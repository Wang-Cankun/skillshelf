// `skl retire <name>` — soft-delete a skill into <library>/_retired/<name>/. The
// read layer already renders retired skills (struck-through in INDEX.md, "(retired)"
// in `ls --all`, excluded from bundles/deploys) but had no WRITE primitive to enter
// that state — forcing a hand `mkdir _retired && mv`. This is the reversible first
// step of the removal lifecycle (retire -> optionally `rm`); undo with `skl unretire`.
//
//   skl retire <name> [--json]

import type { Ctx } from "../types.ts";
import { retireSkill, reindexLibrary } from "../core/lifecycle.ts";

export const meta = {
  name: "retire",
  summary: "Soft-delete a skill into library/_retired/ (reversible; excluded from deploys)",
  usage: "skl retire <name> [--json]",
} as const;

export async function run(argv: string[], ctx: Ctx): Promise<number> {
  const json = argv.includes("--json");
  const name = argv.find((a) => !a.startsWith("--"));
  if (!name) {
    ctx.error("skl retire: a <name> is required");
    ctx.error(`usage: ${meta.usage}`);
    return 1;
  }
  try {
    const dest = await retireSkill(ctx.libraryPath, name);
    await reindexLibrary(ctx.libraryPath);
    if (json) ctx.json({ ok: true, name, retiredTo: dest });
    else {
      ctx.log(`retired ${name} -> _retired/${name}`);
      ctx.log("  (excluded from bundles/deploys; restore with `skl unretire`, purge with `skl rm`)");
    }
    return 0;
  } catch (err) {
    ctx.error(`skl retire: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
