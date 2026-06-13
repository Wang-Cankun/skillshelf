// `skl roots` — list the persisted scan roots. A pure read of config.json, with NO
// disk crawl (unlike `skl scan`, which crawls every root). Lets a human or agent see
// the registered roots cheaply, and emit a minimal {"roots":[...]} for scripting
// without piping a heavy `scan --json` through jq.
//
//   skl roots [--json]
//
// Mutate the set with `skl scan --add-root <path>` / `skl scan --remove-root <path>`.

import type { Ctx } from "../types.ts";

export const meta = {
  name: "roots",
  summary: "List the persisted scan roots (read-only; no crawl)",
  usage: "skl roots [--json]",
} as const;

export async function run(argv: string[], ctx: Ctx): Promise<number> {
  const json = argv.includes("--json");
  const unknown = argv.find((a) => a.startsWith("-") && a !== "--json");
  if (unknown) {
    ctx.error(`skl roots: unknown argument: ${unknown}`);
    ctx.error(`usage: ${meta.usage}`);
    return 1;
  }

  const roots = ctx.roots;
  if (json) {
    ctx.json({ roots });
    return 0;
  }

  if (roots.length === 0) {
    ctx.log("No scan roots configured.");
    ctx.log("Add one with:  skl scan --add-root <path>");
    return 0;
  }
  ctx.log(`Scan roots (${roots.length}):`);
  for (const r of roots) ctx.log(`  ${r}`);
  return 0;
}
