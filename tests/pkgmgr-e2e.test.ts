// End-to-end package-manager test for the add/update network paths — run fully
// OFFLINE against a real on-disk "upstream" git repo. This exercises the parts
// that normally hit github.com (clone, ref capture, re-pull, 3-way divergence)
// without any network by using the `git` channel (`git clone` of a local path).
//
// What is covered:
//   1. `skl add <local-git-repo>` installs the skill, records source+ref+
//      installedHash in the lockfile, and creates the overlay sidecar.
//   2. A normal upstream move (new commit changing the body) is re-pulled by
//      `skl update` WITHOUT being falsely blocked, and the overlay is preserved.
//   3. A LOCAL hand-edit makes `skl update` report "diverged" and the local edit
//      is NOT clobbered; `skl update --force` then overwrites it.

import { test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";

import * as addCmd from "../src/commands/add.ts";
import * as updateCmd from "../src/commands/update.ts";
import { readLockfile } from "../src/core/provenance.ts";
import { runCmd } from "./helpers.ts";

// ---- offline git fixture plumbing -----------------------------------------

let workRoot: string; // holds upstream repo + library, cleaned each test
let upstream: string; // the "upstream" git repo on disk
let library: string; // an empty skillshelf library

/** Run a git command in `cwd`; throw on failure so fixture setup is loud. */
async function git(cwd: string, ...args: string[]): Promise<void> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    // Deterministic, hermetic identity/config so the test never depends on the
    // host's global git config.
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
  if (code !== 0) {
    throw new Error(`git ${args.join(" ")} failed (exit ${code}): ${stderr.trim()}`);
  }
}

function skillMd(body: string): string {
  return [
    "---",
    "name: e2e-demo",
    "description: A demo skill used by the offline package-manager e2e test.",
    "domains: [demo]",
    "---",
    "",
    "# e2e-demo",
    "",
    body,
    "",
  ].join("\n");
}

async function commitUpstream(message: string): Promise<void> {
  await git(upstream, "add", "-A");
  await git(upstream, "commit", "-m", message);
}

beforeEach(async () => {
  workRoot = await mkdtemp(join(tmpdir(), "skl-pkgmgr-e2e-"));
  upstream = join(workRoot, "upstream");
  library = join(workRoot, "library");
  await mkdir(upstream, { recursive: true });
  await mkdir(library, { recursive: true });

  // Build a valid skill in the upstream repo: SKILL.md + a reference file.
  await writeFile(join(upstream, "SKILL.md"), skillMd("Original upstream body, version 1."));
  await writeFile(join(upstream, "reference.md"), "# Reference\n\nupstream reference v1\n");

  await git(upstream, "init", "-q", "-b", "main");
  await commitUpstream("initial skill");
});

afterEach(async () => {
  await rm(workRoot, { recursive: true, force: true });
});

// ---- the test -------------------------------------------------------------

test("add rejects a path-traversal name from untrusted upstream frontmatter", async () => {
  // A hostile third-party skill that tries to escape the library via its
  // frontmatter `name`. add derives the destination slug from this value, so it
  // MUST be slug-validated before being joined into a library path.
  const evil = join(workRoot, "evil-upstream");
  await mkdir(evil, { recursive: true });
  await writeFile(
    join(evil, "SKILL.md"),
    ["---", "name: ../../escaped", "description: hostile skill", "---", "", "# pwn", ""].join("\n"),
  );
  await git(evil, "init", "-q", "-b", "main");
  await git(evil, "add", "-A");
  await git(evil, "commit", "-m", "hostile");

  const add = await runCmd(addCmd, [evil, "--no-infer", "--json"], { library });
  expect(add.code).toBe(1);
  expect(add.err).toContain("invalid skill name");
  // Nothing was written outside the library.
  expect(existsSync(join(workRoot, "escaped"))).toBe(false);

  // An explicit --name override with a traversal payload is rejected the same way.
  const add2 = await runCmd(addCmd, [evil, "--name", "../../escaped", "--no-infer", "--json"], {
    library,
  });
  expect(add2.code).toBe(1);
  expect(add2.err).toContain("invalid skill name");
  expect(existsSync(join(workRoot, "escaped"))).toBe(false);
});

test("offline e2e: add from local git repo, then upstream-move + local-divergence update", async () => {
  // ----- 1. skl add <local git path> --------------------------------------
  const add = await runCmd(addCmd, [upstream, "--no-infer", "--json"], { library });
  expect(add.code).toBe(0);

  const destDir = join(library, "e2e-demo");
  expect(existsSync(join(destDir, "SKILL.md"))).toBe(true);
  // Reference file came along.
  expect(existsSync(join(destDir, "reference.md"))).toBe(true);
  // Overlay sidecar created.
  expect(existsSync(join(destDir, "e2e-demo.shelf.json"))).toBe(true);
  // Upstream .git must NOT be copied into the library.
  expect(existsSync(join(destDir, ".git"))).toBe(false);

  // Lockfile records source + ref + installedHash.
  const lock1 = await readLockfile(library);
  const entry1 = lock1.entries["e2e-demo"];
  expect(entry1).toBeDefined();
  expect(entry1!.channel).toBe("git");
  expect(entry1!.source.startsWith("git:")).toBe(true);
  expect(entry1!.source).toContain(upstream);
  expect(entry1!.ref).toMatch(/^[0-9a-f]{40}$/); // real commit SHA
  expect(typeof entry1!.installedHash).toBe("string");
  expect(entry1!.installedHash!.length).toBeGreaterThan(0);
  expect(entry1!.localEdits).toBe(false);

  // Installed body matches upstream v1.
  expect(await readFile(join(destDir, "SKILL.md"), "utf8")).toContain(
    "Original upstream body, version 1.",
  );

  // Stamp the overlay so we can prove it survives updates.
  const overlayPath = join(destDir, "e2e-demo.shelf.json");
  await writeFile(
    overlayPath,
    JSON.stringify({ domains: ["demo", "curated"], notes: "human-curated overlay" }, null, 2),
  );

  // ----- 2. upstream moves forward -> update re-pulls (NOT falsely blocked) -
  await writeFile(join(upstream, "SKILL.md"), skillMd("Upstream body, VERSION 2 (moved forward)."));
  await writeFile(join(upstream, "reference.md"), "# Reference\n\nupstream reference v2\n");
  await commitUpstream("upstream body change v2");

  const upd2 = await runCmd(updateCmd, ["e2e-demo", "--json"], { library });
  expect(upd2.code).toBe(0); // clean update, no divergence
  const report2 = upd2.json[0] as { updated: number; diverged: number; results: { outcome: string }[] };
  expect(report2.updated).toBe(1);
  expect(report2.diverged).toBe(0);
  expect(report2.results[0]!.outcome).toBe("updated");

  // Body was re-pulled.
  const bodyAfterUpstreamMove = await readFile(join(destDir, "SKILL.md"), "utf8");
  expect(bodyAfterUpstreamMove).toContain("VERSION 2 (moved forward)");
  expect(bodyAfterUpstreamMove).not.toContain("version 1.");
  // Reference file refreshed too.
  expect(await readFile(join(destDir, "reference.md"), "utf8")).toContain("reference v2");
  // Overlay PRESERVED across the update.
  expect(await readFile(overlayPath, "utf8")).toContain("human-curated overlay");

  // Lockfile advanced ref + new installedHash.
  const lock2 = await readLockfile(library);
  const entry2 = lock2.entries["e2e-demo"]!;
  expect(entry2.ref).not.toBe(entry1!.ref);
  expect(entry2.installedHash).not.toBe(entry1!.installedHash);

  // ----- 3. local hand-edit -> divergence detected, NOT clobbered ----------
  const handEditedBody = skillMd("LOCALLY hand-edited body — must not be clobbered.");
  await writeFile(join(destDir, "SKILL.md"), handEditedBody);

  // No new upstream commit: upstream still at v2, but local body now differs
  // from installedHash => genuine user edit => protected.
  const upd3 = await runCmd(updateCmd, ["e2e-demo", "--json"], { library });
  expect(upd3.code).toBe(2); // diverged exit code
  const report3 = upd3.json[0] as { updated: number; diverged: number; results: { outcome: string; diff?: string }[] };
  expect(report3.diverged).toBe(1);
  expect(report3.updated).toBe(0);
  expect(report3.results[0]!.outcome).toBe("diverged");

  // Local edit was NOT overwritten.
  expect(await readFile(join(destDir, "SKILL.md"), "utf8")).toContain(
    "LOCALLY hand-edited body — must not be clobbered.",
  );

  // ----- 3b. --force overwrites the diverged local body -------------------
  const upd4 = await runCmd(updateCmd, ["e2e-demo", "--force", "--json"], { library });
  expect(upd4.code).toBe(0);
  const report4 = upd4.json[0] as { updated: number; diverged: number; results: { outcome: string }[] };
  expect(report4.updated).toBe(1);
  expect(report4.diverged).toBe(0);
  expect(report4.results[0]!.outcome).toBe("updated");

  // Force re-pulled upstream v2, discarding the local edit.
  const bodyAfterForce = await readFile(join(destDir, "SKILL.md"), "utf8");
  expect(bodyAfterForce).toContain("VERSION 2 (moved forward)");
  expect(bodyAfterForce).not.toContain("hand-edited body");
  // Overlay still preserved after force.
  expect(await readFile(overlayPath, "utf8")).toContain("human-curated overlay");
});
