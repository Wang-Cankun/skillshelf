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
