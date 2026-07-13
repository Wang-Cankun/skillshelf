// Tauri shell affordances for the drawer's "Edit SKILL.md" / "Open folder"
// (ADR-0008 §5: these route through the OS shell — open in $EDITOR / reveal in
// Finder — NOT a `skl edit/open` verb, which don't exist). No-ops in the
// browser (dev) where there is no shell to drive.

import { openPath, openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { IS_TAURI } from "./skl";

/** The editor app skill sources open in. Editing usually spans several files
 *  (SKILL.md + references), so the DIRECTORY opens as a workspace folder and
 *  the clicked file is focused inside it. */
const EDITOR_APP = "Visual Studio Code";

/**
 * Open a skill's source dir in the editor, focusing one file inside it.
 * Falls back to the OS default handler for the file when the editor app is
 * missing. Never fully silent — a denied opener scope (capabilities) otherwise
 * reads as a dead button with no trace anywhere.
 */
export async function openInEditor(
  dir: string | undefined,
  file?: string,
): Promise<void> {
  if (!IS_TAURI || !dir) return;
  const filePath = file ? `${dir}/${file}` : dir;
  try {
    await openPath(dir, EDITOR_APP);
    if (file) await openPath(filePath, EDITOR_APP);
  } catch (err) {
    console.error(`openInEditor(${dir}) via ${EDITOR_APP} failed:`, err);
    try {
      await openPath(filePath);
    } catch (err2) {
      console.error(`openInEditor(${filePath}) fallback failed:`, err2);
    }
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
