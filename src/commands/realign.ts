// `skl realign <deployed-name>` — fix an ALIASED deployment: a symlink in an
// agent's skills dir that resolves to a library skill but carries the WRONG
// name (e.g. `nuwa` -> <library>/huashu-nuwa). Renames the link to the library
// skill's name so name-keyed views (status/agents) see it again. The engine
// verb behind the UI's "Realign name" remediation. Only ever renames a symlink
// in place — never touches the library or the link target.

import { join } from "node:path";
import { rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { Ctx } from "../types.ts";
import { parseDeployTarget } from "../core/agents.ts";
import { isSymlink, realpathOrSelf, realpathOrSelfAsync } from "../lib/fs.ts";
import { render, type CommandResult } from "../core/report.ts";

export const meta = {
  name: "realign",
  summary: "Rename an aliased deployment symlink to match its library skill",
  usage: "skl realign <deployed-name> [--agent <id>] [--global | --project <name>] [--json]",
} as const;

export async function run(argv: string[], ctx: Ctx): Promise<number> {
  try {
    const json = argv.includes("--json");
    const parsed = parseDeployTarget(argv);
    if ("error" in parsed) {
      ctx.error(`skl realign: ${parsed.error}`);
      ctx.error("usage: " + meta.usage);
      return 1;
    }
    const { positionals, target } = parsed;
    const deployedName = positionals[0];
    if (!deployedName || positionals.length > 1) {
      ctx.error("usage: " + meta.usage);
      return 1;
    }

    const link = join(target.dir, deployedName);
    if (!isSymlink(link)) {
      ctx.error(
        `skl realign: ${link} is not a symlink — realign only renames aliased links (a real copy is a different anomaly; see \`skl where\`)`,
      );
      return 1;
    }

    // Resolve which library skill the link points at, by realpath — this also
    // matches a LINKED library entry, whose canonical realpath is its external
    // dev repo, exactly like the `where` classifier does.
    const real = await realpathOrSelfAsync(link);
    const skills = await ctx.loadLibrary();
    const owner = skills.find((s) => !s.retired && realpathOrSelf(s.path) === real);
    if (!owner) {
      ctx.error(
        `skl realign: ${link} does not resolve to any library skill (target: ${real}) — nothing to align to`,
      );
      return 1;
    }

    if (owner.name === deployedName) {
      const result: CommandResult = {
        json: { from: deployedName, to: owner.name, link, status: "already" },
        human: (emit) => emit(`${deployedName} already matches its library skill — nothing to do`),
      };
      render(ctx, json, result);
      return 0;
    }

    const dest = join(target.dir, owner.name);
    if (existsSync(dest) || isSymlink(dest)) {
      ctx.error(
        `skl realign: ${dest} already exists — remove one of the two deployments first (\`skl drop ${deployedName}\` keeps the aligned one)`,
      );
      return 1;
    }

    // Atomic same-dir rename of the LINK itself (rename never dereferences).
    await rename(link, dest);

    const result: CommandResult = {
      json: { from: deployedName, to: owner.name, link: dest, status: "realigned" },
      human: (emit) => emit(`realigned ${deployedName} -> ${owner.name} in ${target.dir}`),
    };
    render(ctx, json, result);
    return 0;
  } catch (err) {
    ctx.error(`skl realign failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
