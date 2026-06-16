// `skl unretire <name>` — restore a retired skill from <library>/_retired/<name>/
// back to the active library. The inverse of `skl retire`.
//
//   skl unretire <name> [--json]

import type { Ctx } from "../types.ts";
import { unretireSkill, bulkLifecycle } from "../core/lifecycle.ts";

export const meta = {
  name: "unretire",
  summary: "Restore retired skill(s) back to the active library",
  usage: "skl unretire <name>... [--json]",
} as const;

export async function run(argv: string[], ctx: Ctx): Promise<number> {
  const json = argv.includes("--json");
  const names = argv.filter((a) => !a.startsWith("--"));
  if (names.length === 0) {
    ctx.error("skl unretire: a <name> is required");
    ctx.error(`usage: ${meta.usage}`);
    return 1;
  }
  // Unretire each name, then reindex ONCE at the end (mirrors retire: one pass for N).
  return bulkLifecycle(names, unretireSkill, ctx, {
    json,
    jsonKey: "restoredTo",
    verb: "unretire",
    onResults: (results) => {
      for (const r of results) ctx.log(`unretired ${r.name} (active again)`);
    },
  });
}
