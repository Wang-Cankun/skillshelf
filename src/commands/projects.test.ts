// `skl projects [add|rm|ls]` verb (ADR-0010 §5a). Drives the real ctx through an
// isolated SKILLSHELF_CONFIG so the JSON shapes the GUI/bridge bind to are pinned.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadContext } from "../config.ts";
import { run as projectsRun } from "./projects.ts";
import type { Ctx } from "../types.ts";

describe("skl projects verb", () => {
  let tmp: string;
  let cfg: string;

  async function makeCtx(): Promise<{ ctx: Ctx; json: unknown[]; logs: string[] }> {
    const json: unknown[] = [];
    const logs: string[] = [];
    const ctx = await loadContext({ env: { SKILLSHELF_CONFIG: cfg } as NodeJS.ProcessEnv });
    ctx.json = (v: unknown) => json.push(v);
    ctx.log = (...a: unknown[]) => logs.push(a.join(" "));
    ctx.error = () => {};
    return { ctx, json, logs };
  }

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "skl-projects-cmd-"));
    cfg = join(tmp, "config.json");
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("ls --json on an empty registry returns {projects:[]}", async () => {
    const { ctx, json } = await makeCtx();
    const code = await projectsRun(["ls", "--json"], ctx);
    expect(code).toBe(0);
    expect(json[0]).toEqual({ projects: [] });
  });

  test("default verb (no args) is ls", async () => {
    const { ctx, json } = await makeCtx();
    const code = await projectsRun(["--json"], ctx);
    expect(code).toBe(0);
    expect(json[0]).toEqual({ projects: [] });
  });

  test("add persists and reports the updated list", async () => {
    const { ctx, json } = await makeCtx();
    const code = await projectsRun(["add", "/tmp/webapp", "--json"], ctx);
    expect(code).toBe(0);
    expect(json[0]).toEqual({ projects: ["/tmp/webapp"], added: true });

    // a fresh ctx reads it back from disk
    const { ctx: ctx2, json: json2 } = await makeCtx();
    await projectsRun(["ls", "--json"], ctx2);
    expect(json2[0]).toEqual({ projects: ["/tmp/webapp"] });
  });

  test("rm removes a persisted project", async () => {
    const { ctx } = await makeCtx();
    await projectsRun(["add", "/tmp/webapp"], ctx);
    const { ctx: ctx2, json } = await makeCtx();
    const code = await projectsRun(["rm", "/tmp/webapp", "--json"], ctx2);
    expect(code).toBe(0);
    expect(json[0]).toEqual({ projects: [], removed: true });
  });

  test("rm on a non-registered path reports removed:false", async () => {
    const { ctx, json } = await makeCtx();
    const code = await projectsRun(["rm", "/tmp/nope", "--json"], ctx);
    expect(code).toBe(0);
    expect(json[0]).toEqual({ projects: [], removed: false });
  });

  test("add without a path errors", async () => {
    const { ctx } = await makeCtx();
    expect(await projectsRun(["add"], ctx)).toBe(1);
  });

  test("unknown verb errors", async () => {
    const { ctx } = await makeCtx();
    expect(await projectsRun(["frobnicate"], ctx)).toBe(1);
  });
});
