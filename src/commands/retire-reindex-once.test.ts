// Proves the PERFORMANCE contract of multi-name retire/unretire: the library is
// reindexed exactly ONCE for N names (today's per-call reindex is the cost the bulk
// verbs eliminate). reindexLibrary's only on-disk effect is writeIndex(); we mock
// indexgen.writeIndex with a counting spy that still writes, so one reindex pass == one
// writeIndex call. mock.module is hoisted, so retire.ts's transitive reference to
// writeIndex resolves to the spy.

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm as fsRm, realpath } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Ctx, Skill } from "../types.ts";
import * as indexgen from "../core/indexgen.ts";
import { loadLibrary } from "../core/library.ts";
import { run as retireRun } from "./retire.ts";
import { run as unretireRun } from "./unretire.ts";

let writeIndexCalls = 0;
const realWriteIndex = indexgen.writeIndex;
mock.module("../core/indexgen.ts", () => ({
  ...indexgen,
  writeIndex: (libraryPath: string, skills: Skill[]) => {
    writeIndexCalls++;
    return realWriteIndex(libraryPath, skills);
  },
}));

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
}

describe("multi-name retire/unretire reindex ONCE for N names", () => {
  let tmp: string;
  let library: string;

  beforeEach(async () => {
    writeIndexCalls = 0;
    tmp = await realpath(await mkdtemp(join(tmpdir(), "skl-reindex-")));
    library = join(tmp, "library");
    await writeSkill(library, "alpha");
    await writeSkill(library, "beta");
    await writeSkill(library, "gamma");
  });
  afterEach(async () => {
    await fsRm(tmp, { recursive: true, force: true });
  });

  test("retire of 3 names triggers exactly one reindex pass", async () => {
    const { ctx } = makeCtx(library);
    const code = await retireRun(["alpha", "beta", "gamma"], ctx);
    expect(code).toBe(0);
    expect(writeIndexCalls).toBe(1);
    for (const n of ["alpha", "beta", "gamma"]) {
      expect(existsSync(join(library, "_retired", n))).toBe(true);
    }
  });

  test("single-name retire still reindexes once (unchanged)", async () => {
    const { ctx } = makeCtx(library);
    await retireRun(["alpha"], ctx);
    expect(writeIndexCalls).toBe(1);
  });

  test("multi-name retire with a failure still reindexes once (only the good ones moved)", async () => {
    const { ctx } = makeCtx(library);
    const code = await retireRun(["alpha", "ghost", "beta"], ctx);
    expect(code).toBe(1);
    expect(writeIndexCalls).toBe(1);
    expect(existsSync(join(library, "_retired", "alpha"))).toBe(true);
    expect(existsSync(join(library, "_retired", "beta"))).toBe(true);
  });

  test("ALL names failing skips the reindex entirely (nothing moved)", async () => {
    const { ctx } = makeCtx(library);
    const code = await retireRun(["ghost1", "ghost2"], ctx);
    expect(code).toBe(1);
    expect(writeIndexCalls).toBe(0);
  });

  test("unretire of 2 names triggers exactly one reindex pass", async () => {
    await retireRun(["alpha", "beta"], makeCtx(library).ctx);
    writeIndexCalls = 0;
    const { ctx } = makeCtx(library);
    const code = await unretireRun(["alpha", "beta"], ctx);
    expect(code).toBe(0);
    expect(writeIndexCalls).toBe(1);
    expect(existsSync(join(library, "alpha"))).toBe(true);
    expect(existsSync(join(library, "beta"))).toBe(true);
  });
});
