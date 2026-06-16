// `skl untrack <name>` — drop the provenance lock entry for a library skill.
//
//   skl untrack <name> [--json]
//
// The inverse of `skl track` (ADR-0005): removes the skill's `shelf.lock.json` entry so
// `outdated`/`update` stop treating it as tracked. The skill's on-disk content, domain
// tags (taxonomy.json), and any deploy symlinks are untouched — only the provenance is
// forgotten. Idempotent: untracking a skill with no entry is a no-op (like `drop`).

import type { Ctx } from "../types.ts";
import { removeEntry } from "../core/provenance.ts";

export const meta = {
  name: "untrack",
  summary: "Drop a skill's provenance lock entry (inverse of track); idempotent",
  usage: "skl untrack <name> [--json]",
} as const;

export async function run(argv: string[], ctx: Ctx): Promise<number> {
  const json = argv.includes("--json");
  const name = argv.find((a) => !a.startsWith("-")) ?? null;

  if (!name || name.trim() === "") {
    ctx.error("skl untrack: a <name> is required");
    ctx.error(`usage: ${meta.usage}`);
    return 1;
  }

  try {
    const removed = await removeEntry(ctx.config.libraryPath, name.trim());
    const summary = { ok: true, action: "untrack" as const, name: name.trim(), removed };
    if (json) {
      ctx.json(summary);
    } else if (removed) {
      ctx.log(`untracked ${name.trim()} (provenance entry removed; content + tags untouched)`);
    } else {
      ctx.log(`untrack: ${name.trim()} had no provenance entry (nothing to do)`);
    }
    return 0;
  } catch (err) {
    ctx.error(`skl untrack: failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
