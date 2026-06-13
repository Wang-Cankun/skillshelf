// `skl where [name]` — the deployment map: where is each library skill actually
// deployed across every surface tools read skills from, and what's a mess?
//
// Skillshelf's founding job: many skills × many tools (Claude Code, Codex, …) that
// scatter copies/symlinks nobody can track. `status` only sees the cwd project;
// `scan` is root-centric. `where` is skill-centric across all surfaces, computed
// from reality (no stored state). It only REPORTS — it never mutates.
//
//   skl where              full map + a flagged "problems" section with fixes
//   skl where <name>        one skill: every place it's deployed, classified
//   skl where --problems    only the non-clean rows
//   skl where --json        structured DeploymentReport

import { homedir } from "node:os";
import type { Ctx, DeploymentSite } from "../types.ts";
import { inventoryDeployments, suggestionFor } from "../core/deployments.ts";
import { knownAgentSurfacePaths } from "../core/surfaces.ts";

export const meta = {
  name: "where",
  summary: "Show where each library skill is deployed across all surfaces (copies, symlinks, drift)",
  usage: "skl where [name] [--problems] [--json]",
} as const;

const HOME = homedir();
/** Shorten an absolute path under $HOME to ~ for display. */
function tilde(p: string): string {
  return p === HOME ? "~" : p.startsWith(HOME + "/") ? "~" + p.slice(HOME.length) : p;
}

/** Short human label for a site's classification. */
function labelFor(s: DeploymentSite): string {
  switch (s.kind) {
    case "linked":
      return "✓ linked";
    case "source":
      return "✓ source";
    case "dead":
      return "✗ dead link";
    case "foreign-link":
      return "⚠ 2nd-source";
    case "copy":
      if (!s.inLibrary) return "⚠ untracked copy";
      return s.drift ? "⚠ drifted copy" : "⚠ redundant copy";
  }
}

interface Args {
  name: string | null;
  problems: boolean;
  json: boolean;
}

function parseArgs(argv: string[]): { args: Args } | { error: string } {
  const args: Args = { name: null, problems: false, json: false };
  for (const a of argv) {
    if (a === "--problems") args.problems = true;
    else if (a === "--json") args.json = true;
    else if (a.startsWith("--")) return { error: `unknown argument: ${a}` };
    else if (args.name === null) args.name = a;
    else return { error: `unexpected extra argument: ${a}` };
  }
  return { args };
}

export async function run(argv: string[], ctx: Ctx): Promise<number> {
  const parsed = parseArgs(argv);
  if ("error" in parsed) {
    ctx.error(`skl where: ${parsed.error}`);
    ctx.error(`usage: ${meta.usage}`);
    return 1;
  }
  const { name, problems, json } = parsed.args;

  try {
    const lib = await ctx.loadLibrary();
    // Surfaces = configured roots + the global-core target + the well-known
    // cross-agent global skill dirs (claude, codex, …) so sprawl across agents
    // shows up without manual `skl scan --add-root`. inventoryDeployments
    // realpath-de-duplicates and skips missing dirs.
    const surfaces = [...ctx.roots, ctx.config.globalCoreTarget, ...knownAgentSurfacePaths()];
    const report = await inventoryDeployments(surfaces, ctx.libraryPath, lib);

    // --- single skill ----------------------------------------------------
    if (name !== null) {
      const sites = report.sites.filter((s) => s.name === name);
      const inLibrary = lib.some((s) => s.name === name);
      if (json) {
        ctx.json({ name, inLibrary, sites });
        return 0;
      }
      if (sites.length === 0) {
        ctx.log(
          inLibrary
            ? `${name}: in the library, but not deployed to any scanned surface.`
            : `${name}: not in the library and not found in any scanned surface.`,
        );
        return 0;
      }
      ctx.log(`${name} — deployed at ${sites.length} site${sites.length === 1 ? "" : "s"}:`);
      for (const s of sites) {
        ctx.log(`  ${labelFor(s)}  ${tilde(s.path)}`);
        if (s.kind === "foreign-link" && s.target) ctx.log(`      → ${tilde(s.target)}`);
        const fix = suggestionFor(s);
        if (fix) ctx.log(`      ${fix}`);
      }
      return 0;
    }

    // --- full map / problems --------------------------------------------
    if (json) {
      ctx.json(problems ? { surfaces: report.surfaces, problems: report.problems } : report);
      return 0;
    }

    const linked = report.sites.filter((s) => s.kind === "linked");
    ctx.log(`Scanned ${report.surfaces.length} surface${report.surfaces.length === 1 ? "" : "s"}:`);
    for (const s of report.surfaces) ctx.log(`  ${tilde(s)}`);
    ctx.log("");
    ctx.log(`Clean: ${linked.length} linked deployment${linked.length === 1 ? "" : "s"}.`);

    if (report.problems.length === 0) {
      ctx.log("No deployment problems. ✨");
      return 0;
    }

    ctx.log("");
    ctx.log(`Problems (${report.problems.length}):`);
    for (const s of report.problems) {
      ctx.log(`  ${s.name}  [${labelFor(s)}]`);
      ctx.log(`    ${tilde(s.path)}${s.kind === "foreign-link" && s.target ? ` → ${tilde(s.target)}` : ""}`);
      ctx.log(`    → ${suggestionFor(s)}`);
    }
    return 0;
  } catch (err) {
    ctx.error(`skl where failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
