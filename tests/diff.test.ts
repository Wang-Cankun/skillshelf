// `skl diff <name>` — unified diff between a DEPLOYED copy's SKILL.md and the
// library skill's SKILL.md. Read-only; the engine verb behind the UI's drift
// "View diff" action (previously a "coming soon" stub).

import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { mkdirSync, writeFileSync, symlinkSync, readFileSync } from "node:fs";
import * as diff from "../src/commands/diff.ts";
import { runCmd, tempProject, FIXTURE_LIBRARY } from "./helpers.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

describe("skl diff", () => {
  test("reports a unified diff for a drifted deployed copy", async () => {
    const p = await tempProject();
    cleanups.push(p.cleanup);
    const site = join(p.path, ".claude", "skills", "rnaseq-qc");
    mkdirSync(site, { recursive: true });
    const libBody = readFileSync(join(FIXTURE_LIBRARY, "rnaseq-qc", "SKILL.md"), "utf8");
    writeFileSync(join(site, "SKILL.md"), libBody + "\nLOCAL DRIFT LINE\n");

    const r = await runCmd(diff, ["rnaseq-qc", "--json"], { cwd: p.path });
    expect(r.code).toBe(0);
    const j = r.json[0] as any;
    expect(j.identical).toBe(false);
    expect(j.diff).toContain("+LOCAL DRIFT LINE");
  });

  test("an identical copy reports identical with an empty diff", async () => {
    const p = await tempProject();
    cleanups.push(p.cleanup);
    const site = join(p.path, ".claude", "skills", "rnaseq-qc");
    mkdirSync(site, { recursive: true });
    const libBody = readFileSync(join(FIXTURE_LIBRARY, "rnaseq-qc", "SKILL.md"), "utf8");
    writeFileSync(join(site, "SKILL.md"), libBody);

    const r = await runCmd(diff, ["rnaseq-qc", "--json"], { cwd: p.path });
    expect(r.code).toBe(0);
    const j = r.json[0] as any;
    expect(j.identical).toBe(true);
    expect(j.diff).toBe("");
  });

  test("a clean symlink deployment reports identical", async () => {
    const p = await tempProject();
    cleanups.push(p.cleanup);
    const dir = join(p.path, ".claude", "skills");
    mkdirSync(dir, { recursive: true });
    symlinkSync(join(FIXTURE_LIBRARY, "rnaseq-qc"), join(dir, "rnaseq-qc"));

    const r = await runCmd(diff, ["rnaseq-qc", "--json"], { cwd: p.path });
    expect(r.code).toBe(0);
    expect((r.json[0] as any).identical).toBe(true);
  });

  test("errors when the skill is not deployed on the surface", async () => {
    const p = await tempProject();
    cleanups.push(p.cleanup);
    const r = await runCmd(diff, ["rnaseq-qc", "--json"], { cwd: p.path });
    expect(r.code).toBe(1);
  });

  test("errors for a name not in the library", async () => {
    const p = await tempProject();
    cleanups.push(p.cleanup);
    const r = await runCmd(diff, ["no-such-skill", "--json"], { cwd: p.path });
    expect(r.code).toBe(1);
  });
});
