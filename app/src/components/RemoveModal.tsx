// Hard-remove confirm (ADR-0008, mockup lines 390-407). Type-to-confirm gate:
// the destructive `skl rm` only fires when the typed text exactly equals the
// skill name. hardRemove() owns closing the modal + toast via the command layer.

import { useStore } from "../state/store";
import { useCommands } from "../state/commands";
import { MONO } from "../lib/tokens";

export function RemoveModal() {
  const { state, dispatch } = useStore();
  const commands = useCommands();
  const confirm = state.confirm;

  if (!confirm) return null;
  const name = confirm.name;
  // Bulk remove (retired view) carries the full set in `names`; single removes
  // omit it and fall back to `[name]`. The type-to-confirm gate arms against the
  // primary/display name in both cases.
  const names = confirm.names ?? [name];
  const bulk = names.length > 1;
  const armed = state.confirmText === name;

  return (
    <>
      <div
        onClick={() => dispatch({ type: "cancelConfirm" })}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(24,24,27,0.42)",
          zIndex: 65,
          animation: "var(--animate-scrim-in)",
        }}
      />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          zIndex: 66,
          width: 440,
          maxWidth: "92vw",
          background: "#FFFFFF",
          borderRadius: 14,
          boxShadow: "0 24px 70px rgba(0,0,0,.3)",
          padding: "22px 22px 18px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 10,
          }}
        >
          <span
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: "#FBEBEB",
              color: "#DC2626",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 15,
              flexShrink: 0,
            }}
          >
            ⚠
          </span>
          <span style={{ fontSize: 15, fontWeight: 650 }}>
            {bulk ? `Remove ${names.length} skills?` : `Remove ${name}?`}
          </span>
        </div>
        <p
          style={{
            fontSize: 12.5,
            color: "#52525B",
            lineHeight: 1.55,
            margin: "0 0 12px",
          }}
        >
          {bulk
            ? "This deletes these skill folders from disk and drops their tags + provenance. "
            : "This deletes the skill folder from disk and drops its tags + provenance. "}
          <b style={{ color: "#3F3F46" }}>This cannot be undone.</b> To retire
          instead (reversible), close this and use Retire.
        </p>
        <div
          style={{
            background: "#F6F6F7",
            border: "1px solid #ECECEE",
            borderRadius: 8,
            padding: "8px 10px",
            fontFamily: MONO,
            fontSize: 10.5,
            color: "#52525B",
            marginBottom: 13,
          }}
        >
          <span style={{ color: "#A1A1AA" }}>$</span> skl rm{" "}
          {names.join(" ")}
        </div>
        <div
          style={{ fontSize: 11.5, color: "#71717A", marginBottom: 6 }}
        >
          Type{" "}
          <b style={{ color: "#18181B", fontFamily: MONO }}>{name}</b> to
          confirm
        </div>
        <input
          aria-label="type skill name to confirm"
          value={state.confirmText}
          onChange={(e) =>
            dispatch({ type: "setConfirmText", text: e.target.value })
          }
          placeholder="skill name"
          style={{
            width: "100%",
            height: 34,
            padding: "0 11px",
            border: "1px solid #E2E2E5",
            borderRadius: 8,
            fontSize: 13,
            fontFamily: MONO,
            outline: "none",
            marginBottom: 14,
          }}
        />
        <div
          style={{ display: "flex", justifyContent: "flex-end", gap: 9 }}
        >
          <button
            onClick={() => dispatch({ type: "cancelConfirm" })}
            style={{
              background: "#FFFFFF",
              border: "1px solid #E2E2E5",
              color: "#3F3F46",
              borderRadius: 8,
              padding: "7px 14px",
              fontSize: 12.5,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Cancel
          </button>
          <button
            onClick={
              armed
                ? () => {
                    // hardRemove is single-name (and cancels the modal on its
                    // first call); loop over the captured set for bulk removes.
                    for (const n of names) commands.hardRemove(n);
                  }
                : undefined
            }
            disabled={!armed}
            style={
              armed
                ? {
                    background: "#DC2626",
                    color: "#FFFFFF",
                    border: "none",
                    borderRadius: 8,
                    padding: "7px 16px",
                    fontSize: 12.5,
                    fontWeight: 550,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }
                : {
                    background: "#F4F4F5",
                    color: "#C7C7CC",
                    border: "none",
                    borderRadius: 8,
                    padding: "7px 16px",
                    fontSize: 12.5,
                    fontWeight: 550,
                    cursor: "not-allowed",
                    fontFamily: "inherit",
                  }
            }
          >
            Remove
          </button>
        </div>
      </div>
    </>
  );
}
