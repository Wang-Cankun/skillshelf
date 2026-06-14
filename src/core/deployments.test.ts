import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, symlink, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inventoryDeployments } from "./deployments.ts";
import { hashContent } from "./crawl.ts";
import { parseFrontmatter } from "../lib/frontmatter.ts";
import type { Skill } from "../types.ts";

const SKILL_BODY = "---\nname: cairn\ndescription: a test skill\n---\n\nbody text\n";

/** Write a minimal skill dir (SKILL.md) and return its path. */
async function makeSkillDir(parent: string, name: string, body = SKILL_BODY): Promise<string> {
  const dir = join(parent, name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "SKILL.md"), body);
  return dir;
}

/** A minimal library Skill record (only the fields inventoryDeployments reads). */
function libSkill(name: string, path: string, body = SKILL_BODY): Skill {
  return {
    name,
    description: "",
    primaryDomain: null,
    domains: [],
    path,
    bodyPath: join(path, "SKILL.md"),
    refFiles: [],
    source: null,
    retired: false,
    mirrorOf: null,
    contentHash: hashContent(parseFrontmatter(body).body),
    discoveredRoot: null,
  };
}

describe("inventoryDeployments — linked-source recognition", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await realpath(await mkdtemp(join(tmpdir(), "skl-deploy-")));
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("linked source (library entry symlinks AT the surface dir) is clean `source`, not a redundant copy", async () => {
    // External dev-repo source dir with SKILL.md.
    const ext = join(tmp, "ext");
    const srcDir = await makeSkillDir(ext, "cairn");

    // Library where library/cairn is a SYMLINK to the external source dir.
    const library = join(tmp, "library");
    await mkdir(library, { recursive: true });
    await symlink(srcDir, join(library, "cairn"));

    // Surface that contains the same external source dir.
    const surface = ext;

    const report = await inventoryDeployments(
      [surface],
      library,
      [libSkill("cairn", join(library, "cairn"))],
    );

    const site = report.sites.find((s) => s.name === "cairn");
    expect(site).toBeDefined();
    expect(site!.kind).toBe("source");
    expect(site!.drift).toBe(false);
    expect(report.problems.some((s) => s.name === "cairn")).toBe(false);
  });

  test("genuine redundant copy (library entry is a real copy, not a symlink) is still flagged `copy`", async () => {
    // Library with a REAL copy of cairn (not a symlink).
    const library = join(tmp, "library");
    const libEntry = await makeSkillDir(library, "cairn");

    // A different real dir with the same skill name on a surface.
    const surfaceRoot = join(tmp, "surface");
    await makeSkillDir(surfaceRoot, "cairn");

    const report = await inventoryDeployments(
      [surfaceRoot],
      library,
      [libSkill("cairn", libEntry)],
    );

    const site = report.sites.find((s) => s.name === "cairn");
    expect(site).toBeDefined();
    expect(site!.kind).toBe("copy");
    expect(report.problems.some((s) => s.name === "cairn")).toBe(true);
  });
});

describe("inventoryDeployments — aliased links (link-name ≠ library skill)", () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await realpath(await mkdtemp(join(tmpdir(), "skl-alias-")));
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("a symlink into the library under a DIFFERENT name is `aliased`, and a problem", async () => {
    const library = join(tmp, "library");
    await makeSkillDir(library, "huashu-nuwa");
    const lib = [libSkill("huashu-nuwa", join(library, "huashu-nuwa"))];

    const surface = join(tmp, "surface");
    await mkdir(surface, { recursive: true });
    // deployed under the WRONG name `nuwa`, pointing at library/huashu-nuwa
    await symlink(join(library, "huashu-nuwa"), join(surface, "nuwa"));
    // control: a correctly-named link
    await symlink(join(library, "huashu-nuwa"), join(surface, "huashu-nuwa"));

    const report = await inventoryDeployments([surface], library, lib);
    const aliased = report.sites.find((s) => s.name === "nuwa");
    const correct = report.sites.find((s) => s.name === "huashu-nuwa");

    expect(aliased!.kind).toBe("aliased");
    expect(correct!.kind).toBe("linked");
    // the aliased link must surface as a problem (was invisible before)
    expect(report.problems.some((s) => s.name === "nuwa")).toBe(true);
    expect(report.problems.some((s) => s.name === "huashu-nuwa")).toBe(false);
  });

  test("deploying a LINK-SHELVED library skill is `linked`, not a 2nd-source foreign-link", async () => {
    // External dev repo holds the real skill; library/cairn link-shelves to it.
    const ext = join(tmp, "ext");
    const extSkill = await makeSkillDir(ext, "cairn");
    const library = join(tmp, "library");
    await mkdir(library, { recursive: true });
    await symlink(extSkill, join(library, "cairn")); // library/cairn -> ext/cairn
    const lib = [libSkill("cairn", join(library, "cairn"))];

    // A deployment symlink into the library entry (which itself shelves out).
    const surface = join(tmp, "surface");
    await mkdir(surface, { recursive: true });
    await symlink(join(library, "cairn"), join(surface, "cairn"));

    const report = await inventoryDeployments([surface], library, lib);
    const site = report.sites.find((s) => s.name === "cairn");
    expect(site!.kind).toBe("linked"); // not "foreign-link"
    expect(report.problems.some((s) => s.name === "cairn")).toBe(false);
  });
});
