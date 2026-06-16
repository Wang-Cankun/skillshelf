import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resolveConfig,
  addRoot,
  removeRoot,
  addProject,
  removeProject,
  loadContext,
} from "./config.ts";

describe("config: SKILLSHELF_CONFIG isolation + root registry inverse", () => {
  let tmp: string;
  let cfg: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "skl-config-"));
    cfg = join(tmp, "config.json");
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("SKILLSHELF_CONFIG env redirects the config file path", async () => {
    const config = await resolveConfig({ env: { SKILLSHELF_CONFIG: cfg } as NodeJS.ProcessEnv });
    expect(config.configFilePath).toBe(cfg);
  });

  test("addRoot then removeRoot is a clean round-trip", async () => {
    await addRoot(cfg, [], "/tmp/alpha");
    const after = await addRoot(cfg, ["/tmp/alpha"], "/tmp/beta");
    expect(after).toEqual(["/tmp/alpha", "/tmp/beta"]);

    const { roots, removed } = await removeRoot(cfg, "/tmp/alpha");
    expect(removed).toBe(true);
    expect(roots).toEqual(["/tmp/beta"]);

    const onDisk = JSON.parse(await readFile(cfg, "utf8"));
    expect(onDisk.roots).toEqual(["/tmp/beta"]);
  });

  test("removeRoot on a non-registered path is idempotent (removed:false)", async () => {
    await addRoot(cfg, [], "/tmp/alpha");
    const { roots, removed } = await removeRoot(cfg, "/tmp/nope");
    expect(removed).toBe(false);
    expect(roots).toEqual(["/tmp/alpha"]);
  });

  test("removeRoot preserves annotated RootEntry siblings", async () => {
    await Bun.write(
      cfg,
      JSON.stringify({
        roots: [{ path: "/tmp/keep", notes: "important" }, "/tmp/drop"],
      }),
    );
    const { roots, removed } = await removeRoot(cfg, "/tmp/drop");
    expect(removed).toBe(true);
    expect(roots).toEqual(["/tmp/keep"]);
    const onDisk = JSON.parse(await readFile(cfg, "utf8"));
    // annotation on the surviving entry is preserved
    expect(onDisk.roots).toEqual([{ path: "/tmp/keep", notes: "important" }]);
  });

  test("ctx.removeRoot persists and keeps the live roots view in sync", async () => {
    const ctx = await loadContext({ env: { SKILLSHELF_CONFIG: cfg } as NodeJS.ProcessEnv });
    await ctx.addRoot("/tmp/one");
    await ctx.addRoot("/tmp/two");
    const res = await ctx.removeRoot("/tmp/one");
    expect(res.removed).toBe(true);
    expect(ctx.roots).toEqual(["/tmp/two"]);
    expect(existsSync(cfg)).toBe(true);
  });
});

describe("config: agents block (ADR-0010 delta 4)", () => {
  let tmp: string;
  let cfg: string;
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "skl-config-agents-"));
    cfg = join(tmp, "config.json");
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("agents round-trip through resolveConfig", async () => {
    const agents = [
      { id: "pi", name: "PI Agent", short: "PI", icon: "anthropic", color: "#abcdef" },
      { id: "claude", name: "Claude Code", short: "Claude", hidden: true },
    ];
    await Bun.write(cfg, JSON.stringify({ agents }));
    const config = await resolveConfig({ configFilePath: cfg });
    expect(config.agents).toEqual(agents);
  });

  test("AgentConfigEntry with inheritsGlobal:false round-trips through resolveConfig", async () => {
    const agents = [
      { id: "pi", name: "PI Agent", short: "PI", inheritsGlobal: false },
    ];
    await Bun.write(cfg, JSON.stringify({ agents }));
    const config = await resolveConfig({ configFilePath: cfg });
    expect(config.agents).toHaveLength(1);
    expect(config.agents[0]!.inheritsGlobal).toBe(false);
  });

  test("missing agents block resolves to []", async () => {
    await Bun.write(cfg, JSON.stringify({ library: "/tmp/lib" }));
    const config = await resolveConfig({ configFilePath: cfg });
    expect(config.agents).toEqual([]);
    expect(config.projects).toEqual([]);
  });
});

describe("config: projects registry (ADR-0010 §5a)", () => {
  let tmp: string;
  let cfg: string;
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "skl-config-proj-"));
    cfg = join(tmp, "config.json");
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("addProject then removeProject is a clean round-trip", async () => {
    await addProject(cfg, [], "/tmp/webapp");
    const after = await addProject(cfg, ["/tmp/webapp"], "/tmp/data-pipeline");
    expect(after).toEqual(["/tmp/webapp", "/tmp/data-pipeline"]);

    const { projects, removed } = await removeProject(cfg, "/tmp/webapp");
    expect(removed).toBe(true);
    expect(projects).toEqual(["/tmp/data-pipeline"]);
    const onDisk = JSON.parse(await readFile(cfg, "utf8"));
    expect(onDisk.projects).toEqual(["/tmp/data-pipeline"]);
  });

  test("addProject is idempotent on a duplicate path", async () => {
    await addProject(cfg, [], "/tmp/webapp");
    const after = await addProject(cfg, ["/tmp/webapp"], "/tmp/webapp");
    expect(after).toEqual(["/tmp/webapp"]);
  });

  test("removeProject on a non-registered path is idempotent (removed:false)", async () => {
    await addProject(cfg, [], "/tmp/webapp");
    const { projects, removed } = await removeProject(cfg, "/tmp/nope");
    expect(removed).toBe(false);
    expect(projects).toEqual(["/tmp/webapp"]);
  });

  test("addProject/removeProject preserve roots, agents, and library", async () => {
    await Bun.write(
      cfg,
      JSON.stringify({
        library: "/tmp/lib",
        roots: [{ path: "/tmp/root-a", notes: "keep me" }],
        agents: [{ id: "pi", name: "PI", short: "PI" }],
      }),
    );
    await addProject(cfg, [], "/tmp/webapp");
    let onDisk = JSON.parse(await readFile(cfg, "utf8"));
    expect(onDisk.library).toBe("/tmp/lib");
    expect(onDisk.roots).toEqual([{ path: "/tmp/root-a", notes: "keep me" }]);
    expect(onDisk.agents).toEqual([{ id: "pi", name: "PI", short: "PI" }]);
    expect(onDisk.projects).toEqual(["/tmp/webapp"]);

    await removeProject(cfg, "/tmp/webapp");
    onDisk = JSON.parse(await readFile(cfg, "utf8"));
    expect(onDisk.library).toBe("/tmp/lib");
    expect(onDisk.roots).toEqual([{ path: "/tmp/root-a", notes: "keep me" }]);
    expect(onDisk.agents).toEqual([{ id: "pi", name: "PI", short: "PI" }]);
    expect(onDisk.projects).toEqual([]);
  });

  test("projects normalize {path} form + dedupe via resolveConfig", async () => {
    await Bun.write(
      cfg,
      JSON.stringify({
        projects: ["/tmp/webapp", { path: "/tmp/webapp", name: "dup" }, { path: "/tmp/scratch" }],
      }),
    );
    const config = await resolveConfig({ configFilePath: cfg });
    expect(config.projects).toEqual(["/tmp/webapp", "/tmp/scratch"]);
  });

  test("ctx.addProject/removeProject persist + keep config.projects in sync", async () => {
    const ctx = await loadContext({ env: { SKILLSHELF_CONFIG: cfg } as NodeJS.ProcessEnv });
    await ctx.addProject("/tmp/one");
    await ctx.addProject("/tmp/two");
    expect(ctx.config.projects).toEqual(["/tmp/one", "/tmp/two"]);
    const res = await ctx.removeProject("/tmp/one");
    expect(res.removed).toBe(true);
    expect(ctx.config.projects).toEqual(["/tmp/two"]);
    expect(existsSync(cfg)).toBe(true);
  });
});
