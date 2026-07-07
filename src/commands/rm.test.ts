import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, symlink, rm as fsRm, realpath } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run as rmRun } from "./rm.ts";
import { run as retireRun } from "./retire.ts";
import { run as unretireRun } from "./unretire.ts";
import { loadLibrary } from "../core/library.ts";
import type { Ctx } from "../types.ts";

function makeCtx(libraryPath: string) {
  const json: unknown[] = [];
  const errors: string[] = [];
  const ctx = {
    config: { libraryPath },
    libraryPath,
    loadLibrary: () => loadLibrary(libraryPath),
    log: () => {},
    error: (...a: unknown[]) => errors.push(a.join(" ")),
    json: (v: unknown) => json.push(v),
  } as unknown as Ctx;
  return { ctx, json, errors };
}

async function writeSkill(library: string, name: string) {
  const dir = join(library, name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${name}\n---\n\nbody\n`);
  return dir;
}

describe("skl rm/retire/unretire — removal lifecycle (friction #1)", () => {
  let tmp: string;
  let library: string;

  beforeEach(async () => {
    tmp = await realpath(await mkdtemp(join(tmpdir(), "skl-rm-")));
    library = join(tmp, "library");
    await writeSkill(library, "alpha");
    await writeFile(
      join(library, "taxonomy.json"),
      JSON.stringify({ version: 1, skills: { alpha: ["bio"] } }),
    );
  });
  afterEach(async () => {
    await fsRm(tmp, { recursive: true, force: true });
  });

  test("rm refuses a live OWNED skill without --force", async () => {
    const { ctx, errors } = makeCtx(library);
    const code = await rmRun(["alpha"], ctx);
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("live skill");
    expect(existsSync(join(library, "alpha"))).toBe(true); // untouched
  });

  test("rm --dry-run previews without deleting", async () => {
    const { ctx, json } = makeCtx(library);
    const code = await rmRun(["alpha", "--force", "--dry-run", "--json"], ctx);
    expect(code).toBe(0);
    expect((json[0] as { dryRun: boolean }).dryRun).toBe(true);
    expect(existsSync(join(library, "alpha"))).toBe(true); // still there
  });

  test("retire -> rm purges and drops taxonomy", async () => {
    await retireRun(["alpha"], makeCtx(library).ctx);
    expect(existsSync(join(library, "_retired", "alpha"))).toBe(true);

    const { ctx, json } = makeCtx(library);
    const code = await rmRun(["alpha", "--json"], ctx); // retired -> no --force needed
    expect(code).toBe(0);
    expect((json[0] as { taxonomyDropped: boolean }).taxonomyDropped).toBe(true);
    expect(existsSync(join(library, "_retired", "alpha"))).toBe(false);
    // _retired pruned when empty
    expect(existsSync(join(library, "_retired"))).toBe(false);
  });

  test("retire then unretire round-trips", async () => {
    await retireRun(["alpha"], makeCtx(library).ctx);
    const { ctx } = makeCtx(library);
    const code = await unretireRun(["alpha"], ctx);
    expect(code).toBe(0);
    expect(existsSync(join(library, "alpha"))).toBe(true);
    expect(existsSync(join(library, "_retired", "alpha"))).toBe(false);
  });

  test("multi-name retire moves ALL named skills (reindexed once — see reindex-once.test.ts)", async () => {
    await writeSkill(library, "beta");
    await writeSkill(library, "gamma");

    const { ctx, json } = makeCtx(library);
    const code = await retireRun(["alpha", "beta", "gamma", "--json"], ctx);
    expect(code).toBe(0);
    // all three moved to _retired
    for (const n of ["alpha", "beta", "gamma"]) {
      expect(existsSync(join(library, "_retired", n))).toBe(true);
      expect(existsSync(join(library, n))).toBe(false);
    }
    // INDEX.md reflects the FINAL batch state (all three struck/retired) — proof the
    // single end-of-batch reindex ran over the fully-mutated library, not stale state.
    const index = await Bun.file(join(library, "INDEX.md")).text();
    expect(index).toContain("alpha");
    // multi-name JSON returns an array, one entry per name
    const out = json[0] as Array<{ ok: boolean; name: string }>;
    expect(Array.isArray(out)).toBe(true);
    expect(out.map((r) => r.name).sort()).toEqual(["alpha", "beta", "gamma"]);
  });

  test("multi-name retire partial: one good + one missing exits 1 yet still retires the good one", async () => {
    await writeSkill(library, "beta");

    const { ctx, errors } = makeCtx(library);
    const code = await retireRun(["alpha", "ghost", "beta"], ctx);
    expect(code).toBe(1);
    // good ones still applied (partial success is real on disk)
    expect(existsSync(join(library, "_retired", "alpha"))).toBe(true);
    expect(existsSync(join(library, "_retired", "beta"))).toBe(true);
    // missing one reported
    expect(errors.join("\n")).toContain("not in the library");
  });

  test("multi-name unretire restores ALL named skills (array JSON)", async () => {
    await writeSkill(library, "beta");
    await retireRun(["alpha", "beta"], makeCtx(library).ctx);

    const { ctx, json } = makeCtx(library);
    const code = await unretireRun(["alpha", "beta", "--json"], ctx);
    expect(code).toBe(0);
    expect(existsSync(join(library, "alpha"))).toBe(true);
    expect(existsSync(join(library, "beta"))).toBe(true);
    const out = json[0] as Array<{ ok: boolean; name: string; restoredTo: string }>;
    expect(Array.isArray(out)).toBe(true);
    expect(out.map((r) => r.name).sort()).toEqual(["alpha", "beta"]);
  });

  test("single-name retire JSON shape is unchanged (object, not array)", async () => {
    const { ctx, json } = makeCtx(library);
    const code = await retireRun(["alpha", "--json"], ctx);
    expect(code).toBe(0);
    const out = json[0] as { ok: boolean; name: string; retiredTo: string };
    expect(Array.isArray(out)).toBe(false);
    expect(out.ok).toBe(true);
    expect(out.name).toBe("alpha");
    expect(typeof out.retiredTo).toBe("string");
  });

  test("rm a LINKED entry without --force is a safe unlink (dev repo untouched)", async () => {
    const dev = join(tmp, "dev", "linkedskill");
    await mkdir(dev, { recursive: true });
    await writeFile(join(dev, "SKILL.md"), "---\nname: linkedskill\n---\n\nbody\n");
    await symlink(dev, join(library, "linkedskill"));

    const { ctx, json } = makeCtx(library);
    const code = await rmRun(["linkedskill", "--json"], ctx);
    expect(code).toBe(0);
    expect((json[0] as { wasLink: boolean }).wasLink).toBe(true);
    expect(existsSync(join(library, "linkedskill"))).toBe(false); // symlink gone
    expect(existsSync(join(dev, "SKILL.md"))).toBe(true); // dev repo intact
  });

  test("rm a missing skill errors", async () => {
    const { ctx, errors } = makeCtx(library);
    const code = await rmRun(["ghost", "--force"], ctx);
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("not in the library");
  });

  test("rm removes MULTIPLE names in one call (regression: batch must not drop names)", async () => {
    await writeSkill(library, "beta");
    await writeSkill(library, "gamma");
    const { ctx } = makeCtx(library);
    // Live OWNED skills need --force; the WHOLE batch must purge, not just the first
    // (the old single-name rm silently ignored names 2..N).
    const code = await rmRun(["alpha", "beta", "gamma", "--force"], ctx);
    expect(code).toBe(0);
    for (const n of ["alpha", "beta", "gamma"]) {
      expect(existsSync(join(library, n))).toBe(false);
    }
  });

  test("rm batch is ATOMIC on validation — one missing name deletes nothing", async () => {
    await writeSkill(library, "beta");
    const { ctx, errors } = makeCtx(library);
    const code = await rmRun(["alpha", "ghost", "beta", "--force"], ctx);
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("not in the library");
    // No partial purge — both valid names survive because one name was invalid.
    expect(existsSync(join(library, "alpha"))).toBe(true);
    expect(existsSync(join(library, "beta"))).toBe(true);
  });

  test("rm refuses a path-traversal name (no escape outside the library)", async () => {
    // a sibling dir outside the library that must NOT be deletable via `../`
    const victim = join(tmp, "victim");
    await mkdir(victim, { recursive: true });
    await writeFile(join(victim, "keep.txt"), "x");

    const { ctx, errors } = makeCtx(library);
    const code = await rmRun(["../victim", "--force"], ctx);
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("path separators");
    expect(existsSync(join(victim, "keep.txt"))).toBe(true); // untouched
  });

  test("rm of a skill present in BOTH active and _retired still refuses the live copy without --force", async () => {
    // manufacture the twin state (active alpha already exists; add a retired twin)
    await mkdir(join(library, "_retired", "alpha"), { recursive: true });
    await writeFile(join(library, "_retired", "alpha", "SKILL.md"), "---\nname: alpha\n---\n\nold\n");

    const { ctx, errors } = makeCtx(library);
    const code = await rmRun(["alpha"], ctx); // no --force
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("live skill");
    expect(existsSync(join(library, "alpha"))).toBe(true); // active copy survives
  });
});
