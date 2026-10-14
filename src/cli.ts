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

// Registration order = display order in help. Load only the selected command.
const MODULES = {
  search: () => import("./commands/search.ts"),
  ls: () => import("./commands/ls.ts"),
  status: () => import("./commands/status.ts"),
  where: () => import("./commands/where.ts"),
  agents: () => import("./commands/agents.ts"),
  show: () => import("./commands/show.ts"),
  use: () => import("./commands/use.ts"),
  drop: () => import("./commands/drop.ts"),
  realign: () => import("./commands/realign.ts"),
  diff: () => import("./commands/diff.ts"),
  refresh: () => import("./commands/refresh.ts"),
  add: () => import("./commands/add.ts"),
  scan: () => import("./commands/scan.ts"),
  roots: () => import("./commands/roots.ts"),
  projects: () => import("./commands/projects.ts"),
  import: () => import("./commands/import.ts"),
  link: () => import("./commands/link.ts"),
  track: () => import("./commands/track.ts"),
  untrack: () => import("./commands/untrack.ts"),
  migrate: () => import("./commands/migrate.ts"),
  tag: () => import("./commands/tag.ts"),
  untag: () => import("./commands/untag.ts"),
  retag: () => import("./commands/retag.ts"),
  retire: () => import("./commands/retire.ts"),
  unretire: () => import("./commands/unretire.ts"),
  rename: () => import("./commands/rename.ts"),
  rm: () => import("./commands/rm.ts"),
  outdated: () => import("./commands/outdated.ts"),
  update: () => import("./commands/update.ts"),
  init: () => import("./commands/init.ts"),
  new: () => import("./commands/new.ts"),
  index: () => import("./commands/index.ts"),
  infer: () => import("./commands/infer.ts"),
} satisfies Record<string, () => Promise<CommandModule>>;

const COMMANDS = new Map<string, () => Promise<CommandModule>>(Object.entries(MODULES));

// Command aliases (not shown in the help listing; resolve to the canonical module).
const ALIASES: Record<string, string> = { mv: "rename" };
for (const [alias, target] of Object.entries(ALIASES)) {
  const load = COMMANDS.get(target);
  if (load) COMMANDS.set(alias, load);
}

async function helpText(): Promise<string> {
  const modules = await Promise.all(Object.values(MODULES).map((load) => load()));
  const lines: string[] = [];
  lines.push("skl — skillshelf: agent-first skill registry + manager");
  lines.push("");
  lines.push("Usage: skl <command> [args] [--json]");
  lines.push("");
  lines.push("Commands:");
  const width = Math.max(...modules.map((m) => m.meta.name.length));
  for (const mod of modules) {
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
    console.log(await helpText());
    return 0;
  }

  if (first === "help") {
    const target = rawArgv[1];
    if (target !== undefined) {
      const load = COMMANDS.get(target);
      if (load) {
        console.log(commandHelp(await load()));
        return 0;
      }
      console.error(`Unknown command: ${target}`);
      console.error("");
      console.error(await helpText());
      return 1;
    }
    console.log(await helpText());
    return 0;
  }

  const load = COMMANDS.get(first);
  if (!load) {
    console.error(`Unknown command: ${first}`);
    console.error("");
    console.error(await helpText());
    return 1;
  }

  const mod = await load();
  if (rawArgv.includes("--help") || rawArgv.includes("-h")) {
    console.log(commandHelp(mod));
    return 0;
  }

  let ctx: Ctx;
  try {
    const { loadContext } = await import("./config.ts");
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
