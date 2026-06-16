// "+ Add to project…" picker for the drawer's agent×scope sub-matrix (delta 3).
// The matrix only shows Global + projects where THIS skill is already deployed
// (anti-sparsity, RISK 3); this picker is the ONE way to bring a not-yet-deployed
// project in as a transient row.
//
// Browser/dev mode: a fixture list of persisted projects (useConfig().projects)
// minus the ones already shown as rows. Tauri: the native directory picker via
// pickDirectory() (@tauri-apps/plugin-dialog) — window.prompt is a no-op in the
// WRY webview, so the browser dev fallback inside pickDirectory() prompts there.
//
// On pick we persist the project via addProject() (pure nav state, §5a) then call
// onPicked(path) so the drawer can add it as a matrix row. We do NOT blind-deploy
// here: the user lights the per-agent cell in the new row themselves (so we never
// fabricate a deployment the user didn't ask for — derive-from-FS invariant).

import { useState } from "react";
import { useConfig } from "../state/queries";
import { useCommands } from "../state/commands";
import { IS_TAURI, projectScopeName } from "../lib/skl";
import { pickDirectory } from "../lib/pickDir";
import { MONO } from "../lib/tokens";

export function AddToProjectPicker({
  /** scope basenames already present as rows (Global + deployed projects). */
  shownScopes,
  /** called with the absolute project path once persisted. */
  onPicked,
}: {
  shownScopes: string[];
  onPicked: (path: string) => void;
}) {
  const config = useConfig().data;
  const commands = useCommands();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const shown = new Set(shownScopes);
  const candidates = (config?.projects ?? []).filter(
    (p) => !shown.has(projectScopeName(p)),
  );

  const pick = async (path: string) => {
    setBusy(true);
    const ok = await commands.addProject(path);
    setBusy(false);
    setOpen(false);
    if (ok) onPicked(path);
  };

  const promptForPath = async () => {
    // Native directory picker (window.prompt is a no-op in Tauri's WRY webview);
    // browser dev falls back to a prompt inside pickDirectory().
    const path = await pickDirectory();
    if (path) await pick(path);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          width: "100%",
          padding: "8px 9px",
          marginTop: 4,
          background: "#FFFFFF",
          border: "1px dashed #D4D4D8",
          borderRadius: 8,
          color: "#52525B",
          fontSize: 11.5,
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left",
        }}
      >
        <span style={{ fontSize: 13, color: "#9A9AA2" }}>＋</span>
        Add to project…
      </button>
    );
  }

  return (
    <div
      style={{
        marginTop: 4,
        border: "1px solid #E7E7E9",
        borderRadius: 9,
        padding: "8px 8px 9px",
        background: "#FCFCFD",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 6,
          padding: "0 2px",
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: "#52525B" }}>
          Add to project
        </span>
        <button
          onClick={() => setOpen(false)}
          aria-label="cancel add to project"
          style={{
            background: "none",
            border: "none",
            color: "#A1A1AA",
            cursor: "pointer",
            fontSize: 13,
            lineHeight: 1,
            padding: 0,
          }}
        >
          ✕
        </button>
      </div>

      {IS_TAURI ? (
        <button
          onClick={() => void promptForPath()}
          disabled={busy}
          style={pickerBtn}
        >
          Choose a directory…
        </button>
      ) : candidates.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {candidates.map((p) => (
            <button
              key={p}
              onClick={() => void pick(p)}
              disabled={busy}
              style={pickerRow}
            >
              <span style={{ fontWeight: 600, color: "#18181B" }}>
                {projectScopeName(p)}
              </span>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 9.5,
                  color: "#A1A1AA",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {p}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div
          style={{
            fontSize: 11,
            color: "#9A9AA2",
            padding: "6px 4px",
            lineHeight: 1.5,
          }}
        >
          No other projects. Add one from the top scope switcher first.
        </div>
      )}
    </div>
  );
}

const pickerBtn: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  background: "#18181B",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 7,
  fontSize: 11.5,
  cursor: "pointer",
  fontFamily: "inherit",
};

const pickerRow: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 1,
  width: "100%",
  textAlign: "left",
  padding: "6px 9px",
  background: "#FFFFFF",
  border: "1px solid #ECECEE",
  borderRadius: 7,
  cursor: "pointer",
  fontSize: 11.5,
  fontFamily: "inherit",
};
