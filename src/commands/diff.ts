// `skl diff <name>` — unified diff between a DEPLOYED site's SKILL.md and the
// library skill's SKILL.md, for one agent surface. Read-only (an L2 fact per
// ADR-0007: two runs can't disagree). The engine verb behind the UI's drift
// "View diff" action. A clean symlink deployment trivially reports identical —
// its realpath IS the library copy.

import { join } from "node:path";
import { existsSync } from "node:fs";
import type { Ctx } from "../types.ts";
import { parseDeployTarget } from "../core/agents.ts";
import { findByName } from "../core/library.ts";
import { readSkillBody, unifiedDiff } from "../core/fetch.ts";
import { isSymlink, realpathOrSelfAsync } from "../lib/fs.ts";
import { render, type CommandResult } from "../core/report.ts";

export const meta = {
  name: "diff",
  summary: "Unified diff of a deployed copy's SKILL.md against the library skill",
  usage: "skl diff <name> [--agent <id>] [--global | --project <name>] [--json]",
} as const;

export async function run(argv: string[], ctx: Ctx): Promise<number> {
  try {
    const json = argv.includes("--json");
    const parsed = parseDeployTarget(argv);
    if ("error" in parsed) {
      ctx.error(`skl diff: ${parsed.error}`);
      ctx.error("usage: " + meta.usage);
      return 1;
    }
    const { positionals, target } = parsed;
    const name = positionals[0];
    if (!name || positionals.length > 1) {
      ctx.error("usage: " + meta.usage);
      return 1;
    }

    const skills = await ctx.loadLibrary();
    const skill = findByName(
      skills.filter((s) => !s.retired),
      name,
    );
    if (!skill) {
      ctx.error(`skl diff: no library skill named "${name}"`);
      return 1;
    }

    const site = join(target.dir, name);
    if (!existsSync(site) && !isSymlink(site)) {
      ctx.error(`skl diff: ${name} is not deployed at ${target.dir}`);
      return 1;
    }

    // A symlink resolving to the library skill can't drift — same bytes.
    const siteReal = await realpathOrSelfAsync(site);
    const libReal = await realpathOrSelfAsync(skill.path);
    const deployedBody = siteReal === libReal ? null : await readSkillBody(site);
    const libraryBody = await readSkillBody(skill.path);
    const text =
      deployedBody === null
        ? ""
        : await unifiedDiff(libraryBody, deployedBody, `library/${name}/SKILL.md`, `${site}/SKILL.md`);

    const identical = text.trim() === "";
    const result: CommandResult = {
      json: { name, site, library: skill.path, identical, diff: text },
      human: (emit) => {
        if (identical) emit(`${name}: deployed copy matches the library (no drift)`);
        else emit(text.trimEnd());
      },
    };
    render(ctx, json, result);
    return 0;
  } catch (err) {
    ctx.error(`skl diff failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
