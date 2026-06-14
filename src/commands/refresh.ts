// `skl refresh` — re-sync THIS project's ./.claude/skills/ symlinks to current library
// reality. The idempotent re-`use` was already the de-facto re-sync; this names it.
//
// For every managed symlink in the project skills dir:
//   - resolves to a library skill that still exists  -> repoint at its current path
//     (repairs a relocated library: SKILLSHELF_LIBRARY moved, absolute link stale)
//   - the same-named library skill no longer exists   -> prune (renamed/removed/retired)
//   - points somewhere unrelated (not a library skill) -> left untouched
//
// Deliberately does NOT expand bundles (that would guess intent) — to pick up NEW
// members of a bundle, re-run `skl use <bundle>` (also idempotent).
//
//   skl refresh [--dry-run] [--json]

import { join, resolve, isAbsolute, dirname } from "node:path";
import { readdir, readlink } from "node:fs/promises";
import type { Ctx, Skill } from "../types.ts";
import { activeSkills } from "../core/library.ts";
import {
  pathExists,
  isSymlink,
  realpathOrSelf,
  realpathOrSelfAsync,
  safeSymlink,
  removeSymlink,
} from "../lib/fs.ts";

/** Direct entry names in a dir that are symlinks — INCLUDING dead ones (which
 *  listDirNames drops because they don't resolve to a directory). */
async function symlinkNames(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isSymbolicLink()).map((e) => e.name);
  } catch {
    return [];
  }
}

export const meta = {
  name: "refresh",
  summary: "Re-sync this project's .claude/skills symlinks to current library reality",
  usage: "skl refresh [--dry-run] [--json]",
} as const;

type Action = "repointed" | "ok" | "pruned" | "foreign";

interface Outcome {
  name: string;
  action: Action;
}

export async function run(argv: string[], ctx: Ctx): Promise<number> {
  const json = argv.includes("--json");
  const dryRun = argv.includes("--dry-run");
  const skillsDir = join(process.cwd(), ".claude", "skills");

  try {
    const skills = activeSkills(await ctx.loadLibrary());
    const byName = new Map<string, Skill>(skills.map((s) => [s.name, s]));
    // Two library prefixes: realpath (resolves /tmp -> /private/tmp etc.) and the
    // plain resolved path. A DEAD link's target can't be realpath'd, so we match its
    // raw readlink target against either form to decide if it pointed into the library.
    const libPrefixes = [realpathOrSelf(ctx.libraryPath), resolve(ctx.libraryPath)].map((p) =>
      p.endsWith("/") ? p : p + "/",
    );

    const outcomes: Outcome[] = [];
    if (pathExists(skillsDir)) {
      for (const name of await symlinkNames(skillsDir)) {
        const link = join(skillsDir, name);
        if (!isSymlink(link)) continue; // only manage symlinks; never touch real files
        const skill = byName.get(name);

        if (skill) {
          // The same-named library skill exists: ensure the link points at it.
          const cur = realpathOrSelf(link);
          const want = await realpathOrSelfAsync(skill.path);
          if (cur === want) {
            outcomes.push({ name, action: "ok" });
          } else {
            if (!dryRun) await safeSymlink(skill.path, link, { force: true });
            outcomes.push({ name, action: "repointed" });
          }
          continue;
        }

        // No same-named library skill. Read the RAW target to decide if it pointed
        // into the library (renamed/removed -> prune) or somewhere unrelated (leave).
        const raw = await readlink(link).catch(() => null);
        const targetAbs = raw == null ? "" : isAbsolute(raw) ? raw : resolve(dirname(link), raw);
        // Strictly UNDER the library (a per-skill entry) — a link to the library ROOT
        // itself was never a skill deployment, so leave it as `foreign` rather than prune.
        const pointsIntoLibrary = libPrefixes.some((pre) => targetAbs.startsWith(pre));

        if (pointsIntoLibrary) {
          // Was a library skill (link still resolves into the library tree) but no
          // active skill of this name remains — renamed/removed/retired. Prune.
          if (!dryRun) await removeSymlink(link, { force: true });
          outcomes.push({ name, action: "pruned" });
        } else {
          outcomes.push({ name, action: "foreign" });
        }
      }
    }

    const count = (a: Action) => outcomes.filter((o) => o.action === a).length;
    if (json) {
      ctx.json({
        dryRun,
        skillsDir,
        outcomes,
        repointed: count("repointed"),
        pruned: count("pruned"),
        ok: count("ok"),
      });
      return 0;
    }

    if (outcomes.length === 0) {
      ctx.log(`No managed symlinks in ${skillsDir} — nothing to refresh.`);
      return 0;
    }
    const verb = dryRun ? "would" : "did";
    ctx.log(`Refresh ${skillsDir}:`);
    for (const o of outcomes) ctx.log(`  ${o.name}  [${o.action}]`);
    ctx.log("");
    ctx.log(`${count("repointed")} repointed, ${count("pruned")} pruned, ${count("ok")} already current (${verb} apply).`);
    return 0;
  } catch (err) {
    ctx.error(`skl refresh: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
