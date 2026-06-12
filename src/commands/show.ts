// `skl show <name>` — print ONLY the SKILL.md instruction layer (the body
// after frontmatter) and list bundled reference-file paths. Reference file
// CONTENTS are never printed; the agent Reads them on demand. Manual
// progressive disclosure: cheap by default, deep on demand.

import type { Ctx, Skill } from "../types.ts";
import { findByName } from "../core/library.ts";
import { parseFrontmatter } from "../lib/frontmatter.ts";

export const meta = {
  name: "show",
  summary: "Print SKILL.md body; list reference-file paths (not contents)",
  usage: "skl show <name> [--json]",
} as const;

async function bodyOf(skill: Skill): Promise<string> {
  const raw = await Bun.file(skill.bodyPath).text();
  const { body, hasFrontmatter } = parseFrontmatter(raw);
  return hasFrontmatter ? body : raw;
}

export async function run(argv: string[], ctx: Ctx): Promise<number> {
  try {
    const json = argv.includes("--json");
    const positional = argv.filter((a) => !a.startsWith("--"));
    const name = positional[0];

    if (!name) {
      ctx.error("usage: " + meta.usage);
      return 1;
    }

    const skills = await ctx.loadLibrary();
    const skill = findByName(skills, name);
    if (!skill) {
      ctx.error(`No skill named "${name}". Try: skl search ${name}`);
      return 1;
    }

    const body = await bodyOf(skill);

    if (json) {
      ctx.json({
        name: skill.name,
        description: skill.description,
        primaryDomain: skill.primaryDomain,
        domains: skill.domains,
        path: skill.path,
        bodyPath: skill.bodyPath,
        body,
        refFiles: skill.refFiles,
        retired: skill.retired,
        source: skill.source,
      });
      return 0;
    }

    ctx.log(body.replace(/\n+$/, ""));

    if (skill.refFiles.length) {
      ctx.log("");
      ctx.log(`# Reference files (${skill.refFiles.length}) — Read on demand:`);
      for (const f of skill.refFiles) ctx.log(f);
    }
    return 0;
  } catch (err) {
    ctx.error(`show failed: ${(err as Error).message}`);
    return 1;
  }
}
