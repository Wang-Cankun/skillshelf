// `skl scan [roots…]` — read-only discovery pass over scan roots.
//
// Crawls each root (see core/crawl.ts) and reports:
//   - per-root candidate counts and a total, split into new vs already-in-library
//   - every candidate (a discovered skill — see CONTEXT.md) with its location and
//     an `imported` flag (already managed by the library, or symlinks into it)
//   - the actionable list of NEW candidates (not yet imported) to feed `skl import`
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

import { sep } from "node:path";
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
    "skl scan [roots…] [--add-root <path>] [--remove-root <path>] [--json]",
} as const;

interface Args {
  roots: string[];
  addRoot: string | null;
  removeRoot: string | null;
  json: boolean;
}

function parseArgs(argv: string[]): { args: Args } | { error: string } {
  const args: Args = { roots: [], addRoot: null, removeRoot: null, json: false };
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
    } else if (a === "--remove-root" || a === "--rm-root") {
      const p = argv[++i];
      if (!p) return { error: "--remove-root requires a <path>" };
      args.removeRoot = p;
    } else if (a.startsWith("--remove-root=")) {
      args.removeRoot = a.slice("--remove-root=".length);
      if (args.removeRoot === "") return { error: "--remove-root requires a <path>" };
    } else if (a.startsWith("--rm-root=")) {
      args.removeRoot = a.slice("--rm-root=".length);
      if (args.removeRoot === "") return { error: "--remove-root requires a <path>" };
    } else if (a.startsWith("--")) {
      return { error: `unknown argument: ${a}` };
    } else {
      args.roots.push(a);
    }
  }
  if (args.addRoot != null && args.removeRoot != null) {
    return { error: "--add-root and --remove-root are mutually exclusive" };
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
  /** true if this candidate already lives in (or symlinks into) the library */
  imported: boolean;
}

function toCandidate(s: Skill, imported: boolean): CandidateView {
  return {
    name: s.name,
    description: s.description,
    path: s.path,
    root: rootOf(s),
    retired: s.retired,
    mirror: s.mirrorOf != null,
    imported,
  };
}

/**
 * Decide whether a discovered candidate is already managed by the library.
 * A candidate counts as imported if a library skill shares its name (the usual
 * case after `skl import`, including the symlink-back left at the old path) OR
 * its real path resolves inside the library tree (a symlink pointing into it).
 */
function makeIsImported(libNames: Set<string>, libraryRealPath: string) {
  const prefix = libraryRealPath.endsWith(sep) ? libraryRealPath : libraryRealPath + sep;
  return (s: Skill): boolean => {
    if (libNames.has(s.name)) return true;
    const real = realpathOrSelf(s.path);
    return real === libraryRealPath || real.startsWith(prefix);
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

    // --remove-root: de-register (inverse of --add-root), then report. Idempotent —
    // a not-registered path reports removed:false and is not an error.
    if (args.removeRoot != null) {
      const { roots, removed } = await ctx.removeRoot(args.removeRoot);
      if (args.json) {
        ctx.json({ removed, target: args.removeRoot, roots });
        return 0;
      }
      ctx.log(removed ? `Removed root: ${args.removeRoot}` : `Not a registered root: ${args.removeRoot}`);
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

    // Which candidates are already in the library? Compare against the live
    // library so scan can flag what's NEW (worth importing) vs already managed.
    const lib = await ctx.loadLibrary();
    const isImported = makeIsImported(
      new Set(lib.map((s) => s.name)),
      realpathOrSelf(ctx.libraryPath),
    );

    // Per-root counts (a candidate is a discovered skill; mirrors counted too so
    // the count matches what's physically on disk under each root). `new` =
    // candidates not yet in the library.
    const perRoot = new Map<string, number>();
    const perRootNew = new Map<string, number>();
    for (const r of roots) {
      perRoot.set(r, 0);
      perRootNew.set(r, 0);
    }
    for (const s of skills) {
      const r = rootOf(s);
      if (r != null) {
        perRoot.set(r, (perRoot.get(r) ?? 0) + 1);
        if (!isImported(s)) perRootNew.set(r, (perRootNew.get(r) ?? 0) + 1);
      }
    }

    const candidates = skills.map((s) => toCandidate(s, isImported(s)));
    // New candidates worth importing: not yet in the library, de-duped by name
    // (drop bridge mirrors and aliased copies), sorted for a stable report.
    const newByName = new Map<string, CandidateView>();
    for (const c of candidates) {
      if (c.imported || c.mirror) continue;
      if (!newByName.has(c.name)) newByName.set(c.name, c);
    }
    const newCandidates = [...newByName.values()].sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
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
          new: newCandidates.length,
          duplicateGroups: groupViews.length,
          driftGroups: drifted.length,
          exactDuplicateGroups: exact.length,
        },
        perRoot: roots.map((r) => ({
          root: r,
          candidates: perRoot.get(r) ?? 0,
          new: perRootNew.get(r) ?? 0,
        })),
        dedupedRoots,
        candidates,
        newCandidates,
        duplicateGroups: groupViews,
      });
      return 0;
    }

    // --- Human report ----------------------------------------------------
    ctx.log(`Scanned ${roots.length} root${roots.length === 1 ? "" : "s"}:`);
    for (const r of roots) {
      const c = perRoot.get(r) ?? 0;
      const n = perRootNew.get(r) ?? 0;
      const breakdown = c === 0 ? "" : n === 0 ? " (all in library)" : ` (${n} new, ${c - n} in library)`;
      ctx.log(`  ${r} — ${c} candidate${c === 1 ? "" : "s"}${breakdown}`);
    }
    if (dedupedRoots.length) {
      ctx.log(`  (skipped ${dedupedRoots.length} aliased root${dedupedRoots.length === 1 ? "" : "s"}: ${dedupedRoots.join(", ")})`);
    }
    ctx.log("");
    ctx.log(`Total candidates: ${candidates.length} (${newCandidates.length} new, not yet in library)`);

    // New candidates: the actionable list — what you'd `skl import` next.
    if (newCandidates.length > 0) {
      ctx.log("");
      ctx.log(`New (not in library) — ${newCandidates.length}:`);
      for (const c of newCandidates) {
        ctx.log(`  ${c.name}${c.retired ? " [retired]" : ""}`);
        ctx.log(`    ${c.path}`);
      }
      ctx.log("");
      ctx.log("Import one with:  skl import <name> --from <path>");
    }

    if (groupViews.length === 0) {
      if (newCandidates.length === 0) ctx.log("No duplicates or drift detected.");
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
