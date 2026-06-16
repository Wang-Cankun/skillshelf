// "Active here via Global" info+action popover (ADR-0010 inheritance §3). Renders
// off `state.inherited` — set when an INHERITED AgentToggle cell is clicked (rows
// OR drawer). An inherited cell is NOT a toggle: the agent auto-loads its GLOBAL
// skills dir (~/.<id>/skills) in EVERY project, so a globally-deployed skill is
// effectively active here even with no project symlink — and there is NO per-
// project denylist, so you CANNOT locally disable it. Clicking therefore opens
// this modal of explicit choices instead of flipping a symlink:
//   • Pin to this project → deploy(skill, agentId, scope, true, scopePath)
//                           (adds the project symlink; cell becomes pinned/solid)
//   • Manage in Global    → switch to the Global scope (removing from Global
//                           affects ALL projects — surfaced as a warning)
//   • Cancel
//
// Mirrors ResolvePopover (mounted alongside it inside DetailDrawer, always
// mounted) so a list-row inherited click resolves even when the drawer is closed.

import { useStore } from "../state/store";
import { useCommands } from "../state/commands";
import { GLOBAL_SCOPE } from "../state/store";
import { MONO } from "../lib/tokens";

type ActionKind = "run" | "nav";

interface InheritedAction {
  label: string;
  hint: string;
  /** the literal `skl …` vector this maps to (echoed as a preview). Empty = none. */
  cmd: string[];
  kind: ActionKind;
  /** soft "affects all projects" caution styling (Manage in Global). */
  caution?: boolean;
  run: () => void;
}

export function InheritedPopover() {
  const { state, dispatch } = useStore();
  const commands = useCommands();
  const target = state.inherited;
  if (!target) return null;

  const { skill, agent, scope, scopePath } = target;
  const close = () => dispatch({ type: "closeInherited" });
  const scopeFlag = ["--project", scopePath ?? scope];

  const actions: InheritedAction[] = [
    {
      label: "Pin to this project",
      hint: "Add a project symlink so this skill stays here even if Global changes. The cell becomes solid (pinned).",
      cmd: ["skl", "use", skill, "--agent", agent, ...scopeFlag],
      kind: "run",
      run: () => {
        close();
        void commands.deploy(skill, agent, scope, true, scopePath ?? undefined);
      },
    },
    {
      label: "Manage in Global",
      hint: "Switch to the Global scope to edit this skill's global deployment. Removing it from Global affects ALL projects, not just this one.",
      cmd: [],
      kind: "nav",
      caution: true,
      run: () => {
        close();
        dispatch({ type: "setScope", scope: GLOBAL_SCOPE, scopePath: null });
      },
    },
  ];

  return (
    <>
      <div
        onClick={close}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(24,24,27,0.42)",
          zIndex: 65,
          animation: "var(--animate-scrim-in)",
        }}
      />
      <div
        role="dialog"
        aria-label={`Active via Global: ${skill}`}
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          zIndex: 66,
          width: 460,
          maxWidth: "92vw",
          background: "#FFFFFF",
          borderRadius: 14,
          boxShadow: "0 24px 70px rgba(0,0,0,.3)",
          padding: "20px 20px 16px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 6,
          }}
        >
          <span
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: "#EEF2FF",
              color: "#4F46E5",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 15,
              flexShrink: 0,
            }}
          >
            ↧
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 650, lineHeight: 1.2 }}>
              Active here via Global
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 11,
                color: "#71717A",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {skill} · {agent} · {scope}
            </div>
          </div>
        </div>
        <p
          style={{
            fontSize: 12.5,
            color: "#52525B",
            lineHeight: 1.5,
            margin: "0 0 14px",
          }}
        >
          This skill is deployed in Global, so {agent} loads it in every project —
          including this one — with no local symlink. You can't disable it just
          here; pin it to make it explicit, or manage the Global deployment.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {actions.map((a, i) => (
            <button
              key={a.label + i}
              onClick={a.run}
              style={{
                display: "block",
                textAlign: "left",
                width: "100%",
                background: a.caution ? "#FEFCE8" : "#FFFFFF",
                border: "1px solid " + (a.caution ? "#EDE7C3" : "#E2E2E5"),
                borderRadius: 9,
                padding: "9px 12px",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 2,
                }}
              >
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: a.caution ? "#92700A" : "#18181B",
                  }}
                >
                  {a.label}
                </span>
                {a.caution ? (
                  <span
                    style={{
                      fontSize: 9.5,
                      color: "#A1820C",
                      border: "1px solid #EADFB0",
                      borderRadius: 4,
                      padding: "0 5px",
                      fontWeight: 500,
                    }}
                  >
                    affects all projects
                  </span>
                ) : null}
              </div>
              <div style={{ fontSize: 11.5, color: "#71717A", lineHeight: 1.4 }}>
                {a.hint}
              </div>
              {a.cmd.length ? (
                <div
                  style={{
                    marginTop: 5,
                    fontFamily: MONO,
                    fontSize: 10,
                    color: "#A1A1AA",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  $ {a.cmd.join(" ")}
                </div>
              ) : null}
            </button>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: 14,
          }}
        >
          <button
            onClick={close}
            style={{
              background: "#FFFFFF",
              border: "1px solid #E2E2E5",
              color: "#3F3F46",
              borderRadius: 8,
              padding: "6px 14px",
              fontSize: 12.5,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
