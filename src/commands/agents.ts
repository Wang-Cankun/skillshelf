// `skl agents [name]` — the multi-agent deployment matrix: for each known agent
// (claude, codex, …) and scope (Global / a project), what is each skill's
// deployment state? Built on the same reality `skl where` inventories. ADR-0008 §7.3.
//
//   skl agents              human summary of installed agents + per-agent counts
//   skl agents --json        full AgentsReport { agents, scopes, deployments }
//   skl agents <name>        one skill's row across agents × scopes

import { basename, join, sep } from "node:path";
import type { AgentConfigEntry, Ctx } from "../types.ts";
import { inventoryDeployments } from "../core/deployments.ts";
import { knownAgentSurfacePaths } from "../core/surfaces.ts";
import {
  computeAgentsReport,
  knownAgentIds,
  resolveReadTarget,
  type DeployState,
} from "../core/agents.ts";

export const meta = {
  name: "agents",
  summary: "Show each skill's deployment state across known agents (claude, codex, …) and scopes",
  usage: "skl agents [name] [--agent <id>] [--project <dir>] [--json]",
} as const;

const GLYPH: Record<DeployState, string> = {
  clean: "✓",
  source: "⊙",
  drift: "⚠",
  copy: "□",
  dead: "✗",
  absent: "·",
};

const LEGEND = "legend: ✓ clean · ⊙ source · ⚠ drift · □ copy · ✗ dead · · absent";

/**
 * Scope name for a persisted project dir = its basename — matching the engine's
 * scope derivation (parseDeployTarget / scopeForSurface use the last path segment),
 * so a config project reconciles with the FS-derived scopes in the matrix.
 */
function projectScopeName(projectPath: string): string {
  return projectPath.split(sep).filter(Boolean).pop() || basename(projectPath) || projectPath;
}

export async function run(argv: string[], ctx: Ctx): Promise<number> {
  // ── Config write subverbs (ADR-0010 delta 4): `skl agents add|rm` mutate the
  //    custom-agent registry in config.json. These are registry metadata only —
  //    they never deploy; the matrix stays FS-derived. Checked BEFORE the read
  //    path so `add`/`rm` are never mistaken for a skill name. (`add`/`rm` are
  //    reserved subverbs; a skill literally named "add"/"rm" is not a concern.)
  if (argv[0] === "add" || argv[0] === "rm") {
    return runConfigSubverb(argv, ctx);
  }
  try {
    const rt = resolveReadTarget(argv);
    if ("error" in rt) {
      ctx.error(`skl agents: ${rt.error}`);
      ctx.error("usage: " + meta.usage);
      return 1;
    }
    const json = rt.rest.includes("--json");
    const name = rt.rest.find((a) => !a.startsWith("--")) ?? null;

    const lib = await ctx.loadLibrary();
    // Effective agent ids = built-in seeds + custom config agents (so a custom
    // agent's project/global skills dirs are scanned for inventory).
    const agentIds = new Set<string>(knownAgentIds());
    for (const a of ctx.config.agents) {
      if (a && typeof a.id === "string" && a.id.trim() !== "") agentIds.add(a.id);
    }
    // Config-project surfaces (ADR-0010 §5a): scan each persisted project dir for
    // every effective agent so a deployed config-project is inventoried.
    const projectSurfaces: string[] = [];
    for (const proj of ctx.config.projects) {
      for (const id of agentIds) projectSurfaces.push(join(proj, `.${id}`, "skills"));
    }
    // Same surface union as `skl where` (+ any --project surfaces for this call,
    // + persisted config-project surfaces) so the agent matrix sees the same
    // reality and can verify an ad-hoc OR persisted project deploy.
    const surfaces = [
      ...ctx.roots,
      ctx.config.globalCoreTarget,
      ...knownAgentSurfacePaths(),
      ...projectSurfaces,
      ...rt.extraSurfaces,
    ];
    const report = await inventoryDeployments(surfaces, ctx.libraryPath, lib);
    // Empty persisted projects still appear as scope rows (basename = scope name);
    // custom agents merge into the matrix. Deployments stay FS-derived.
    let agentsReport = computeAgentsReport(report, undefined, {
      agents: ctx.config.agents,
      extraScopes: ctx.config.projects.map((p) => projectScopeName(p)),
    });

    // --agent <id> focuses the whole report on that agent: prune the agents list
    // and the deployments map to just that agent (skills not deployed to it drop).
    if (rt.agentId) {
      const id = rt.agentId;
      const deployments: typeof agentsReport.deployments = {};
      for (const [skill, byAgent] of Object.entries(agentsReport.deployments)) {
        if (byAgent[id]) deployments[skill] = { [id]: byAgent[id] };
      }
      agentsReport = {
        agents: agentsReport.agents.filter((a) => a.id === id),
        scopes: agentsReport.scopes,
        deployments,
      };
    }

    if (json) {
      if (name !== null) {
        ctx.json({
          name,
          agents: agentsReport.agents,
          scopes: agentsReport.scopes,
          deployment: agentsReport.deployments[name] ?? {},
        });
        return 0;
      }
      ctx.json(agentsReport);
      return 0;
    }

    // --- human view ------------------------------------------------------
    const { agents, scopes, deployments } = agentsReport;
    if (name !== null) {
      const byAgent = deployments[name] ?? {};
      ctx.log(`${name} — deployment across agents:`);
      for (const a of agents) {
        const dep = byAgent[a.id];
        const g = dep?.g ?? "absent";
        const projects = dep?.p
          ? Object.entries(dep.p).map(([s, st]) => `${s} ${GLYPH[st]}`).join("  ")
          : "";
        const installed = a.installed ? "" : " (not installed)";
        ctx.log(`  ${a.short.padEnd(10)} ${GLYPH[g]} global·${g}${installed}${projects ? `   ${projects}` : ""}`);
      }
      ctx.log("");
      ctx.log(LEGEND);
      return 0;
    }

    ctx.log(`Agents (${agents.filter((a) => a.installed).length} installed) · scopes: ${scopes.join(", ")}`);
    for (const a of agents) {
      let clean = 0;
      let problems = 0;
      for (const byAgent of Object.values(deployments)) {
        const dep = byAgent[a.id];
        if (!dep) continue;
        const states: DeployState[] = [dep.g ?? "absent", ...Object.values(dep.p ?? {})];
        for (const st of states) {
          if (st === "clean" || st === "source") clean++;
          else if (st !== "absent") problems++;
        }
      }
      const tag = a.installed ? "" : "  (not installed)";
      ctx.log(`  ${a.short.padEnd(10)} ${a.global}${tag}  —  ${clean} clean, ${problems} need attention`);
    }
    ctx.log("");
    ctx.log(LEGEND);
    return 0;
  } catch (err) {
    ctx.error(`skl agents failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

/** Read a `--flag value` option out of argv (returns undefined if absent). */
function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  return v && !v.startsWith("--") ? v : undefined;
}

/**
 * `skl agents add <id> --name <n> --global <dir> --proj-convention <c> [--icon k]
 *  [--color #rgb]` and `skl agents rm <id>` — persist the custom-agent registry
 * (ADR-0010 delta 4). With `--json` emits `{ agents }` / `{ agents, removed }`
 * (the full custom-agent list) so the GUI can round-trip without a separate read.
 */
async function runConfigSubverb(argv: string[], ctx: Ctx): Promise<number> {
  const verb = argv[0];
  const json = argv.includes("--json");
  const id = argv[1] && !argv[1].startsWith("--") ? argv[1].trim() : "";

  if (!id) {
    ctx.error(`skl agents ${verb}: requires an agent id`);
    ctx.error("usage: skl agents add <id> --name <name> --global <dir> --proj-convention <conv> [--icon <key>] [--color <hex>]");
    return 1;
  }

  if (verb === "rm") {
    const { agents, removed } = await ctx.removeAgent(id);
    if (json) {
      ctx.json({ agents, removed });
      return 0;
    }
    ctx.log(removed ? `Removed custom agent "${id}".` : `No custom agent "${id}" (nothing removed).`);
    return 0;
  }

  // add
  const name = flag(argv, "--name") ?? id;
  const global = flag(argv, "--global");
  const projConvention = flag(argv, "--proj-convention");
  const icon = flag(argv, "--icon");
  const color = flag(argv, "--color");
  // `--hidden` persists a hide override (ADR-0010 delta 4 / RISK 8): mergeAgents
  // drops `hidden:true` so the agent leaves the matrix everywhere. A hide entry
  // for a SEED carries no paths, so --global/--proj-convention are only required
  // for a real (visible) registration.
  const hidden = argv.includes("--hidden");
  // Global→project inheritance (ADR-0010): default TRUE (the ~/.x/skills
  // convention). `--no-inherits-global` opts out (persists inheritsGlobal:false);
  // `--inherits-global` is accepted for symmetry but is the default, so we only
  // persist the flag when it diverges from the default to keep config minimal.
  const inheritsGlobal = !argv.includes("--no-inherits-global");
  if (!hidden && (!global || !projConvention)) {
    ctx.error("skl agents add: --global and --proj-convention are required");
    return 1;
  }
  const entry: AgentConfigEntry = {
    id,
    name,
    short: name,
    ...(global ? { global } : {}),
    ...(projConvention ? { projConvention } : {}),
    ...(icon ? { icon } : {}),
    ...(color ? { color } : {}),
    ...(hidden ? { hidden: true } : {}),
    ...(inheritsGlobal ? {} : { inheritsGlobal: false }),
  };
  const agents = await ctx.addAgent(entry);
  if (json) {
    ctx.json({ agents, added: true });
    return 0;
  }
  ctx.log(`Registered custom agent "${name}" (${id}). Custom agents (${agents.length}):`);
  for (const a of agents) ctx.log(`  ${a.id}  ${a.global}`);
  return 0;
}
