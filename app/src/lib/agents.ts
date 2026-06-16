// Multi-agent registry + the surface→agent resolver (ADR-0008 §6/§7.3).
//
// `skl agents --json` will eventually emit AgentsReport directly. Until that
// ships, deriveAgentsReport() reconstructs the same shape from the real
// `where --json` feed by mapping each deployment site's surface path to an
// agent id + scope (Global vs a named project), and its kind/drift to a
// deployment state. This keeps every value a backend fact (ADR-0007).

import type {
  AgentInfo,
  AgentsReport,
  AgentDeployment,
  DeployStateName,
  DeploymentReport,
  DeploymentSite,
} from "./types";

// Registry seeds — the agents this user actually deploys to: Claude Code,
// Codex, and Pi. `installed` is overridden at runtime if the real feed knows
// better; these are the defaults. (To add more agents, append here AND extend
// the inferHome regex below + the Rust agent surface set.)
//
// This list INTENTIONALLY diverges from the ENGINE seed list in
// `src/core/agents.ts` (claude, codex, cursor, opencode, gemini; no `pi`). The
// engine errs toward broad on-disk detection; the app shows the user's real 2–3
// agents and reconstructs the report in the browser dev fallback. The two are
// NOT meant to match — net-new/overridden agents flow through the config `agents`
// block (delta 4) on both sides. Keep this comment in sync with its twin over
// AGENT_SEEDS in src/core/agents.ts when changing either list.
export const AGENT_SEEDS: AgentInfo[] = [
  {
    id: "claude",
    name: "Claude Code",
    short: "Claude",
    global: "~/.claude/skills",
    projConvention: ".claude/skills",
    installed: true,
    inheritsGlobal: true,
  },
  {
    id: "codex",
    name: "Codex",
    short: "Codex",
    global: "~/.codex/skills",
    projConvention: ".codex/skills",
    installed: true,
    inheritsGlobal: true,
  },
  {
    id: "pi",
    name: "Pi",
    short: "Pi",
    global: "~/.pi/skills",
    projConvention: ".pi/skills",
    installed: true,
    inheritsGlobal: true,
  },
];

const AGENT_IDS = AGENT_SEEDS.map((a) => a.id);

/**
 * Merge custom-agent config entries onto the built-in seeds (ADR-0010 §9 /
 * delta 4): same id = field-level override (custom wins), new id = append.
 * Order: seeds first (in seed order), then any net-new custom agents. This is
 * the ONE merge used by both `deriveAgentsReport` and `prefs.visibleAgents` so
 * the registry has a single source of truth.
 */
export function mergeAgents(
  seeds: AgentInfo[],
  custom?: AgentInfo[],
): AgentInfo[] {
  if (!custom?.length) return [...seeds];
  const byId = new Map<string, AgentInfo>(seeds.map((a) => [a.id, a]));
  const order = seeds.map((a) => a.id);
  for (const c of custom) {
    if (byId.has(c.id)) byId.set(c.id, { ...byId.get(c.id)!, ...c });
    else {
      byId.set(c.id, c);
      order.push(c.id);
    }
  }
  return order.map((id) => byId.get(id)!);
}

/** Detect which agent a surface path belongs to (by its `.<id>` segment). */
export function agentIdForSurface(surface: string): string | null {
  for (const id of AGENT_IDS) {
    if (
      surface.includes(`/.${id}/`) ||
      surface.endsWith(`/.${id}/skills`) ||
      surface.includes(`/.${id}/skills`)
    ) {
      return id;
    }
  }
  return null;
}

/**
 * Infer the user HOME prefix from the surface set (the `~/.<agent>` sites).
 *
 * DEV/BROWSER FALLBACK ONLY: this heuristic is used when `skl agents --json`
 * (which would carry an explicit home) is unavailable. It derives HOME as the
 * longest common path prefix shared by all agent-dir parents — the global
 * `~/.<agent>` sites all share the home root, while project sites scatter under
 * different roots, so the shared prefix collapses to the home directory. This
 * avoids the previous denylist-of-path-substrings approach, but a single
 * agent-dir parent (or only project sites) can still be ambiguous; the Tauri
 * path should supply a real home once available.
 */
function inferHome(surfaces: string[]): string | null {
  const parents: string[] = [];
  for (const s of surfaces) {
    const m = s.match(/^(.*)\/\.(claude|codex|pi)\/skills?$/);
    if (m) parents.push(m[1]);
  }
  if (!parents.length) return null;
  if (parents.length === 1) return parents[0];

  const split = parents.map((p) => p.split("/"));
  const first = split[0];
  let i = 0;
  for (; i < first.length; i++) {
    const seg = first[i];
    if (!split.every((parts) => parts[i] === seg)) break;
  }
  const prefix = first.slice(0, i).join("/");
  return prefix || null;
}

/**
 * Resolve a surface to a scope name: "Global" when the agent dir sits directly
 * under HOME, else the enclosing project's directory name.
 */
export function scopeForSurface(surface: string, home: string | null): string {
  const id = agentIdForSurface(surface);
  if (id && home && surface.startsWith(`${home}/.${id}/`)) return "Global";
  // strip a trailing `/.<id>/skills` or `/skills` to get the project root.
  let root = surface;
  if (id) {
    const idx = surface.indexOf(`/.${id}/`);
    if (idx >= 0) root = surface.slice(0, idx);
  } else {
    root = surface.replace(/\/skills?$/, "");
  }
  const base = root.split("/").filter(Boolean).pop();
  return base || "Global";
}

function stateForSite(site: DeploymentSite): DeployStateName {
  switch (site.kind) {
    case "linked":
      return site.drift ? "drift" : "clean";
    case "source":
      return "source";
    case "copy":
      return "copy";
    case "foreign-link":
      return "copy";
    case "aliased":
      return "drift";
    case "dead":
      return "dead";
    default:
      return "absent";
  }
}

// rank to keep the "strongest" signal if two sites collide on the same key.
const RANK: Record<DeployStateName, number> = {
  dead: 5,
  drift: 4,
  copy: 3,
  source: 2,
  clean: 1,
  absent: 0,
};

/**
 * Build an AgentsReport from a DeploymentReport (the dev/browser fallback for
 * `skl agents --json`). Project copies shadow nothing here — we record every
 * resolvable site; the drawer/matrix apply the "copy shadows global" read rule.
 *
 * `opts.agents` merges custom-agent entries (delta 4) onto the built-in seeds
 * (id match = override, new id = append). `opts.extraScopes` unions persisted-
 * but-empty project basenames (§5a) into `scopes` WITHOUT fabricating any
 * deployment — empty scopes read as all-absent (derive-from-FS invariant).
 */
export function deriveAgentsReport(
  where: DeploymentReport,
  opts: { agents?: AgentInfo[]; extraScopes?: string[] } = {},
): AgentsReport {
  const home = inferHome(where.surfaces);
  const deployments: Record<string, Record<string, AgentDeployment>> = {};
  const scopeSet = new Set<string>(["Global"]);
  for (const sc of opts.extraScopes ?? [])
    if (sc && sc !== "Global") scopeSet.add(sc);

  const allSites = [...where.sites, ...where.problems];
  for (const site of allSites) {
    const id = agentIdForSurface(site.surface);
    if (!id) continue;
    const scope = scopeForSurface(site.surface, home);
    if (scope !== "Global") scopeSet.add(scope);
    const state = stateForSite(site);

    const perAgent = (deployments[site.name] ??= {});
    const dep = (perAgent[id] ??= {});
    if (scope === "Global") {
      if (!dep.g || RANK[state] > RANK[dep.g]) dep.g = state;
    } else {
      dep.p ??= {};
      const cur = dep.p[scope];
      if (!cur || RANK[state] > RANK[cur]) dep.p[scope] = state;
    }
  }

  // installed = an agent has at least one resolvable site, OR its seed default.
  const seen = new Set<string>();
  for (const byAgent of Object.values(deployments))
    for (const id of Object.keys(byAgent)) seen.add(id);
  const agents = mergeAgents(AGENT_SEEDS, opts.agents).map((a) => ({
    ...a,
    installed: a.installed || seen.has(a.id),
  }));

  // Stable scope ordering: Global first, then project names alphabetically.
  const scopes = [
    "Global",
    ...[...scopeSet].filter((s) => s !== "Global").sort(),
  ];

  return { agents, scopes, deployments };
}

/**
 * Detect whether a (skill, agent, scope) cell is backed by an `aliased`
 * deployment site (a link deployed under the WRONG name — ADR-0010 §4). The
 * agent matrix folds `aliased` into the derived `drift` state (stateForSite), so
 * a cell alone can't tell drift from alias-divergence. ResolvePopover needs the
 * distinction to offer "Realign name" instead of the diff/pull drift menu, so we
 * recover it from the raw `where` feed (the only place `kind:"aliased"` survives).
 *
 * The matrix keys an aliased site by its alias `name` (the wrong name you'd `ls`),
 * which is the same `skill` the AgentToggle renders — so we match on name + the
 * surface's resolved agent id + scope.
 */
export function aliasedSiteFor(
  where: DeploymentReport,
  skill: string,
  agentId: string,
  scope: string,
): DeploymentSite | null {
  const home = inferHome(where.surfaces);
  for (const site of [...where.sites, ...where.problems]) {
    if (site.kind !== "aliased" || site.name !== skill) continue;
    if (agentIdForSurface(site.surface) !== agentId) continue;
    if (scopeForSurface(site.surface, home) !== scope) continue;
    return site;
  }
  return null;
}

/**
 * Recover the raw `copy` (or `foreign-link`) deployment site backing a (skill,
 * agent, scope) cell, from the `where` feed. The matrix renders a `copy` cell but
 * doesn't carry the on-disk PATH of the standalone copy, which the resolve actions
 * need to run real `skl link --at <path>` / `skl import --from <path>` verbs
 * (Bug 1). Mirrors `aliasedSiteFor`: match on name + resolved agent id + scope.
 */
export function copySiteFor(
  where: DeploymentReport,
  skill: string,
  agentId: string,
  scope: string,
): DeploymentSite | null {
  const home = inferHome(where.surfaces);
  for (const site of [...where.sites, ...where.problems]) {
    if (site.kind !== "copy" && site.kind !== "foreign-link") continue;
    if (site.name !== skill) continue;
    if (agentIdForSurface(site.surface) !== agentId) continue;
    if (scopeForSurface(site.surface, home) !== scope) continue;
    return site;
  }
  return null;
}

/**
 * Count of non-absent deployment sites per scope. With `agentId`, counts only
 * that agent's deployments (the deployment grid fixes one agent on the columns);
 * without it, counts across all agents. Drives the location-column count badges.
 */
export function scopeDeployCounts(
  report: AgentsReport,
  agentId?: string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const sc of report.scopes) counts[sc] = 0;
  for (const byAgent of Object.values(report.deployments)) {
    const deps = agentId
      ? byAgent[agentId]
        ? [byAgent[agentId]]
        : []
      : Object.values(byAgent);
    for (const dep of deps) {
      if (dep.g && dep.g !== "absent")
        counts.Global = (counts.Global ?? 0) + 1;
      if (dep.p)
        for (const [sc, st] of Object.entries(dep.p))
          if (st && st !== "absent") counts[sc] = (counts[sc] ?? 0) + 1;
    }
  }
  return counts;
}

/** Total non-absent deployment sites per agent (global + all projects). Drives
 *  the deployment-grid agent picker badges (so an empty agent reads as 0). */
export function agentDeployCounts(report: AgentsReport): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const a of report.agents) counts[a.id] = 0;
  for (const byAgent of Object.values(report.deployments)) {
    for (const [id, dep] of Object.entries(byAgent)) {
      let n = 0;
      if (dep.g && dep.g !== "absent") n++;
      if (dep.p) for (const st of Object.values(dep.p)) if (st !== "absent") n++;
      counts[id] = (counts[id] ?? 0) + n;
    }
  }
  return counts;
}

/** Base deployment state for a (skill, agent, scope) from an AgentsReport. */
export function baseState(
  report: AgentsReport,
  skill: string,
  agentId: string,
  scope: string,
): DeployStateName {
  const dep = report.deployments[skill]?.[agentId];
  if (!dep) return "absent";
  if (scope === "Global") return dep.g ?? "absent";
  return dep.p?.[scope] ?? "absent";
}

/**
 * Effective state applying any optimistic local override (the Undo pattern):
 * override "on" of an absent site reads as clean; "off" reads as absent.
 */
export function effState(
  report: AgentsReport,
  overrides: Record<string, "on" | "off">,
  skill: string,
  agentId: string,
  scope: string,
): DeployStateName {
  const o = overrides[`${skill}|${agentId}|${scope}`];
  const b = baseState(report, skill, agentId, scope);
  if (o === "on") return b === "absent" ? "clean" : b;
  if (o === "off") return "absent";
  return b;
}

/**
 * The three-state cell model for the project-scoped deployment matrix (ADR-0010
 * inheritance), PLUS the existing per-state values that anomalies and the Global
 * scope still carry. SINGLE source of truth for how a (skill, agent, scope) cell
 * reads — AgentToggle, CountBar, SkillList, and the drawer matrix all route here.
 *
 *   'pinned'    — .p[S] is a present/active state (clean/source): a real project
 *                 symlink here. Renders solid (today's "on" look).
 *   'inherited' — NOT pinned AND agent.inheritsGlobal AND the Global state is
 *                 active (clean/source) AND scope !== 'Global': the skill is
 *                 effectively active here via the agent's ~/.<id>/skills auto-load.
 *                 Renders tinted + dashed/hollow ring.
 *   'absent'    — none of the above: plain grey.
 *
 * For the GLOBAL scope this returns the raw global DeployStateName (clean/source/
 * drift/copy/dead/absent) unchanged — inheritance is a project-only notion.
 * ANOMALY states (drift/copy/dead) on the project cell TAKE PRECEDENCE over
 * inherited and are returned verbatim so the existing two-tier anomaly UI wins.
 */
export type CellState = "pinned" | "inherited" | "absent" | DeployStateName;

export function cellStateFor(
  report: AgentsReport,
  skill: string,
  agentId: string,
  scope: string,
  agent: AgentInfo | undefined,
): CellState {
  // Global scope is unchanged: just the raw global state (solid/grey + existing
  // anomaly handling). Inheritance never applies to Global.
  if (scope === "Global") return baseState(report, skill, agentId, "Global");

  const dep = report.deployments[skill]?.[agentId];
  const here = dep?.p?.[scope] ?? "absent";

  // A present/active project deployment = PINNED here (solid). Anomalies on the
  // project cell (drift/copy/dead) are returned verbatim and take precedence over
  // inherited — they keep their existing two-tier behaviour.
  if (here === "clean" || here === "source") return "pinned";
  if (here !== "absent") return here; // drift | copy | dead — anomaly precedence

  // Not pinned + no anomaly. INHERITED only when the agent auto-loads its global
  // dir AND that global deployment is itself active (clean/source). A non-
  // inheriting agent (inheritsGlobal=false) NEVER shows inherited — stays absent.
  if (agent?.inheritsGlobal) {
    const g = dep?.g ?? "absent";
    if (g === "clean" || g === "source") return "inherited";
  }
  return "absent";
}

/**
 * Override-aware cell state — the SINGLE resolver shared by AgentToggle, CountBar
 * (its "Active here"/"Installed" total), and effectiveCounts so a just-pinned or
 * just-unpinned cell and the count bar can never disagree. It layers the optimistic
 * deployOverrides on top of the three-state cellStateFor model exactly as the chip
 * does: when the override makes this cell present/anomalous we trust `eff`; only
 * when the override-aware cell is `absent` do we defer to cellStateFor, which may
 * still surface `inherited` from the (override-independent) Global state. In Global
 * scope cellStateFor returns the raw global state == eff, so behaviour is unchanged.
 */
export function cellStateWithOverride(
  report: AgentsReport,
  overrides: Record<string, "on" | "off">,
  skill: string,
  agentId: string,
  scope: string,
  agent: AgentInfo | undefined,
): CellState {
  const o = overrides[`${skill}|${agentId}|${scope}`];

  // Explicit "off" override (optimistic UNPIN): the stale report may still read
  // this cell as present/clean, so we must NOT fall through to the override-blind
  // cellStateFor (it would resurface the stale `pinned`). Force THIS cell's
  // deployment absent and recompute the floor. In a project scope an inheriting
  // agent whose Global is active drops back to `inherited` (skill still active via
  // Global); otherwise (and in Global scope) the floor is `absent`.
  if (o === "off") {
    if (scope === "Global") return "absent";
    if (agent?.inheritsGlobal) {
      const g = report.deployments[skill]?.[agentId]?.g ?? "absent";
      if (g === "clean" || g === "source") return "inherited";
    }
    return "absent";
  }

  // "on" override (optimistic PIN): effState makes an absent cell read present, so
  // trust it. With no override, effState == baseState; we still defer to
  // cellStateFor so a genuinely-unset cell can surface `inherited`/anomaly state.
  // NORMALIZE the present case through cellStateFor's project mapping so an active
  // project cell reads `pinned` (not the raw `clean`/`source`) — this keeps the
  // chip and effectiveCounts (which match on `pinned`) mutually consistent even
  // with NO override; Global stays its raw state, anomalies pass through verbatim.
  const eff = effState(report, overrides, skill, agentId, scope);
  if (eff === "absent") return cellStateFor(report, skill, agentId, scope, agent);
  if (scope !== "Global" && (eff === "clean" || eff === "source")) return "pinned";
  return eff;
}

/** Per-agent effective-availability breakdown for a NON-Global scope. */
export interface EffectiveCount {
  /** skills with a present/active project symlink here */
  pinned: number;
  /** skills active here ONLY via Global inheritance (not pinned) */
  inherited: number;
  /** pinned ∪ inherited — total effectively available in this scope */
  effective: number;
}

/**
 * Per-agent effective availability for the count bar (ADR-0010 §4): in a NON-
 * Global scope, count what's effectively active = pinned ∪ inherited, with the
 * pinned/inherited breakdown. Derived entirely from cellStateFor (the single
 * source of truth), so the bar can never disagree with the cells.
 *
 * In the GLOBAL scope there is no inheritance: `pinned` counts active global
 * deployments, `inherited` is 0, and `effective` == `pinned`.
 *
 * `overrides` folds the optimistic deployOverrides (default none) through the same
 * cellStateWithOverride resolver the chip uses, so the count tracks a pin/unpin
 * immediately instead of lagging the cell until the next refetch.
 */
export function effectiveCounts(
  report: AgentsReport,
  agents: AgentInfo[],
  scope: string,
  skills: Array<{ name: string }>,
  overrides: Record<string, "on" | "off"> = {},
): Record<string, EffectiveCount> {
  const out: Record<string, EffectiveCount> = {};
  for (const a of agents) {
    let pinned = 0;
    let inherited = 0;
    for (const s of skills) {
      const st = cellStateWithOverride(report, overrides, s.name, a.id, scope, a);
      if (scope === "Global") {
        if (st === "clean" || st === "source") pinned++;
      } else if (st === "pinned") pinned++;
      else if (st === "inherited") inherited++;
    }
    out[a.id] = { pinned, inherited, effective: pinned + inherited };
  }
  return out;
}
