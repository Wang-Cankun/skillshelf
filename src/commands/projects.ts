// `skl projects [add|rm|ls] [path]` — manage the persisted NAV projects list
// (ADR-0010 §5a). This is navigation state only: a persisted project becomes a
// selectable scope in the management UI even before anything is deployed into it.
// It is NEVER deployment truth — cell/count state is always derived from reality
// (`skl agents`/`skl where`), so an added-but-empty project shows all-absent cells.
//
//   skl projects [ls] [--json]   list the persisted nav projects (default verb)
//   skl projects add <path>      add a project dir (expands ~, absolutizes, de-dupes)
//   skl projects rm <path>       remove a project dir (matched by resolved path)
//
// The GUI's `+ Add project` persists through this verb behind the Tauri bridge.

import type { Ctx } from "../types.ts";
import { render, type CommandResult } from "../core/report.ts";

export const meta = {
  name: "projects",
  summary: "Manage the persisted nav projects shown as scopes in the UI (add/rm/ls)",
  usage: "skl projects [ls|add <path>|rm <path>] [--json]",
} as const;

export async function run(argv: string[], ctx: Ctx): Promise<number> {
  const json = argv.includes("--json");
  const rest = argv.filter((a) => a !== "--json");
  const verb = rest[0] && !rest[0].startsWith("-") ? rest[0] : "ls";

  if (verb === "ls") {
    const unknown = rest.slice(verb === rest[0] ? 1 : 0).find((a) => a.startsWith("-"));
    if (unknown) return usageError(ctx, `unknown argument: ${unknown}`);
    const projects = ctx.config.projects;
    const result: CommandResult = {
      json: { projects },
      human: (emit) => {
        if (projects.length === 0) {
          emit("No nav projects configured.");
          emit("Add one with:  skl projects add <path>");
          return;
        }
        emit(`Nav projects (${projects.length}):`);
        for (const p of projects) emit(`  ${p}`);
      },
    };
    render(ctx, json, result);
    return 0;
  }

  if (verb === "add") {
    const path = rest[1];
    if (!path || path.startsWith("-")) return usageError(ctx, "add requires a path");
    const projects = await ctx.addProject(path);
    const result: CommandResult = {
      json: { projects, added: true },
      human: (emit) => {
        emit(`Added project. Nav projects (${projects.length}):`);
        for (const p of projects) emit(`  ${p}`);
      },
    };
    render(ctx, json, result);
    return 0;
  }

  if (verb === "rm") {
    const path = rest[1];
    if (!path || path.startsWith("-")) return usageError(ctx, "rm requires a path");
    const { projects, removed } = await ctx.removeProject(path);
    const result: CommandResult = {
      json: { projects, removed },
      human: (emit) => {
        emit(removed ? "Removed project." : "No matching project (nothing removed).");
        if (projects.length > 0) {
          emit(`Nav projects (${projects.length}):`);
          for (const p of projects) emit(`  ${p}`);
        }
      },
    };
    render(ctx, json, result);
    return 0;
  }

  return usageError(ctx, `unknown verb: ${verb}`);
}

function usageError(ctx: Ctx, msg: string): number {
  ctx.error(`skl projects: ${msg}`);
  ctx.error(`usage: ${meta.usage}`);
  return 1;
}
