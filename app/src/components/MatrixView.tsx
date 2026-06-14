// Matrix tab (ADR-0008, mockup lines 232-267; renderVals 709-749). A skill ×
// (domain|agent) grid in a white card. Two leading columns persist in both
// modes: a sticky SKILL name (opens the drawer) and a SOURCE column. Cells are
// display-only here — toggling deployments lives in the drawer AGENTS rail.

import { useStore } from "../state/store";
import { useLibrary, useAgents } from "../state/queries";
import { effState } from "../lib/agents";
import { DEPLOY_GLYPH, MONO } from "../lib/tokens";
import type { AgentsReport } from "../lib/types";

const DOM_COLS = [
  "green-card",
  "content",
  "business",
  "sci-writing",
  "docs",
  "meta",
  "philosophy",
  "ops",
  "bioinfo",
  "browser",
  "media",
];

const thBase: React.CSSProperties = {
  textAlign: "center",
  padding: "9px 7px",
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.02em",
  borderBottom: "1px solid #E7E7E9",
  whiteSpace: "nowrap",
  minWidth: 60,
};
const tdBase: React.CSSProperties = {
  textAlign: "center",
  padding: "7px 7px",
  borderBottom: "1px solid #F3F3F4",
};

const EMPTY_AGENTS: AgentsReport = { agents: [], scopes: [], deployments: {} };

export function MatrixView() {
  const { state, dispatch } = useStore();
  const skills = (useLibrary().data ?? []).filter(
    (s) => !s.retired && !state.removedHard[s.name],
  );
  const agentsReport = useAgents().data ?? EMPTY_AGENTS;
  const isAgent = state.matrixMode === "agent";

  const cols = isAgent ? agentsReport.agents.map((a) => a.id) : DOM_COLS;
  const colLabels = isAgent
    ? agentsReport.agents.map((a) => a.short)
    : DOM_COLS;

  return (
    <div style={{ padding: "14px 16px" }}>
      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #E7E7E9",
          borderRadius: 11,
          overflow: "auto",
        }}
      >
        <table
          style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}
        >
          <thead>
            <tr style={{ background: "#FBFBFC" }}>
              <th
                style={{
                  position: "sticky",
                  left: 0,
                  background: "#FBFBFC",
                  zIndex: 2,
                  textAlign: "left",
                  padding: "9px 12px",
                  fontSize: 10.5,
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                  color: "#9A9AA2",
                  borderBottom: "1px solid #E7E7E9",
                  borderRight: "1px solid #EFEFF1",
                }}
              >
                SKILL
              </th>
              <th
                style={{
                  textAlign: "left",
                  padding: "9px 10px",
                  fontSize: 10.5,
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                  color: "#9A9AA2",
                  borderBottom: "1px solid #E7E7E9",
                }}
              >
                SOURCE
              </th>
              {cols.map((col, i) => {
                const installed = isAgent
                  ? agentsReport.agents[i]?.installed
                  : true;
                return (
                  <th
                    key={col}
                    style={{
                      ...thBase,
                      color: installed ? "#9A9AA2" : "#CFCFD4",
                    }}
                  >
                    {colLabels[i]}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {skills.map((skill) => {
              const isVendor = skill.source === "vendored";
              const untagged = !isAgent && skill.domains.length === 0;
              return (
                <tr
                  key={skill.name}
                  style={{ background: untagged ? "#FCFBF4" : "transparent" }}
                >
                  <td
                    style={{
                      position: "sticky",
                      left: 0,
                      zIndex: 1,
                      background: untagged ? "#FCFBF4" : "#FFFFFF",
                      padding: 0,
                      borderBottom: "1px solid #F3F3F4",
                      borderRight: "1px solid #EFEFF1",
                    }}
                  >
                    <button
                      onClick={() =>
                        dispatch({ type: "openDrawer", name: skill.name })
                      }
                      style={{
                        width: "100%",
                        padding: "7px 12px",
                        fontSize: 12,
                        fontWeight: 550,
                        color: "#18181B",
                        whiteSpace: "nowrap",
                        cursor: "pointer",
                        fontFamily: MONO,
                        background: "none",
                        border: "none",
                        textAlign: "left",
                      }}
                    >
                      {skill.name}
                    </button>
                  </td>
                  <td
                    style={{
                      padding: "7px 10px",
                      borderBottom: "1px solid #F3F3F4",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span
                      style={
                        isVendor
                          ? { color: "#2563EB", fontFamily: MONO, fontSize: 10.5 }
                          : { color: "#9A9AA2", fontSize: 11 }
                      }
                    >
                      {isVendor ? "dbskill" : "local"}
                    </span>
                  </td>
                  {cols.map((col, i) => {
                    if (isAgent) {
                      const st = effState(
                        agentsReport,
                        state.deployOverrides,
                        skill.name,
                        agentsReport.agents[i].id,
                        state.scope,
                      );
                      const g = DEPLOY_GLYPH[st];
                      return (
                        <td key={col} style={tdBase}>
                          <span
                            style={{
                              color: g.color,
                              fontSize: 13,
                              fontWeight: st === "clean" ? 700 : 500,
                              lineHeight: 1,
                            }}
                          >
                            {g.glyph}
                          </span>
                        </td>
                      );
                    }
                    const isPrimary = skill.primaryDomain === col;
                    const isAlso = skill.domains.includes(col) && !isPrimary;
                    return (
                      <td key={col} style={tdBase}>
                        {isPrimary ? (
                          <span
                            style={{
                              color: "#18181B",
                              fontSize: 13,
                              fontWeight: 700,
                              lineHeight: 1,
                            }}
                          >
                            ●
                          </span>
                        ) : isAlso ? (
                          <span
                            style={{
                              color: "#B6B6BC",
                              fontSize: 13,
                              lineHeight: 1,
                            }}
                          >
                            ◦
                          </span>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* legend (swaps per mode) */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "6px 16px",
          marginTop: 13,
          padding: "11px 14px",
          background: "#FFFFFF",
          border: "1px solid #E7E7E9",
          borderRadius: 10,
          fontSize: 11.5,
          color: "#52525B",
        }}
      >
        <span
          style={{
            fontWeight: 600,
            color: "#9A9AA2",
            letterSpacing: "0.04em",
            marginRight: 4,
          }}
        >
          LEGEND
        </span>
        {isAgent ? (
          <>
            <LegendChip glyph="✓" label="linked" color="#15A34A" weight={700} />
            <LegendChip glyph="⊙" label="source" color="#71717A" weight={500} />
            <LegendChip glyph="⚠" label="drift" color="#D97706" weight={500} />
            <LegendChip glyph="□" label="copy" color="#D97706" weight={500} />
            <LegendChip glyph="·" label="absent" color="#D4D4D8" weight={500} />
          </>
        ) : (
          <>
            <LegendChip
              glyph="●"
              label="primary domain"
              color="#18181B"
              weight={700}
            />
            <LegendChip
              glyph="◦"
              label="also-tagged"
              color="#B6B6BC"
              weight={400}
            />
            <span style={{ color: "#C7C7CC" }}>·</span>
            <span style={{ color: "#9A9AA2" }}>empty row = untagged</span>
          </>
        )}
      </div>
    </div>
  );
}

function LegendChip({
  glyph,
  label,
  color,
  weight,
}: {
  glyph: string;
  label: string;
  color: string;
  weight: number;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ color, fontWeight: weight }}>{glyph}</span>
      {label}
    </span>
  );
}
