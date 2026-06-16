use std::path::PathBuf;
use std::process::Command;
use std::sync::OnceLock;

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
fn run_skl(args: Vec<String>) -> Result<SklResult, String> {
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

    let output = Command::new(skl)
        .args(&args)
        .env("PATH", augmented_path())
        .output()
        .map_err(|e| {
            format!(
                "skl not found: failed to spawn `{}`: {e}",
                skl.display()
            )
        })?;

    let stdout = String::from_utf8(output.stdout)
        .map_err(|e| format!("`skl` produced non-UTF-8 stdout: {e}"))?;
    let stderr = String::from_utf8(output.stderr)
        .map_err(|e| format!("`skl` produced non-UTF-8 stderr: {e}"))?;

    Ok(SklResult {
        ok: output.status.success(),
        stdout,
        stderr,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![run_skl])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
