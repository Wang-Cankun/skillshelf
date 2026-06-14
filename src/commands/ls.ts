// `skl ls [bundle]` — one-line listing of the whole library, or a single
// bundle (tag query). Excludes retired by default; `--all` includes them.

import type { Ctx, Skill } from "../types.ts";
import { activeSkills, entryModeInfo } from "../core/library.ts";
import { resolveBundle } from "../core/bundle.ts";

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

function toJson(skills: Skill[], libraryPath: string): unknown {
  return skills.map((s) => {
    const { mode, linkTarget } = entryModeInfo(libraryPath, s.name);
    return {
      name: s.name,
      description: s.description,
      primaryDomain: s.primaryDomain,
      domains: s.domains,
      path: s.path,
      retired: s.retired,
      mode,
      linkTarget,
    };
  });
}

export async function run(argv: string[], ctx: Ctx): Promise<number> {
  try {
    const json = argv.includes("--json");
    const all = argv.includes("--all");
    const positional = argv.filter((a) => !a.startsWith("--"));
    const bundleName = positional[0];

    const skills = await ctx.loadLibrary();

    if (bundleName) {
      const bundle = await resolveBundle(skills, bundleName, {
        includeRetired: all,
      });
      if (json) {
        ctx.json({ bundle: bundle.name, skills: toJson(bundle.skills, ctx.libraryPath) });
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
      ctx.json(toJson(listed, ctx.libraryPath));
      return 0;
    }
    emitHuman(ctx, listed);
    return 0;
  } catch (err) {
    ctx.error(`ls failed: ${(err as Error).message}`);
    return 1;
  }
}
