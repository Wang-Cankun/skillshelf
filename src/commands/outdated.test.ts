import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, symlink, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run, mapLimit } from "./outdated.ts";
import type { Ctx } from "../types.ts";

function makeCtx(libraryPath: string) {
  const json: unknown[] = [];
  const ctx = {
    config: { libraryPath },
    libraryPath,
    log: () => {},
    error: () => {},
    json: (v: unknown) => json.push(v),
  } as unknown as Ctx;
  return { ctx, json };
}

describe("skl outdated — LINKED entries are reported, not probed (ADR-0004)", () => {
  let tmp: string;
  let library: string;

  beforeEach(async () => {
    tmp = await realpath(await mkdtemp(join(tmpdir(), "skl-outdated-")));
    library = join(tmp, "library");
    const dev = join(tmp, "dev", "devskill");
    await mkdir(library, { recursive: true });
    await mkdir(dev, { recursive: true });
    await writeFile(join(dev, "SKILL.md"), "---\nname: devskill\n---\n\nbody\n");
    await symlink(dev, join(library, "devskill"));
    await writeFile(
      join(library, "shelf.lock.json"),
      JSON.stringify({
        version: 1,
        entries: {
          devskill: { name: "devskill", source: "github:owner/repo", ref: "abc", channel: "github", installedAt: "2020-01-01T00:00:00.000Z", localEdits: false },
        },
      }),
    );
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("a LINKED entry is status 'linked', never counted stale", async () => {
    const { ctx, json } = makeCtx(library);
    const code = await run(["--json"], ctx);

    expect(code).toBe(0); // not stale -> exit 0 (no network probe of the dead github ref)
    const report = json[0] as { stale: number; rows: Array<{ name: string; status: string }> };
    expect(report.stale).toBe(0);
    expect(report.rows.find((r) => r.name === "devskill")!.status).toBe("linked");
  });
});

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

async function gitOut(cwd: string, args: string[]): Promise<string> {
  const p = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const out = await new Response(p.stdout).text();
  await p.exited;
  return out.trim();
}

// Regression: an OWNED github/git entry whose upstream HEAD has advanced past the
// installed ref MUST surface as "stale". This is the online ref-compare path
// (classify step 7) that was dead code while checkEntry fed localHash:null — every
// online row collapsed to "current" and `outdated` could never flag an update
// (and the UI ↑ badge, keyed off status==="stale", never lit). Uses the git: channel
// over a real LOCAL repo so the "latest ref" probe is offline (`git ls-remote <path>`).
describe("skl outdated — online ref-compare flags a moved upstream as stale", () => {
  let tmp: string;
  let library: string;
  let upstream: string;

  beforeEach(async () => {
    tmp = await realpath(await mkdtemp(join(tmpdir(), "skl-outdated-stale-")));
    library = join(tmp, "library");
    upstream = join(tmp, "upstream");
    await mkdir(join(upstream, "skills", "foo"), { recursive: true });
    await writeFile(
      join(upstream, "skills", "foo", "SKILL.md"),
      "---\nname: foo\ndescription: foo skill\n---\n\nFOO BODY\n",
    );
    await git(upstream, ["init", "-q"]);
    await git(upstream, ["add", "-A"]);
    await git(upstream, ["commit", "-q", "-m", "v1"]);
    const ref1 = await gitOut(upstream, ["rev-parse", "HEAD"]);

    // Library copy of foo (readable body → a real localHash) pinned to ref1.
    await mkdir(join(library, "foo"), { recursive: true });
    await writeFile(
      join(library, "foo", "SKILL.md"),
      "---\nname: foo\ndescription: foo skill\n---\n\nFOO BODY\n",
    );
    await writeFile(
      join(library, "shelf.lock.json"),
      JSON.stringify({
        version: 1,
        entries: {
          foo: {
            name: "foo",
            source: `git:${upstream}#skills/foo`,
            ref: ref1,
            channel: "git",
            installedAt: "2020-01-01T00:00:00.000Z",
            localEdits: false,
          },
        },
      }),
    );

    // Advance upstream HEAD past ref1 — the repo moved on since install.
    await writeFile(join(upstream, "skills", "foo", "note.txt"), "changed\n");
    await git(upstream, ["add", "-A"]);
    await git(upstream, ["commit", "-q", "-m", "v2"]);
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("an owned entry whose upstream HEAD advanced is status 'stale' (exit 2)", async () => {
    const { ctx, json } = makeCtx(library);
    const code = await run(["--json"], ctx);

    expect(code).toBe(2); // stale exists → non-zero so CI/agents can branch on it
    const report = json[0] as {
      stale: number;
      rows: Array<{ name: string; status: string }>;
    };
    expect(report.stale).toBe(1);
    expect(report.rows.find((r) => r.name === "foo")!.status).toBe("stale");
  });
});

// The concurrency bound is the fix for the "unknown storm" — firing one network
// probe per skill all at once dropped 59/87 probes to transient failures. These
// pin the three invariants the storm fix relies on: peak in-flight <= limit, every
// item runs once, and output order matches input (rows must not scramble).
describe("mapLimit — bounded-concurrency probe pool", () => {
  test("never runs more than `limit` tasks concurrently", async () => {
    let inflight = 0;
    let peak = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);
    await mapLimit(items, 4, async () => {
      inflight++;
      peak = Math.max(peak, inflight);
      await new Promise((r) => setTimeout(r, 5));
      inflight--;
      return null;
    });
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1); // genuinely parallel, not accidentally serialized
  });

  test("preserves input order regardless of completion order", async () => {
    // Later items finish FIRST (descending delay); output must still be by index.
    const out = await mapLimit([40, 30, 20, 10], 4, async (ms, i) => {
      await new Promise((r) => setTimeout(r, ms));
      return `${i}:${ms}`;
    });
    expect(out).toEqual(["0:40", "1:30", "2:20", "3:10"]);
  });

  test("runs every item exactly once", async () => {
    const seen: number[] = [];
    const items = Array.from({ length: 15 }, (_, i) => i);
    const out = await mapLimit(items, 6, async (n) => {
      seen.push(n);
      return n * 2;
    });
    expect(out).toEqual(items.map((n) => n * 2));
    expect([...seen].sort((a, b) => a - b)).toEqual(items);
  });

  test("limit exceeding the list length still resolves all; empty list is empty", async () => {
    expect(await mapLimit([1, 2, 3], 100, async (n) => n + 1)).toEqual([2, 3, 4]);
    expect(await mapLimit([], 6, async (n: number) => n)).toEqual([]);
  });

  test("limit <= 0 is clamped to 1 (no undefined holes), still processes all", async () => {
    const out = await mapLimit([1, 2, 3], 0, async (n) => n * 10);
    expect(out).toEqual([10, 20, 30]);
    expect(out.every((v) => v !== undefined)).toBe(true);
  });
});
