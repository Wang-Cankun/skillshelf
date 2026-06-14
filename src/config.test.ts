import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveConfig, addRoot, removeRoot, loadContext } from "./config.ts";

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
