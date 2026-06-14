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
import { join } from "node:path";
import type { Ctx, DeploymentSite } from "../types.ts";
import {
  inventoryDeployments,
  suggestionFor,
  remediationFor,
  type RemediationAction,
} from "../core/deployments.ts";
import { knownAgentSurfacePaths } from "../core/surfaces.ts";
import { safeSymlink, removeSymlink } from "../lib/fs.ts";

export const meta = {
  name: "where",
  summary: "Show where each library skill is deployed across all surfaces (copies, symlinks, drift)",
  usage: "skl where [name] [--problems] [--prune | --fix] [--dry-run] [--json]",
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
  prune: boolean;
  fix: boolean;
  dryRun: boolean;
  json: boolean;
}

function parseArgs(argv: string[]): { args: Args } | { error: string } {
  const args: Args = { name: null, problems: false, prune: false, fix: false, dryRun: false, json: false };
  for (const a of argv) {
    if (a === "--problems") args.problems = true;
    else if (a === "--prune") args.prune = true;
    else if (a === "--fix") args.fix = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--json") args.json = true;
    else if (a.startsWith("--")) return { error: `unknown argument: ${a}` };
    else if (args.name === null) args.name = a;
    else return { error: `unexpected extra argument: ${a}` };
  }
  if (args.prune && args.fix) {
    return { error: "--prune and --fix are mutually exclusive (--fix includes --prune's dead-link cleanup)" };
  }
  return { args };
}

export interface FixOutcome {
  name: string;
  path: string;
  action: RemediationAction;
  applied: boolean;
  note: string;
}

/**
 * Apply where's own remediation to the flagged sites and return per-site outcomes.
 * --prune handles only dead links; --fix also dedupes content-identical copies to a
 * symlink into the library. `manual` problems (drift / 2nd-source / untracked) are
 * NEVER auto-resolved — they carry a real decision; we report them with the existing
 * suggestion so the loop is closed but judgment stays with the human/agent.
 */
export async function remediate(
  sites: DeploymentSite[],
  libraryPath: string,
  opts: { fix: boolean; dryRun: boolean },
): Promise<FixOutcome[]> {
  const out: FixOutcome[] = [];
  for (const s of sites) {
    const action = remediationFor(s);
    if (action === "remove-dead") {
      if (!opts.dryRun) await removeSymlink(s.path, { force: true });
      out.push({ name: s.name, path: s.path, action, applied: !opts.dryRun, note: opts.dryRun ? "would remove dead link" : "removed dead link" });
    } else if (action === "dedupe-copy" && opts.fix) {
      if (!opts.dryRun) await safeSymlink(join(libraryPath, s.name), s.path, { force: true });
      out.push({ name: s.name, path: s.path, action, applied: !opts.dryRun, note: opts.dryRun ? "would replace identical copy with a symlink into the library" : "deduped copy -> symlink into library" });
    } else {
      // manual (or dedupe-copy under --prune): not auto-applied.
      out.push({ name: s.name, path: s.path, action: "manual", applied: false, note: suggestionFor(s) });
    }
  }
  return out;
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

    // --- remediation (--prune / --fix) -----------------------------------
    if (parsed.args.prune || parsed.args.fix) {
      const targets = name !== null ? report.problems.filter((s) => s.name === name) : report.problems;
      const outcomes = await remediate(targets, ctx.libraryPath, {
        fix: parsed.args.fix,
        dryRun: parsed.args.dryRun,
      });
      const applied = outcomes.filter((o) => o.applied).length;
      const manual = outcomes.filter((o) => o.action === "manual");
      if (json) {
        ctx.json({ dryRun: parsed.args.dryRun, mode: parsed.args.fix ? "fix" : "prune", applied, outcomes });
        return 0;
      }
      const verb = parsed.args.dryRun ? "Would apply" : "Applied";
      ctx.log(`${verb} ${parsed.args.fix ? "fix" : "prune"} to ${outcomes.length} problem site(s):`);
      for (const o of outcomes) {
        const flag = o.action === "manual" ? "•" : parsed.args.dryRun ? "?" : "✓";
        ctx.log(`  ${flag} ${o.name}  ${tilde(o.path)}`);
        ctx.log(`      ${o.note}`);
      }
      ctx.log("");
      ctx.log(`${applied} ${parsed.args.dryRun ? "would be " : ""}auto-fixed, ${manual.length} need a manual decision.`);
      return 0;
    }

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
