import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, symlink, rm, realpath } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { remediate } from "./where.ts";
import { run as refreshRun } from "./refresh.ts";
import { run as statusRun } from "./status.ts";
import { isSymlink, realpathOrSelf } from "../lib/fs.ts";
import { loadLibrary } from "../core/library.ts";
import type { Ctx, DeploymentSite } from "../types.ts";

function site(partial: Partial<DeploymentSite> & Pick<DeploymentSite, "name" | "path" | "kind">): DeploymentSite {
  return { surface: "/surface", target: null, inLibrary: false, drift: false, ...partial };
}

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

describe("where remediation + refresh + status drift (friction #6)", () => {
  let tmp: string;
  let library: string;

  beforeEach(async () => {
    tmp = await realpath(await mkdtemp(join(tmpdir(), "skl-rem-")));
    library = join(tmp, "library");
    await mkdir(join(library, "alpha"), { recursive: true });
    await writeFile(join(library, "alpha", "SKILL.md"), "---\nname: alpha\ndescription: a\n---\n\nbody\n");
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("--prune removes dead links only; copies stay manual", async () => {
    const surface = join(tmp, "surface");
    await mkdir(surface, { recursive: true });
    await symlink(join(tmp, "gone"), join(surface, "deadlink"));
    const dead = site({ name: "deadlink", path: join(surface, "deadlink"), kind: "dead" });
    const copy = site({ name: "alpha", path: join(surface, "alpha"), kind: "copy", inLibrary: true, drift: false });

    const outcomes = await remediate([dead, copy], library, { fix: false, dryRun: false });
    expect(outcomes.find((o) => o.name === "deadlink")!.action).toBe("remove-dead");
    expect(outcomes.find((o) => o.name === "deadlink")!.applied).toBe(true);
    expect(existsSync(join(surface, "deadlink"))).toBe(false);
    // under --prune a dedupe-able copy is left as manual
    expect(outcomes.find((o) => o.name === "alpha")!.action).toBe("manual");
  });

  test("--fix dedupes a content-identical copy into a library symlink", async () => {
    const surface = join(tmp, "surface");
    await mkdir(join(surface, "alpha"), { recursive: true });
    await writeFile(join(surface, "alpha", "SKILL.md"), "---\nname: alpha\ndescription: a\n---\n\nbody\n");
    const copy = site({ name: "alpha", path: join(surface, "alpha"), kind: "copy", inLibrary: true, drift: false });

    const outcomes = await remediate([copy], library, { fix: true, dryRun: false });
    expect(outcomes[0]!.action).toBe("dedupe-copy");
    expect(isSymlink(join(surface, "alpha"))).toBe(true);
    expect(realpathOrSelf(join(surface, "alpha"))).toBe(realpathOrSelf(join(library, "alpha")));
  });

  test("--fix never auto-resolves a drifted copy or a foreign link", async () => {
    const drifted = site({ name: "alpha", path: "/s/alpha", kind: "copy", inLibrary: true, drift: true });
    const foreign = site({ name: "beta", path: "/s/beta", kind: "foreign-link", target: "/elsewhere" });
    const outcomes = await remediate([drifted, foreign], library, { fix: true, dryRun: true });
    expect(outcomes.every((o) => o.action === "manual")).toBe(true);
    expect(outcomes.every((o) => !o.applied)).toBe(true);
  });

  test("--dry-run reports without mutating", async () => {
    const surface = join(tmp, "surface");
    await mkdir(surface, { recursive: true });
    await symlink(join(tmp, "gone"), join(surface, "deadlink"));
    const dead = site({ name: "deadlink", path: join(surface, "deadlink"), kind: "dead" });
    const outcomes = await remediate([dead], library, { fix: true, dryRun: true });
    expect(outcomes[0]!.applied).toBe(false);
    expect(isSymlink(join(surface, "deadlink"))).toBe(true); // still there
  });

  test("refresh prunes a stale link whose library skill is gone, leaves foreign links", async () => {
    const proj = join(tmp, "proj");
    const skillsDir = join(proj, ".claude", "skills");
    await mkdir(skillsDir, { recursive: true });
    await symlink(join(library, "alpha"), join(skillsDir, "alpha")); // valid
    await symlink(join(library, "ghost"), join(skillsDir, "ghost")); // dead, was-library
    await symlink("/foreign/x", join(skillsDir, "foreign")); // foreign

    const prev = process.cwd();
    process.chdir(proj);
    try {
      const { ctx, json } = makeCtx(library);
      await refreshRun(["--json"], ctx);
      const out = json[0] as { outcomes: Array<{ name: string; action: string }> };
      const by = Object.fromEntries(out.outcomes.map((o) => [o.name, o.action]));
      expect(by.alpha).toBe("ok");
      expect(by.ghost).toBe("pruned");
      expect(by.foreign).toBe("foreign");
      expect(existsSync(join(skillsDir, "ghost"))).toBe(false);
      expect(isSymlink(join(skillsDir, "foreign"))).toBe(true);
    } finally {
      process.chdir(prev);
    }
  });

  test("status flags an unmanaged real copy (drift-prone)", async () => {
    const proj = join(tmp, "proj2");
    const skillsDir = join(proj, ".claude", "skills");
    await mkdir(join(skillsDir, "realcopy"), { recursive: true });
    await writeFile(join(skillsDir, "realcopy", "SKILL.md"), "---\nname: realcopy\n---\n\nx\n");

    const prev = process.cwd();
    process.chdir(proj);
    try {
      const { ctx, json } = makeCtx(library);
      await statusRun(["--json"], ctx);
      const out = json[0] as { unmanaged: Array<{ name: string }> };
      expect(out.unmanaged.map((u) => u.name)).toContain("realcopy");
    } finally {
      process.chdir(prev);
    }
  });
});
