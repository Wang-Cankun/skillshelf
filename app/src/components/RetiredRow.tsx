// A single two-line library row for the Retired view (Retired feature).
// Mirrors SkillRow's layout/styling exactly — same select checkbox, the same
// name button that opens the drawer, the same line-2 description + domain chips —
// but with NO AgentToggle deploy controls (deploying a retired skill is a
// footgun). On the right of line 1 it carries the two lifecycle actions:
//   [Unretire] → commands.unretire([name])  ·  [Remove] → confirm-then-hardRemove
// The name is plain (no strikethrough): the whole view is already the archive.

import { useStore } from "../state/store";
import { useCommands } from "../state/commands";
import { domainHue, MONO } from "../lib/tokens";
import type { Skill } from "../lib/types";

export function RetiredRow({ skill }: { skill: Skill }) {
  const { state, dispatch } = useStore();
  const commands = useCommands();
  const checked = !!state.selected[skill.name];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "9px 14px",
        borderBottom: "1px solid #F3F3F4",
        borderLeft: `2px solid ${checked ? "#2563EB" : "transparent"}`,
        background: checked ? "#F5F8FE" : "transparent",
      }}
    >
      <button
        onClick={() => dispatch({ type: "toggleSelect", name: skill.name })}
        aria-label={`select ${skill.name}`}
        aria-pressed={checked}
        style={{
          width: 22,
          marginTop: 1,
          fontSize: 14,
          color: checked ? "#2563EB" : "#C7C7CC",
          flexShrink: 0,
          cursor: "pointer",
          background: "none",
          border: "none",
          padding: 0,
          textAlign: "left",
        }}
      >
        {checked ? "☑" : "☐"}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* line 1 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            minWidth: 0,
          }}
        >
          <button
            onClick={() => dispatch({ type: "openDrawer", name: skill.name })}
            style={{
              fontWeight: 560,
              color: "#18181B",
              fontFamily: MONO,
              fontSize: 12.5,
              cursor: "pointer",
              background: "none",
              border: "none",
              padding: 0,
              textAlign: "left",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {skill.name}
          </button>

          <span style={{ flex: 1 }} />

          {/* lifecycle actions — no deploy controls in the archive */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              flexShrink: 0,
            }}
          >
            <button
              onClick={() => void commands.unretire([skill.name])}
              style={{
                fontSize: 11,
                fontWeight: 560,
                color: "#2563EB",
                cursor: "pointer",
                background: "none",
                border: "1px solid #E7E7E9",
                borderRadius: 5,
                padding: "2px 8px",
              }}
            >
              Unretire
            </button>
            <button
              onClick={() =>
                dispatch({ type: "askConfirm", name: skill.name })
              }
              style={{
                fontSize: 11,
                fontWeight: 560,
                color: "#DC2626",
                cursor: "pointer",
                background: "none",
                border: "1px solid #E7E7E9",
                borderRadius: 5,
                padding: "2px 8px",
              }}
            >
              Remove
            </button>
          </div>
        </div>

        {/* line 2 */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 9,
            marginTop: 3,
            minWidth: 0,
          }}
        >
          <button
            onClick={() => dispatch({ type: "openDrawer", name: skill.name })}
            style={{
              flex: 1,
              minWidth: 0,
              color: "#71717A",
              fontSize: 12,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              background: "none",
              border: "none",
              padding: 0,
              textAlign: "left",
              cursor: "pointer",
            }}
          >
            {skill.description}
          </button>
          <span
            style={{
              display: "inline-flex",
              gap: 5,
              flexShrink: 0,
            }}
          >
            {(skill.domains.length ? skill.domains : ["untagged"]).map((d) => (
              <span
                key={d}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 10.5,
                  color: "#A1A1AA",
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 2,
                    background: skill.domains.length ? domainHue(d) : "#D4D4D8",
                    display: "inline-block",
                  }}
                />
                {d}
              </span>
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}
