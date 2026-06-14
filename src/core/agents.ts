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
import type { DeploymentReport, DeploymentSite } from "../types.ts";

/** Deployment state of one (skill, agent, scope) cell. */
export type DeployState =
  | "clean"
  | "source"
  | "drift"
  | "copy"
  | "dead"
  | "absent";

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
}

/** Per (skill, agent): global state + per-project states. Omitted keys = absent. */
export interface AgentDeployment {
  g?: DeployState;
  p?: Record<string, DeployState>;
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
const AGENT_SEEDS: AgentSeed[] = [
  { id: "claude", name: "Claude Code", short: "Claude" },
  { id: "codex", name: "Codex", short: "Codex" },
  { id: "cursor", name: "Cursor", short: "Cursor" },
  { id: "opencode", name: "OpenCode", short: "OpenCode" },
  { id: "gemini", name: "Gemini", short: "Gemini" },
];

const AGENT_IDS = AGENT_SEEDS.map((a) => a.id);

/** Absolute path to an agent's global skills dir. */
function globalDir(id: string, home: string): string {
  return join(home, `.${id}`, "skills");
}

/** Which agent owns a surface path (by its `/.<id>/` dotdir segment), or null. */
export function agentIdForSurface(surface: string): string | null {
  for (const id of AGENT_IDS) {
    if (surface.includes(`${sep}.${id}${sep}`) || surface.endsWith(`${sep}.${id}`)) {
      return id;
    }
  }
  return null;
}

/**
 * Scope of a surface for a given agent: "Global" when the surface sits directly
 * under $HOME (e.g. ~/.claude/skills); otherwise the enclosing project's dir name.
 * Uses the real $HOME (no heuristic — this runs in the engine, not the browser).
 */
export function scopeForSurface(
  surface: string,
  agentId: string,
  home: string,
): string {
  const homeDot = join(home, `.${agentId}`);
  if (surface === homeDot || surface.startsWith(homeDot + sep)) return "Global";
  // strip from the `/.<id>` segment to get the project root, then take its name.
  const marker = `${sep}.${agentId}`;
  const idx = surface.indexOf(marker);
  const root = idx >= 0 ? surface.slice(0, idx) : surface;
  const base = root.split(sep).filter(Boolean).pop();
  return base || "Global";
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
 * Codex keeps its own vendored imports under `~/.codex/vendor_imports/...`.
 * Those are codex-internal copies, not skillshelf deployment targets, and they'd
 * otherwise collapse into the real `~/.codex/skills` Global cell — so the agent
 * matrix excludes them (they still show up in `skl where` for sprawl visibility).
 */
function isAgentMatrixSurface(surface: string): boolean {
  return !surface.includes(`${sep}vendor_imports${sep}`);
}

/** Map a site's classification to a deployment state. */
export function stateForSite(site: DeploymentSite): DeployState {
  switch (site.kind) {
    case "linked":
      return "clean";
    case "source":
      return "source";
    case "copy":
      return site.drift ? "drift" : "copy";
    case "foreign-link":
      return "copy";
    case "aliased":
      // name mismatch — a real misconfiguration, not a clean deploy.
      return "drift";
    case "dead":
      return "dead";
    default:
      return "absent";
  }
}

// Keep the strongest signal if two sites collide on the same (skill,agent,scope).
const RANK: Record<DeployState, number> = {
  dead: 5,
  drift: 4,
  copy: 3,
  source: 2,
  clean: 1,
  absent: 0,
};

/**
 * Fold a DeploymentReport (from `inventoryDeployments`) into the agent matrix.
 * Sites whose surface isn't a known agent dir are ignored (they still show up in
 * `skl where`; the agent matrix is agent-scoped by definition).
 */
export function computeAgentsReport(
  report: DeploymentReport,
  home: string = homedir(),
): AgentsReport {
  const deployments: Record<string, Record<string, AgentDeployment>> = {};
  const scopeSet = new Set<string>(["Global"]);

  for (const site of report.sites) {
    if (!isAgentMatrixSurface(site.surface)) continue;
    const agentId = agentIdForSurface(site.surface);
    if (!agentId) continue;
    const scope = scopeForSurface(site.surface, agentId, home);
    if (scope !== "Global") scopeSet.add(scope);
    const state = stateForSite(site);

    // Keyed by the deployed link name (site.name). For an `aliased` site this is
    // the wrong-name alias, not a library skill — intentional: it raises the alarm
    // under the name you'd `ls` in the surface; `skl where --problems` is the
    // canonical place to see the real skill it points at.
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

  const agents: AgentInfo[] = AGENT_SEEDS.map((a) => ({
    id: a.id,
    name: a.name,
    short: a.short,
    global: `~/.${a.id}/skills`,
    projConvention: `.${a.id}/skills`,
    installed: existsSync(globalDir(a.id, home)),
  }));

  const scopes = [
    "Global",
    ...[...scopeSet].filter((s) => s !== "Global").sort(),
  ];

  return { agents, scopes, deployments };
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
  return join(root, `.${agentId}`, "skills");
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
    extraSurfaces = ids.map((id) => join(projectDir, `.${id}`, "skills"));
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
    dir = join(cwd, `.${effectiveAgent}`, "skills");
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
