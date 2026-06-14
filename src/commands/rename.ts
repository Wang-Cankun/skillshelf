// `skl rename <old> <new>` (alias `skl mv`) — rename a skill's slug, moving every
// coupled piece of state together in ONE op: the library dir, the SKILL.md
// frontmatter `name:`, the taxonomy key, and the lockfile key. A hand `mv` alone
// leaves a half-renamed skill (dir=new, frontmatter/taxonomy=old) — the exact
// multi-file-consistency hazard the dogfood pass hit.
//
//   skl rename <old> <new> [--json]
//
// Does NOT repoint external deploy symlinks (they point at the old library path);
// re-run `skl use` in affected projects (or `skl where` to find stragglers) after.

import type { Ctx } from "../types.ts";
import { renameSkill, reindexLibrary } from "../core/lifecycle.ts";

export const meta = {
  name: "rename",
  summary: "Rename a skill slug atomically (dir + frontmatter + taxonomy + lock)",
  usage: "skl rename <old> <new> [--json]",
} as const;

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export async function run(argv: string[], ctx: Ctx): Promise<number> {
  const json = argv.includes("--json");
  const positional = argv.filter((a) => !a.startsWith("--"));
  const unknownFlag = argv.find((a) => a.startsWith("--") && a !== "--json");
  if (unknownFlag) {
    ctx.error(`skl rename: unknown argument: ${unknownFlag}`);
    ctx.error(`usage: ${meta.usage}`);
    return 1;
  }
  const [from, to] = positional;
  if (!from || !to) {
    ctx.error("skl rename: an <old> and a <new> name are required");
    ctx.error(`usage: ${meta.usage}`);
    return 1;
  }
  if (!SLUG_RE.test(to)) {
    ctx.error(`skl rename: invalid name "${to}" — use lowercase letters, digits, and hyphens`);
    return 1;
  }
  if (from === to) {
    ctx.error("skl rename: <old> and <new> are the same");
    return 1;
  }

  try {
    const result = await renameSkill(ctx.libraryPath, from, to);
    await reindexLibrary(ctx.libraryPath);
    if (json) {
      ctx.json({ ok: true, ...result });
    } else {
      ctx.log(`renamed ${from} -> ${to}`);
      if (result.frontmatterRewritten) ctx.log("  rewrote SKILL.md frontmatter name:");
      if (result.taxonomyMoved) ctx.log("  moved taxonomy entry");
      if (result.lockMoved) ctx.log("  moved lockfile entry");
      ctx.log("  note: deploy symlinks pointing at the old name are now stale — re-run `skl use` (or `skl where`).");
    }
    return 0;
  } catch (err) {
    ctx.error(`skl rename: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
