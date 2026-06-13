import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, symlink, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { entryMode } from "./library.ts";

describe("entryMode — owned vs linked (ADR-0004)", () => {
  let tmp: string;
  let library: string;

  beforeEach(async () => {
    tmp = await realpath(await mkdtemp(join(tmpdir(), "skl-mode-")));
    library = join(tmp, "library");
    await mkdir(library, { recursive: true });
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("a real directory is OWNED", async () => {
    await mkdir(join(library, "owned"), { recursive: true });
    expect(entryMode(library, "owned")).toBe("owned");
  });

  test("a symlink resolving OUTSIDE the library is LINKED", async () => {
    const dev = join(tmp, "dev", "cairn");
    await mkdir(dev, { recursive: true });
    await symlink(dev, join(library, "cairn"));
    expect(entryMode(library, "cairn")).toBe("linked");
  });

  test("a symlink resolving INSIDE the library is OWNED", async () => {
    await mkdir(join(library, "real"), { recursive: true });
    await symlink(join(library, "real"), join(library, "alias"));
    expect(entryMode(library, "alias")).toBe("owned");
  });

  test("an absent entry is treated as OWNED (no symlink)", () => {
    expect(entryMode(library, "nope")).toBe("owned");
  });
});
