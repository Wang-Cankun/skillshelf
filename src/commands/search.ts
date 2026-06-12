// `skl search <kw>` — fuzzy match over skill name + description (+ domains)
// across the whole library. Kills "forgot it exists".

import type { Ctx, Skill } from "../types.ts";
import { searchSkills } from "../core/library.ts";

export const meta = {
  name: "search",
  summary: "Fuzzy over name+desc+domains across the library",
  usage: "skl search <kw...> [--json]",
} as const;

function oneLine(desc: string, max = 100): string {
  const flat = desc.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : flat.slice(0, max - 1).trimEnd() + "…";
}

export async function run(argv: string[], ctx: Ctx): Promise<number> {
  try {
    const json = argv.includes("--json");
    const terms = argv.filter((a) => a !== "--json");
    const query = terms.join(" ").trim();

    if (query === "") {
      ctx.error("usage: " + meta.usage);
      return 1;
    }

    const skills = await ctx.loadLibrary();
    const matches = searchSkills(skills, query);

    if (json) {
      ctx.json(
        matches.map((s: Skill) => ({
          name: s.name,
          description: s.description,
          primaryDomain: s.primaryDomain,
          domains: s.domains,
          path: s.path,
          retired: s.retired,
        })),
      );
      return 0;
    }

    if (matches.length === 0) {
      ctx.log(`No skills match "${query}".`);
      return 0;
    }

    for (const s of matches) {
      const tag = s.retired ? " (retired)" : "";
      const dom = s.domains.length ? ` [${s.domains.join(", ")}]` : "";
      ctx.log(`${s.name}${dom}${tag} — ${oneLine(s.description)}`);
    }
    return 0;
  } catch (err) {
    ctx.error(`search failed: ${(err as Error).message}`);
    return 1;
  }
}
