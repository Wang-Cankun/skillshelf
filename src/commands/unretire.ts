// `skl unretire <name>` — restore a retired skill from <library>/_retired/<name>/
// back to the active library. The inverse of `skl retire`.
//
//   skl unretire <name> [--json]

import type { Ctx } from "../types.ts";
import { unretireSkill, reindexLibrary } from "../core/lifecycle.ts";

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
  const multi = names.length > 1;

  // Unretire each name, then reindex ONCE at the end (mirrors retire: one pass for N).
  const results: Array<{ ok: true; name: string; restoredTo: string }> = [];
  const failures: Array<{ name: string; error: string }> = [];
  let didMutate = false;
  for (const name of names) {
    try {
      const dest = await unretireSkill(ctx.libraryPath, name);
      didMutate = true;
      results.push({ ok: true, name, restoredTo: dest });
    } catch (err) {
      failures.push({ name, error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (didMutate) await reindexLibrary(ctx.libraryPath);

  if (json) {
    // Single-name shape stays byte-identical (success emits the object, a failure
    // emits NO json — only the error stream, exactly as before); multi returns an array.
    if (!multi) {
      const r = results[0];
      if (r) ctx.json({ ok: true, name: r.name, restoredTo: r.restoredTo });
    } else {
      ctx.json(results.map((r) => ({ ok: true, name: r.name, restoredTo: r.restoredTo })));
    }
  } else {
    for (const r of results) ctx.log(`unretired ${r.name} (active again)`);
  }

  for (const f of failures) ctx.error(`skl unretire: ${f.error}`);
  return failures.length > 0 ? 1 : 0;
}
