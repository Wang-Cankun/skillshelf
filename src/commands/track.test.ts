import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, symlink, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { parseFrontmatter } from "../lib/frontmatter.ts";
import { run as trackRun } from "./track.ts";
import { run as untrackRun } from "./untrack.ts";
import { readLockfile } from "../core/provenance.ts";
import type { Ctx } from "../types.ts";

function makeCtx(libraryPath: string) {
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

function bodyHash(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

describe("skl track — adopt provenance offline", () => {
  let tmp: string;
  let library: string;

  beforeEach(async () => {
    tmp = await realpath(await mkdtemp(join(tmpdir(), "skl-track-")));
    library = join(tmp, "library");
    await mkdir(join(library, "foo"), { recursive: true });
    await writeFile(join(library, "foo", "SKILL.md"), "---\nname: foo\ndescription: a foo\n---\n\nBODY OF FOO\n");
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("attaches an adopted lock entry with the local body hash and empty ref", async () => {
    const { ctx, json } = makeCtx(library);
    const code = await trackRun(["foo", "--source", "github:owner/repo", "--json"], ctx);
    expect(code).toBe(0);

    const lock = await readLockfile(library);
    const e = lock.entries.foo!;
    expect(e.source).toBe("github:owner/repo");
    expect(e.channel).toBe("github");
    expect(e.ref).toBe("");
    expect(e.adopted).toBe(true);
    expect(e.localEdits).toBe(false);
    const expectedBody = parseFrontmatter("---\nname: foo\ndescription: a foo\n---\n\nBODY OF FOO\n").body;
    expect(e.installedHash).toBe(bodyHash(expectedBody));

    const summary = json[0] as { adopted: boolean; ref: string };
    expect(summary.adopted).toBe(true);
  });

  test("stores a github subpath in the add.ts @-convention and round-trips", async () => {
    const { ctx } = makeCtx(library);
    const code = await trackRun(["foo", "--source", "github:owner/repo@skills/foo"], ctx);
    expect(code).toBe(0);
    const lock = await readLockfile(library);
    expect(lock.entries.foo!.source).toBe("github:owner/repo@skills/foo");
  });

  test("--ref asserts the exact commit and clears adopted", async () => {
    const { ctx } = makeCtx(library);
    const code = await trackRun(["foo", "--source", "github:owner/repo", "--ref", "deadbeef"], ctx);
    expect(code).toBe(0);
    const e = (await readLockfile(library)).entries.foo!;
    expect(e.ref).toBe("deadbeef");
    expect(e.adopted).toBe(false);
  });

  test("refuses a skill not in the library, pointing at import/add", async () => {
    const { ctx, errors } = makeCtx(library);
    const code = await trackRun(["nope", "--source", "github:owner/repo"], ctx);
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("not in the library");
    expect((await readLockfile(library)).entries.nope).toBeUndefined();
  });

  test("refuses a LINKED entry (dev repo owns versioning, ADR-0004)", async () => {
    // Make a LINKED skill: library/bar -> external dev repo.
    const dev = join(tmp, "dev", "bar");
    await mkdir(dev, { recursive: true });
    await writeFile(join(dev, "SKILL.md"), "---\nname: bar\ndescription: d\n---\n\nbody\n");
    await symlink(dev, join(library, "bar"));

    const { ctx, errors } = makeCtx(library);
    const code = await trackRun(["bar", "--source", "github:owner/repo"], ctx);
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("LINKED");
    expect((await readLockfile(library)).entries.bar).toBeUndefined();
  });

  test("refuses an ALIASED LINKED entry where the symlink slug != frontmatter name", async () => {
    // Regression for the linked-guard bypass: a dev repo linked as library/aka-dir but
    // whose SKILL.md frontmatter name is `aka-name`. findByName matches the frontmatter
    // name, but linked-ness must be resolved by the on-disk slug (basename of the path),
    // or a LINKED skill slips the guard and `update` later clobbers the dev repo (ADR-0004).
    const dev = join(tmp, "dev", "aka-dir");
    await mkdir(dev, { recursive: true });
    await writeFile(join(dev, "SKILL.md"), "---\nname: aka-name\ndescription: d\n---\n\nbody\n");
    await symlink(dev, join(library, "aka-dir"));

    const { ctx, errors } = makeCtx(library);
    const code = await trackRun(["aka-name", "--source", "github:owner/repo"], ctx);
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("LINKED");
    expect((await readLockfile(library)).entries["aka-name"]).toBeUndefined();
    expect((await readLockfile(library)).entries["aka-dir"]).toBeUndefined();
  });

  test("refuses an existing lock entry without --force, allows with --force", async () => {
    const { ctx } = makeCtx(library);
    await trackRun(["foo", "--source", "github:owner/repo"], ctx);

    const second = makeCtx(library);
    const code = await trackRun(["foo", "--source", "github:other/repo"], second.ctx);
    expect(code).toBe(1);
    expect(second.errors.join("\n")).toContain("already");
    // unchanged
    expect((await readLockfile(library)).entries.foo!.source).toBe("github:owner/repo");

    const third = makeCtx(library);
    const fcode = await trackRun(["foo", "--source", "github:other/repo", "--force"], third.ctx);
    expect(fcode).toBe(0);
    expect((await readLockfile(library)).entries.foo!.source).toBe("github:other/repo");
  });
});

describe("skl untrack — inverse of track, idempotent", () => {
  let tmp: string;
  let library: string;

  beforeEach(async () => {
    tmp = await realpath(await mkdtemp(join(tmpdir(), "skl-untrack-")));
    library = join(tmp, "library");
    await mkdir(join(library, "foo"), { recursive: true });
    await writeFile(join(library, "foo", "SKILL.md"), "---\nname: foo\ndescription: d\n---\n\nbody\n");
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("removes an existing entry", async () => {
    const a = makeCtx(library);
    await trackRun(["foo", "--source", "github:owner/repo"], a.ctx);
    expect((await readLockfile(library)).entries.foo).toBeDefined();

    const b = makeCtx(library);
    const code = await untrackRun(["foo", "--json"], b.ctx);
    expect(code).toBe(0);
    expect((b.json[0] as { removed: boolean }).removed).toBe(true);
    expect((await readLockfile(library)).entries.foo).toBeUndefined();
  });

  test("is a no-op (exit 0) when absent", async () => {
    const { ctx, json } = makeCtx(library);
    const code = await untrackRun(["ghost", "--json"], ctx);
    expect(code).toBe(0);
    expect((json[0] as { removed: boolean }).removed).toBe(false);
  });
});
