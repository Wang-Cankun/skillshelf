// The bridge between the React UI and the deterministic `skl` CLI.
//
// In Tauri (desktop) we invoke the Rust `run_skl` command, which shells out to
// the real `skl` binary and returns a structured { ok, stdout, stderr }. In a
// plain browser (Vite dev, no Tauri) we fall back to the REAL data captured in
// fixtures.ts (plus derive.ts reconstructions of the §7 feeds) so the UI renders
// meaningfully without Rust. Mutating actions become dry-run echoes in the
// browser (ADR-0007: the UI is a graphical front for deterministic verbs).
//
// Every Tauri payload is validated through a Zod schema (schemas.ts) at the
// boundary — a malformed/structurally-changed payload throws here, not later.

import type {
  Skill,
  DeploymentReport,
  ScanReport,
  StatusReport,
  AgentsReport,
  AgentInfo,
  AppConfig,
  ShowReport,
  OutdatedReport,
  DiffReport,
} from "./types";
import {
  LibrarySchema,
  DeploymentReportSchema,
  ScanReportSchema,
  StatusReportSchema,
  AgentsReportSchema,
  ConfigSchema,
  RawShowSchema,
  OutdatedSchema,
  DiffReportSchema,
} from "./schemas";
import { realLibrary, realWhere, realScan, realStatus, realConfig } from "./fixtures";
import { augmentLibrary, deriveShow, normalizeShow, deriveOutdated } from "./derive";
import { deriveAgentsReport } from "./agents";
import { resolveVisibleAgents } from "./prefs";
import type { ZodType } from "zod";

/** Basename of an absolute project dir — the scope-name the agents report keys
 *  by (RISK 4: config carries absolute paths; report scopes are basenames). */
export function projectScopeName(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}

export const IS_TAURI =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * Normalize agents parsed from a `--json` payload to a guaranteed
 * `AgentInfo.inheritsGlobal: boolean` (ADR-0010). The schema keeps the field
 * optional so an older skl that omits it still validates; here a missing value
 * defaults to true — the ~/.x/skills inheritance convention — so every consumer
 * (cellStateFor, effectiveCounts, the matrix) sees a defined flag.
 */
function normalizeAgents(
  agents: ReadonlyArray<Omit<AgentInfo, "inheritsGlobal"> & { inheritsGlobal?: boolean }>,
): AgentInfo[] {
  return agents.map((a) => ({ ...a, inheritsGlobal: a.inheritsGlobal ?? true }));
}

/**
 * Structured result of running a `skl` action. Mirrors the Rust `SklResult`
 * struct returned by `run_skl` (CONTRACT-A): `ok` reflects a zero exit code.
 */
export interface SklResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

/** Echo a command the way it would be run, for command-echo UI affordances. */
export function cmdEcho(args: string[]): string {
  return "skl " + args.join(" ");
}

/**
 * Invoke the Tauri `run_skl` command, validate its JSON stdout through `schema`,
 * and return the parsed `T`. Dynamically imports @tauri-apps/api so the browser
 * bundle never needs it. Throws if `run_skl` reports a non-zero exit, if stdout
 * is not valid JSON, or if the payload fails schema validation.
 */
async function invokeJson<T>(args: string[], schema: ZodType<T>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  const result = await invoke<SklResult>("run_skl", { args });
  if (!result.ok) {
    throw new Error(result.stderr.trim() || `${cmdEcho(args)} exited non-zero`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(result.stdout);
  } catch (err) {
    throw new Error(`failed to parse JSON from ${cmdEcho(args)}: ${String(err)}`);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `unexpected shape from ${cmdEcho(args)}: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

export async function loadLibrary(): Promise<Skill[]> {
  // `--all` includes retired rows so the Retired view (decision #1) can render
  // them; live views filter retired out in libraryView (select.ts).
  if (IS_TAURI) return invokeJson(["ls", "--all", "--json"], LibrarySchema);
  // browser: augment captured rows with §7.1 fields from where + lockfile.
  return augmentLibrary(realLibrary, realWhere);
}

export async function loadWhere(): Promise<DeploymentReport> {
  if (IS_TAURI) return invokeJson(["where", "--json"], DeploymentReportSchema);
  return realWhere;
}

export async function loadScan(): Promise<ScanReport> {
  if (IS_TAURI) return invokeJson(["scan", "--json"], ScanReportSchema);
  return realScan;
}

export async function loadStatus(): Promise<StatusReport> {
  if (IS_TAURI) return invokeJson(["status", "--json"], StatusReportSchema);
  return realStatus;
}

export async function loadOutdated(): Promise<OutdatedReport> {
  if (IS_TAURI) {
    // `skl outdated --json` EXITS 2 when stale/diverged skills exist — a CI
    // signal, NOT a failure (the JSON payload is still on stdout). invokeJson
    // throws on any non-zero exit, so it can't be used here: with ~20 stale
    // skills the check would always "fail". Parse stdout directly and only
    // treat a genuinely empty/unparseable stdout (exit 1) as an error.
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke<SklResult>("run_skl", {
      args: ["outdated", "--json"],
    });
    let raw: unknown;
    try {
      raw = JSON.parse(result.stdout);
    } catch {
      throw new Error(
        result.stderr.trim() || "skl outdated --json produced no JSON",
      );
    }
    const parsed = OutdatedSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `unexpected shape from skl outdated --json: ${parsed.error.message}`,
      );
    }
    return parsed.data;
  }
  // browser: HONEST fixture-derived fallback (no GitHub access here).
  return deriveOutdated(augmentLibrary(realLibrary, realWhere));
}

export async function loadConfig(): Promise<AppConfig> {
  if (IS_TAURI) {
    // `skl projects --json` -> `{ projects: string[] }` for the nav scopes, and
    // the custom-agent registry is recovered from `agents --json`: the engine
    // tags every agent that came from a config `agents` entry with `custom:true`
    // (src/core/agents.ts), so filtering on that flag reconstructs config.agents
    // — the round-trip the `agents add/rm` write verb persists (ADR-0010 delta 4).
    const [{ projects }, report] = await Promise.all([
      invokeJson(["projects", "--json"], ConfigSchema),
      invokeJson(["agents", "--json"], AgentsReportSchema),
    ]);
    const agents = normalizeAgents(report.agents).filter((a) => a.custom === true);
    return { projects, agents };
  }
  return realConfig;
}

export async function loadAgents(): Promise<AgentsReport> {
  if (IS_TAURI) {
    // The engine already merges the config `agents` block + persisted-project
    // scopes into `agents --json` (S1), so only the display filter remains.
    const report = await invokeJson(["agents", "--json"], AgentsReportSchema);
    return { ...report, agents: resolveVisibleAgents(normalizeAgents(report.agents)) };
  }
  // browser: reconstruct from the real `where` feed, and inject the custom
  // agents + persisted-but-empty project scopes the engine would have merged.
  const cfg = realConfig;
  const report = deriveAgentsReport(realWhere, {
    agents: cfg.agents,
    extraScopes: cfg.projects.map(projectScopeName),
  });
  return { ...report, agents: resolveVisibleAgents(report.agents, cfg.agents) };
}

// ── Config mutations (delta 4 + §5a). Routed through runAction so browser dev
//    gets a dry-run echo and Tauri runs the real verb. `projects add/rm` and
//    `agents add/rm` are real engine verbs that persist into config.json; in the
//    browser they degrade to a dry-run echo (nothing mutated). ─────────────────

/** Persist a project dir to the nav-scopes list (`skl projects add <path>`). */
export function addProjectCmd(path: string) {
  return runAction(["projects", "add", path]);
}

/** Remove a project dir from the nav-scopes list (`skl projects rm <path>`). */
export function removeProjectCmd(path: string) {
  return runAction(["projects", "rm", path]);
}

/**
 * Register (or override) a custom agent in config.json via `skl agents add`
 * (ADR-0010 delta 4). A matching id overrides; a new id appends. The persisted
 * entry is recovered on the next `agents --json` read (tagged `custom:true`), so
 * the popover's invalidate(qk.config/qk.agents) round-trips to real truth instead
 * of vanishing. In the browser this is a dry-run echo (nothing mutated).
 */
export function addAgentCmd(entry: AppConfig["agents"][number]) {
  const args = [
    "agents",
    "add",
    entry.id,
    "--name",
    entry.name,
    "--global",
    entry.global,
    "--proj-convention",
    entry.projConvention,
  ];
  if (entry.icon) args.push("--icon", entry.icon);
  if (entry.color) args.push("--color", entry.color);
  // Global→project inheritance (ADR-0010): default TRUE. Only forward the opt-out
  // flag when the entry diverges from the default — `--inherits-global` is implicit
  // — so the engine persists inheritsGlobal:false and the checkbox actually sticks
  // in the Tauri path (not just in browser fixtures).
  if (entry.inheritsGlobal === false) args.push("--no-inherits-global");
  return runAction(args);
}

/** Remove a custom agent from config.json via `skl agents rm <id>` (delta 4). */
export function removeAgentCmd(id: string) {
  return runAction(["agents", "rm", id]);
}

/**
 * Persist a per-agent Hide toggle (ADR-0010 delta 4 / RISK 8). Hiding writes a
 * `hidden:true` config override via `skl agents add --hidden` — the engine's
 * mergeAgents drops it, so the agent leaves the matrix, count bar, and rows
 * everywhere (the same path config `hidden` already feeds). Un-hiding removes the
 * override with `skl agents rm`. The seed's name/paths are echoed so a hide
 * override of a seed round-trips with a sensible label. Browser dev degrades to a
 * dry-run echo (nothing mutated) like the other config mutations.
 */
export function setAgentHiddenCmd(
  agent: AppConfig["agents"][number],
  hidden: boolean,
) {
  if (!hidden) return removeAgentCmd(agent.id);
  const args = ["agents", "add", agent.id, "--name", agent.name, "--hidden"];
  if (agent.global) args.push("--global", agent.global);
  if (agent.projConvention) args.push("--proj-convention", agent.projConvention);
  if (agent.icon) args.push("--icon", agent.icon);
  if (agent.color) args.push("--color", agent.color);
  return runAction(args);
}

export async function loadShow(
  name: string,
  file?: string,
): Promise<ShowReport> {
  if (IS_TAURI) {
    const args = file
      ? ["show", name, "--file", file, "--json"]
      : ["show", name, "--json"];
    // The live `skl show --json` payload is richer/differently-shaped than the
    // drawer's ShowReport (absolute-string refFiles, no frontmatter object), so
    // validate loosely then normalize into the drawer shape.
    const raw = await invokeJson(args, RawShowSchema);
    return normalizeShow(raw, name);
  }
  return deriveShow(name, file, augmentLibrary(realLibrary, realWhere));
}

/**
 * `skl diff <name>` — unified diff of a deployed copy against the library
 * (read-only, backs the drift "View diff" action). Browser dev shows a small
 * synthetic diff so the panel is exercisable without an engine.
 */
export async function loadDiff(
  name: string,
  agentId: string,
  scopeArgs: string[],
): Promise<DiffReport> {
  if (IS_TAURI) {
    return invokeJson(
      ["diff", name, "--agent", agentId, ...scopeArgs, "--json"],
      DiffReportSchema,
    );
  }
  return {
    name,
    site: "(browser fixture)",
    library: `(library)/${name}`,
    identical: false,
    diff: `--- library/${name}/SKILL.md\n+++ deployed/${name}/SKILL.md\n@@ -1,2 +1,2 @@\n # ${name}\n-fixture body\n+fixture body (local edit)`,
  };
}

/**
 * Run a mutating (or any) `skl` action.
 * - In Tauri: invokes `run_skl`, returning the structured `SklResult`. If the
 *   IPC call itself rejects (binary not found, etc.) that error is captured into
 *   `{ ok: false, stderr }` so callers always get a `SklResult`.
 * - In the browser: returns a dry-run stub so nothing is mutated.
 */
export async function runAction(args: string[]): Promise<SklResult> {
  if (IS_TAURI) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<SklResult>("run_skl", { args });
    } catch (err) {
      return { ok: false, stdout: "", stderr: String(err) };
    }
  }
  return {
    ok: true,
    stdout: "(dry-run: " + cmdEcho(args) + ")",
    stderr: "",
  };
}
