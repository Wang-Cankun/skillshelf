import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, symlink, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run as lsRun } from "./ls.ts";
import { run as outdatedRun } from "./outdated.ts";
import { run as updateRun } from "./update.ts";
import { loadLibrary } from "../core/library.ts";
import { hashContent } from "../core/crawl.ts";
import { parseFrontmatter } from "../lib/frontmatter.ts";
import type { Ctx } from "../types.ts";

function makeCtx(libraryPath: string) {
  const json: unknown[] = [];
  const ctx = {
    config: { libraryPath },
    libraryPath,
    loadLibrary: () => loadLibrary(libraryPath),
    log: () => {},
    error: () => {},
    json: (v: unknown) => json.push(v),
  } as unknown as Ctx;
  return { ctx, json };
}

describe("owned-vs-linked surfacing (friction #7)", () => {
  let tmp: string;
  let library: string;
  let dev: string;

  beforeEach(async () => {
    tmp = await realpath(await mkdtemp(join(tmpdir(), "skl-mode-")));
    library = join(tmp, "library");
    await mkdir(join(library, "owned1"), { recursive: true });
    await writeFile(join(library, "owned1", "SKILL.md"), "---\nname: owned1\ndescription: o\n---\n\nbody\n");
    dev = join(tmp, "dev", "devskill");
    await mkdir(dev, { recursive: true });
    await writeFile(join(dev, "SKILL.md"), "---\nname: devskill\ndescription: d\n---\n\nbody\n");
    await symlink(dev, join(library, "devskill"));
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("ls --json carries mode + linkTarget", async () => {
    const { ctx, json } = makeCtx(library);
    await lsRun(["--all", "--json"], ctx);
    const rows = json[0] as Array<{ name: string; mode: string; linkTarget: string | null }>;
    const owned = rows.find((r) => r.name === "owned1")!;
    const linked = rows.find((r) => r.name === "devskill")!;
    expect(owned.mode).toBe("owned");
    expect(owned.linkTarget).toBeNull();
    expect(linked.mode).toBe("linked");
    expect(linked.linkTarget).toBe(dev);
  });

  test("outdated surfaces a LINKED skill that has NO lock entry", async () => {
    const { ctx, json } = makeCtx(library);
    const code = await outdatedRun(["--json"], ctx);
    expect(code).toBe(0);
    const rows = (json[0] as { rows: Array<{ name: string; status: string }> }).rows;
    expect(rows.find((r) => r.name === "devskill")!.status).toBe("linked");
  });

  test("update reports a LINKED skill (no lock entry) as explicitly skipped", async () => {
    const { ctx, json } = makeCtx(library);
    await updateRun(["devskill", "--json"], ctx);
    const results = (json[0] as { results: Array<{ name: string; outcome: string }> }).results;
    expect(results.find((r) => r.name === "devskill")!.outcome).toBe("skipped");
  });

  test("outdated --check-local flags local divergence offline (no network)", async () => {
    // owned1 tracked with an installedHash that does NOT match the local body.
    const localBody = parseFrontmatter("---\nname: owned1\n---\n\nbody\n").body;
    const staleHash = hashContent(localBody + "DIFFERENT");
    await writeFile(
      join(library, "shelf.lock.json"),
      JSON.stringify({
        version: 1,
        entries: {
          owned1: { name: "owned1", source: "github:o/r", ref: "abc", channel: "github", installedAt: "2020-01-01T00:00:00.000Z", localEdits: false, installedHash: staleHash },
        },
      }),
    );
    const { ctx, json } = makeCtx(library);
    const code = await outdatedRun(["--check-local", "--json"], ctx);
    expect(code).toBe(2); // diverged -> non-zero
    const rows = (json[0] as { rows: Array<{ name: string; status: string }> }).rows;
    expect(rows.find((r) => r.name === "owned1")!.status).toBe("diverged");
  });

  test("outdated --check-local reports a matching baseline as current (offline)", async () => {
    const localBody = parseFrontmatter("---\nname: owned1\n---\n\nbody\n").body;
    const matchHash = hashContent(localBody);
    await writeFile(
      join(library, "shelf.lock.json"),
      JSON.stringify({
        version: 1,
        entries: {
          owned1: { name: "owned1", source: "github:o/r", ref: "abc", channel: "github", installedAt: "2020-01-01T00:00:00.000Z", localEdits: false, installedHash: matchHash },
        },
      }),
    );
    const { ctx, json } = makeCtx(library);
    const code = await outdatedRun(["--check-local", "--json"], ctx);
    expect(code).toBe(0);
    const rows = (json[0] as { rows: Array<{ name: string; status: string }> }).rows;
    expect(rows.find((r) => r.name === "owned1")!.status).toBe("current");
  });
});
