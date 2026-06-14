#!/usr/bin/env bun
// skillshelf CLI entry / router.
//
// Responsibilities:
//   - parse argv[0] as the subcommand (`skl <cmd> ...`)
//   - build the execution Ctx once via config.loadContext()
//   - dispatch to the matching command module's run(restArgv, ctx)
//   - `skl` (no args) / `skl help` -> print help listing every command's meta
//   - clean non-zero exit on unknown command
//
// Both `bun run src/cli.ts <cmd>` and the installed bin `skl <cmd>` route here
// (package.json bin -> ./src/cli.ts).

import type { CommandModule, Ctx } from "./types.ts";
import { loadContext } from "./config.ts";

import * as search from "./commands/search.ts";
import * as ls from "./commands/ls.ts";
import * as status from "./commands/status.ts";
import * as show from "./commands/show.ts";
import * as index from "./commands/index.ts";
import * as use from "./commands/use.ts";
import * as drop from "./commands/drop.ts";
import * as init from "./commands/init.ts";
import * as add from "./commands/add.ts";
import * as outdated from "./commands/outdated.ts";
import * as update from "./commands/update.ts";
import * as infer from "./commands/infer.ts";
import * as newCmd from "./commands/new.ts";
import * as scan from "./commands/scan.ts";
import * as roots from "./commands/roots.ts";
import * as importCmd from "./commands/import.ts";
import * as link from "./commands/link.ts";
import * as where from "./commands/where.ts";
import * as tag from "./commands/tag.ts";
import * as untag from "./commands/untag.ts";
import * as retag from "./commands/retag.ts";
import * as rm from "./commands/rm.ts";
import * as retire from "./commands/retire.ts";
import * as unretire from "./commands/unretire.ts";
import * as rename from "./commands/rename.ts";
import * as refresh from "./commands/refresh.ts";

// Registration order = display order in help.
const MODULES: CommandModule[] = [
  search,
  ls,
  status,
  where,
  show,
  use,
  drop,
  refresh,
  add,
  scan,
  roots,
  importCmd,
  link,
  tag,
  untag,
  retag,
  retire,
  unretire,
  rename,
  rm,
  outdated,
  update,
  init,
  newCmd,
  index,
  infer,
];

const COMMANDS = new Map<string, CommandModule>();
for (const mod of MODULES) {
  COMMANDS.set(mod.meta.name, mod);
}

// Command aliases (not shown in the help listing; resolve to the canonical module).
const ALIASES: Record<string, string> = { mv: "rename" };
for (const [alias, target] of Object.entries(ALIASES)) {
  const mod = COMMANDS.get(target);
  if (mod) COMMANDS.set(alias, mod);
}

function helpText(): string {
  const lines: string[] = [];
  lines.push("skl — skillshelf: agent-first skill registry + manager");
  lines.push("");
  lines.push("Usage: skl <command> [args] [--json]");
  lines.push("");
  lines.push("Commands:");
  const width = Math.max(...MODULES.map((m) => m.meta.name.length));
  for (const mod of MODULES) {
    lines.push(`  ${mod.meta.name.padEnd(width)}  ${mod.meta.summary}`);
  }
  lines.push("");
  lines.push("Run `skl help <command>` for command-specific usage.");
  return lines.join("\n");
}

function commandHelp(mod: CommandModule): string {
  return [`${mod.meta.name} — ${mod.meta.summary}`, `Usage: ${mod.meta.usage}`].join("\n");
}

async function main(rawArgv: string[]): Promise<number> {
  // No subcommand -> help.
  const first = rawArgv[0];
  if (first === undefined || first === "--help" || first === "-h") {
    console.log(helpText());
    return 0;
  }

  if (first === "help") {
    const target = rawArgv[1];
    if (target !== undefined) {
      const mod = COMMANDS.get(target);
      if (mod) {
        console.log(commandHelp(mod));
        return 0;
      }
      console.error(`Unknown command: ${target}`);
      console.error("");
      console.error(helpText());
      return 1;
    }
    console.log(helpText());
    return 0;
  }

  const mod = COMMANDS.get(first);
  if (!mod) {
    console.error(`Unknown command: ${first}`);
    console.error("");
    console.error(helpText());
    return 1;
  }

  let ctx: Ctx;
  try {
    ctx = await loadContext();
  } catch (err) {
    console.error(`Failed to initialize skillshelf: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  // argv passed to the command = everything AFTER the subcommand.
  const rest = rawArgv.slice(1);
  try {
    const code = await mod.run(rest, ctx);
    return typeof code === "number" ? code : 0;
  } catch (err) {
    // Commands are contracted not to throw, but guard the router regardless.
    ctx.error(`skl ${first}: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

const code = await main(process.argv.slice(2));
process.exit(code);
