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
  const multi = names.length > 1;

  // Retire each name, collecting results/failures, then reindex ONCE at the end
  // (a per-name reindex is the cost a bulk retire pays — this collapses it to one).
  const results: Array<{ ok: true; name: string; retiredTo: string }> = [];
  const failures: Array<{ name: string; error: string }> = [];
  let didMutate = false;
  for (const name of names) {
    try {
      const dest = await retireSkill(ctx.libraryPath, name);
      didMutate = true;
      results.push({ ok: true, name, retiredTo: dest });
    } catch (err) {
      failures.push({ name, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Reindex once if anything actually moved on disk, so INDEX.md never lists a
  // skill that left the active set (a single pass for N names).
  if (didMutate) await reindexLibrary(ctx.libraryPath);

  if (json) {
    // Single-name shape stays byte-identical (success emits the object, a failure
    // emits NO json — only the error stream, exactly as before); multi returns an array.
    if (!multi) {
      const r = results[0];
      if (r) ctx.json({ ok: true, name: r.name, retiredTo: r.retiredTo });
    } else {
      ctx.json(results.map((r) => ({ ok: true, name: r.name, retiredTo: r.retiredTo })));
    }
  } else {
    for (const r of results) {
      ctx.log(`retired ${r.name} -> _retired/${r.name}`);
    }
    if (results.length > 0) {
      ctx.log("  (excluded from bundles/deploys; restore with `skl unretire`, purge with `skl rm`)");
    }
  }

  for (const f of failures) ctx.error(`skl retire: ${f.error}`);
  return failures.length > 0 ? 1 : 0;
}
