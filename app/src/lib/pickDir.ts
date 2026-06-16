// Native directory picker (ADR-0010 §5a). Tauri's WRY webview does NOT implement
// window.prompt() (it returns null), so the "+ Add project" switcher and the
// drawer's "Choose a directory…" both need the real Tauri dialog plugin in the
// desktop build. In a plain browser (Vite dev, no Tauri) we fall back to a
// window.prompt for the absolute path so the flow stays exercisable without Rust.

import { IS_TAURI } from "./skl";

/**
 * Open a native directory picker and resolve to the chosen absolute path, or
 * null if the user cancelled. Browser dev falls back to window.prompt.
 */
export async function pickDirectory(): Promise<string | null> {
  if (IS_TAURI) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    return (await open({
      directory: true,
      multiple: false,
      title: "Choose a project directory",
    })) as string | null;
  }
  const path = window.prompt("Absolute path to the project directory:");
  return path && path.trim() ? path.trim() : null;
}
