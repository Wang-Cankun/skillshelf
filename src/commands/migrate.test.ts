import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run as migrateRun } from "./migrate.ts";
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

async function addLibSkill(library: string, name: string, body = "body") {
  await mkdir(join(library, name), { recursive: true });
  await writeFile(join(library, name, "SKILL.md"), `---\nname: ${name}\ndescription: d\n---\n\n${body}\n`);
}

// A fake vendor (.agents/.skill-lock.json) fixture covering every mapping branch.
function vendorLock() {
  return {
    version: 3,
    skills: {
      // github with a subpath dir → github:owner/repo@dir
      ghskill: {
        source: "owner/repo",
        sourceType: "github",
        sourceUrl: "https://github.com/owner/repo",
        skillPath: "skills/ghskill/SKILL.md",
        skillFolderHash: "treesha-not-skl-hash",
        installedAt: "2024-01-01T00:00:00.000Z",
        ref: "main",
      },
      // github, NOT in the library → report only
      ghmissing: {
        source: "owner/other",
        sourceType: "github",
        sourceUrl: "https://github.com/owner/other",
        skillPath: "SKILL.md",
        skillFolderHash: "abc",
        installedAt: "2024-01-01T00:00:00.000Z",
      },
      // git source → git:<url>#dir
      gitskill: {
        source: "ignored",
        sourceType: "git",
        sourceUrl: "/some/local/repo",
        skillPath: "sub/gitskill/SKILL.md",
        skillFolderHash: "def",
        installedAt: "2024-01-01T00:00:00.000Z",
      },
      // local → not trackable
      localskill: {
        source: "localskill",
        sourceType: "local",
        sourceUrl: "/here",
        skillPath: "SKILL.md",
        skillFolderHash: "ghi",
        installedAt: "2024-01-01T00:00:00.000Z",
      },
    },
  };
}

describe("skl migrate — bulk-adopt from a vendor lock", () => {
  let tmp: string;
  let library: string;
  let vendorPath: string;

  beforeEach(async () => {
    tmp = await realpath(await mkdtemp(join(tmpdir(), "skl-migrate-")));
    library = join(tmp, "library");
    await mkdir(library, { recursive: true });
    // ghskill, gitskill, localskill exist in the library; ghmissing does NOT.
    await addLibSkill(library, "ghskill");
    await addLibSkill(library, "gitskill");
    await addLibSkill(library, "localskill");
    vendorPath = join(tmp, ".skill-lock.json");
    await writeFile(vendorPath, JSON.stringify(vendorLock(), null, 2));
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("tracks in-library github/git skills, reports missing, flags local as not trackable", async () => {
    const { ctx, json } = makeCtx(library);
    const code = await migrateRun(["--from", vendorPath, "--json"], ctx);
    expect(code).toBe(0);

    const r = json[0] as {
      counts: { tracked: number; skipped: number; notInLibrary: number; notTrackable: number };
      tracked: Array<{ name: string; source: string }>;
      notInLibrary: Array<{ name: string; source: string }>;
      notTrackable: Array<{ name: string; sourceType: string }>;
    };
    expect(r.counts.tracked).toBe(2);
    expect(r.counts.notInLibrary).toBe(1);
    expect(r.counts.notTrackable).toBe(1);

    const lock = await readLockfile(library);
    // github subpath mapped to the @-convention.
    expect(lock.entries.ghskill!.source).toBe("github:owner/repo@skills/ghskill");
    expect(lock.entries.ghskill!.adopted).toBe(true);
    // vendor tree-sha is NOT reused as installedHash; vendor branch is NOT the ref.
    expect(lock.entries.ghskill!.installedHash).not.toBe("treesha-not-skl-hash");
    expect(lock.entries.ghskill!.ref).toBe("");
    // git source mapped to git:<url>#dir.
    expect(lock.entries.gitskill!.source).toBe("git:/some/local/repo#sub/gitskill");

    // missing skill is reported with an `skl add` line, never installed.
    expect(r.notInLibrary[0]!.name).toBe("ghmissing");
    expect(lock.entries.ghmissing).toBeUndefined();

    // local skill is not trackable (no lock entry).
    expect(r.notTrackable[0]!.name).toBe("localskill");
    expect(lock.entries.localskill).toBeUndefined();
  });

  test("--dry-run previews without writing", async () => {
    const { ctx, json } = makeCtx(library);
    const code = await migrateRun(["--from", vendorPath, "--dry-run", "--json"], ctx);
    expect(code).toBe(0);
    expect((json[0] as { counts: { tracked: number } }).counts.tracked).toBe(2);
    // No entries written.
    expect(Object.keys((await readLockfile(library)).entries)).toHaveLength(0);
  });

  test("skips already-tracked skills unless --force", async () => {
    // First pass tracks ghskill + gitskill.
    await migrateRun(["--from", vendorPath], makeCtx(library).ctx);
    // Second pass should skip both as already-tracked.
    const { ctx, json } = makeCtx(library);
    const code = await migrateRun(["--from", vendorPath, "--json"], ctx);
    expect(code).toBe(0);
    const r = json[0] as { counts: { tracked: number; skipped: number } };
    expect(r.counts.tracked).toBe(0);
    expect(r.counts.skipped).toBe(2);
  });

  test("rejects a non-vendor lock file", async () => {
    const notVendor = join(tmp, "not-vendor.json");
    await writeFile(notVendor, JSON.stringify({ version: 1, entries: {} }));
    const { ctx, errors } = makeCtx(library);
    const code = await migrateRun(["--from", notVendor], ctx);
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("not a recognized vendor");
  });
});
