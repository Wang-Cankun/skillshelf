// A single two-line library row (ADR-0010). Replaces the LibraryView table row.
//   line 1: [select] name · owner/repo | Local · (warning) · agent toggles · update
//   line 2: description · dim domain chips
// Click name/desc → openDrawer. owner/repo click-through lives in SourceCell.
// The agent toggles are the shared AgentToggle (size 28) bound to the active
// scope, so a row is deployable straight from the list (delta 5).

import { useStore, GLOBAL_SCOPE } from "../state/store";
import { useAgents } from "../state/queries";
import { domainHue, MONO, DEPLOY_GLYPH } from "../lib/tokens";
import type { AgentsReport, DeployStateName, Skill } from "../lib/types";
import { AgentToggle } from "./AgentToggle";
import { SourceCell } from "./SourceCell";

const EMPTY_AGENTS: AgentsReport = { agents: [], scopes: [], deployments: {} };

const ANOMALY: ReadonlySet<DeployStateName> = new Set<DeployStateName>([
  "drift",
  "copy",
  "dead",
]);

/** Worst anomaly state for the skill in the active scope (for the row warning). */
function worstAnomaly(
  report: AgentsReport,
  skill: string,
  scope: string,
): DeployStateName | null {
  const byAgent = report.deployments[skill];
  if (!byAgent) return null;
  let worst: DeployStateName | null = null;
  const rank: Record<string, number> = { dead: 3, drift: 2, copy: 1 };
  for (const dep of Object.values(byAgent)) {
    const st = scope === GLOBAL_SCOPE ? dep.g : dep.p?.[scope];
    if (st && ANOMALY.has(st)) {
      if (!worst || (rank[st] ?? 0) > (rank[worst] ?? 0)) worst = st;
    }
  }
  return worst;
}

export function SkillRow({ skill }: { skill: Skill }) {
  const { state, dispatch } = useStore();
  const report = useAgents().data ?? EMPTY_AGENTS;
  const checked = !!state.selected[skill.name];

  const agents = report.agents;
  const warning = worstAnomaly(report, skill.name, state.scope);

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
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              minWidth: 0,
              overflow: "hidden",
            }}
          >
            <SourceCell skill={skill} variant="library" />
          </span>
          {warning ? (
            <span
              title={`${warning} in ${state.scope}`}
              style={{
                color: DEPLOY_GLYPH[warning].color,
                fontSize: 12,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {DEPLOY_GLYPH[warning].glyph}
            </span>
          ) : null}

          <span style={{ flex: 1 }} />

          {/* agent toggles for the active scope (delta 5) */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              flexShrink: 0,
            }}
          >
            {agents.map((a) => (
              <AgentToggle
                key={a.id}
                skill={skill.name}
                agentId={a.id}
                scope={state.scope}
                scopePath={state.scopePath ?? undefined}
                size={28}
              />
            ))}
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
                    background:
                      skill.domains.length ? domainHue(d) : "#D4D4D8",
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
