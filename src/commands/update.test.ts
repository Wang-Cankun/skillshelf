import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "./update.ts";
import type { Ctx } from "../types.ts";

function makeCtx(libraryPath: string) {
  const logs: string[] = [];
  const errors: string[] = [];
  const json: unknown[] = [];
  const ctx = {
    config: { libraryPath },
    libraryPath,
    log: (...a: unknown[]) => logs.push(a.join(" ")),
    error: (...a: unknown[]) => errors.push(a.join(" ")),
    json: (v: unknown) => json.push(v),
  } as unknown as Ctx;
  return { ctx, logs, errors, json };
}

describe("skl update — LINKED entries are skipped (ADR-0004 safety)", () => {
  let tmp: string;
  let library: string;
  let devRepo: string;

  beforeEach(async () => {
    tmp = await realpath(await mkdtemp(join(tmpdir(), "skl-update-")));
    library = join(tmp, "library");
    devRepo = join(tmp, "dev", "devskill");
    await mkdir(library, { recursive: true });
    await mkdir(devRepo, { recursive: true });
    // The dev repo's canonical body — must NOT be clobbered by update.
    await writeFile(join(devRepo, "SKILL.md"), "---\nname: devskill\n---\n\nDEV REPO BODY v1\n");
    // library/devskill is a LINKED entry (symlink to the dev repo).
    await symlink(devRepo, join(library, "devskill"));
    // A STALE lockfile entry — as if devskill had once been a github import.
    const lock = {
      version: 1,
      entries: {
        devskill: {
          name: "devskill",
          source: "github:owner/repo",
          ref: "0000000000000000000000000000000000000000",
          channel: "github",
          installedAt: "2020-01-01T00:00:00.000Z",
          localEdits: false,
        },
      },
    };
    await writeFile(join(library, "shelf.lock.json"), JSON.stringify(lock, null, 2));
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("does not pull upstream into a LINKED dev repo", async () => {
    const { ctx, json } = makeCtx(library);
    const code = await run(["devskill", "--json"], ctx);

    expect(code).toBe(0); // skipped is not an error
    const report = json[0] as { results: Array<{ name: string; outcome: string; note: string }> };
    const row = report.results.find((r) => r.name === "devskill")!;
    expect(row.outcome).toBe("skipped");
    expect(row.note).toContain("LINKED");

    // The dev repo body is untouched — update never followed the symlink.
    const body = await readFile(join(devRepo, "SKILL.md"), "utf8");
    expect(body).toContain("DEV REPO BODY v1");
  });
});

import { existsSync } from "node:fs";
import { fetchRepo } from "../core/fetch.ts";
import { run as runAdd } from "./add.ts";

async function git(cwd: string, args: string[]): Promise<void> {
  const p = Bun.spawn(["git", ...args], {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@t",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@t",
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  await p.exited;
}

// One runnable check covering BOTH ADR-0013 structural behaviors over a real local
// git repo (git: channel, offline): rename-follow (relocatedFrom) + orphan surfacing.
describe("skl update — ADR-0013 reconcile (rename-follow + orphan)", () => {
  let tmp: string;
  let library: string;
  let upstream: string;

  beforeEach(async () => {
    tmp = await realpath(await mkdtemp(join(tmpdir(), "skl-reco-")));
    library = join(tmp, "library");
    upstream = join(tmp, "upstream");
    await mkdir(library, { recursive: true });
    await mkdir(join(upstream, "skills", "foo"), { recursive: true });
    await mkdir(join(upstream, "skills", "keep"), { recursive: true });
    await writeFile(
      join(upstream, "skills", "foo", "SKILL.md"),
      "---\nname: foo\ndescription: foo skill\n---\n\nFOO BODY\n",
    );
    await writeFile(
      join(upstream, "skills", "keep", "SKILL.md"),
      "---\nname: keep\ndescription: keep skill\n---\n\nKEEP BODY\n",
    );
    await git(upstream, ["init", "-q"]);
    await git(upstream, ["add", "-A"]);
    await git(upstream, ["commit", "-q", "-m", "init"]);
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("follows a rename and orphans a removed skill (library copy kept)", async () => {
    if (!(await fetchRepo({ channel: "git", source: `git:${upstream}`, subpath: "", localPath: upstream, raw: upstream } as never)).ok) {
      return; // git unavailable — skip silently
    }
    // Install foo (skills/foo) and keep (skills/keep) from the local git repo.
    const addCtx1 = makeCtx(library);
    await runAdd([`git:${upstream}#skills/foo`, "--json"], addCtx1.ctx);
    const addCtx2 = makeCtx(library);
    await runAdd([`git:${upstream}#skills/keep`, "--json"], addCtx2.ctx);
    expect(existsSync(join(library, "foo", "SKILL.md"))).toBe(true);
    expect(existsSync(join(library, "keep", "SKILL.md"))).toBe(true);

    // Upstream restructures: rename foo's dir; remove keep entirely.
    await git(upstream, ["mv", "skills/foo", "skills/bar"]);
    await git(upstream, ["rm", "-r", "-q", "skills/keep"]);
    await git(upstream, ["commit", "-q", "-m", "restructure"]);

    const { ctx, json } = makeCtx(library);
    const code = await run(["--json"], ctx);

    const report = json[0] as {
      orphaned: number;
      results: Array<{ name: string; outcome: string; source: string; relocatedFrom?: string }>;
      newAvailable: Array<{ repo: string; names: string[] }>;
    };

    // foo was renamed skills/foo → skills/bar: relocatedFrom set, body unchanged.
    const foo = report.results.find((r) => r.name === "foo")!;
    expect(foo.relocatedFrom).toBeDefined();
    expect(["updated", "uptodate"]).toContain(foo.outcome);
    expect(foo.source).toContain("skills/bar");

    // keep was removed with no name match → orphaned, library copy still on disk.
    const keep = report.results.find((r) => r.name === "keep")!;
    expect(keep.outcome).toBe("orphaned");
    expect(existsSync(join(library, "keep", "SKILL.md"))).toBe(true);
    expect(report.orphaned).toBeGreaterThanOrEqual(1);

    // newAvailable is shallow-checked: it's an array (bar is tracked, so empty here).
    expect(Array.isArray(report.newAvailable)).toBe(true);

    // orphaned does not flip the exit code (non-destructive surfacing).
    expect(code).toBe(0);
  });

  // Regression: a single positional name must scope to THAT skill. The --repo
  // arg-parse must not eat argv[0] when --repo is absent (repoIdx === -1).
  test("a single-name update scopes to that name only", async () => {
    if (!(await fetchRepo({ channel: "git", source: `git:${upstream}`, subpath: "", localPath: upstream, raw: upstream } as never)).ok) {
      return; // git unavailable — skip silently
    }
    await runAdd([`git:${upstream}#skills/foo`, "--json"], makeCtx(library).ctx);
    await runAdd([`git:${upstream}#skills/keep`, "--json"], makeCtx(library).ctx);

    const { ctx, json } = makeCtx(library);
    const code = await run(["foo", "--json"], ctx);
    const report = json[0] as { results: Array<{ name: string }> };

    // ONLY foo — never the whole library (keep must be excluded).
    expect(report.results.map((r) => r.name)).toEqual(["foo"]);
    expect(code).toBe(0);
  });

  // --repo <source> scopes a run to ONE vendor (the per-vendor UI action).
  test("--repo scopes the run to a single source, excluding other entries", async () => {
    if (!(await fetchRepo({ channel: "git", source: `git:${upstream}`, subpath: "", localPath: upstream, raw: upstream } as never)).ok) {
      return; // git unavailable — skip silently
    }
    await runAdd([`git:${upstream}#skills/foo`, "--json"], makeCtx(library).ctx);
    await runAdd([`git:${upstream}#skills/keep`, "--json"], makeCtx(library).ctx);

    // The exact stored source key for foo (the value the UI would pass as --repo).
    const lock = JSON.parse(await readFile(join(library, "shelf.lock.json"), "utf8"));
    const fooSource = lock.entries.foo.source as string;

    const { ctx, json } = makeCtx(library);
    const code = await run(["--repo", fooSource, "--json"], ctx);
    const report = json[0] as { results: Array<{ name: string }> };

    // Only foo is reconciled; keep (a different stored source) is excluded.
    expect(report.results.map((r) => r.name)).toEqual(["foo"]);
    expect(code).toBe(0);
  });
});
