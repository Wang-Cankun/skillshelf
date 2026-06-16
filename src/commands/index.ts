// `skl index` — regenerate INDEX.md (catalog grouped by primary domain) at
// the library root, via core/indexgen.

import type { Ctx } from "../types.ts";
import { writeIndex } from "../core/indexgen.ts";

export const meta = {
  name: "index",
  summary: "Regenerate INDEX.md (catalog grouped by domain)",
  usage: "skl index [--json]",
} as const;

export async function run(argv: string[], ctx: Ctx): Promise<number> {
  try {
    const json = argv.includes("--json");
    const skills = await ctx.loadLibrary();

    const generatedAt = new Date().toISOString();
    const { path, bytes } = await writeIndex(ctx.config.libraryPath, skills, {
      generatedAt,
    });

    const active = skills.filter((s) => !s.retired).length;
    const retired = skills.length - active;

    if (json) {
      ctx.json({
        path,
        skills: skills.length,
        active,
        retired,
        generatedAt,
        bytes,
      });
      return 0;
    }

    ctx.log(
      `Wrote ${path} (${active} active${retired ? `, ${retired} retired` : ""}).`,
    );
    return 0;
  } catch (err) {
    ctx.error(`index failed: ${(err as Error).message}`);
    return 1;
  }
}
