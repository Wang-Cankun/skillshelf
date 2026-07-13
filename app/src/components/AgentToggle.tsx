// The shared THREE-state agent chip (ADR-0010 §4 + inheritance §2/§3, RISK 7).
// The ONE control used by both the list rows (size 28) and the drawer agent×scope
// sub-matrix (size 30).
//
// State is DERIVED, never stored: cellStateFor() reads the agents report (global
// `.g` + project `.p[scope]` deployment states) and the agent's `inheritsGlobal`
// flag for this (skill, agentId, scope). It folds the optimistic deployOverrides
// in first so a just-clicked cell flips immediately. Three project-scope states:
//   • pinned    → solid (today's "on" look): a real project symlink here
//   • inherited → tinted icon + DASHED/HOLLOW ring + "active here via Global"
//   • absent    → plain grey
// Anomaly / source / Global behaviour is UNCHANGED and takes precedence (anomaly
// project states drift/copy/dead are returned verbatim by cellStateFor; Global
// scope returns the raw global state).
//
// Click behaviour:
//   • anomaly (drift / copy / dead / aliased) → openResolve(...)       (never blind-toggle)
//   • inherited                               → openInherited(...)     (info+pin, never toggle)
//   • source                                  → no-op (you can't unlink the origin)
//   • pinned / absent                         → deploy(skill, agentId, scope, !on, scopePath)
//
// A authors this; B imports it read-only (DetailDrawer matrix). Do not widen the
// prop contract without updating both call sites.

import { memo } from "react";
import { useStore } from "../state/store";
import { useAgents, useWhere } from "../state/queries";
import { useCommands } from "../state/commands";
import { cellStateWithOverride, aliasedSiteFor } from "../lib/agents";
import type { CellState } from "../lib/agents";
import { iconFor } from "../lib/agentIcon";
import { DEPLOY_GLYPH } from "../lib/tokens";
import type { AgentsReport, DeployStateName } from "../lib/types";

const EMPTY_AGENTS: AgentsReport = { agents: [], scopes: [], deployments: {} };

export interface AgentToggleProps {
  skill: string;
  agentId: string;
  scope: string;
  scopePath?: string;
  size?: number;
  readOnly?: boolean;
}

// drift/copy/dead are the warning glyphs; "aliased" surfaces as "drift" through
// stateForSite, so the anomaly set is exactly these three derived states.
const ANOMALY: ReadonlySet<DeployStateName> = new Set<DeployStateName>([
  "drift",
  "copy",
  "dead",
]);

function AgentToggleImpl({
  skill,
  agentId,
  scope,
  scopePath,
  size = 28,
  readOnly = false,
}: AgentToggleProps) {
  const { state, dispatch } = useStore();
  const report = useAgents().data ?? EMPTY_AGENTS;
  const where = useWhere().data;
  const commands = useCommands();

  const agent =
    report.agents.find((a) => a.id === agentId) ??
    ({ id: agentId } as AgentsReport["agents"][number]);

  // `cell` is the override-aware three-state model (pinned/inherited/absent +
  // anomaly/source/Global verbatim) from the data layer — the single source of
  // truth shared with CountBar/effectiveCounts. It folds the optimistic
  // deployOverrides so a just-clicked cell flips immediately, then falls back to
  // the override-independent Global state (which may surface `inherited`).
  const cell: CellState = cellStateWithOverride(
    report,
    state.deployOverrides,
    skill,
    agentId,
    scope,
    agent,
  );

  const isPinned = cell === "pinned" || cell === "clean" || cell === "source";
  const isInherited = cell === "inherited";
  const enabled = isPinned;
  const isAnomaly = ANOMALY.has(cell as DeployStateName);
  const isSource = cell === "source";
  const icon = iconFor(agent);

  const onClick = () => {
    if (readOnly || isSource) return;
    if (isInherited) {
      // Inherited cells are NOT toggles: a global skill cannot be locally
      // disabled (no per-project denylist). Open the info+pin popover instead.
      dispatch({
        type: "openInherited",
        target: { skill, agent: agentId, scope, scopePath: scopePath ?? null },
      });
      return;
    }
    if (isAnomaly) {
      const anomaly = cell as DeployStateName; // drift | copy | dead
      // A `drift` cell may really be an `aliased` site (matrix folds them); recover
      // the distinction from the raw `where` feed so ResolvePopover can realign.
      const alias =
        anomaly === "drift" && where
          ? aliasedSiteFor(where, skill, agentId, scope)
          : null;
      // The `copy` site's on-disk path is NOT snapshotted here — ResolvePopover
      // derives it from the live `where` feed at render time (single source).
      dispatch({
        type: "openResolve",
        target: {
          skill,
          agent: agentId,
          scope,
          scopePath: scopePath ?? null,
          state: anomaly,
          ...(alias
            ? {
                aliased: true,
                aliasTarget: alias.target
                  ? alias.target.split("/").filter(Boolean).pop() ?? null
                  : null,
              }
            : {}),
        },
      });
      return;
    }
    // pinned ↔ absent toggle (inherited never reaches here — handled above).
    void commands.deploy(skill, agentId, scope, !isPinned, scopePath);
  };

  const dim = size * 0.62; // inner icon size
  const tint = icon.color;
  const cursor = readOnly || isSource ? "default" : "pointer";

  const baseLabel: Record<DeployStateName, string> = {
    clean: "linked",
    source: "source (lives here)",
    drift: "drift — resolve",
    copy: "copy — resolve",
    dead: "dead link — resolve",
    absent: "not linked",
  };
  const label =
    cell === "pinned"
      ? "pinned here"
      : cell === "inherited"
        ? "active here via Global"
        : baseLabel[cell as DeployStateName];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={readOnly}
      aria-label={`${agent.short ?? agentId} · ${label}`}
      aria-pressed={enabled || isInherited}
      title={`${agent.name ?? agentId} — ${label}`}
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 8,
        // Inherited: tinted DASHED/HOLLOW ring (no fill) — "active via Global" but
        // not pinned. Pinned: solid tinted ring + fill (today's "on"). Absent: bare.
        border: enabled
          ? `1px solid ${tint}40`
          : isInherited
            ? `1px dashed ${tint}80`
            : "1px solid transparent",
        background: enabled ? `${tint}1A` : "transparent",
        boxShadow: enabled ? `0 0 0 1px ${tint}33 inset` : "none",
        padding: 0,
        cursor,
        flexShrink: 0,
        transition: "background 100ms, border-color 100ms",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: dim,
          height: dim,
          // Inherited icon sits between solid (1) and absent (0.35) so the cell
          // reads as "available, but via Global" at a glance.
          opacity: enabled ? 1 : isInherited ? 0.7 : 0.35,
        }}
      >
        {icon.svgUrl ? (
          <img
            src={icon.svgUrl}
            alt=""
            draggable={false}
            style={{ width: dim, height: dim, objectFit: "contain" }}
          />
        ) : (
          <span
            style={{
              width: dim,
              height: dim,
              borderRadius: "50%",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: tint,
              color: "#FFFFFF",
              fontSize: dim * 0.6,
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            {icon.letter}
          </span>
        )}
      </span>
      {isAnomaly ? (
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: -3,
            right: -3,
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: "#FFFFFF",
            color: DEPLOY_GLYPH[cell as DeployStateName].color,
            fontSize: 9,
            fontWeight: 700,
            lineHeight: "12px",
            textAlign: "center",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.08)",
          }}
        >
          {DEPLOY_GLYPH[cell as DeployStateName].glyph}
        </span>
      ) : null}
    </button>
  );
}

// All props are primitives (skill/agentId/scope/scopePath/size/readOnly), so the
// default shallow compare is exact — memo bails out on pure parent-driven re-renders.
// CAVEAT: this component calls useStore(), and the store exposes a single context
// value { state, dispatch } recreated on every dispatch (store.tsx). So any store
// mutation (a deploy override, selection, search) still re-renders EVERY chip
// regardless of this memo — context consumers always re-render when the value
// changes. Realising the per-cell win needs the store split into selector-based
// subscriptions; until then this memo only helps the non-store render paths.
export const AgentToggle = memo(AgentToggleImpl);
