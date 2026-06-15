// CLI subprocess smoke pass: every command routes, runs against the fixture
// library, and exits with an expected code. Also covers add's write building
// blocks (copySkillDir + central taxonomy) without network.

import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { runCli, tempLibrary, tempProject, FIXTURE_LIBRARY } from "./helpers.ts";
import { copySkillDir, readSkillBody } from "../src/core/fetch.ts";
import { setDomainsForName } from "../src/core/taxonomy.ts";
import { recordEntry, readLockfile } from "../src/core/provenance.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

describe("CLI smoke (subprocess)", () => {
  test("no args prints help, exit 0", async () => {
    const r = await runCli([]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("skillshelf");
    expect(r.stdout).toContain("Commands:");
  });

  test("unknown command exits non-zero", async () => {
    const r = await runCli(["frobnicate"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("Unknown command");
  });

  test("ls --json lists active skills", async () => {
    const r = await runCli(["ls", "--json"]);
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr.map((s: any) => s.name)).toContain("rnaseq-qc");
  });

  test("search --json finds by keyword", async () => {
    const r = await runCli(["search", "commit", "--json"]);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)[0].name).toBe("commit-push");
  });

  test("show prints body + ref paths, not ref contents", async () => {
    const r = await runCli(["show", "rnaseq-qc"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("# RNA-seq QC");
    expect(r.stdout).toContain("Reference files");
    // CONTENTS of the reference file are NOT printed (string lives only in thresholds.md)
    expect(r.stdout).not.toContain("rRNA contamination");
  });

  test("status --json in fresh project: nothing linked", async () => {
    const p = await tempProject();
    cleanups.push(p.cleanup);
    const r = await runCli(["status", "--json"], { cwd: p.path });
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).linkedCount).toBe(0);
  });

  test("use -> drop lifecycle via subprocess", async () => {
    const p = await tempProject();
    cleanups.push(p.cleanup);
    const used = await runCli(["use", "philosophy", "--json"], { cwd: p.path });
    expect(used.code).toBe(0);
    const link = join(p.path, ".claude", "skills", "concept-deconstruct");
    expect(existsSync(link)).toBe(true);

    const dropped = await runCli(["drop", "philosophy", "--json"], { cwd: p.path });
    expect(dropped.code).toBe(0);
    expect(existsSync(link)).toBe(false);
  });

  test("index writes INDEX.md (temp library)", async () => {
    const t = await tempLibrary();
    cleanups.push(t.cleanup);
    const r = await runCli(["index"], { library: t.path });
    expect(r.code).toBe(0);
    expect(existsSync(join(t.path, "INDEX.md"))).toBe(true);
  });

  test("outdated --json reports the one tracked skill", async () => {
    // exit code 2 == stale, 0 == current; either is a clean run (depends on net).
    const r = await runCli(["outdated", "--json"]);
    expect([0, 2]).toContain(r.code);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(true);
    expect(j.checked).toBe(1);
  });

  test("infer --emit emits a corpus", async () => {
    const r = await runCli(["infer", "--emit", "--json"]);
    expect(r.code).toBe(0);
    const p = JSON.parse(r.stdout);
    expect(p.corpus.skills.length).toBeGreaterThan(0);
  });

  test("new scaffolds a skill (temp library)", async () => {
    const t = await tempLibrary();
    cleanups.push(t.cleanup);
    const r = await runCli(["new", "smoke-new", "--domain", "coding"], { library: t.path });
    expect(r.code).toBe(0);
    expect(existsSync(join(t.path, "smoke-new", "SKILL.md"))).toBe(true);
  });

  test("help <command> prints usage", async () => {
    const r = await runCli(["help", "show"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("skl show");
  });
});

describe("add write building blocks (offline)", () => {
  test("copySkillDir + recordEntry + setDomainsForName produce a tracked, tagged skill", async () => {
    // Simulate a fetched upstream skill dir.
    const stage = await mkdtemp(join(tmpdir(), "skl-stage-"));
    cleanups.push(() => rm(stage, { recursive: true, force: true }));
    const upstream = join(stage, "upstream");
    await mkdir(upstream, { recursive: true });
    await writeFile(
      join(upstream, "SKILL.md"),
      "---\nname: imported\ndescription: imported skill\n---\n# Imported\nbody\n",
    );
    await writeFile(join(upstream, ".git"), "should be excluded");

    const t = await tempLibrary();
    cleanups.push(t.cleanup);
    const dest = join(t.path, "imported");
    await copySkillDir(upstream, dest);
    // .git excluded by the copy filter
    expect(existsSync(join(dest, ".git"))).toBe(false);
    expect(await readSkillBody(dest)).toContain("# Imported");

    // Record the domain centrally in <library>/taxonomy.json (ADR-0002), keyed by
    // the skill's canonical name — no per-skill sidecar.
    await setDomainsForName(t.path, "imported", ["coding"]);
    await recordEntry(t.path, {
      name: "imported",
      source: "github:o/r@imported",
      ref: "abc123",
      channel: "github",
      installedAt: "2026-01-01T00:00:00.000Z",
      localEdits: false,
    });

    const { loadLibrary, findByName } = await import("../src/core/library.ts");
    const lib = await loadLibrary(t.path);
    const s = findByName(lib, "imported")!;
    expect(s.domains).toContain("coding");
    expect(s.source?.source).toBe("github:o/r@imported");
    expect((await readLockfile(t.path)).entries["imported"]?.ref).toBe("abc123");
  });
});
