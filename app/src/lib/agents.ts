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
export const AGENT_SEEDS: AgentInfo[] = [
  {
    id: "claude",
    name: "Claude Code",
    short: "Claude",
    global: "~/.claude/skills",
    projConvention: ".claude/skills",
    installed: true,
  },
  {
    id: "codex",
    name: "Codex",
    short: "Codex",
    global: "~/.codex/skills",
    projConvention: ".codex/skills",
    installed: true,
  },
  {
    id: "pi",
    name: "Pi",
    short: "Pi",
    global: "~/.pi/skills",
    projConvention: ".pi/skills",
    installed: true,
  },
];

const AGENT_IDS = AGENT_SEEDS.map((a) => a.id);

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
 */
export function deriveAgentsReport(where: DeploymentReport): AgentsReport {
  const home = inferHome(where.surfaces);
  const deployments: Record<string, Record<string, AgentDeployment>> = {};
  const scopeSet = new Set<string>(["Global"]);

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
  const agents = AGENT_SEEDS.map((a) => ({
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
