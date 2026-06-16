// The library list (ADR-0010, replaces LibraryView). Two-line rows (SkillRow)
// with a meta strip carrying Select-all (delta 1). The row set is the library
// sliced by the active scope/range and the search/filter/sort toolbar state:
//   • Global → the full library (range ignored).
//   • project + "installed" → only skills deployed in that scope.
//   • project + "all" → the full library (so you can deploy new ones here).
// The `{kind:"needs"}` filter and the `attention` sort both consult the agents
// report (anomaly state lives there, not on Skill), which this component owns.

import { useCallback, useDeferredValue, useMemo } from "react";
import { useStore } from "../state/store";
import { GLOBAL_SCOPE } from "../state/store";
import { useLibrary, useAgents, useWhere } from "../state/queries";
import { libraryView } from "../lib/select";
import { needsAttentionNames } from "../lib/derive";
import { effState } from "../lib/agents";
import type { AgentsReport, DeployStateName, Skill } from "../lib/types";
import { MONO } from "../lib/tokens";
import { SkillRow } from "./SkillRow";
import { RetiredRow } from "./RetiredRow";

const EMPTY_AGENTS: AgentsReport = { agents: [], scopes: [], deployments: {} };

const ANOMALY: ReadonlySet<DeployStateName> = new Set<DeployStateName>([
  "drift",
  "copy",
  "dead",
]);

/** Anomaly weight of a skill across all agents at all scopes (drives `needs`
 *  filter membership + `attention` sort). 0 = clean everywhere. */
export function anomalyWeight(report: AgentsReport, skill: string): number {
  const byAgent = report.deployments[skill];
  if (!byAgent) return 0;
  let w = 0;
  for (const dep of Object.values(byAgent)) {
    if (dep.g && ANOMALY.has(dep.g)) w++;
    if (dep.p) for (const st of Object.values(dep.p)) if (ANOMALY.has(st)) w++;
  }
  return w;
}

/** Is the skill deployed (any non-absent state) for any agent in `scope`?
 *  Reads through `effState` so an optimistic deploy/drop slices this scope's
 *  "installed" view immediately (matches the AgentToggle's derived read). */
export function deployedInScope(
  report: AgentsReport,
  overrides: Record<string, "on" | "off">,
  skill: string,
  scope: string,
): boolean {
  const byAgent = report.deployments[skill];
  // No deployment row AND no optimistic override → definitely absent. (A fresh
  // optimistic "on" for a never-deployed skill still has no report row, so also
  // check the override keyspace below.)
  const agentIds = byAgent
    ? Object.keys(byAgent)
    : report.agents.map((a) => a.id);
  for (const agentId of agentIds) {
    const st = effState(report, overrides, skill, agentId, scope);
    if (st !== "absent") return true;
  }
  return false;
}

const headStyle: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: "0.05em",
  color: "#9A9AA2",
};

export function SkillList() {
  const { state, dispatch } = useStore();
  const skills = useLibrary().data ?? [];
  const report = useAgents().data ?? EMPTY_AGENTS;
  const where = useWhere().data;

  // The {kind:"needs"} filter is the folded Inbox (ADR-0010 §6): a library-wide
  // triage that is ORTHOGONAL to scope (left-rail filter, §84). It must show
  // EXACTLY the same set the sidebar badge counts, so the pipeline filters by the
  // ONE needsAttentionNames set and it bypasses the project-installed scope slice
  // below (otherwise the count and the rows would diverge again — Bug 3).
  // ponytail: defer the search term feeding the heavy filter/sort/group view so
  // keystrokes keep the input snappy (the list re-renders at low priority). Native
  // React 19 — no store split / debounce util needed. Upgrade to a selector-based
  // store only if click-driven re-renders also measurably jank.
  const deferredSearch = useDeferredValue(state.search);
  const needsFilter = state.filter?.kind === "needs";
  const retiredFilter = state.filter?.kind === "retired";
  // Memoized so the Set isn't rebuilt (and the view memo below isn't busted) on
  // every parent render — only when the library or deployment feed changes.
  const needsNames = useMemo(
    () => (needsFilter && where ? needsAttentionNames(skills, where) : null),
    [needsFilter, where, skills],
  );

  // 1. base filter/sort/group pipeline (search + source/domain/untagged/needs).
  // Memoized on its REAL inputs so an unrelated re-render (e.g. a deploy toggle
  // that only touches the agents report) doesn't recompute the whole filter/
  // sort/group pass over the library. The output buckets keep identity, which is
  // what lets the memoized SkillRow children bail out.
  const view = useMemo(
    () =>
      libraryView(skills, {
        filter: state.filter,
        search: deferredSearch,
        sort: state.sort,
        sortDir: state.sortDir,
        group: state.group,
        retired: state.retired,
        unretired: state.unretired,
        removedHard: state.removedHard,
        needsNames,
      }),
    [
      skills,
      state.filter,
      deferredSearch,
      state.sort,
      state.sortDir,
      state.group,
      state.retired,
      state.unretired,
      state.removedHard,
      needsNames,
    ],
  );

  // 2. scope/range slice + anomaly-aware overlays the pure selector can't do
  //    (it has no agents report). Re-bucket after filtering each bucket's rows.
  const projectInstalled =
    !needsFilter &&
    !retiredFilter &&
    state.scope !== GLOBAL_SCOPE &&
    state.range === "installed";

  const sliceRows = useCallback(
    (rows: Skill[]): Skill[] => {
      let r = rows;
      if (projectInstalled)
        r = r.filter((s) =>
          deployedInScope(report, state.deployOverrides, s.name, state.scope),
        );
      if (state.sort === "attention") {
        const sign = state.sortDir === "desc" ? -1 : 1;
        r = r
          .slice()
          .sort(
            (a, b) =>
              sign * (anomalyWeight(report, b.name) - anomalyWeight(report, a.name)) ||
              (a.name < b.name ? -1 : 1),
          );
      }
      return r;
    },
    [
      projectInstalled,
      report,
      state.deployOverrides,
      state.scope,
      state.sort,
      state.sortDir,
    ],
  );

  // Memoized so the anomaly/installed overlay pass only re-runs when the view or
  // the deployment-derived inputs (report, overrides, scope, range, sort) change.
  const buckets = useMemo(
    () =>
      view.buckets
        .map((b) => ({ ...b, rows: sliceRows(b.rows) }))
        .filter((b) => b.rows.length > 0),
    [view, sliceRows],
  );

  const visibleNames = buckets.flatMap((b) => b.rows.map((r) => r.name));
  const allSelected =
    visibleNames.length > 0 && visibleNames.every((n) => state.selected[n]);
  const someSelected = visibleNames.some((n) => state.selected[n]);

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
        {/* meta strip — Select-all (delta 1) + the visible count. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 14px",
            borderBottom: "1px solid #E7E7E9",
            background: "#FBFBFC",
          }}
        >
          <button
            onClick={() =>
              dispatch({
                type: "setSelectedMany",
                names: visibleNames,
                value: !allSelected,
              })
            }
            disabled={visibleNames.length === 0}
            aria-label={allSelected ? "deselect all" : "select all"}
            aria-pressed={allSelected}
            title={
              allSelected ? "Deselect all" : `Select all ${visibleNames.length}`
            }
            style={{
              width: 22,
              fontSize: 14,
              lineHeight: 1,
              color: allSelected || someSelected ? "#2563EB" : "#C7C7CC",
              background: "none",
              border: "none",
              padding: 0,
              cursor: visibleNames.length ? "pointer" : "default",
              textAlign: "left",
            }}
          >
            {allSelected ? "☑" : someSelected ? "▣" : "☐"}
          </button>
          <span style={headStyle}>SKILL</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontFamily: MONO, fontSize: 11, color: "#9A9AA2" }}>
            {visibleNames.length}
          </span>
        </div>

        {visibleNames.length === 0 ? (
          <div style={{ padding: "28px 14px", fontSize: 12.5, color: "#9A9AA2" }}>
            {needsFilter
              ? "Nothing needs attention here."
              : retiredFilter
                ? "Nothing retired."
                : projectInstalled
                ? "No skills installed in this project yet — switch to All to deploy some."
                : "No skills match."}
          </div>
        ) : (
          buckets.map((bucket, bi) => (
            <div key={bucket.label || `bucket-${bi}`}>
              {bucket.hasLabel ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 14px",
                    background: "#FBFBFC",
                    borderBottom: "1px solid #F0F0F1",
                    fontSize: 10.5,
                    fontWeight: 600,
                    letterSpacing: "0.05em",
                    color: "#9A9AA2",
                  }}
                >
                  <span>{bucket.label}</span>
                  <span style={{ fontFamily: MONO, color: "#C7C7CC" }}>
                    {bucket.rows.length}
                  </span>
                </div>
              ) : null}
              {bucket.rows.map((skill) =>
                retiredFilter ? (
                  <RetiredRow key={skill.name} skill={skill} />
                ) : (
                  <SkillRow key={skill.name} skill={skill} />
                ),
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
