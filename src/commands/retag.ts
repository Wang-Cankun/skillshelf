// `skl retag <old-domain> <new-domain>` — deterministically rename a domain across
// the WHOLE library taxonomy (every skill tagged <old> becomes <new>). This is the
// pure rename the AI `infer` pass can't promise (it re-reasons every tag); retag
// touches nothing but the named domain. Fixes a domain typo in one pass instead of a
// hand-edit of taxonomy.json or a silently-failing `sed` loop over frontmatter.
//
//   skl retag <old-domain> <new-domain> [--json]

import type { Ctx } from "../types.ts";
import { renameDomainAcrossLibrary } from "../core/taxonomy.ts";
import { reindexLibrary } from "../core/lifecycle.ts";

export const meta = {
  name: "retag",
  summary: "Rename a domain across the whole library taxonomy (deterministic)",
  usage: "skl retag <old-domain> <new-domain> [--json]",
} as const;

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export async function run(argv: string[], ctx: Ctx): Promise<number> {
  const json = argv.includes("--json");
  const positional = argv.filter((a) => !a.startsWith("--"));
  const unknownFlag = argv.find((a) => a.startsWith("--") && a !== "--json");
  if (unknownFlag) {
    ctx.error(`skl retag: unknown argument: ${unknownFlag}`);
    ctx.error(`usage: ${meta.usage}`);
    return 1;
  }
  const [oldDomain, newDomain] = positional;
  if (!oldDomain || !newDomain) {
    ctx.error("skl retag: an <old-domain> and a <new-domain> are required");
    ctx.error(`usage: ${meta.usage}`);
    return 1;
  }
  if (!SLUG_RE.test(newDomain)) {
    ctx.error(`skl retag: invalid domain "${newDomain}" — use lowercase letters, digits, and hyphens`);
    return 1;
  }

  try {
    const changed = await renameDomainAcrossLibrary(ctx.libraryPath, oldDomain, newDomain);
    if (changed.length > 0) await reindexLibrary(ctx.libraryPath);

    if (json) {
      ctx.json({ ok: true, from: oldDomain, to: newDomain, changed });
    } else if (changed.length === 0) {
      ctx.log(`No skills tagged '${oldDomain}' in the taxonomy — nothing to rename.`);
    } else {
      ctx.log(`retagged '${oldDomain}' -> '${newDomain}' across ${changed.length} skill(s):`);
      for (const n of changed) ctx.log(`  ${n}`);
    }
    return 0;
  } catch (err) {
    ctx.error(`skl retag: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
