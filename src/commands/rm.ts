// `skl rm <name>...` — delete skill(s) from the library entirely: remove each dir (or,
// for a LINKED entry, just the symlink — the dev repo it points at is never touched, so
// this doubles as `unlink`) AND drop its taxonomy + lockfile entries, then re-index ONCE.
// Before this, the ONLY delete path was an unguarded `rm -rf` against the library —
// no safety rail for the most destructive lifecycle step.
//
//   skl rm <name>... [--force] [--dry-run] [--json]
//
// Batch: multiple names delete in one call (reindex collapses to one, mirroring
// `retire`). Validation is ATOMIC — if any name is missing or a live OWNED skill without
// --force, the whole batch refuses and nothing is deleted (never a partial purge).
//
// Safety (mirrors `link --at` refuse-by-default + named escape hatch): a LIVE (active,
// non-retired) skill is refused without --force — retire it first (reversible) or pass
// --force to hard-purge. A retired skill is already in the reversible holding area, so
// it purges without --force. --dry-run previews exactly what would be removed.

import type { Ctx } from "../types.ts";
import { locateEntry, removeSkill, reindexLibrary, type RemoveResult } from "../core/lifecycle.ts";
import { readTaxonomy } from "../core/taxonomy.ts";
import { readLockfile } from "../core/provenance.ts";
import { render, type CommandResult } from "../core/report.ts";

export const meta = {
  name: "rm",
  summary: "Delete skill(s) from the library (dir/symlink + taxonomy + lock), re-index",
  usage: "skl rm <name>... [--force] [--dry-run] [--json]",
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
  const names = argv.filter((a) => !a.startsWith("--"));
  if (names.length === 0) {
    ctx.error("skl rm: a <name> is required");
    ctx.error(`usage: ${meta.usage}`);
    return 1;
  }

  try {
    // Locate + guard EVERY name up front. The batch is ATOMIC on validation: if any
    // name is missing, or is a live OWNED skill without --force (destroys real bytes),
    // refuse the WHOLE batch and delete nothing — never a partial purge.
    const located = names.map((name) => ({ name, loc: locateEntry(ctx.libraryPath, name) }));

    const notFound = located.filter((x) => !x.loc.path).map((x) => x.name);
    if (notFound.length) {
      // Not-found stays a plain error (no --json body), matching the prior single-name path.
      for (const n of notFound) ctx.error(`skl rm: '${n}' is not in the library`);
      return 1;
    }

    // Refuse only a live OWNED skill unless forced — that destroys real bytes. A LINKED
    // entry is just a symlink (removing it loses nothing); a purely-retired skill is
    // already in the reversible holding area — both purge freely. Gate on `loc.active`
    // itself (NOT `!loc.retired`) so a skill present in BOTH active and _retired keeps
    // the guard on its live copy.
    const refused = located.filter((x) => x.loc.active && !x.loc.isLink && !force).map((x) => x.name);
    if (refused.length) {
      if (json) {
        // Preserve the single-name payload shape; use a list form for a batch.
        const body =
          names.length === 1
            ? { ok: false, name: names[0], refused: true, reason: "live-owned-needs-force" }
            : { ok: false, refused, reason: "live-owned-needs-force" };
        render(ctx, json, { json: body, human: () => {} });
      } else {
        for (const n of refused) {
          ctx.error(`skl rm: '${n}' is a live skill — this destroys real bytes.`);
          ctx.error("Retire it first (reversible):  skl retire " + n);
          ctx.error("Or hard-purge now:             skl rm " + n + " --force");
        }
      }
      return 1;
    }

    // Preview what would be dropped (for --dry-run and richer reporting).
    if (dryRun) {
      const tax = await readTaxonomy(ctx.libraryPath);
      const lock = await readLockfile(ctx.libraryPath);
      const plans = located.map(({ name, loc }) => ({
        name,
        path: loc.path,
        mode: loc.isLink ? ("linked" as const) : ("owned" as const),
        wasRetired: loc.retired && !loc.active,
        taxonomyEntry: name in tax.skills,
        lockEntry: name in lock.entries,
      }));
      const result: CommandResult = {
        json: names.length === 1 ? { ok: true, dryRun: true, plan: plans[0] } : { ok: true, dryRun: true, plans },
        human: (emit) => {
          for (const plan of plans) {
            emit(`DRY RUN — would remove '${plan.name}':`);
            emit(`  path:     ${plan.path}${plan.mode === "linked" ? " (symlink only — dev repo untouched)" : ""}`);
            emit(`  taxonomy: ${plan.taxonomyEntry ? "drop entry" : "none"}`);
            emit(`  lockfile: ${plan.lockEntry ? "drop entry" : "none"}`);
          }
          emit("Re-run without --dry-run to apply.");
        },
      };
      render(ctx, json, result);
      return 0;
    }

    // Apply: remove each, then re-index ONCE at the end (a per-name reindex is the cost
    // a bulk rm avoids — collapse it to one, mirroring bulkLifecycle).
    const removed: RemoveResult[] = [];
    for (const { name } of located) {
      removed.push(await removeSkill(ctx.libraryPath, name));
    }
    await reindexLibrary(ctx.libraryPath);

    const result: CommandResult = {
      json: names.length === 1 ? { ok: true, ...removed[0] } : { ok: true, removed },
      human: (emit) => {
        for (const r of removed) {
          emit(`removed ${r.name}${r.wasLink ? " (symlink only — dev repo untouched)" : ""}`);
          if (r.taxonomyDropped) emit("  dropped taxonomy entry");
          if (r.lockDropped) emit("  dropped lockfile entry");
        }
      },
    };
    render(ctx, json, result);
    return 0;
  } catch (err) {
    ctx.error(`skl rm: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
