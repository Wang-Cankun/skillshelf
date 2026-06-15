// Tauri shell affordances for the drawer's "Edit SKILL.md" / "Open folder"
// (ADR-0008 §5: these route through the OS shell — open in $EDITOR / reveal in
// Finder — NOT a `skl edit/open` verb, which don't exist). No-ops in the
// browser (dev) where there is no shell to drive.

import { openPath, openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { IS_TAURI } from "./skl";

/** Open a path with the OS default handler (a file opens in $EDITOR/default). */
export async function openInEditor(path: string | undefined): Promise<void> {
  if (!IS_TAURI || !path) return;
  try {
    await openPath(path);
  } catch {
    /* shell unavailable — surface nothing; the buttons are best-effort */
  }
}

/**
 * Open an external URL (e.g. a GitHub repo root) in the default browser.
 * No-op in the browser (dev), where there is no OS shell to drive. Uses the
 * opener plugin's `openUrl`; best-effort try/catch like the other affordances.
 */
export async function openExternal(url: string | undefined): Promise<void> {
  if (!IS_TAURI || !url) return;
  try {
    await openUrl(url);
  } catch {
    /* shell unavailable — best-effort */
  }
}

/** Reveal a path in the system file manager (Finder on macOS). */
export async function revealInFinder(path: string | undefined): Promise<void> {
  if (!IS_TAURI || !path) return;
  try {
    await revealItemInDir(path);
  } catch {
    /* shell unavailable */
  }
}
