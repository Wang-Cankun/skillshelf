use std::path::PathBuf;
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use notify::{RecursiveMode, Watcher};
use notify_debouncer_full::{new_debouncer, Debouncer, FileIdMap};
use tauri::{Emitter, Manager};

/// Result of running the `skl` CLI. Mirrors the TS `SklResult` (CONTRACT-B):
/// `ok` reflects a zero exit code; `stdout`/`stderr` are non-lossy UTF-8.
#[derive(serde::Serialize)]
struct SklResult {
    ok: bool,
    stdout: String,
    stderr: String,
}

/// Subcommands the UI is allowed to invoke. Anything else is rejected before a
/// process is ever spawned. This is the full known-safe `skl` verb set — it must
/// cover every verb the UI dispatches (loaders ls/where/scan/status AND mutations
/// tag/untag/rename/retire/drop/use/import/link/…), while still rejecting an
/// unknown leading token. Keep in sync with the TS allowlist note.
const ALLOWED_VERBS: &[&str] = &[
    "ls", "search", "show", "scan", "where", "status", "import", "add",
    "tag", "untag", "retag", "rename", "retire", "unretire", "rm",
    "use", "drop", "link", "roots", "projects", "outdated", "update", "refresh",
    "infer", "index", "new", "init",
    // ADR-0008: multi-agent + drawer feeds. `agents`/`show` back the new
    // `--json` loaders; `diff` backs a future near-dup affordance (deferred in
    // the UI but kept allow-listed so it never fails silently at the bridge).
    "agents", "diff",
];

/// Resolve an absolute path to the `skl` binary, cached for the process
/// lifetime. Strategy:
///   1. Probe the user's login shell (`$SHELL -lic 'command -v skl'`) so we
///      inherit their real PATH (nvm/bun/homebrew shims etc.), which a GUI app
///      launched from Finder does NOT get.
///   2. Fall back to a list of common absolute install locations.
/// Returns `None` if nothing resolves; callers then surface a helpful error.
fn resolve_skl_path() -> Option<&'static PathBuf> {
    static SKL_PATH: OnceLock<Option<PathBuf>> = OnceLock::new();
    SKL_PATH
        .get_or_init(|| {
            // 1. Login-shell probe.
            if let Ok(shell) = std::env::var("SHELL") {
                if let Ok(out) = Command::new(&shell)
                    .args(["-lic", "command -v skl"])
                    .output()
                {
                    if out.status.success() {
                        let found = String::from_utf8_lossy(&out.stdout).trim().to_string();
                        if !found.is_empty() {
                            let p = PathBuf::from(found);
                            if p.is_file() {
                                return Some(p);
                            }
                        }
                    }
                }
            }

            // 2. Candidate absolute fallbacks.
            let mut candidates: Vec<PathBuf> = Vec::new();
            if let Ok(home) = std::env::var("HOME") {
                candidates.push(PathBuf::from(&home).join(".bun/bin/skl"));
                candidates.push(PathBuf::from(&home).join(".local/bin/skl"));
                candidates.push(PathBuf::from(&home).join(".npm-global/bin/skl"));
            }
            candidates.push(PathBuf::from("/opt/homebrew/bin/skl"));
            candidates.push(PathBuf::from("/usr/local/bin/skl"));
            candidates.push(PathBuf::from("/usr/bin/skl"));

            candidates.into_iter().find(|p| p.is_file())
        })
        .as_ref()
}

/// Build a PATH value augmented with the common bin dirs, so a child process
/// spawned by a Finder-launched GUI app can still resolve helpers `skl` shells
/// out to. Prepends our well-known dirs to any inherited PATH.
fn augmented_path() -> String {
    let mut dirs: Vec<String> = Vec::new();
    if let Ok(home) = std::env::var("HOME") {
        dirs.push(format!("{home}/.bun/bin"));
        dirs.push(format!("{home}/.local/bin"));
        dirs.push(format!("{home}/.npm-global/bin"));
    }
    dirs.push("/opt/homebrew/bin".into());
    dirs.push("/usr/local/bin".into());
    dirs.push("/usr/bin".into());
    dirs.push("/bin".into());
    if let Ok(existing) = std::env::var("PATH") {
        dirs.push(existing);
    }
    dirs.join(":")
}

/// Run the deterministic `skl` CLI with the given args and return a structured
/// `SklResult`. Resolves `skl` to an absolute path (CONTRACT-A), enforces a
/// subcommand allowlist, augments the child PATH, and decodes output non-lossily.
/// Spawn failure (or an unresolvable binary) is returned as an `Err` carrying a
/// helpful "skl not found" message.
#[tauri::command]
async fn run_skl(args: Vec<String>) -> Result<SklResult, String> {
    // Enforce the subcommand allowlist on the first positional arg.
    match args.first() {
        None => return Err("no `skl` subcommand provided".to_string()),
        Some(verb) if !ALLOWED_VERBS.contains(&verb.as_str()) => {
            return Err(format!("`skl {verb}` is not an allowed subcommand"));
        }
        Some(_) => {}
    }

    let skl = resolve_skl_path().ok_or_else(|| {
        "skl not found: the `skl` CLI could not be located. Install it (e.g. \
         `bun add -g skillshelf`) so it is on your login shell PATH, or place it \
         at ~/.bun/bin/skl, ~/.local/bin/skl, /opt/homebrew/bin/skl, or \
         /usr/local/bin/skl."
            .to_string()
    })?;
    let path = augmented_path();

    // `skl` calls can take seconds (e.g. `update` clones a repo). A synchronous
    // command body runs on the main thread and FREEZES the webview for that whole
    // time, so run the blocking spawn off-thread and await it.
    tauri::async_runtime::spawn_blocking(move || {
        let output = Command::new(skl)
            .args(&args)
            .env("PATH", path)
            .output()
            .map_err(|e| format!("skl not found: failed to spawn `{}`: {e}", skl.display()))?;

        let stdout = String::from_utf8(output.stdout)
            .map_err(|e| format!("`skl` produced non-UTF-8 stdout: {e}"))?;
        let stderr = String::from_utf8(output.stderr)
            .map_err(|e| format!("`skl` produced non-UTF-8 stderr: {e}"))?;

        Ok(SklResult {
            ok: output.status.success(),
            stdout,
            stderr,
        })
    })
    .await
    .map_err(|e| format!("run_skl task failed: {e}"))?
}

// ---------------------------------------------------------------------------
// Filesystem watcher (CONTRACT-FS): a single debounced `skl://fs-changed` event
// is emitted whenever anything changes under the watched dirs (library, the
// global agent skills dirs, and persisted nav projects). The JS side listens for
// that exact name and invalidates its queries. We coalesce notify's many raw
// events into ONE emit per quiet window via `notify-debouncer-full`.
// ---------------------------------------------------------------------------

/// Event name shared with the JS side. Must match the JS `listen()` exactly.
const FS_CHANGED_EVENT: &str = "skl://fs-changed";

/// Debounce window: coalesce bursts of fs events and emit once per quiet period.
const FS_DEBOUNCE: Duration = Duration::from_millis(400);

/// Holds the live debouncer so the watcher is not dropped for the app lifetime.
/// Stored in Tauri's managed state via `.manage(...)`. The `Mutex<Option<..>>`
/// lets `setup()` move the debouncer in after construction; if init fails the
/// app still runs (best-effort), leaving `None`.
struct WatcherState {
    _debouncer: Mutex<Option<Debouncer<notify::RecommendedWatcher, FileIdMap>>>,
}

/// Expand a leading `~` against $HOME. Returns the path unchanged if no HOME.
fn expand_home(p: &str) -> PathBuf {
    if p == "~" {
        if let Ok(home) = std::env::var("HOME") {
            return PathBuf::from(home);
        }
    }
    if let Some(rest) = p.strip_prefix("~/") {
        if let Ok(home) = std::env::var("HOME") {
            return PathBuf::from(home).join(rest);
        }
    }
    PathBuf::from(p)
}

/// Read `~/.skillshelf/config.json` (best-effort) and return the parsed JSON.
fn read_skl_config() -> Option<serde_json::Value> {
    let home = std::env::var("HOME").ok()?;
    let cfg_path = PathBuf::from(home).join(".skillshelf").join("config.json");
    let text = std::fs::read_to_string(cfg_path).ok()?;
    serde_json::from_str(&text).ok()
}

/// Resolve the LIBRARY dir, mirroring `src/config.ts`:
///   1. env SKILLSHELF_LIBRARY
///   2. ~/.skillshelf/config.json  "library"
///   3. default ~/.skillshelf/library
fn resolve_library(cfg: Option<&serde_json::Value>) -> Option<PathBuf> {
    if let Ok(env_lib) = std::env::var("SKILLSHELF_LIBRARY") {
        let t = env_lib.trim();
        if !t.is_empty() {
            return Some(expand_home(t));
        }
    }
    if let Some(lib) = cfg.and_then(|c| c.get("library")).and_then(|v| v.as_str()) {
        let t = lib.trim();
        if !t.is_empty() {
            return Some(expand_home(t));
        }
    }
    let home = std::env::var("HOME").ok()?;
    Some(PathBuf::from(home).join(".skillshelf").join("library"))
}

/// Persisted nav project roots from config "projects" (string | {path}).
fn resolve_projects(cfg: Option<&serde_json::Value>) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Some(arr) = cfg.and_then(|c| c.get("projects")).and_then(|v| v.as_array()) {
        for entry in arr {
            let raw = if let Some(s) = entry.as_str() {
                Some(s)
            } else {
                entry.get("path").and_then(|v| v.as_str())
            };
            if let Some(s) = raw {
                let t = s.trim();
                if !t.is_empty() {
                    out.push(expand_home(t));
                }
            }
        }
    }
    out
}

/// The set of directories to watch (best-effort): library + global agent skills
/// dirs + persisted project roots. Only existing dirs are returned; de-duped.
fn watched_dirs() -> Vec<PathBuf> {
    let cfg = read_skl_config();
    let mut dirs: Vec<PathBuf> = Vec::new();

    if let Some(lib) = resolve_library(cfg.as_ref()) {
        dirs.push(lib);
    }

    if let Ok(home) = std::env::var("HOME") {
        let home = PathBuf::from(home);
        for agent in [
            ".claude", ".codex", ".cursor", ".opencode", ".gemini", ".pi",
        ] {
            dirs.push(home.join(agent).join("skills"));
        }
        // omp nests skills under agent/skills/ (not .omp/skills/)
        dirs.push(home.join(".omp").join("agent").join("skills"));
    }

    dirs.extend(resolve_projects(cfg.as_ref()));

    // Keep only existing dirs, de-duped (order-preserving).
    let mut seen = std::collections::HashSet::new();
    dirs.into_iter()
        .filter(|p| p.is_dir())
        .filter(|p| seen.insert(p.clone()))
        .collect()
}

/// Build the debounced recursive watcher and start watching every existing dir.
/// Returns the live debouncer (which owns its own background thread); the caller
/// MUST keep it alive (we store it in managed state) or watching stops. Never
/// panics: a failed watcher init or an unwatchable path is logged and skipped.
fn start_watcher(
    app: tauri::AppHandle,
) -> notify::Result<Debouncer<notify::RecommendedWatcher, FileIdMap>> {
    // The debouncer runs the callback on its own thread once per quiet window,
    // with the coalesced batch of events. We emit exactly ONE event per batch.
    let mut debouncer = new_debouncer(FS_DEBOUNCE, None, move |result| match result {
        Ok(_events) => {
            // Coalesced batch -> single emit. Ignore payload; JS just invalidates.
            let _ = app.emit(FS_CHANGED_EVENT, ());
        }
        Err(errors) => {
            for e in errors {
                eprintln!("fs-watcher error: {e:?}");
            }
        }
    })?;

    let dirs = watched_dirs();
    if dirs.is_empty() {
        eprintln!("fs-watcher: no existing dirs to watch (best-effort, continuing)");
    }
    for dir in dirs {
        if let Err(e) = debouncer.watcher().watch(&dir, RecursiveMode::Recursive) {
            // Best-effort: a path that vanished between the is_dir() check and
            // the watch() call must not abort the whole watcher.
            eprintln!("fs-watcher: failed to watch {}: {e:?}", dir.display());
        }
    }

    Ok(debouncer)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(WatcherState {
            _debouncer: Mutex::new(None),
        })
        .setup(|app| {
            // Best-effort: never block or panic the main thread. The debouncer
            // spawns its own thread; we just keep it owned in managed state so
            // it lives for the whole app lifetime (dropping it stops watching).
            match start_watcher(app.handle().clone()) {
                Ok(debouncer) => {
                    let state = app.state::<WatcherState>();
                    let lock = state._debouncer.lock();
                    if let Ok(mut slot) = lock {
                        *slot = Some(debouncer);
                    }
                }
                Err(e) => {
                    eprintln!("fs-watcher: failed to start (continuing without it): {e:?}");
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![run_skl])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
