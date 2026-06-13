// `skl scan [roots…]` — read-only discovery pass over scan roots.
//
// Crawls each root (see core/crawl.ts) and reports:
//   - per-root candidate counts and a total
//   - every candidate (a discovered skill — see CONTEXT.md) with its location
//   - duplicate / drift groups (via core/dedupe.ts) with their locations and a
//     recommendation for the human/agent to act on
//
// Roots come from positional args if given, else ctx.roots (config-persisted).
// Scan NEVER moves anything and emits NO inference payload — taxonomy is the job
// of `skl infer`. Use `skl import` to actually consolidate candidates.
//
// Flags:
//   --add-root <path>   persist a scan root into config.json, then report roots
//   --json              emit a structured object instead of the human report

import type { Ctx, Skill, DuplicateGroup } from "../types.ts";
import { crawl } from "../core/crawl.ts";
import {
  findDuplicates,
  driftedGroups,
  exactDuplicateGroups,
  genuineConflictGroups,
} from "../core/dedupe.ts";
import { realpathOrSelf } from "../lib/fs.ts";

export const meta = {
  name: "scan",
  summary: "Read-only discovery of skill candidates across roots (counts, duplicates, drift)",
  usage:
    "skl scan [roots…] [--add-root <path>] [--json]",
} as const;

interface Args {
  roots: string[];
  addRoot: string | null;
  json: boolean;
}

function parseArgs(argv: string[]): { args: Args } | { error: string } {
  const args: Args = { roots: [], addRoot: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--json") {
      args.json = true;
    } else if (a === "--add-root") {
      const p = argv[++i];
      if (!p) return { error: "--add-root requires a <path>" };
      args.addRoot = p;
    } else if (a.startsWith("--add-root=")) {
      args.addRoot = a.slice("--add-root=".length);
      if (args.addRoot === "") return { error: "--add-root requires a <path>" };
    } else if (a.startsWith("--")) {
      return { error: `unknown argument: ${a}` };
    } else {
      args.roots.push(a);
    }
  }
  return { args };
}

/**
 * Attribute a discovered skill to the scan root it was crawled under. crawl records
 * this at discovery time (`Skill.discoveredRoot`); we must NOT re-derive it via
 * realpath, because a skill reached through a symlink resolves OUTSIDE its declared
 * root and would be mis-attributed to no root (the per-root undercount bug).
 */
function rootOf(skill: Skill): string | null {
  return skill.discoveredRoot ?? null;
}

interface CandidateView {
  name: string;
  description: string;
  path: string;
  root: string | null;
  retired: boolean;
  mirror: boolean;
}

function toCandidate(s: Skill): CandidateView {
  return {
    name: s.name,
    description: s.description,
    path: s.path,
    root: rootOf(s),
    retired: s.retired,
    mirror: s.mirrorOf != null,
  };
}

/** Human-readable recommendation for one duplicate/drift group. */
function recommendationFor(g: DuplicateGroup): string {
  if (g.divergent.length > 0) {
    return `drift — ${g.divergent.length + 1} copies of "${g.name}" differ; review and pick a canonical copy (skillshelf won't choose for you)`;
  }
  return `exact duplicate — ${g.duplicates.length + 1} identical copies of "${g.name}"; import the canonical one and let the others become symlinks`;
}

function groupLocations(g: DuplicateGroup): string[] {
  return [g.canonical, ...g.duplicates, ...g.divergent].map((s) => s.path);
}

interface GroupView {
  name: string;
  kind: "drift" | "duplicate";
  identical: boolean;
  canonical: string;
  duplicates: string[];
  divergent: string[];
  locations: string[];
  recommendation: string;
}

function toGroupView(g: DuplicateGroup): GroupView {
  return {
    name: g.name,
    kind: g.divergent.length > 0 ? "drift" : "duplicate",
    identical: g.identical,
    canonical: g.canonical.path,
    duplicates: g.duplicates.map((s) => s.path),
    divergent: g.divergent.map((s) => s.path),
    locations: groupLocations(g),
    recommendation: recommendationFor(g),
  };
}

/** Report the configured roots when there is nothing to scan. */
function reportNoRoots(args: Args, roots: string[], ctx: Ctx): number {
  if (args.json) {
    ctx.json({ roots, totals: { roots: roots.length, candidates: 0 }, candidates: [], duplicateGroups: [] });
    return 0;
  }
  if (roots.length === 0) {
    ctx.log("No scan roots configured.");
    ctx.log("Add one with:  skl scan --add-root <path>");
    ctx.log("Or scan ad-hoc:  skl scan <path> [<path>…]");
  } else {
    ctx.log(`Configured scan roots (${roots.length}):`);
    for (const r of roots) ctx.log(`  ${r}`);
  }
  return 0;
}

export async function run(argv: string[], ctx: Ctx): Promise<number> {
  const parsed = parseArgs(argv);
  if ("error" in parsed) {
    ctx.error(`skl scan: ${parsed.error}`);
    ctx.error(`usage: ${meta.usage}`);
    return 1;
  }
  const args = parsed.args;

  try {
    // --add-root: persist, then report the updated roots (no scan side effect).
    if (args.addRoot != null) {
      const roots = await ctx.addRoot(args.addRoot);
      if (args.json) {
        ctx.json({ added: realpathLike(args.addRoot, roots), roots });
        return 0;
      }
      ctx.log(`Roots (${roots.length}):`);
      for (const r of roots) ctx.log(`  ${r}`);
      return 0;
    }

    // Roots: explicit args win; else fall back to configured roots.
    const roots = args.roots.length > 0 ? args.roots : ctx.roots;
    if (roots.length === 0) {
      return reportNoRoots(args, ctx.roots, ctx);
    }

    // Single combined crawl: realpath-dedupe and cross-root drift detection both
    // need every copy in one set.
    const { skills, dedupedRoots } = await crawl(roots);

    // Per-root counts (a candidate is a discovered skill; mirrors counted too so
    // the count matches what's physically on disk under each root).
    const perRoot = new Map<string, number>();
    for (const r of roots) perRoot.set(r, 0);
    for (const s of skills) {
      const r = rootOf(s);
      if (r != null) perRoot.set(r, (perRoot.get(r) ?? 0) + 1);
    }

    const candidates = skills.map((s) => toCandidate(s));
    // Surface only genuine conflicts: faithful `.agents`/`.claude` bridge mirrors are
    // a known, intended relationship, not a decision the user has to resolve.
    const allGroups = genuineConflictGroups(findDuplicates(skills));
    const drifted = driftedGroups(allGroups);
    const exact = exactDuplicateGroups(allGroups);
    const reported = [...drifted, ...exact].sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
    const groupViews = reported.map(toGroupView);

    if (args.json) {
      ctx.json({
        roots,
        totals: {
          roots: roots.length,
          candidates: candidates.length,
          duplicateGroups: groupViews.length,
          driftGroups: drifted.length,
          exactDuplicateGroups: exact.length,
        },
        perRoot: roots.map((r) => ({ root: r, candidates: perRoot.get(r) ?? 0 })),
        dedupedRoots,
        candidates,
        duplicateGroups: groupViews,
      });
      return 0;
    }

    // --- Human report ----------------------------------------------------
    ctx.log(`Scanned ${roots.length} root${roots.length === 1 ? "" : "s"}:`);
    for (const r of roots) {
      ctx.log(`  ${r} — ${perRoot.get(r) ?? 0} candidate${(perRoot.get(r) ?? 0) === 1 ? "" : "s"}`);
    }
    if (dedupedRoots.length) {
      ctx.log(`  (skipped ${dedupedRoots.length} aliased root${dedupedRoots.length === 1 ? "" : "s"}: ${dedupedRoots.join(", ")})`);
    }
    ctx.log("");
    ctx.log(`Total candidates: ${candidates.length}`);

    if (groupViews.length === 0) {
      ctx.log("No duplicates or drift detected.");
      return 0;
    }

    ctx.log("");
    ctx.log(`Duplicate / drift groups (${groupViews.length}):`);
    for (const g of groupViews) {
      ctx.log(`  ${g.name} [${g.kind}]`);
      for (const loc of g.locations) ctx.log(`    - ${loc}`);
      ctx.log(`    → ${g.recommendation}`);
    }
    return 0;
  } catch (err) {
    ctx.error(`scan failed: ${(err as Error).message}`);
    return 1;
  }
}

/** Best-effort: report which root in the list corresponds to the added path. */
function realpathLike(added: string, roots: string[]): string {
  // ctx.addRoot expands/absolutizes; find the matching persisted entry to report.
  const real = realpathOrSelf(added);
  for (const r of roots) {
    if (realpathOrSelf(r) === real) return r;
  }
  return roots[roots.length - 1] ?? added;
}
