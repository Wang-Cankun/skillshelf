// `skl agents [name]` — the multi-agent deployment matrix: for each known agent
// (claude, codex, …) and scope (Global / a project), what is each skill's
// deployment state? Built on the same reality `skl where` inventories. ADR-0008 §7.3.
//
//   skl agents              human summary of installed agents + per-agent counts
//   skl agents --json        full AgentsReport { agents, scopes, deployments }
//   skl agents <name>        one skill's row across agents × scopes

import type { Ctx } from "../types.ts";
import { inventoryDeployments } from "../core/deployments.ts";
import { knownAgentSurfacePaths } from "../core/surfaces.ts";
import { computeAgentsReport, type DeployState } from "../core/agents.ts";

export const meta = {
  name: "agents",
  summary: "Show each skill's deployment state across known agents (claude, codex, …) and scopes",
  usage: "skl agents [name] [--json]",
} as const;

const GLYPH: Record<DeployState, string> = {
  clean: "✓",
  source: "⊙",
  drift: "⚠",
  copy: "□",
  dead: "✗",
  absent: "·",
};

export async function run(argv: string[], ctx: Ctx): Promise<number> {
  try {
    const json = argv.includes("--json");
    const name = argv.find((a) => !a.startsWith("--")) ?? null;

    const lib = await ctx.loadLibrary();
    // Same surface union as `skl where` so the agent matrix sees the same reality.
    const surfaces = [...ctx.roots, ctx.config.globalCoreTarget, ...knownAgentSurfacePaths()];
    const report = await inventoryDeployments(surfaces, ctx.libraryPath, lib);
    const agentsReport = computeAgentsReport(report);

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
    return 0;
  } catch (err) {
    ctx.error(`skl agents failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
