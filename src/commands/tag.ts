// `skl tag <name> <domain>...` — add one or more domain tags to a skill, surgically
// and deterministically, in the central taxonomy.json (ADR-0002). The only other
// taxonomy writer is the non-deterministic AI `infer` pass; this is the precise,
// no-LLM edit for "give this one skill this one tag" that previously forced a
// hand-edit of taxonomy.json (or a silently-failing frontmatter sed).
//
//   skl tag <name> <domain> [<domain>...] [--json]

import type { Ctx } from "../types.ts";
import { findByName } from "../core/library.ts";
import { addDomainsForName } from "../core/taxonomy.ts";
import { reindexLibrary } from "../core/lifecycle.ts";

export const meta = {
  name: "tag",
  summary: "Add domain tag(s) to a skill in the central taxonomy",
  usage: "skl tag <name> <domain> [<domain>...] [--json]",
} as const;

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export async function run(argv: string[], ctx: Ctx): Promise<number> {
  const json = argv.includes("--json");
  const positional = argv.filter((a) => !a.startsWith("--"));
  const unknownFlag = argv.find((a) => a.startsWith("--") && a !== "--json");
  if (unknownFlag) {
    ctx.error(`skl tag: unknown argument: ${unknownFlag}`);
    ctx.error(`usage: ${meta.usage}`);
    return 1;
  }
  const [name, ...domains] = positional;
  if (!name || domains.length === 0) {
    ctx.error("skl tag: a <name> and at least one <domain> are required");
    ctx.error(`usage: ${meta.usage}`);
    return 1;
  }
  const bad = domains.find((d) => !SLUG_RE.test(d));
  if (bad) {
    ctx.error(`skl tag: invalid domain "${bad}" — use lowercase letters, digits, and hyphens`);
    return 1;
  }

  try {
    const skills = await ctx.loadLibrary();
    if (!findByName(skills, name)) {
      ctx.error(`skl tag: '${name}' is not in the library`);
      return 1;
    }
    const { added, already, domains: resulting } = await addDomainsForName(
      ctx.libraryPath,
      name,
      domains,
    );
    if (added.length > 0) await reindexLibrary(ctx.libraryPath);

    if (json) {
      ctx.json({ ok: true, name, added, already, domains: resulting });
    } else {
      if (added.length > 0) ctx.log(`tagged ${name} += [${added.join(", ")}]`);
      if (already.length > 0) ctx.log(`  (already had: ${already.join(", ")})`);
      ctx.log(`  domains: [${resulting.join(", ")}]`);
    }
    return 0;
  } catch (err) {
    ctx.error(`skl tag: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
