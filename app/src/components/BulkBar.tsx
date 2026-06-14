// Floating bulk-action bar (ADR-0008, rev. — replaces the docked Inspector and
// the old in-list sticky bar). The single home for multi-selection: it appears
// only when ≥1 skill is checked, floats centered above the health strip, and
// carries the two allowlisted, undoable verbs (tag / retire) plus the exact
// command echo. Single-skill depth stays in the DetailDrawer; this is the
// "many skills" surface, so there is no third panel.

import { useStore } from "../state/store";
import { useLibrary } from "../state/queries";
import { useCommands } from "../state/commands";
import { allDomains } from "../lib/select";
import { DomainMenu } from "./DomainMenu";
import { MONO } from "../lib/tokens";

export function BulkBar() {
  const { state, dispatch } = useStore();
  const skills = useLibrary().data ?? [];
  const commands = useCommands();

  const names = Object.keys(state.selected).filter((k) => state.selected[k]);
  if (!names.length) return null;

  // A drawer covers the screen (z 50/51) — don't float the bar over it.
  if (state.drawer) return null;

  const echo =
    names.length > 2
      ? `skl tag <${names.length} names…> <domain>`
      : `skl tag ${names.join(" ")} <domain>`;

  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        bottom: 42, // clears the 30px health strip
        transform: "translateX(-50%)",
        zIndex: 40, // below the drawer (50/51) + toast (60)
        display: "flex",
        alignItems: "center",
        gap: 12,
        maxWidth: "min(760px, calc(100vw - 48px))",
        padding: "10px 14px",
        background: "#18181B",
        borderRadius: 12,
        color: "#FFFFFF",
        fontSize: 12.5,
        boxShadow: "0 12px 34px rgba(0,0,0,0.28)",
      }}
    >
      <span style={{ fontWeight: 650, whiteSpace: "nowrap" }}>
        ▸ {names.length} selected
      </span>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <DomainMenu
          domains={allDomains(skills)}
          onPick={(d) => {
            commands.tag(names, d);
            dispatch({ type: "clearSelection" });
          }}
          variant="menu"
          placement="up"
        />
        <button
          onClick={() => {
            commands.retire(names);
            dispatch({ type: "clearSelection" });
          }}
          style={darkBtn}
        >
          Retire
        </button>
      </div>
      <span
        style={{
          fontFamily: MONO,
          fontSize: 11,
          color: "#9A9AA2",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {echo}
      </span>
      <button
        onClick={() => dispatch({ type: "clearSelection" })}
        aria-label="clear selection"
        style={{
          marginLeft: 2,
          background: "none",
          border: "none",
          color: "#9A9AA2",
          fontSize: 12,
          cursor: "pointer",
          fontFamily: "inherit",
          whiteSpace: "nowrap",
        }}
      >
        ⌫ clear
      </button>
    </div>
  );
}

const darkBtn: React.CSSProperties = {
  background: "#2C2C30",
  color: "#FFFFFF",
  border: "1px solid #3C3C40",
  borderRadius: 7,
  padding: "5px 11px",
  fontSize: 12,
  cursor: "pointer",
  fontFamily: "inherit",
  whiteSpace: "nowrap",
};
