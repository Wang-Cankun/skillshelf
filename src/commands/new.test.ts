import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "./new.ts";
import type { Ctx } from "../types.ts";

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

describe("skl new — retired-aware collision", () => {
  let tmp: string;
  let library: string;

  beforeEach(async () => {
    tmp = await realpath(await mkdtemp(join(tmpdir(), "skl-new-")));
    library = join(tmp, "library");
    await mkdir(library, { recursive: true });
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("`skl new <retired-name>` refuses (exit 1, no write)", async () => {
    await mkdir(join(library, "_retired", "caveman"), { recursive: true });
    await writeFile(
      join(library, "_retired", "caveman", "SKILL.md"),
      "---\nname: caveman\ndescription: a test skill\n---\n\nbody\n",
    );

    const { ctx, errors } = makeCtx(library);
    const code = await run(["caveman"], ctx);
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("skl unretire caveman");
    expect(existsSync(join(library, "caveman"))).toBe(false);
  });

  test("`skl new <fresh-name>` still scaffolds (no regression)", async () => {
    const { ctx } = makeCtx(library);
    const code = await run(["fresh-skill"], ctx);
    expect(code).toBe(0);
    expect(existsSync(join(library, "fresh-skill", "SKILL.md"))).toBe(true);
  });
});
