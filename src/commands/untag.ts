// `skl untag <name> <domain>` — remove ONE domain tag from a skill in the central
// taxonomy.json (ADR-0002). The inverse of `skl tag`. Errors (does not silently
// no-op) when the domain isn't a taxonomy tag — a typo'd untag should be visible —
// and distinguishes a frontmatter-declared domain (which lives in the skill body,
// not the taxonomy, and can't be removed here).
//
//   skl untag <name> <domain> [--json]

import type { Ctx } from "../types.ts";
import { findByName } from "../core/library.ts";
import { readTaxonomy, domainsForName, removeDomainForName } from "../core/taxonomy.ts";
import { reindexLibrary } from "../core/lifecycle.ts";

export const meta = {
  name: "untag",
  summary: "Remove a domain tag from a skill in the central taxonomy",
  usage: "skl untag <name> <domain> [--json]",
} as const;

export async function run(argv: string[], ctx: Ctx): Promise<number> {
  const json = argv.includes("--json");
  const positional = argv.filter((a) => !a.startsWith("--"));
  const unknownFlag = argv.find((a) => a.startsWith("--") && a !== "--json");
  if (unknownFlag) {
    ctx.error(`skl untag: unknown argument: ${unknownFlag}`);
    ctx.error(`usage: ${meta.usage}`);
    return 1;
  }
  const [name, domain] = positional;
  if (!name || !domain) {
    ctx.error("skl untag: a <name> and a <domain> are required");
    ctx.error(`usage: ${meta.usage}`);
    return 1;
  }

  try {
    const skills = await ctx.loadLibrary();
    const skill = findByName(skills, name);
    if (!skill) {
      ctx.error(`skl untag: '${name}' is not in the library`);
      return 1;
    }

    const removed = await removeDomainForName(ctx.libraryPath, name, domain);
    if (!removed) {
      // Distinguish "never had it" from "it's declared in SKILL.md frontmatter".
      const tax = await readTaxonomy(ctx.libraryPath);
      const inTaxonomy = domainsForName(tax, name).includes(domain);
      if (!inTaxonomy && skill.domains.includes(domain)) {
        ctx.error(
          `skl untag: '${domain}' is declared in ${name}'s SKILL.md frontmatter, not the taxonomy — edit the skill body to remove it`,
        );
      } else {
        ctx.error(`skl untag: '${name}' is not tagged '${domain}'`);
      }
      return 1;
    }

    await reindexLibrary(ctx.libraryPath);
    const tax = await readTaxonomy(ctx.libraryPath);
    const resulting = domainsForName(tax, name);
    if (json) {
      ctx.json({ ok: true, name, removed: domain, domains: resulting });
    } else {
      ctx.log(`untagged ${name} -= ${domain}`);
      ctx.log(`  taxonomy domains: [${resulting.join(", ")}]`);
    }
    return 0;
  } catch (err) {
    ctx.error(`skl untag: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
