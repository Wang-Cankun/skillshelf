import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "./import.ts";
import type { Ctx } from "../types.ts";

const BODY = "---\nname: caveman\ndescription: a test skill\n---\n\nbody\n";

interface Captured {
  ctx: Ctx;
  logs: string[];
  errors: string[];
  json: unknown[];
}

function makeCtx(libraryPath: string): Captured {
  const logs: string[] = [];
  const errors: string[] = [];
  const json: unknown[] = [];
  const ctx = {
    config: { libraryPath },
    libraryPath,
    log: (...a: unknown[]) => logs.push(a.join(" ")),
    error: (...a: unknown[]) => errors.push(a.join(" ")),
    json: (v: unknown) => json.push(v),
  } as unknown as Ctx;
  return { ctx, logs, errors, json };
}

describe("skl import — retired-aware collision", () => {
  let tmp: string;
  let library: string;
  let candidate: string;

  beforeEach(async () => {
    tmp = await realpath(await mkdtemp(join(tmpdir(), "skl-import-")));
    library = join(tmp, "library");
    await mkdir(library, { recursive: true });
    // A candidate skill dir on disk to import.
    candidate = join(tmp, "ext", "caveman");
    await mkdir(candidate, { recursive: true });
    await writeFile(join(candidate, "SKILL.md"), BODY);
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("importing to a retired name refuses (exit 1, no write)", async () => {
    // Retire "caveman": a tombstone, no active copy.
    await mkdir(join(library, "_retired", "caveman"), { recursive: true });
    await writeFile(join(library, "_retired", "caveman", "SKILL.md"), BODY);

    const { ctx, errors } = makeCtx(library);
    const code = await run(["caveman", "--from", candidate, "--copy"], ctx);
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("skl unretire caveman");

    // No active copy created; the candidate is untouched.
    expect(existsSync(join(library, "caveman"))).toBe(false);
    expect(existsSync(join(candidate, "SKILL.md"))).toBe(true);
  });

  test("importing a non-retired name still works (no regression)", async () => {
    const { ctx } = makeCtx(library);
    const code = await run(["caveman", "--from", candidate, "--copy", "--json"], ctx);
    expect(code).toBe(0);
    expect(existsSync(join(library, "caveman", "SKILL.md"))).toBe(true);
  });
});
