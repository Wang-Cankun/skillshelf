// Provenance lockfile read/write/upsert/remove + provenanceForName.

import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  readLockfile,
  writeLockfile,
  recordEntry,
  removeEntry,
  provenanceForName,
  lockfilePath,
  entryFromGit,
} from "../src/core/provenance.ts";
import type { LockEntry } from "../src/types.ts";
import { FIXTURE_LIBRARY } from "./helpers.ts";

let scratch: string | null = null;
afterEach(async () => {
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = null;
});
async function lib(): Promise<string> {
  scratch = await mkdtemp(join(tmpdir(), "skl-prov-"));
  return scratch;
}

const ENTRY: LockEntry = {
  name: "demo-skill",
  source: "github:owner/repo@skills/demo",
  ref: "deadbeef",
  channel: "github",
  installedAt: "2026-01-01T00:00:00.000Z",
  localEdits: false,
};

describe("provenance lockfile", () => {
  test("reads existing fixture lockfile", async () => {
    const lock = await readLockfile(FIXTURE_LIBRARY);
    expect(lock.version).toBe(1);
    expect(lock.entries["xhs-title"]?.ref).toBe(
      "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
    );
  });

  test("missing lockfile yields an empty lockfile, not a throw", async () => {
    const l = await lib();
    const lock = await readLockfile(l);
    expect(lock).toEqual({ version: 1, entries: {} });
  });

  test("round-trips write -> read", async () => {
    const l = await lib();
    await writeLockfile(l, { version: 1, entries: { [ENTRY.name]: ENTRY } });
    const lock = await readLockfile(l);
    expect(lock.entries["demo-skill"]).toEqual(ENTRY);
    // file is pretty-printed and newline-terminated
    const text = await Bun.file(lockfilePath(l)).text();
    expect(text.endsWith("\n")).toBe(true);
    expect(text).toContain("\n  ");
  });

  test("recordEntry upserts and removeEntry deletes", async () => {
    const l = await lib();
    await recordEntry(l, ENTRY);
    expect(provenanceForName(await readLockfile(l), "demo-skill")?.ref).toBe("deadbeef");

    const updated = { ...ENTRY, ref: "cafebabe", localEdits: true };
    await recordEntry(l, updated);
    expect((await readLockfile(l)).entries["demo-skill"]?.ref).toBe("cafebabe");

    expect(await removeEntry(l, "demo-skill")).toBe(true);
    expect(await removeEntry(l, "demo-skill")).toBe(false);
    expect((await readLockfile(l)).entries["demo-skill"]).toBeUndefined();
  });

  test("provenanceForName returns null for unknown name", async () => {
    const lock = await readLockfile(FIXTURE_LIBRARY);
    expect(provenanceForName(lock, "nope")).toBeNull();
  });

  test("entryFromGit normalizes a github origin", () => {
    const e = entryFromGit(
      "x",
      { remote: "git@github.com:o/r.git", source: "github:o/r", ref: "abc123" },
      { installedAt: "2026-01-01T00:00:00.000Z" },
    );
    expect(e).toEqual({
      name: "x",
      source: "github:o/r",
      ref: "abc123",
      channel: "github",
      installedAt: "2026-01-01T00:00:00.000Z",
      localEdits: false,
    });
  });

  test("corrupt lockfile JSON degrades to empty", async () => {
    const l = await lib();
    await Bun.write(lockfilePath(l), "{ not json");
    expect(await readLockfile(l)).toEqual({ version: 1, entries: {} });
  });
});
