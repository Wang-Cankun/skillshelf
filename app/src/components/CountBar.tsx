// Count bar (ADR-0010 delta 4 trigger). Sits under the toolbar: a computed
// "Installed N" for the active scope plus a per-agent count chip, and the gear
// that opens the AgentSettingsPopover (detected agents + custom-agent form).
// All counts derive from the agents report for the ACTIVE scope (Global or the
// project) — never fabricated.

import { useState } from "react";
import { useStore } from "../state/store";
import { useAgents, useLibrary } from "../state/queries";
import { GLOBAL_SCOPE } from "../state/store";
import { effectiveCounts, cellStateWithOverride } from "../lib/agents";
import { iconFor } from "../lib/agentIcon";
import { MONO } from "../lib/tokens";
import type { AgentsReport } from "../lib/types";
import { AgentSettingsPopover } from "./AgentSettingsPopover";

const EMPTY_AGENTS: AgentsReport = { agents: [], scopes: [], deployments: {} };

export function CountBar() {
  const { state } = useStore();
  const report = useAgents().data ?? EMPTY_AGENTS;
  const skills = (useLibrary().data ?? []).filter(
    (s) => !s.retired && !state.removedHard[s.name],
  );
  const [gearOpen, setGearOpen] = useState(false);

  const agents = report.agents;
  const isProject = state.scope !== GLOBAL_SCOPE;
  // Per-agent effective availability (pinned ∪ inherited) from the data-layer
  // single source of truth (cellStateFor). In a project scope this surfaces the
  // pinned/inherited breakdown (ADR-0010 §4); in Global, inherited is always 0.
  const counts = effectiveCounts(
    report,
    agents,
    state.scope,
    skills,
    state.deployOverrides,
  );
  // "Installed N" = distinct skills effectively active for ANY agent in the
  // active scope. Routed through cellStateWithOverride — the same override-aware
  // resolver the chip and effectiveCounts use — so the total moves the instant a
  // cell is pinned/unpinned. In a project "active" means pinned OR inherited-via-
  // Global; in Global it's any non-absent (clean/source/anomaly) cell.
  const installed = skills.filter((s) =>
    agents.some((a) => {
      const c = cellStateWithOverride(
        report,
        state.deployOverrides,
        s.name,
        a.id,
        state.scope,
        a,
      );
      return isProject
        ? c === "pinned" || c === "inherited"
        : c !== "absent";
    }),
  ).length;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "7px 16px",
        borderBottom: "1px solid #EFEFF1",
        background: "#FFFFFF",
        fontSize: 11.5,
        color: "#71717A",
      }}
    >
      <span
        style={{ fontWeight: 600, color: "#3F3F46" }}
        title={
          isProject
            ? "Distinct skills active here — pinned to this project or inherited via Global"
            : undefined
        }
      >
        {isProject ? "Active here" : "Installed"}{" "}
        <span style={{ fontFamily: MONO, color: "#18181B" }}>{installed}</span>
      </span>
      <span style={{ color: "#D4D4D8" }}>·</span>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {agents.map((a) => {
          const icon = iconFor(a);
          const c = counts[a.id] ?? { pinned: 0, inherited: 0, effective: 0 };
          // Project: show effective (pinned ∪ inherited) with a faded "+N via
          // Global" suffix and the full breakdown in the tooltip. Global: plain
          // active count, no inheritance.
          const n = isProject ? c.effective : c.pinned;
          const title = isProject
            ? `${a.name} — ${n} active here (${c.pinned} pinned + ${c.inherited} via Global)`
            : `${a.name} — ${n} in ${state.scope}`;
          return (
            <span
              key={a.id}
              title={title}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                opacity: n ? 1 : 0.5,
              }}
            >
              {icon.svgUrl ? (
                <img
                  src={icon.svgUrl}
                  alt=""
                  style={{ width: 13, height: 13, objectFit: "contain" }}
                />
              ) : (
                <span
                  style={{
                    width: 13,
                    height: 13,
                    borderRadius: "50%",
                    background: icon.color,
                    color: "#FFFFFF",
                    fontSize: 8,
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {icon.letter}
                </span>
              )}
              <span style={{ color: "#52525B" }}>{a.short}</span>
              <span style={{ fontFamily: MONO, color: "#9A9AA2" }}>{n}</span>
              {isProject && c.inherited ? (
                <span style={{ fontFamily: MONO, color: "#C7C7CC", fontSize: 10.5 }}>
                  ({c.pinned}+{c.inherited})
                </span>
              ) : null}
            </span>
          );
        })}
      </div>
      <span style={{ flex: 1 }} />
      <div style={{ position: "relative" }}>
        <button
          onClick={() => setGearOpen((o) => !o)}
          aria-label="agent settings"
          aria-expanded={gearOpen}
          title="Manage agents"
          style={{
            background: gearOpen ? "#F4F4F5" : "none",
            border: "1px solid #E7E7E9",
            borderRadius: 7,
            padding: "3px 9px",
            fontSize: 12.5,
            cursor: "pointer",
            color: "#52525B",
            fontFamily: "inherit",
          }}
        >
          ⚙
        </button>
        {gearOpen ? (
          <AgentSettingsPopover onClose={() => setGearOpen(false)} />
        ) : null}
      </div>
    </div>
  );
}
