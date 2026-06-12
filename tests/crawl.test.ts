// Crawl rule coverage (docs/ARCHITECTURE.md §6): realpath-dedupe, bridge-mirror,
// _retired tagging, node_modules-ignore, and BOTH layouts
// (<root>/<name>/SKILL.md and <root>/skills/<name>/SKILL.md).

import { afterAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { crawl, expandProjectRoots } from "../src/core/crawl.ts";

const tmps: string[] = [];
afterAll(async () => {
  for (const t of tmps) await rm(t, { recursive: true, force: true });
});

async function scratch(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), "skl-crawl-"));
  tmps.push(d);
  return d;
}

async function skill(dir: string, name: string, domains: string[], extra?: { ref?: boolean }) {
  const sd = join(dir, name);
  await mkdir(sd, { recursive: true });
  await writeFile(
    join(sd, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${name} desc\ndomains: [${domains.join(", ")}]\n---\n# ${name}\nbody of ${name}\n`,
  );
  if (extra?.ref) {
    await writeFile(join(sd, "notes.md"), "reference content");
  }
  return sd;
}

describe("crawl rules", () => {
  test("both layouts: name/SKILL.md AND skills/name/SKILL.md", async () => {
    const root = await scratch();
    // layout A: <root>/<name>/SKILL.md
    await skill(root, "flat-skill", ["coding"]);
    // layout B: <root>/skills/<name>/SKILL.md
    await mkdir(join(root, "skills"), { recursive: true });
    await skill(join(root, "skills"), "nested-skill", ["writing"]);

    const { skills } = await crawl([root]);
    const names = skills.map((s) => s.name).sort();
    expect(names).toEqual(["flat-skill", "nested-skill"]);
  });

  test("realpath-dedupe collapses aliased roots AND aliased skill dirs", async () => {
    const root = await scratch();
    await skill(root, "alpha", ["a"]);
    // Symlink the whole root to a second name; crawling both must not double count.
    const alias = root + "-alias";
    await symlink(root, alias);
    tmps.push(alias);

    const { skills, dedupedRoots } = await crawl([root, alias]);
    expect(skills.filter((s) => s.name === "alpha").length).toBe(1);
    expect(dedupedRoots.length).toBe(1);
  });

  test("aliased skill dir inside one root collapses by realpath", async () => {
    const root = await scratch();
    const real = await skill(root, "beta", ["b"]);
    // a sibling symlink dir pointing at the same skill dir
    await symlink(real, join(root, "beta-link"));
    const { skills } = await crawl([root]);
    expect(skills.filter((s) => s.name === "beta").length).toBe(1);
  });

  test("bridge mirror: .agents/skills entries get mirrorOf set, not double-counted as canonical", async () => {
    const root = await scratch();
    // canonical .claude/skills/commit
    await mkdir(join(root, ".claude", "skills"), { recursive: true });
    const canonical = await skill(join(root, ".claude", "skills"), "commit", ["coding"]);
    // bridge mirror under .agents/skills/commit
    await mkdir(join(root, ".agents", "skills"), { recursive: true });
    await skill(join(root, ".agents", "skills"), "commit", ["coding"]);

    const { skills } = await crawl([root]);
    const copies = skills.filter((s) => s.name === "commit");
    expect(copies.length).toBe(2);
    const mirror = copies.find((s) => s.mirrorOf);
    const canon = copies.find((s) => !s.mirrorOf);
    expect(mirror).toBeDefined();
    expect(canon).toBeDefined();
    // mirrorOf points at the canonical (.claude) skill dir
    expect(mirror!.mirrorOf).toBe(canonical);
  });

  test("_retired/ skills are tagged retired", async () => {
    const root = await scratch();
    await skill(root, "active-one", ["x"]);
    await mkdir(join(root, "_retired"), { recursive: true });
    await skill(join(root, "_retired"), "dead-one", ["x"]);

    const { skills } = await crawl([root]);
    const dead = skills.find((s) => s.name === "dead-one");
    const live = skills.find((s) => s.name === "active-one");
    expect(dead?.retired).toBe(true);
    expect(live?.retired).toBe(false);
  });

  test("node_modules paths are ignored entirely", async () => {
    const root = await scratch();
    await skill(root, "real-skill", ["x"]);
    await mkdir(join(root, "node_modules", "pkg"), { recursive: true });
    await skill(join(root, "node_modules", "pkg"), "vendored-skill", ["x"]);

    const { skills } = await crawl([root]);
    const names = skills.map((s) => s.name);
    expect(names).toContain("real-skill");
    expect(names).not.toContain("vendored-skill");
  });

  test("refFiles list bundled files, excluding SKILL.md / overlay / lock", async () => {
    const root = await scratch();
    const sd = await skill(root, "withref", ["x"], { ref: true });
    await writeFile(join(sd, "withref.shelf.json"), "{}");
    await writeFile(join(sd, "shelf.lock.json"), "{}");
    const { skills } = await crawl([root]);
    const s = skills.find((x) => x.name === "withref")!;
    expect(s.refFiles.map((f) => f.split("/").pop())).toEqual(["notes.md"]);
  });

  test("expandProjectRoots finds .claude/skills, .agents/skills, skills, skill", async () => {
    const parent = await scratch();
    const proj = join(parent, "proj");
    for (const sub of [".claude/skills", ".agents/skills", "skills", "skill"]) {
      await mkdir(join(proj, sub), { recursive: true });
    }
    const roots = await expandProjectRoots(parent);
    expect(roots.length).toBe(4);
    expect(roots.some((r) => r.endsWith("/.claude/skills"))).toBe(true);
    expect(roots.some((r) => r.endsWith("/skill"))).toBe(true);
  });
});
