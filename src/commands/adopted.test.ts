import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run as outdatedRun } from "./outdated.ts";
import { run as updateRun } from "./update.ts";
import { readLockfile, recordEntry } from "../core/provenance.ts";
import type { Ctx, LockEntry } from "../types.ts";

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

/** Build a tiny on-disk git repo to act as a `git:` upstream for one skill. */
async function makeGitUpstream(dir: string, name: string, body: string): Promise<void> {
  await mkdir(join(dir, name), { recursive: true });
  await writeFile(join(dir, name, "SKILL.md"), `---\nname: ${name}\ndescription: d\n---\n\n${body}\n`);
  const git = (args: string[]) => Bun.spawnSync(["git", "-C", dir, ...args], { stdout: "ignore", stderr: "ignore" });
  git(["init", "-q"]);
  git(["config", "user.email", "t@t.t"]);
  git(["config", "user.name", "t"]);
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "init"]);
}

describe("adopted entries — outdated reports 'adopted', not stale", () => {
  let tmp: string;
  let library: string;

  beforeEach(async () => {
    tmp = await realpath(await mkdtemp(join(tmpdir(), "skl-adopted-outdated-")));
    library = join(tmp, "library");
    await mkdir(join(library, "foo"), { recursive: true });
    await writeFile(join(library, "foo", "SKILL.md"), "---\nname: foo\ndescription: d\n---\n\nbody\n");
    const entry: LockEntry = {
      name: "foo",
      source: "github:owner/repo",
      ref: "",
      channel: "github",
      installedAt: "2024-01-01T00:00:00.000Z",
      localEdits: false,
      installedHash: "abc",
      adopted: true,
    };
    await recordEntry(library, entry);
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("status is 'adopted' and never counted stale (no upstream probe)", async () => {
    const { ctx, json } = makeCtx(library);
    const code = await outdatedRun(["--json"], ctx);
    expect(code).toBe(0); // not stale -> exit 0, no network probe of the empty ref
    const report = json[0] as { stale: number; rows: Array<{ name: string; status: string; note: string }> };
    expect(report.stale).toBe(0);
    const row = report.rows.find((r) => r.name === "foo")!;
    expect(row.status).toBe("adopted");
    expect(row.note).toContain("baseline unverified");
  });
});

describe("adopted entries — update is conservative and graduates", () => {
  let tmp: string;
  let library: string;
  let upstream: string;

  async function seedAdopted(libBody: string, upstreamBody: string): Promise<void> {
    await mkdir(join(library, "foo"), { recursive: true });
    await writeFile(join(library, "foo", "SKILL.md"), `---\nname: foo\ndescription: d\n---\n\n${libBody}\n`);
    upstream = join(tmp, "upstream");
    await makeGitUpstream(upstream, "foo", upstreamBody);
    const entry: LockEntry = {
      name: "foo",
      source: `git:${upstream}#foo`,
      ref: "",
      channel: "git",
      installedAt: "2024-01-01T00:00:00.000Z",
      localEdits: false,
      installedHash: "unverified-baseline-hash",
      adopted: true,
    };
    await recordEntry(library, entry);
  }

  beforeEach(async () => {
    tmp = await realpath(await mkdtemp(join(tmpdir(), "skl-adopted-update-")));
    library = join(tmp, "library");
    await mkdir(library, { recursive: true });
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("differing body: requires --force, shows diff, does not clobber", async () => {
    await seedAdopted("LOCAL BODY", "UPSTREAM BODY");
    const { ctx, json } = makeCtx(library);
    const code = await updateRun(["foo", "--json"], ctx);
    // diverged -> exit 2
    expect(code).toBe(2);
    const report = json[0] as { results: Array<{ name: string; outcome: string }> };
    expect(report.results.find((r) => r.name === "foo")!.outcome).toBe("diverged");
    // local body untouched
    const body = await readFile(join(library, "foo", "SKILL.md"), "utf8");
    expect(body).toContain("LOCAL BODY");
    // still adopted (not graduated)
    expect((await readLockfile(library)).entries.foo!.adopted).toBe(true);
  });

  test("differing body with --force: overwrites and graduates (adopted cleared)", async () => {
    await seedAdopted("LOCAL BODY", "UPSTREAM BODY");
    const { ctx } = makeCtx(library);
    const code = await updateRun(["foo", "--force"], ctx);
    expect(code).toBe(0);
    const body = await readFile(join(library, "foo", "SKILL.md"), "utf8");
    expect(body).toContain("UPSTREAM BODY");
    const e = (await readLockfile(library)).entries.foo!;
    expect(e.adopted).toBe(false); // graduated
    expect(e.ref).not.toBe(""); // real commit pinned
    expect(e.localEdits).toBe(false);
  });

  test("identical body: graduates without --force (lossless)", async () => {
    await seedAdopted("SAME BODY", "SAME BODY");
    const { ctx } = makeCtx(library);
    const code = await updateRun(["foo"], ctx);
    expect(code).toBe(0);
    const e = (await readLockfile(library)).entries.foo!;
    expect(e.adopted).toBe(false); // graduated
    expect(e.ref).not.toBe("");
    // installedHash now reflects the verified upstream body.
    expect(e.installedHash).not.toBe("unverified-baseline-hash");
  });
});
