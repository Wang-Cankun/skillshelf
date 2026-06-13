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
