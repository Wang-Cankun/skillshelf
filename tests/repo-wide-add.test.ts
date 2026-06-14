// Repo-wide `skl add` (ADR-0006): discover + install a whole repo (or a subset) in
// ONE clone. Two layers, both fully OFFLINE:
//   - discoverSkills() unit tests over plain on-disk dir trees (no git, no network).
//   - `skl add` integration tests over a real local git repo via the `git:` channel
//     (`git clone` of a filesystem path), in a HOME/library-isolated sandbox so the
//     library lives in a tempdir and nothing touches the real machine.

import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdtemp, rm, mkdir, writeFile, readFile, symlink, realpath } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";

import * as addCmd from "../src/commands/add.ts";
import { discoverSkills } from "../src/core/fetch.ts";
import { readLockfile } from "../src/core/provenance.ts";
import { runCmd } from "./helpers.ts";

// ---- fixture plumbing ------------------------------------------------------

function skillMd(name: string, desc: string, body = "body"): string {
  return ["---", `name: ${name}`, `description: ${desc}`, "---", "", `# ${name}`, "", body, ""].join("\n");
}

async function writeSkill(dir: string, name: string, desc: string, body = "body"): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "SKILL.md"), skillMd(name, desc, body));
}

/** Run a git command in `cwd`; throw on failure so fixture setup is loud. Hermetic. */
async function git(cwd: string, ...args: string[]): Promise<void> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "skillshelf-test",
      GIT_AUTHOR_EMAIL: "test@example.invalid",
      GIT_COMMITTER_NAME: "skillshelf-test",
      GIT_COMMITTER_EMAIL: "test@example.invalid",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_SYSTEM: "/dev/null",
    },
  });
  const [, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  if (code !== 0) throw new Error(`git ${args.join(" ")} failed (exit ${code}): ${stderr.trim()}`);
}

async function initRepo(dir: string): Promise<void> {
  await git(dir, "init", "-q", "-b", "main");
  await git(dir, "add", "-A");
  await git(dir, "commit", "-q", "-m", "fixture");
}

// ===========================================================================
// discoverSkills() — pure, over plain dir trees (no git needed)
// ===========================================================================

describe("discoverSkills (convention walk)", () => {
  let root: string;
  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), "skl-disco-")));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("flat skills/<name>/SKILL.md", async () => {
    await writeSkill(join(root, "skills", "alpha"), "alpha", "Alpha skill");
    await writeSkill(join(root, "skills", "bravo"), "bravo", "Bravo skill");
    const found = await discoverSkills(root);
    expect(found.map((d) => d.name).sort()).toEqual(["alpha", "bravo"]);
    expect(found.find((d) => d.name === "alpha")!.subpath).toBe("skills/alpha");
    expect(found.find((d) => d.name === "alpha")!.description).toBe("Alpha skill");
  });

  test("catalog skills/<cat>/<name>/SKILL.md (depth-2)", async () => {
    await writeSkill(join(root, "skills", "alpha"), "alpha", "Alpha skill"); // flat
    await writeSkill(join(root, "skills", "group", "charlie"), "charlie", "Charlie skill"); // catalog
    const found = await discoverSkills(root);
    expect(found.map((d) => d.name).sort()).toEqual(["alpha", "charlie"]);
    expect(found.find((d) => d.name === "charlie")!.subpath).toBe("skills/group/charlie");
  });

  test("recursive fallback for oddly-nested repos (no conventional container)", async () => {
    await writeSkill(join(root, "pkg", "a", "deep", "delta"), "delta", "Delta skill");
    const found = await discoverSkills(root);
    expect(found.map((d) => d.name)).toEqual(["delta"]);
    expect(found[0]!.subpath).toBe("pkg/a/deep/delta");
  });

  test("root itself is the skill (subpath empty)", async () => {
    await writeSkill(root, "solo", "Solo skill");
    const found = await discoverSkills(root);
    expect(found.map((d) => d.name)).toEqual(["solo"]);
    expect(found[0]!.subpath).toBe("");
  });

  test("validity gate: a SKILL.md missing description is skipped in the walk", async () => {
    await writeSkill(join(root, "skills", "alpha"), "alpha", "Alpha skill");
    // a template stub with name but no description -> not a discovered skill
    await mkdir(join(root, "skills", "stub"), { recursive: true });
    await writeFile(join(root, "skills", "stub", "SKILL.md"), "---\nname: stub\n---\n\nstub\n");
    const found = await discoverSkills(root);
    expect(found.map((d) => d.name)).toEqual(["alpha"]);
  });

  test("explicit subpath pointer is lenient (installs even without description)", async () => {
    await mkdir(join(root, "skills", "stub"), { recursive: true });
    await writeFile(join(root, "skills", "stub", "SKILL.md"), "---\nname: stub\n---\n\nstub\n");
    const found = await discoverSkills(root, "skills/stub");
    expect(found.map((d) => d.name)).toEqual(["stub"]);
    expect(found[0]!.subpath).toBe("skills/stub");
  });

  test("prunes node_modules / dist while walking", async () => {
    // Deeply nested → exercises the recursive fallback, which is where childDirs'
    // skip-set actually applies.
    await writeSkill(join(root, "a", "b", "c", "real"), "real", "Real skill");
    await writeSkill(join(root, "node_modules", "x", "skills", "nope"), "nope", "Should be skipped");
    await writeSkill(join(root, "dist", "built"), "built", "Should be skipped");
    const found = await discoverSkills(root);
    expect(found.map((d) => d.name)).toEqual(["real"]);
  });

  test("recursive fallback descends into allowed dot-dirs (.claude/skills/<name>)", async () => {
    await writeSkill(join(root, ".claude", "skills", "clawed"), "clawed", "Allowed dot-dir");
    const found = await discoverSkills(root);
    expect(found.map((d) => d.name)).toEqual(["clawed"]);
  });

  test("subpath scoping limits discovery to that subtree", async () => {
    await writeSkill(join(root, "skills", "alpha"), "alpha", "Alpha skill");
    await writeSkill(join(root, "other", "bravo"), "bravo", "Bravo skill");
    const found = await discoverSkills(root, "other");
    expect(found.map((d) => d.name)).toEqual(["bravo"]);
  });

  test("missing root → empty", async () => {
    expect(await discoverSkills(join(root, "nope"))).toEqual([]);
  });
});

// ===========================================================================
// `skl add` repo-wide — integration over a local git repo (git: channel)
// ===========================================================================

describe("skl add — repo-wide (offline git: channel)", () => {
  let work: string;
  let repo: string; // the multi-skill upstream repo
  let library: string;
  let home: string;
  let gitSrc: string;

  beforeEach(async () => {
    work = await realpath(await mkdtemp(join(tmpdir(), "skl-rwadd-")));
    repo = join(work, "repo");
    library = join(work, "library");
    home = join(work, "home");
    await mkdir(library, { recursive: true });
    await mkdir(home, { recursive: true });
    // 3 skills: 2 flat + 1 catalog.
    await writeSkill(join(repo, "skills", "alpha"), "alpha", "Alpha skill", "ALPHA v1");
    await writeSkill(join(repo, "skills", "bravo"), "bravo", "Bravo skill", "BRAVO v1");
    await writeSkill(join(repo, "skills", "group", "charlie"), "charlie", "Charlie skill", "CHARLIE v1");
    await initRepo(repo);
    gitSrc = `git:${repo}`;
  });
  afterEach(async () => {
    await rm(work, { recursive: true, force: true });
  });

  const env = (): NodeJS.ProcessEnv => ({ HOME: home, SKILLSHELF_CONFIG: join(home, "config.json") });

  test("--list discovers all, writes nothing", async () => {
    const r = await runCmd(addCmd, [gitSrc, "--list", "--json"], { library, env: env() });
    expect(r.code).toBe(0);
    const out = r.json[0] as { action: string; count: number; skills: { name: string; subpath: string; inLibrary: boolean }[] };
    expect(out.action).toBe("list");
    expect(out.count).toBe(3);
    expect(out.skills.map((s) => s.name).sort()).toEqual(["alpha", "bravo", "charlie"]);
    expect(out.skills.every((s) => s.inLibrary === false)).toBe(true);
    // No writes.
    expect(existsSync(join(library, "alpha"))).toBe(false);
    expect(existsSync(join(library, "shelf.lock.json"))).toBe(false);
  });

  test("--all installs every skill: N lockfile entries sharing one ref", async () => {
    const r = await runCmd(addCmd, [gitSrc, "--all", "--no-infer", "--json"], { library, env: env() });
    expect(r.code).toBe(0);
    const out = r.json[0] as { counts: { installed: number }; results: { name: string; status: string }[] };
    expect(out.counts.installed).toBe(3);

    for (const name of ["alpha", "bravo", "charlie"]) {
      expect(existsSync(join(library, name, "SKILL.md"))).toBe(true);
      expect(existsSync(join(library, name, ".git"))).toBe(false); // upstream .git not copied
    }
    const lock = await readLockfile(library);
    expect(Object.keys(lock.entries).sort()).toEqual(["alpha", "bravo", "charlie"]);
    // One clone → all entries share the same commit SHA.
    const refs = new Set(Object.values(lock.entries).map((e) => e.ref));
    expect(refs.size).toBe(1);
    expect([...refs][0]).toMatch(/^[0-9a-f]{40}$/);
    // Per-skill source carries each skill's own subpath.
    expect(lock.entries["alpha"]!.source).toBe(`git:${repo}#skills/alpha`);
    expect(lock.entries["charlie"]!.source).toBe(`git:${repo}#skills/group/charlie`);
    expect(typeof lock.entries["alpha"]!.installedHash).toBe("string");
  });

  test("--skill filter installs only the named subset", async () => {
    const r = await runCmd(addCmd, [gitSrc, "--skill", "alpha,charlie", "--no-infer", "--json"], { library, env: env() });
    expect(r.code).toBe(0);
    expect(existsSync(join(library, "alpha"))).toBe(true);
    expect(existsSync(join(library, "charlie"))).toBe(true);
    expect(existsSync(join(library, "bravo"))).toBe(false);
    expect(Object.keys((await readLockfile(library)).entries).sort()).toEqual(["alpha", "charlie"]);
  });

  test("--skill with an unknown name errors and writes nothing", async () => {
    const r = await runCmd(addCmd, [gitSrc, "--skill", "nope", "--no-infer", "--json"], { library, env: env() });
    expect(r.code).toBe(1);
    expect(r.err).toContain("not found");
    expect(existsSync(join(library, "shelf.lock.json"))).toBe(false);
  });

  test("bare repo with several skills errors (never silently picks one)", async () => {
    const r = await runCmd(addCmd, [gitSrc, "--no-infer", "--json"], { library, env: env() });
    expect(r.code).toBe(1);
    expect(r.err).toContain("3 skills found");
    expect(existsSync(join(library, "alpha"))).toBe(false);
  });

  test("--all and --skill are mutually exclusive", async () => {
    const r = await runCmd(addCmd, [gitSrc, "--all", "--skill", "alpha"], { library, env: env() });
    expect(r.code).toBe(1);
    expect(r.err).toContain("mutually exclusive");
  });

  test("single-skill via explicit subpath is unchanged (legacy summary)", async () => {
    const r = await runCmd(addCmd, [`git:${repo}#skills/alpha`, "--no-infer", "--json"], { library, env: env() });
    expect(r.code).toBe(0);
    const out = r.json[0] as { name: string; path: string; source: string; channel: string };
    expect(out.name).toBe("alpha");
    expect(out.source).toBe(`git:${repo}#skills/alpha`);
    expect(out.channel).toBe("git");
    expect(existsSync(join(library, "alpha", "SKILL.md"))).toBe(true);
    expect(existsSync(join(library, "bravo"))).toBe(false);
    // Re-adding without --force errors (legacy behavior preserved).
    const again = await runCmd(addCmd, [`git:${repo}#skills/alpha`, "--no-infer", "--json"], { library, env: env() });
    expect(again.code).toBe(1);
    expect(again.err).toContain("already exists");
  });

  test("--dry-run reports new / identical / differs without writing", async () => {
    // Install all first.
    await runCmd(addCmd, [gitSrc, "--all", "--no-infer", "--json"], { library, env: env() });
    // Mutate one library copy's body → differs; remove one → new; leave one → identical.
    await writeFile(join(library, "bravo", "SKILL.md"), skillMd("bravo", "Bravo skill", "LOCALLY EDITED"));
    await rm(join(library, "charlie"), { recursive: true, force: true });

    const r = await runCmd(addCmd, [gitSrc, "--all", "--dry-run", "--no-infer", "--json"], { library, env: env() });
    expect(r.code).toBe(0);
    const out = r.json[0] as { action: string; counts: Record<string, number>; skills: { name: string; verdict: string; willInstall: boolean; needsForce: boolean }[] };
    expect(out.action).toBe("dry-run");
    const byName = Object.fromEntries(out.skills.map((s) => [s.name, s]));
    expect(byName["alpha"]!.verdict).toBe("identical");
    expect(byName["bravo"]!.verdict).toBe("differs");
    expect(byName["bravo"]!.needsForce).toBe(true);
    expect(byName["charlie"]!.verdict).toBe("new");
    expect(out.counts.identical).toBe(1);
    expect(out.counts.differs).toBe(1);
    expect(out.counts.new).toBe(1);
    // Dry-run wrote nothing: the local edit survives.
    expect(await readFile(join(library, "bravo", "SKILL.md"), "utf8")).toContain("LOCALLY EDITED");
  });

  test("--all skips a differing skill without --force, --force overwrites it", async () => {
    await runCmd(addCmd, [gitSrc, "--all", "--no-infer", "--json"], { library, env: env() });
    await writeFile(join(library, "bravo", "SKILL.md"), skillMd("bravo", "Bravo skill", "LOCALLY EDITED"));

    const skip = await runCmd(addCmd, [gitSrc, "--all", "--no-infer", "--json"], { library, env: env() });
    expect(skip.code).toBe(0);
    const sOut = skip.json[0] as { counts: { installed: number; skipped: number }; results: { name: string; status: string; verdict: string }[] };
    expect(sOut.counts.skipped).toBe(1);
    const bravoRow = sOut.results.find((r) => r.name === "bravo")!;
    expect(bravoRow.status).toBe("skipped");
    expect(bravoRow.verdict).toBe("differs");
    // local edit NOT clobbered.
    expect(await readFile(join(library, "bravo", "SKILL.md"), "utf8")).toContain("LOCALLY EDITED");

    const force = await runCmd(addCmd, [gitSrc, "--all", "--force", "--no-infer", "--json"], { library, env: env() });
    expect(force.code).toBe(0);
    expect(await readFile(join(library, "bravo", "SKILL.md"), "utf8")).toContain("BRAVO v1");
  });

  test("path-traversal name in --all is rejected; nothing escapes the library", async () => {
    const evil = join(work, "evil");
    await writeSkill(join(evil, "skills", "good"), "good", "Good skill");
    // hostile frontmatter name trying to escape the library
    await mkdir(join(evil, "skills", "bad"), { recursive: true });
    await writeFile(join(evil, "skills", "bad", "SKILL.md"), skillMd("../../escaped", "Hostile skill"));
    await initRepo(evil);

    const r = await runCmd(addCmd, [`git:${evil}`, "--all", "--no-infer", "--json"], { library, env: env() });
    // The good skill installs; the hostile one is an error outcome (exit 1).
    expect(r.code).toBe(1);
    const out = r.json[0] as { results: { name: string; status: string; reason: string }[] };
    const bad = out.results.find((x) => x.name === "../../escaped")!;
    expect(bad.status).toBe("error");
    expect(bad.reason).toContain("invalid skill name");
    expect(existsSync(join(library, "good"))).toBe(true);
    // Nothing was written outside the library.
    expect(existsSync(join(work, "escaped"))).toBe(false);
    expect(existsSync(join(library, "..", "escaped"))).toBe(false);
  });

  test("--all never writes THROUGH a symlinked (linked) library entry", async () => {
    await runCmd(addCmd, [gitSrc, "--all", "--no-infer", "--json"], { library, env: env() });
    // Convert library/alpha into a LINKED entry pointing at an external dev repo.
    const devRepo = join(work, "dev-alpha");
    await writeSkill(devRepo, "alpha", "Alpha skill", "DEV REPO BODY");
    await rm(join(library, "alpha"), { recursive: true, force: true });
    await symlink(devRepo, join(library, "alpha"));

    const r = await runCmd(addCmd, [gitSrc, "--all", "--force", "--no-infer", "--json"], { library, env: env() });
    expect(r.code).toBe(0);
    const out = r.json[0] as { results: { name: string; status: string; reason: string }[] };
    const alphaRow = out.results.find((x) => x.name === "alpha")!;
    expect(alphaRow.status).toBe("skipped");
    expect(alphaRow.reason).toContain("linked");
    // The dev repo body was NOT clobbered through the symlink.
    expect(await readFile(join(devRepo, "SKILL.md"), "utf8")).toContain("DEV REPO BODY");
  });
});
