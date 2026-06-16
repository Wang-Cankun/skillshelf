// `skl agents add|rm` write verbs (ADR-0010 delta 4). Drives the real ctx through
// an isolated SKILLSHELF_CONFIG so the GUI round-trip is pinned: a registered
// custom agent persists, reads back tagged `custom:true` in `agents --json` (the
// flag loadConfig() filters on), and `rm` removes it. This is the round-trip the
// review flagged as a non-persisting stub.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadContext } from "../config.ts";
import { run as agentsRun } from "./agents.ts";
import type { AgentsReport } from "../core/agents.ts";
import type { Ctx } from "../types.ts";

describe("skl agents add|rm write verbs (ADR-0010 delta 4)", () => {
  let tmp: string;
  let cfg: string;
  let library: string;

  async function makeCtx(): Promise<{ ctx: Ctx; json: unknown[] }> {
    const json: unknown[] = [];
    const ctx = await loadContext({
      env: {
        SKILLSHELF_CONFIG: cfg,
        SKILLSHELF_LIBRARY: library,
        SKILLSHELF_GLOBAL_CORE: join(tmp, ".no-global-core"),
      } as NodeJS.ProcessEnv,
    });
    ctx.json = (v: unknown) => json.push(v);
    ctx.log = () => {};
    ctx.error = () => {};
    return { ctx, json };
  }

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "skl-agents-config-"));
    cfg = join(tmp, "config.json");
    library = join(tmp, "library");
    await mkdir(library, { recursive: true });
    await writeFile(
      join(library, "config.json"),
      "", // placeholder so library dir is non-empty; real skills not needed here
    );
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("add persists a custom agent and reports the updated list", async () => {
    const { ctx, json } = await makeCtx();
    const code = await agentsRun(
      [
        "add",
        "cursor",
        "--name",
        "Cursor",
        "--global",
        "~/.cursor/skills",
        "--proj-convention",
        ".cursor/skills",
        "--icon",
        "cursor",
        "--json",
      ],
      ctx,
    );
    expect(code).toBe(0);
    const out = json[0] as { agents: Array<{ id: string; icon?: string }>; added: boolean };
    expect(out.added).toBe(true);
    expect(out.agents.map((a) => a.id)).toContain("cursor");
    expect(out.agents.find((a) => a.id === "cursor")?.icon).toBe("cursor");
  });

  test("a persisted custom agent reads back tagged custom:true in agents --json", async () => {
    const { ctx } = await makeCtx();
    await agentsRun(
      ["add", "cursor", "--name", "Cursor", "--global", "~/.cursor/skills", "--proj-convention", ".cursor/skills"],
      ctx,
    );

    // fresh ctx reads config from disk
    const { ctx: ctx2, json } = await makeCtx();
    await agentsRun(["--json"], ctx2);
    const report = json[0] as AgentsReport;
    const cursor = report.agents.find((a) => a.id === "cursor");
    expect(cursor).toBeDefined();
    expect(cursor!.custom).toBe(true);
    // built-in seeds are NOT tagged custom (loadConfig must not pick them up).
    const claude = report.agents.find((a) => a.id === "claude");
    expect(claude?.custom).toBeUndefined();
  });

  test("rm removes a persisted custom agent", async () => {
    const { ctx } = await makeCtx();
    await agentsRun(
      ["add", "cursor", "--name", "Cursor", "--global", "~/.cursor/skills", "--proj-convention", ".cursor/skills"],
      ctx,
    );

    const { ctx: ctx2, json } = await makeCtx();
    const code = await agentsRun(["rm", "cursor", "--json"], ctx2);
    expect(code).toBe(0);
    const out = json[0] as { agents: unknown[]; removed: boolean };
    expect(out.removed).toBe(true);
    expect(out.agents).toEqual([]);
  });

  test("rm on a non-registered id reports removed:false", async () => {
    const { ctx, json } = await makeCtx();
    const code = await agentsRun(["rm", "nope", "--json"], ctx);
    expect(code).toBe(0);
    expect(json[0]).toEqual({ agents: [], removed: false });
  });

  test("add without required path flags errors", async () => {
    const { ctx } = await makeCtx();
    expect(await agentsRun(["add", "cursor", "--name", "Cursor"], ctx)).toBe(1);
  });

  test("add/rm without an id errors", async () => {
    const { ctx } = await makeCtx();
    expect(await agentsRun(["add"], ctx)).toBe(1);
    expect(await agentsRun(["rm"], ctx)).toBe(1);
  });
});
