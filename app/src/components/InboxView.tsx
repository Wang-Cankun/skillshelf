// Inbox tab content (ADR-0008 §4, mockup lines 201-229). Renders the
// deterministic triage rows from deriveInbox() in a white card. The only live
// action is Retire (ADR-0007: other action buttons are inert visual menus, and
// the NEAR-DUP row is intentionally omitted upstream in deriveInbox).

import { useStore } from "../state/store";
import { useLibrary, useWhere } from "../state/queries";
import { useCommands } from "../state/commands";
import { deriveInbox } from "../lib/derive";
import { allDomains } from "../lib/select";
import { DomainMenu } from "./DomainMenu";
import { SEV_MAP } from "../lib/tokens";
import { MONO } from "../lib/tokens";

const primaryBtn: React.CSSProperties = {
  background: "#18181B",
  color: "#FFFFFF",
  border: "1px solid #18181B",
  borderRadius: 6,
  padding: "4px 11px",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
  whiteSpace: "nowrap",
  fontFamily: "inherit",
};
const secBtn: React.CSSProperties = {
  background: "#FFFFFF",
  color: "#3F3F46",
  border: "1px solid #E2E2E5",
  borderRadius: 6,
  padding: "4px 11px",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
  whiteSpace: "nowrap",
  fontFamily: "inherit",
};

export function InboxView() {
  const { dispatch } = useStore();
  const skills = useLibrary().data ?? [];
  const where = useWhere().data ?? { surfaces: [], sites: [], problems: [] };
  const commands = useCommands();
  const rows = deriveInbox(skills, where);

  return (
    <div style={{ padding: "14px 16px" }}>
      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #E7E7E9",
          borderRadius: 11,
          overflow: "hidden",
        }}
      >
        {rows.map((r, i) => {
          const m = SEV_MAP[r.severity];
          return (
            <div
              key={`${r.skill}-${r.severity}-${i}`}
              title={r.cmd}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                padding: "10px 14px",
                borderBottom: "1px solid #F3F3F4",
                fontSize: 13,
              }}
            >
              <span
                style={{
                  color: m.color,
                  fontSize: 13,
                  width: 14,
                  textAlign: "center",
                  flexShrink: 0,
                }}
              >
                {m.glyph}
              </span>
              <span
                style={{
                  color: m.color,
                  background: m.bg,
                  padding: "2px 8px",
                  borderRadius: 5,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  width: 84,
                  textAlign: "center",
                }}
              >
                {r.type}
              </span>
              {r.openable ? (
                <button
                  onClick={() => dispatch({ type: "openDrawer", name: r.skill })}
                  style={{
                    width: 172,
                    fontWeight: 570,
                    color: "#18181B",
                    flexShrink: 0,
                    fontFamily: MONO,
                    fontSize: 12,
                    cursor: "pointer",
                    background: "none",
                    border: "none",
                    padding: 0,
                    textAlign: "left",
                  }}
                >
                  {r.skill}
                </button>
              ) : (
                <span
                  style={{
                    width: 172,
                    fontWeight: 570,
                    color: "#18181B",
                    flexShrink: 0,
                    fontFamily: MONO,
                    fontSize: 12,
                  }}
                >
                  {r.skill}
                </span>
              )}
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  color: "#71717A",
                  fontSize: 12,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {r.detail}
              </span>
              {r.counts ? (
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 11.5,
                    color: r.countColor,
                    flexShrink: 0,
                  }}
                >
                  {r.counts}
                </span>
              ) : null}
              {r.auto ? (
                <span
                  style={{
                    fontSize: 10.5,
                    color: "#15A34A",
                    background: "#ECF6EF",
                    borderRadius: 5,
                    padding: "2px 7px",
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  ✓ auto
                </span>
              ) : null}
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                {r.severity === "untagged" ? (
                  // The headline triage action: pick (or accept the prefix-
                  // inferred suggestion) → undoable `skl tag` (commands.tag).
                  <DomainMenu
                    domains={allDomains(skills)}
                    suggested={r.suggestedDomain}
                    onPick={(d) => commands.tag([r.skill], d)}
                    variant="menu"
                    align="right"
                  />
                ) : (
                  r.actions.map((a, ai) => {
                    const isRetire = a.args && a.args[0] === "retire";
                    return (
                      <button
                        key={`${a.label}-${ai}`}
                        onClick={
                          isRetire
                            ? () => commands.retire([r.skill])
                            : undefined
                        }
                        // deferred affordances (Review ▾ / View lock …) have no
                        // wired verb yet — disable so they aren't inert focus traps.
                        disabled={!isRetire}
                        title={isRetire ? undefined : "coming soon"}
                        style={a.primary ? primaryBtn : secBtn}
                      >
                        {a.label}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          marginTop: 11,
          padding: "0 4px",
          fontSize: 11.5,
          color: "#9A9AA2",
          fontFamily: MONO,
        }}
      >
        <span style={{ color: "#15A34A" }}>✓ auto</span>
        <span style={{ color: "#52525B" }}>
          = safe one-click (prefix-infer tag).
        </span>
        <span>Click a skill name to open its detail drawer.</span>
      </div>
    </div>
  );
}
