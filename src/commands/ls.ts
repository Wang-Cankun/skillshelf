// `skl ls [bundle]` — one-line listing of the whole library, or a single
// bundle (tag query). Excludes retired by default; `--all` includes them.

import { statSync } from "node:fs";
import type { Ctx, Skill } from "../types.ts";
import { activeSkills, entryModeInfo } from "../core/library.ts";
import { resolveBundle } from "../core/bundle.ts";
import { inventoryDeployments } from "../core/deployments.ts";
import { knownAgentSurfacePaths } from "../core/surfaces.ts";
import { isCleanSite } from "../core/agents.ts";

export const meta = {
  name: "ls",
  summary: "One-line listing of the library, or one bundle",
  usage: "skl ls [bundle] [--all] [--json]",
} as const;

function oneLine(desc: string, max = 100): string {
  const flat = desc.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : flat.slice(0, max - 1).trimEnd() + "…";
}

function emitHuman(ctx: Ctx, skills: Skill[]): void {
  if (skills.length === 0) {
    ctx.log("(no skills)");
    return;
  }
  for (const s of skills) {
    const tag = s.retired ? " (retired)" : "";
    const dom =
      s.primaryDomain && !s.retired ? ` [${s.primaryDomain}]` : "";
    ctx.log(`${s.name}${dom}${tag} — ${oneLine(s.description)}`);
  }
}

/** Stat-derived timestamps for a skill's SKILL.md (ISO-8601), null if unavailable. */
function fileTimes(bodyPath: string): { modifiedAt: string | null; createdAt: string | null } {
  try {
    const st = statSync(bodyPath);
    const created = st.birthtimeMs > 0 ? st.birthtime : null;
    return {
      modifiedAt: st.mtime.toISOString(),
      createdAt: created ? created.toISOString() : null,
    };
  } catch {
    return { modifiedAt: null, createdAt: null };
  }
}

function toJson(
  skills: Skill[],
  libraryPath: string,
  deployCounts: Map<string, number>,
): unknown {
  return skills.map((s) => {
    const { mode, linkTarget } = entryModeInfo(libraryPath, s.name);
    const { modifiedAt, createdAt } = fileTimes(s.bodyPath);
    return {
      name: s.name,
      description: s.description,
      primaryDomain: s.primaryDomain,
      domains: s.domains,
      path: s.path,
      retired: s.retired,
      mode,
      linkTarget,
      // ADR-0008 §7.1 additions: a string source (UI maps "vendored"/"local"),
      // stat timestamps, and the count of clean deployment sites.
      source: s.source ? "vendored" : "local",
      modifiedAt,
      createdAt,
      deployCount: deployCounts.get(s.name) ?? 0,
    };
  });
}

/** Count clean (`linked`) deployment sites per skill across all surfaces. */
async function deployCountsFor(ctx: Ctx, lib: Skill[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  try {
    const surfaces = [...ctx.roots, ctx.config.globalCoreTarget, ...knownAgentSurfacePaths()];
    const report = await inventoryDeployments(surfaces, ctx.libraryPath, lib);
    for (const site of report.sites) {
      // "clean" = the ✓ states in `skl where` (linked OR canonical source), shared
      // with the agents matrix via isCleanSite so the Deploys column agrees with it.
      if (isCleanSite(site)) counts.set(site.name, (counts.get(site.name) ?? 0) + 1);
    }
  } catch {
    // deployment scan is best-effort enrichment; ls still returns the library.
  }
  return counts;
}

export async function run(argv: string[], ctx: Ctx): Promise<number> {
  try {
    const json = argv.includes("--json");
    const all = argv.includes("--all");
    const positional = argv.filter((a) => !a.startsWith("--"));
    const bundleName = positional[0];

    const skills = await ctx.loadLibrary();
    const deployCounts = json ? await deployCountsFor(ctx, skills) : new Map<string, number>();

    if (bundleName) {
      const bundle = await resolveBundle(skills, bundleName, {
        includeRetired: all,
      });
      if (json) {
        ctx.json({ bundle: bundle.name, skills: toJson(bundle.skills, ctx.libraryPath, deployCounts) });
        return 0;
      }
      if (bundle.skills.length === 0) {
        ctx.log(`Bundle "${bundle.name}" has no skills.`);
        return 0;
      }
      ctx.log(`# ${bundle.name} (${bundle.skills.length})`);
      emitHuman(ctx, bundle.skills);
      return 0;
    }

    const listed = all ? skills : activeSkills(skills);
    if (json) {
      ctx.json(toJson(listed, ctx.libraryPath, deployCounts));
      return 0;
    }
    emitHuman(ctx, listed);
    return 0;
  } catch (err) {
    ctx.error(`ls failed: ${(err as Error).message}`);
    return 1;
  }
}
