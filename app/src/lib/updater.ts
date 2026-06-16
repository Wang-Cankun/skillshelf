// Safe, inert-by-default desktop auto-update check (Tauri updater plugin).
//
// This is deliberately a NO-OP until the updater is activated:
//   1. It only runs inside Tauri (IS_TAURI) — never in the browser/dev build.
//   2. It only runs when UPDATER_ENABLED is true. Flip that to `true` ONLY
//      after a real signing pubkey is pasted into
//      `app/src-tauri/tauri.conf.json` (`plugins.updater.pubkey`) and the
//      TAURI_SIGNING_* CI secrets are configured — otherwise the plugin has no
//      key to verify update artifacts against. See docs/RELEASING.md.
//
// Wiring is intentionally minimal: it checks for an update and, if one exists,
// downloads + installs it, then relaunches. Errors are swallowed so a flaky
// network or a not-yet-published latest.json never blocks app startup.

import { IS_TAURI } from "./skl";

/**
 * Master switch for the auto-updater. Left `false` so the app ships UNSIGNED
 * and update-inert out of the box. Set to `true` once signing/updater are
 * activated (see docs/RELEASING.md → "Activate the updater").
 */
const UPDATER_ENABLED = false;

/**
 * Check for a desktop update and install it if available. No-ops in the browser
 * and while the updater is disabled. Call once on app mount; best-effort.
 */
export async function checkForUpdates(): Promise<void> {
  if (!IS_TAURI || !UPDATER_ENABLED) return;
  try {
    // Imported lazily so the browser/dev bundle never pulls in the plugin and
    // the static import can't break a non-Tauri build.
    const { check } = await import("@tauri-apps/plugin-updater");
    const { relaunch } = await import("@tauri-apps/plugin-process");
    const update = await check();
    if (update) {
      await update.downloadAndInstall();
      await relaunch();
    }
  } catch {
    /* network/updater unavailable — startup must never block on updates */
  }
}
