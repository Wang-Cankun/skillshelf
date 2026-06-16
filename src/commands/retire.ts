// `skl retire <name>` — soft-delete a skill into <library>/_retired/<name>/. The
// read layer already renders retired skills (struck-through in INDEX.md, "(retired)"
// in `ls --all`, excluded from bundles/deploys) but had no WRITE primitive to enter
// that state — forcing a hand `mkdir _retired && mv`. This is the reversible first
// step of the removal lifecycle (retire -> optionally `rm`); undo with `skl unretire`.
//
//   skl retire <name> [--json]

import type { Ctx } from "../types.ts";
import { retireSkill, bulkLifecycle } from "../core/lifecycle.ts";

export const meta = {
  name: "retire",
  summary: "Soft-delete skill(s) into library/_retired/ (reversible; excluded from deploys)",
  usage: "skl retire <name>... [--json]",
} as const;

export async function run(argv: string[], ctx: Ctx): Promise<number> {
  const json = argv.includes("--json");
  const names = argv.filter((a) => !a.startsWith("--"));
  if (names.length === 0) {
    ctx.error("skl retire: a <name> is required");
    ctx.error(`usage: ${meta.usage}`);
    return 1;
  }
  // Retire each name; reindex ONCE at the end (a per-name reindex is the cost a bulk
  // retire pays — bulkLifecycle collapses it to one).
  return bulkLifecycle(names, retireSkill, ctx, {
    json,
    jsonKey: "retiredTo",
    verb: "retire",
    onResults: (results) => {
      for (const r of results) ctx.log(`retired ${r.name} -> _retired/${r.name}`);
      if (results.length > 0) {
        ctx.log("  (excluded from bundles/deploys; restore with `skl unretire`, purge with `skl rm`)");
      }
    },
  });
}
