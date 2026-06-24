// Agent deployment matrix (`skl agents`) — the multi-agent lens on the
// deployment inventory. ADR-0008 §6/§7.3.
//
// `skl where` already inventories every deployment site across all surfaces and
// classifies each (linked/source/copy/drift/dead/foreign-link). This module
// folds that flat site list into a skill × agent × scope matrix: for each known
// agent (claude, codex, …) and each scope (Global, or a named project), what is
// the deployment state of each skill? Computed from reality — no stored state.

import { homedir } from "node:os";
import { join, sep } from "node:path";
import { existsSync } from "node:fs";
import type { AgentConfigEntry, DeploymentReport, DeploymentSite } from "../types.ts";
// The surface→agent→scope fold lives in the node-free shared module so the app's
// browser fallback and this engine compute identical matrices. See agent-matrix.ts.
import {
  agentIdForSurface as agentIdForSurfaceCore,
  scopeForSurface,
  stateForSite,
  foldAgentMatrix,
} from "./agent-matrix.ts";
import type { DeployState, AgentDeployment } from "./agent-matrix.ts";

// Re-export the shared fold primitives so existing importers (agents.test.ts,
// ls.ts, etc.) keep resolving them from ./agents.ts — they now delegate to
// agent-matrix.ts (do NOT edit them here; edit the shared module).
export { scopeForSurface, stateForSite };
export type { DeployState, AgentDeployment };

/** A known agent + its skill-dir conventions (aligned with the cross-agent ecosystem). */
export interface AgentInfo {
  /** stable agent id (the `.<id>` dotdir segment) */
  id: string;
  /** display name */
  name: string;
  /** short label for dense UI */
  short: string;
  /** GLOBAL skills dir, tilde form for display (e.g. ~/.claude/skills) */
  global: string;
  /** project-relative convention (e.g. .claude/skills) */
  projConvention: string;
  /** true if the agent's global skills dir exists on this machine */
  installed: boolean;
  /**
   * true if the agent loads its GLOBAL skills dir (~/.<id>/skills) in EVERY
   * project IN ADDITION to the project's own dir (ADR-0010 inheritance). When
   * true, a globally-deployed skill is EFFECTIVELY active in every project even
   * with no project symlink (the "inherited from Global" model). Default true
   * (the ~/.x/skills convention all seeds follow); a custom agent may set false.
   */
  inheritsGlobal: boolean;
  /** provider-icons key (custom-agent presentation, ADR-0010 delta 4) */
  icon?: string;
  /** hex tint (custom-agent presentation) */
  color?: string;
  /** true if this agent came from a config `agents` entry (custom or seed override) */
  custom?: boolean;
}

export interface AgentsReport {
  agents: AgentInfo[];
  /** ["Global", ...sorted project names that have a deployment] */
  scopes: string[];
  /** skill name -> agent id -> deployment */
  deployments: Record<string, Record<string, AgentDeployment>>;
}

/** The agent registry seed (ids = the `.<id>` dotdir; UI renders these verbatim). */
interface AgentSeed {
  id: string;
  name: string;
  short: string;
}
// ENGINE seed list — the full set of agents `skl` can DETECT on disk (claude,
// codex, cursor, opencode, gemini, omp; no `pi` — `pi` is a user-facing alias for
// `omp` in the app). This INTENTIONALLY diverges from the app-side seed list in
// `app/src/lib/agents.ts` (claude, codex, pi, omp), which shows only the agents a
// given user actually deploys to and reconstructs the report in the browser dev
// fallback. The two lists are NOT meant to match: the engine errs toward broad
// detection, the app toward the user's real surfaces, and custom/overridden agents
// flow through config (delta 4) on both sides. If you add/remove an id here, decide
// deliberately whether the app list should follow — see the matching comment over
// AGENT_SEEDS in app/src/lib/agents.ts.
const AGENT_SEEDS: AgentSeed[] = [
  { id: "claude", name: "Claude Code", short: "Claude" },
  { id: "codex", name: "Codex", short: "Codex" },
  { id: "cursor", name: "Cursor", short: "Cursor" },
  { id: "opencode", name: "OpenCode", short: "OpenCode" },
  { id: "gemini", name: "Gemini", short: "Gemini" },
  { id: "omp", name: "Oh My Pi", short: "OMP" },
];

const AGENT_IDS = AGENT_SEEDS.map((a) => a.id);

/**
 * Which agent owns a surface path, or null. Engine wrapper around the shared
 * agent-matrix core that defaults `ids` to the built-in registry; computeAgentsReport
 * passes a widened set (seeds + custom config agents) so custom-agent surfaces are
 * detected too. (The shared core has no default — the app always passes its own ids.)
 */
export function agentIdForSurface(
  surface: string,
  ids: readonly string[] = AGENT_IDS,
): string | null {
  return agentIdForSurfaceCore(surface, ids);
}

/** Relative subdirectory under .<id>/ where skills live (agent/skills for omp, skills otherwise). */
function skillsSuffix(id: string): string {
  return id === "omp" ? join("agent", "skills") : "skills";
}

/** Absolute path to an agent's global skills dir. */
function globalDir(id: string, home: string): string {
  return join(home, `.${id}`, skillsSuffix(id));
}

/**
 * A "clean" deployment for counting purposes = a site `where` renders with a ✓
 * (a symlink into the library, OR the canonical linked-bookshelf source). Shared
 * by `ls --json` deployCount and the `agents` summary so the two never disagree.
 */
export function isCleanSite(site: DeploymentSite): boolean {
  return site.kind === "linked" || site.kind === "source";
}

/**
 * Fold a DeploymentReport (from `inventoryDeployments`) into the agent matrix.
 * Sites whose surface isn't a known agent dir are ignored (they still show up in
 * `skl where`; the agent matrix is agent-scoped by definition).
 */
export function computeAgentsReport(
  report: DeploymentReport,
  home: string = homedir(),
  opts: { extraScopes?: string[]; agents?: AgentConfigEntry[] } = {},
): AgentsReport {
  // Merge the built-in seeds with custom/overridden config agents (ADR-0010 delta
  // 4): a matching id OVERRIDES a seed, a new id APPENDS, `hidden:true` removes it.
  // Seed order is preserved; custom-only agents follow in config order.
  const merged = mergeAgents(opts.agents ?? []);
  const ids = merged.map((a) => a.id);

  // Persisted-but-empty project scopes (ADR-0010 §5a) are unioned in by the fold
  // via `extraScopes` so an added project still appears as a drawer/scope row;
  // they get NO deployments — cells stay all-absent, derived from reality.
  const { scopes, deployments } = foldAgentMatrix(report.sites, {
    home,
    agentIds: ids,
    extraScopes: opts.extraScopes,
  });

  // Ids that came from a config `agents` entry (custom agent or seed override) so
  // the GUI can recover the custom registry from the report (loadConfig filters on
  // `custom`) without a separate config-read verb (ADR-0010 delta 4).
  const customIds = new Set(
    (opts.agents ?? [])
      .filter((a) => a && typeof a.id === "string" && a.id.trim() !== "")
      .map((a) => a.id),
  );
  const agents: AgentInfo[] = merged.map((a) => ({
    id: a.id,
    name: a.name,
    short: a.short,
    global: a.global ?? `~/.${a.id}/${skillsSuffix(a.id)}`,
    projConvention: a.projConvention ?? `.${a.id}/${skillsSuffix(a.id)}`,
    installed: existsSync(globalDir(a.id, home)),
    // Default true (the ~/.x/skills inheritance convention all seeds follow); a
    // custom config entry may opt out with inheritsGlobal:false. `?? true` keeps
    // legacy config entries (no flag) inheriting, preserving today's behaviour.
    inheritsGlobal: a.inheritsGlobal ?? true,
    ...(a.icon ? { icon: a.icon } : {}),
    ...(a.color ? { color: a.color } : {}),
    ...(customIds.has(a.id) ? { custom: true } : {}),
  }));

  return { agents, scopes, deployments };
}

/**
 * Merge the built-in AGENT_SEEDS with custom config entries (ADR-0010 delta 4),
 * dropping any agent flagged `hidden`. Returns the effective registry (seed order
 * preserved; custom-only ids appended in config order). Shared by the report's
 * `agents[]` and the widened surface-detection id set.
 */
function mergeAgents(custom: AgentConfigEntry[]): AgentConfigEntry[] {
  const byId = new Map<string, AgentConfigEntry>();
  for (const seed of AGENT_SEEDS) {
    byId.set(seed.id, { id: seed.id, name: seed.name, short: seed.short });
  }
  for (const c of custom) {
    if (!c || typeof c.id !== "string" || c.id.trim() === "") continue;
    const prev = byId.get(c.id);
    byId.set(c.id, prev ? { ...prev, ...c } : { ...c });
  }
  return [...byId.values()].filter((a) => !a.hidden);
}

/** Resolve an agent's deploy dir for a scope: global (~/.<id>/skills) or a project. */
export function agentDeployDir(
  agentId: string,
  scope: "global" | { project: string },
  home: string = homedir(),
  cwd: string = process.cwd(),
): string {
  if (scope === "global") return globalDir(agentId, home);
  // a named project: resolve as an absolute path, or a dir under cwd.
  const proj = scope.project;
  const root = proj.startsWith(sep) ? proj : join(cwd, proj);
  return join(root, `.${agentId}`, skillsSuffix(agentId));
}

/** True if `id` is a known agent. */
export function isKnownAgent(id: string): boolean {
  return AGENT_IDS.includes(id);
}

/** All known agent ids (the registry order). */
export function knownAgentIds(): string[] {
  return [...AGENT_IDS];
}

/**
 * Read-side counterpart to parseDeployTarget (ADR-0008 §7.4 / CLI e2e fix): lets
 * the READ verbs (`where`/`agents`/`status`) target the SAME place `use`/`drop`
 * just wrote — a specific `--project <dir>` (and optionally one `--agent <id>`).
 *
 * Returns the surviving argv (`rest`, with --agent/--project + values removed so
 * the command parses its own flags), and `extraSurfaces` to TRANSIENTLY inject
 * into the deployment scan for this invocation only (never persisted to config —
 * that was the `scan --add-root` anti-workaround the e2e test flagged). When
 * `--project` is given without `--agent`, every known agent's project dir is
 * scanned so an ad-hoc project shows all its agents.
 */
export function resolveReadTarget(
  argv: string[],
  home: string = homedir(),
  cwd: string = process.cwd(),
):
  | { rest: string[]; agentId: string | null; projectDir: string | null; extraSurfaces: string[] }
  | { error: string } {
  let agentId: string | null = null;
  let projectRaw: string | null = null;
  const rest: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a === "--agent") {
      agentId = argv[++i] ?? "";
      if (!agentId || agentId.startsWith("-")) return { error: "--agent requires an agent id" };
    } else if (a === "--project") {
      projectRaw = argv[++i] ?? "";
      if (!projectRaw || projectRaw.startsWith("-"))
        return { error: "--project requires a project name or path" };
    } else {
      rest.push(a);
    }
  }

  if (agentId !== null && !isKnownAgent(agentId)) {
    return { error: `unknown agent "${agentId}" (known: ${AGENT_IDS.join(", ")})` };
  }

  const projectDir =
    projectRaw === null ? null : projectRaw.startsWith(sep) ? projectRaw : join(cwd, projectRaw);

  let extraSurfaces: string[] = [];
  if (projectDir) {
    const ids = agentId ? [agentId] : AGENT_IDS;
    extraSurfaces = ids.map((id) => join(projectDir, `.${id}`, skillsSuffix(id)));
  }

  return { rest, agentId, projectDir, extraSurfaces };
}

export interface DeployTarget {
  /** absolute skills dir to deploy into / drop from */
  dir: string;
  /** the agent id targeted */
  agentId: string;
  /** scope: "Global" or a project name */
  scope: string;
  /** human label for messages */
  label: string;
}

/**
 * Parse `--agent <id>`, `--global`, and `--project <name>` out of an argv, also
 * returning the remaining positionals (so a flag VALUE like the agent id is never
 * mistaken for the bundle/skill name). ADR-0008 §7.4: the GUI always targets a
 * specific agent's GLOBAL dir; the CLI default (no flags) stays the cwd project's
 * `.claude/skills` so existing behaviour is unchanged.
 */
export function parseDeployTarget(
  argv: string[],
  home: string = homedir(),
  cwd: string = process.cwd(),
): { positionals: string[]; target: DeployTarget } | { error: string } {
  let agentId: string | null = null;
  let global = false;
  let project: string | null = null;
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a === "--agent") {
      agentId = argv[++i] ?? "";
      if (!agentId || agentId.startsWith("-")) return { error: "--agent requires an agent id" };
    } else if (a === "--global") {
      global = true;
    } else if (a === "--project") {
      project = argv[++i] ?? "";
      if (!project || project.startsWith("-"))
        return { error: "--project requires a project name or path" };
    } else if (a === "--json") {
      // consumed by the command, ignore here
    } else if (a.startsWith("-")) {
      return { error: `unknown argument: ${a}` };
    } else {
      positionals.push(a);
    }
  }

  if (global && project) {
    return { error: "--global and --project are mutually exclusive" };
  }
  const effectiveAgent = agentId ?? "claude";
  if (!isKnownAgent(effectiveAgent)) {
    return { error: `unknown agent "${effectiveAgent}" (known: ${AGENT_IDS.join(", ")})` };
  }

  let dir: string;
  let scope: string;
  if (global) {
    dir = agentDeployDir(effectiveAgent, "global", home, cwd);
    scope = "Global";
  } else if (project) {
    dir = agentDeployDir(effectiveAgent, { project }, home, cwd);
    scope = project.split(sep).filter(Boolean).pop() || project;
  } else {
    // default: the cwd project's dir for this agent (legacy behaviour for claude).
    dir = join(cwd, `.${effectiveAgent}`, skillsSuffix(effectiveAgent));
    scope = cwd.split(sep).filter(Boolean).pop() || "project";
  }

  return {
    positionals,
    target: {
      dir,
      agentId: effectiveAgent,
      scope,
      label: global ? `${effectiveAgent} (global)` : `${effectiveAgent} (${scope})`,
    },
  };
}
