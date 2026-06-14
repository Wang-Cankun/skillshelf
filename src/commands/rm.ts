// `skl rm <name>` — delete a skill from the library entirely: remove its dir (or, for
// a LINKED entry, just the symlink — the dev repo it points at is never touched, so
// this doubles as `unlink`) AND drop its taxonomy + lockfile entries, then re-index.
// Before this, the ONLY delete path was an unguarded `rm -rf` against the library —
// no safety rail for the most destructive lifecycle step.
//
//   skl rm <name> [--force] [--dry-run] [--json]
//
// Safety (mirrors `link --at` refuse-by-default + named escape hatch): a LIVE (active,
// non-retired) skill is refused without --force — retire it first (reversible) or pass
// --force to hard-purge. A retired skill is already in the reversible holding area, so
// it purges without --force. --dry-run previews exactly what would be removed.

import type { Ctx } from "../types.ts";
import { locateEntry, removeSkill, reindexLibrary } from "../core/lifecycle.ts";
import { readTaxonomy } from "../core/taxonomy.ts";
import { readLockfile } from "../core/provenance.ts";

export const meta = {
  name: "rm",
  summary: "Delete a skill from the library (dir/symlink + taxonomy + lock), re-index",
  usage: "skl rm <name> [--force] [--dry-run] [--json]",
} as const;

export async function run(argv: string[], ctx: Ctx): Promise<number> {
  const json = argv.includes("--json");
  const force = argv.includes("--force");
  const dryRun = argv.includes("--dry-run");
  const unknown = argv.find(
    (a) => a.startsWith("--") && !["--json", "--force", "--dry-run"].includes(a),
  );
  if (unknown) {
    ctx.error(`skl rm: unknown argument: ${unknown}`);
    ctx.error(`usage: ${meta.usage}`);
    return 1;
  }
  const name = argv.find((a) => !a.startsWith("--"));
  if (!name) {
    ctx.error("skl rm: a <name> is required");
    ctx.error(`usage: ${meta.usage}`);
    return 1;
  }

  try {
    const loc = locateEntry(ctx.libraryPath, name);
    if (!loc.path) {
      ctx.error(`skl rm: '${name}' is not in the library`);
      return 1;
    }
    // Refuse only a live OWNED skill unless forced — that destroys real bytes. A
    // LINKED entry is just a symlink: removing it loses nothing (the dev repo stays
    // canonical), so `skl rm <linked>` is the safe `unlink` and needs no --force. A
    // purely-retired skill is already in the reversible holding area, so it purges
    // freely. NOTE: gate on `loc.active` itself (the resolved path IS the active copy
    // when active), NOT on the absence of a retired twin — a skill present in BOTH
    // active and _retired still resolves `path` to the active copy, so a `!loc.retired`
    // term would wrongly drop the guard and delete the live copy without --force.
    if (loc.active && !loc.isLink && !force) {
      if (json) {
        ctx.json({ ok: false, name, refused: true, reason: "live-owned-needs-force" });
      } else {
        ctx.error(`skl rm: '${name}' is a live skill — this destroys real bytes.`);
        ctx.error("Retire it first (reversible):  skl retire " + name);
        ctx.error("Or hard-purge now:             skl rm " + name + " --force");
      }
      return 1;
    }

    // Preview what would be dropped (for --dry-run and richer reporting).
    const tax = await readTaxonomy(ctx.libraryPath);
    const lock = await readLockfile(ctx.libraryPath);
    const plan = {
      name,
      path: loc.path,
      mode: loc.isLink ? ("linked" as const) : ("owned" as const),
      wasRetired: loc.retired && !loc.active,
      taxonomyEntry: name in tax.skills,
      lockEntry: name in lock.entries,
    };

    if (dryRun) {
      if (json) ctx.json({ ok: true, dryRun: true, plan });
      else {
        ctx.log(`DRY RUN — would remove '${name}':`);
        ctx.log(`  path:     ${plan.path}${plan.mode === "linked" ? " (symlink only — dev repo untouched)" : ""}`);
        ctx.log(`  taxonomy: ${plan.taxonomyEntry ? "drop entry" : "none"}`);
        ctx.log(`  lockfile: ${plan.lockEntry ? "drop entry" : "none"}`);
        ctx.log("Re-run without --dry-run to apply.");
      }
      return 0;
    }

    const result = await removeSkill(ctx.libraryPath, name);
    await reindexLibrary(ctx.libraryPath);
    if (json) {
      ctx.json({ ok: true, ...result });
    } else {
      ctx.log(`removed ${name}${result.wasLink ? " (symlink only — dev repo untouched)" : ""}`);
      if (result.taxonomyDropped) ctx.log("  dropped taxonomy entry");
      if (result.lockDropped) ctx.log("  dropped lockfile entry");
    }
    return 0;
  } catch (err) {
    ctx.error(`skl rm: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
