// `skl realign <deployed-name>` — rename an ALIASED deployment symlink (a link
// whose name differs from the library skill it resolves to) so its name matches
// the library skill. The engine-side verb behind the UI's "Realign name"
// remediation (previously a "coming soon" stub).

import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { lstat, readlink } from "node:fs/promises";
import * as realign from "../src/commands/realign.ts";
import { runCmd, tempProject, FIXTURE_LIBRARY } from "./helpers.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function skillsDirWithAlias(alias: string) {
  const p = await tempProject();
  cleanups.push(p.cleanup);
  const dir = join(p.path, ".claude", "skills");
  mkdirSync(dir, { recursive: true });
  symlinkSync(join(FIXTURE_LIBRARY, "rnaseq-qc"), join(dir, alias));
  return { p, dir };
}

describe("skl realign", () => {
  test("renames an aliased link to its library skill name", async () => {
    const { p, dir } = await skillsDirWithAlias("wrong-name");

    const r = await runCmd(realign, ["wrong-name", "--json"], { cwd: p.path });
    expect(r.code).toBe(0);
    const j = r.json[0] as any;
    expect(j.status).toBe("realigned");
    expect(j.from).toBe("wrong-name");
    expect(j.to).toBe("rnaseq-qc");

    // Old name gone, new name is a symlink to the same library skill.
    const realigned = join(dir, "rnaseq-qc");
    expect((await lstat(realigned)).isSymbolicLink()).toBe(true);
    expect(await readlink(realigned)).toBe(join(FIXTURE_LIBRARY, "rnaseq-qc"));
    await expect(lstat(join(dir, "wrong-name"))).rejects.toThrow();
  });

  test("an already-aligned link is a no-op", async () => {
    const { p } = await skillsDirWithAlias("rnaseq-qc");
    const r = await runCmd(realign, ["rnaseq-qc", "--json"], { cwd: p.path });
    expect(r.code).toBe(0);
    expect((r.json[0] as any).status).toBe("already");
  });

  test("refuses a real (non-symlink) entry", async () => {
    const p = await tempProject();
    cleanups.push(p.cleanup);
    const dir = join(p.path, ".claude", "skills");
    mkdirSync(join(dir, "real-copy"), { recursive: true });
    writeFileSync(join(dir, "real-copy", "SKILL.md"), "---\nname: real-copy\n---\n\nbody\n");

    const r = await runCmd(realign, ["real-copy", "--json"], { cwd: p.path });
    expect(r.code).toBe(1);
  });

  test("refuses when the aligned name is already occupied", async () => {
    const { p, dir } = await skillsDirWithAlias("wrong-name");
    // Occupy the destination slot with a correct link.
    symlinkSync(join(FIXTURE_LIBRARY, "rnaseq-qc"), join(dir, "rnaseq-qc"));

    const r = await runCmd(realign, ["wrong-name", "--json"], { cwd: p.path });
    expect(r.code).toBe(1);
    // The aliased link is left untouched for the user to resolve.
    expect((await lstat(join(dir, "wrong-name"))).isSymbolicLink()).toBe(true);
  });

  test("refuses a symlink that does not resolve to any library skill", async () => {
    const p = await tempProject();
    cleanups.push(p.cleanup);
    const dir = join(p.path, ".claude", "skills");
    mkdirSync(join(p.path, "elsewhere"), { recursive: true });
    mkdirSync(dir, { recursive: true });
    symlinkSync(join(p.path, "elsewhere"), join(dir, "foreign"));

    const r = await runCmd(realign, ["foreign", "--json"], { cwd: p.path });
    expect(r.code).toBe(1);
  });
});
