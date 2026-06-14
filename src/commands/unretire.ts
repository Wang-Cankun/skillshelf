// `skl unretire <name>` — restore a retired skill from <library>/_retired/<name>/
// back to the active library. The inverse of `skl retire`.
//
//   skl unretire <name> [--json]

import type { Ctx } from "../types.ts";
import { unretireSkill, reindexLibrary } from "../core/lifecycle.ts";

export const meta = {
  name: "unretire",
  summary: "Restore a retired skill back to the active library",
  usage: "skl unretire <name> [--json]",
} as const;

export async function run(argv: string[], ctx: Ctx): Promise<number> {
  const json = argv.includes("--json");
  const name = argv.find((a) => !a.startsWith("--"));
  if (!name) {
    ctx.error("skl unretire: a <name> is required");
    ctx.error(`usage: ${meta.usage}`);
    return 1;
  }
  try {
    const dest = await unretireSkill(ctx.libraryPath, name);
    await reindexLibrary(ctx.libraryPath);
    if (json) ctx.json({ ok: true, name, restoredTo: dest });
    else ctx.log(`unretired ${name} (active again)`);
    return 0;
  } catch (err) {
    ctx.error(`skl unretire: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
