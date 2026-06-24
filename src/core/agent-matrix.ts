// The node-free pure fold at the heart of the agent deployment matrix (ADR-0008
// §6/§7.3). Shared by BOTH the engine (`src/core/agents.ts`) and the app's
// browser dev fallback (`app/src/lib/agents.ts`) so the surface→agent→scope
// math has a SINGLE source of truth instead of two copies that silently drift.
//
// HARD INVARIANT: this module imports NOTHING from node (no node:os/fs/path) and
// NOTHING from React/Vite — pure functions + types only. The engine pulls it in
// by relative path; the app pulls it in through a Vite `@core` alias straight
// into the browser bundle, which only stays node-free because of this rule. The
// fold therefore takes `home` as a param and does all path math with literal `/`
// string ops (every surface path in this app's real data + fixtures is POSIX
// `/`; the app side already hardcoded `/`). A `node:` import here would break the
// browser build — keep it leaf-pure.

import type { DeploymentSite } from "../types.ts";

/** Deployment state of one (skill, agent, scope) cell. */
export type DeployState =
  | "clean"
  | "source"
  | "drift"
  | "copy"
  | "dead"
  | "absent";

/** Per (skill, agent): global state + per-project states. Omitted keys = absent. */
export interface AgentDeployment {
  g?: DeployState;
  p?: Record<string, DeployState>;
}

/** The folded matrix: the scope row order + the skill → agent → deployment map. */
export interface AgentMatrix {
  /** ["Global", ...sorted project names that have a deployment / extra scope] */
  scopes: string[];
  /** skill name -> agent id -> deployment */
  deployments: Record<string, Record<string, AgentDeployment>>;
}

/**
 * Which agent owns a surface path (by its `/.<id>/` dotdir segment), or null.
 * `/`-separated string math ONLY (no node:path sep — this runs in the browser
 * too). INVARIANT: returns the FIRST id in `ids` order that matches, so the
 * caller controls precedence by ordering the widened (seeds + custom) id set.
 */
export function agentIdForSurface(surface: string, ids: readonly string[]): string | null {
  for (const id of ids) {
    if (
      surface.includes(`/.${id}/`) ||
      surface.endsWith(`/.${id}`) ||
      surface.endsWith(`/.${id}/skills`)
    ) {
      return id;
    }
  }
  return null;
}

/**
 * Scope of a surface for a given agent: "Global" when the surface sits directly
 * under HOME (e.g. ~/.claude/skills); otherwise the enclosing project's dir name.
 * Pure `/`-separated string math. INVARIANT: a null/empty `home` (the app's
 * inferHome heuristic miss) means NO surface resolves to Global — every surface
 * falls back to its enclosing basename; the caller accepts that ambiguity.
 */
export function scopeForSurface(
  surface: string,
  agentId: string,
  home: string | null,
): string {
  const homeDot = home ? `${home}/.${agentId}` : null;
  if (homeDot && (surface === homeDot || surface.startsWith(homeDot + "/"))) return "Global";
  // strip from the `/.<id>` segment to get the project root, then take its name.
  const marker = `/.${agentId}`;
  const idx = surface.indexOf(marker);
  const root = idx >= 0 ? surface.slice(0, idx) : surface;
  const base = root.split("/").filter(Boolean).pop();
  return base || "Global";
}

/**
 * Map a site's classification to a deployment state — the UNIFIED SUPERSET that
 * honors `site.drift` on BOTH `linked` AND `copy` kinds (the one behavioral
 * merge between the engine and app originals). Behavior-preserving for both: the
 * engine's real `linked` sites always carry `drift:false` (so still `clean`) and
 * its `copy` drift path is unchanged; the app keeps its fixture-driven linked-
 * drift path AND gains the copy-drift handling it was silently dropping.
 */
export function stateForSite(site: DeploymentSite): DeployState {
  switch (site.kind) {
    case "linked":
      return site.drift ? "drift" : "clean";
    case "source":
      return "source";
    case "copy":
      return site.drift ? "drift" : "copy";
    case "foreign-link":
      return site.drift ? "drift" : "copy";
    case "aliased":
      // name mismatch — a real misconfiguration, not a clean deploy.
      return "drift";
    case "dead":
      return "dead";
    default:
      return "absent";
  }
}

/**
 * Codex keeps its own vendored imports under `~/.codex/vendor_imports/...`.
 * Those are codex-internal copies, not skillshelf deployment targets, and they'd
 * otherwise collapse into the real `~/.codex/skills` Global cell — so the agent
 * matrix excludes them (an engine concern; a harmless no-op for the app, whose
 * fixtures never contain that segment).
 */
export function isAgentMatrixSurface(surface: string): boolean {
  return !surface.includes("/vendor_imports/");
}

/** Keep the strongest signal if two sites collide on the same (skill,agent,scope). */
export const RANK: Record<DeployState, number> = {
  dead: 5,
  drift: 4,
  copy: 3,
  source: 2,
  clean: 1,
  absent: 0,
};

/**
 * THE FOLD. Iterate the sites, skip non-agent + vendor_imports surfaces, bucket
 * each into deployments[name][agentId].g or .p[scope] keeping the max-RANK
 * signal, union Global + project scopes + extraScopes, and return the scope rows
 * sorted Global-first then alphabetically.
 *
 * Pure: no fs, no config, no seed data. The caller runs its OWN mergeAgents /
 * installed / agents[] construction and passes in the already-merged id set as
 * `agentIds` (so custom-agent surfaces are detected) plus the persisted-but-empty
 * project basenames as `extraScopes` (§5a: they appear as scope rows with NO
 * fabricated deployments). ERROR MODES: none thrown — unrecognized surfaces are
 * silently skipped; a site whose scope can't resolve falls into Global.
 */
export function foldAgentMatrix(
  sites: DeploymentSite[],
  opts: { home: string | null; agentIds: readonly string[]; extraScopes?: string[] },
): AgentMatrix {
  const { home, agentIds } = opts;
  const deployments: Record<string, Record<string, AgentDeployment>> = {};
  const scopeSet = new Set<string>(["Global"]);

  for (const s of opts.extraScopes ?? []) {
    if (s && s !== "Global") scopeSet.add(s);
  }

  for (const site of sites) {
    if (!isAgentMatrixSurface(site.surface)) continue;
    const agentId = agentIdForSurface(site.surface, agentIds);
    if (!agentId) continue;
    const scope = scopeForSurface(site.surface, agentId, home);
    if (scope !== "Global") scopeSet.add(scope);
    const state = stateForSite(site);

    // Keyed by the deployed link name (site.name). For an `aliased` site this is
    // the wrong-name alias, not a library skill — intentional: it raises the
    // alarm under the name you'd `ls` in the surface; `skl where --problems` is
    // the canonical place to see the real skill it points at.
    const perAgent = (deployments[site.name] ??= {});
    const dep = (perAgent[agentId] ??= {});
    if (scope === "Global") {
      if (!dep.g || RANK[state] > RANK[dep.g]) dep.g = state;
    } else {
      dep.p ??= {};
      const cur = dep.p[scope];
      if (!cur || RANK[state] > RANK[cur]) dep.p[scope] = state;
    }
  }

  const scopes = [
    "Global",
    ...[...scopeSet].filter((s) => s !== "Global").sort(),
  ];

  return { scopes, deployments };
}
