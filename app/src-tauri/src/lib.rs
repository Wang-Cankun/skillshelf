use std::path::PathBuf;
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use notify::{RecursiveMode, Watcher};
use notify_debouncer_full::{new_debouncer, DebounceEventHandler, DebounceEventResult, Debouncer, FileIdMap};
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
    "use", "drop", "link", "realign", "roots", "projects", "outdated", "update", "refresh",
    "infer", "index", "new", "init",
    // ADR-0008: multi-agent + drawer feeds. `agents`/`show` back the new
    // `--json` loaders; `diff` backs the drift "View diff" action.
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
async fn run_skl(app: tauri::AppHandle, args: Vec<String>) -> Result<SklResult, String> {
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

        if output.status.success() && changes_watch_paths(&args) {
            refresh_watcher(&app);
        }

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

fn config_path() -> Option<PathBuf> {
    if let Ok(path) = std::env::var("SKILLSHELF_CONFIG") {
        if !path.trim().is_empty() {
            let path = expand_home(path.trim());
            return Some(if path.is_absolute() { path } else { std::env::current_dir().ok()?.join(path) });
        }
    }
    let home = std::env::var("HOME").ok()?;
    Some(PathBuf::from(home).join(".skillshelf").join("config.json"))
}

/// Read the same config file as the CLI (best-effort).
fn read_skl_config() -> Option<serde_json::Value> {
    let text = std::fs::read_to_string(config_path()?).ok()?;
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
            ".claude", ".codex", ".cursor", ".opencode", ".gemini",
        ] {
            dirs.push(home.join(agent).join("skills"));
        }
        // pi nests skills under agent/skills/ (not .pi/skills/)
        dirs.push(home.join(".pi").join("agent").join("skills"));
    }

    if let Some(agents) = cfg.as_ref().and_then(|c| c.get("agents")).and_then(|v| v.as_array()) {
        for agent in agents {
            if let Some(global) = agent.get("global").and_then(|v| v.as_str()) {
                if !global.trim().is_empty() {
                    dirs.push(expand_home(global.trim()));
                }
            }
        }
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
    let cfg_path = config_path();
    let config_watch = cfg_path.clone();
    let dirs = watched_dirs();
    let mut debouncer = directory_watcher(&dirs, move |result: DebounceEventResult| match result {
        Ok(events) => {
            if config_watch.as_ref().is_some_and(|path| events.iter().any(|e| e.event.paths.contains(path))) {
                // Dropping a debouncer joins its callback thread: replace it off-thread.
                let app = app.clone();
                tauri::async_runtime::spawn_blocking(move || refresh_watcher(&app));
            }
            let _ = app.emit(FS_CHANGED_EVENT, ());
        }
        Err(errors) => {
            for e in errors {
                eprintln!("fs-watcher error: {e:?}");
            }
        }
    })?;

    // Watch the parent so atomic config-file replacement is detected too.
    if let Some(parent) = cfg_path.as_ref().and_then(|p| p.parent()) {
        if parent.is_dir() && !dirs.iter().any(|p| p == parent) {
            if let Err(e) = debouncer.watcher().watch(parent, RecursiveMode::NonRecursive) {
                eprintln!("fs-watcher: failed to watch config directory {}: {e:?}", parent.display());
            }
        }
    }
    Ok(debouncer)
}

fn directory_watcher(
    dirs: &[PathBuf],
    handler: impl DebounceEventHandler,
) -> notify::Result<Debouncer<notify::RecommendedWatcher, FileIdMap>> {
    let mut debouncer = new_debouncer(FS_DEBOUNCE, None, handler)?;
    for dir in dirs {
        if let Err(e) = debouncer.watcher().watch(dir, RecursiveMode::Recursive) {
            // Best-effort: a path that vanished between the is_dir() check and
            // the watch() call must not abort the whole watcher.
            eprintln!("fs-watcher: failed to watch {}: {e:?}", dir.display());
        }
    }

    Ok(debouncer)
}

fn changes_watch_paths(args: &[String]) -> bool {
    match args.first().map(String::as_str) {
        Some("projects" | "agents") => matches!(args.get(1).map(String::as_str), Some("add" | "rm")),
        Some("use" | "init") => true,
        _ => false,
    }
}

fn refresh_watcher(app: &tauri::AppHandle) {
    let state = app.state::<WatcherState>();
    if let Ok(mut slot) = state._debouncer.lock() {
        match start_watcher(app.clone()) {
            Ok(watcher) => *slot = Some(watcher),
            Err(e) => eprintln!("fs-watcher: refresh failed (keeping previous watcher): {e:?}"),
        }
    };
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    use std::time::{Instant, SystemTime, UNIX_EPOCH};

    #[test]
    fn watch_paths_refresh_only_after_registry_or_surface_changes() {
        for args in [vec!["projects", "add", "/tmp/example"], vec!["projects", "rm", "/tmp/example"],
            vec!["agents", "add", "example"], vec!["agents", "rm", "example"], vec!["use", "demo"], vec!["init"]] {
            assert!(changes_watch_paths(&args.into_iter().map(String::from).collect::<Vec<_>>()));
        }
        for args in [vec!["projects", "--json"], vec!["agents", "--json"], vec!["ls", "--json"]] {
            assert!(!changes_watch_paths(&args.into_iter().map(String::from).collect::<Vec<_>>()));
        }
    }

    #[test]
    fn replacement_watcher_tracks_new_project_and_stops_watching_removed_project() {
        let root = std::env::temp_dir().join(format!("skillshelf-watch-{}-{}", std::process::id(),
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()));
        let old = root.join("old-project");
        let new = root.join("new-project");
        std::fs::create_dir_all(&old).unwrap();
        std::fs::create_dir_all(&new).unwrap();
        let old = std::fs::canonicalize(old).unwrap();
        let new = std::fs::canonicalize(new).unwrap();
        let (tx, rx) = mpsc::channel::<DebounceEventResult>();
        let mut watcher = Some(directory_watcher(&[old.clone()], tx.clone()).unwrap());
        assert!(watcher.is_some());
        watcher = Some(directory_watcher(&[new.clone()], tx).unwrap());
        let old_file = old.join("SKILL.md");
        let new_file = new.join("SKILL.md");
        std::fs::write(&old_file, "ignored").unwrap();
        std::fs::write(&new_file, "updated").unwrap();
        let deadline = Instant::now() + Duration::from_secs(10);
        let mut observed = false;
        while Instant::now() < deadline {
            let events = rx.recv_timeout(deadline.saturating_duration_since(Instant::now())).unwrap().unwrap();
            assert!(!events.iter().any(|e| e.event.paths.contains(&old_file)));
            if events.iter().any(|e| e.event.paths.contains(&new_file)) {
                observed = true;
                break;
            }
        }
        drop(watcher);
        std::fs::remove_dir_all(root).unwrap();
        assert!(observed, "no filesystem event from the newly registered project");
    }
}
