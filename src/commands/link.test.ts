import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, readFile, rm, lstat, readlink, realpath } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "./link.ts";
import type { Ctx } from "../types.ts";

const BODY = "---\nname: claim-log\ndescription: a test skill\n---\n\nbody\n";

async function makeSkillDir(parent: string, name: string, body = BODY): Promise<string> {
  const dir = join(parent, name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "SKILL.md"), body);
  return dir;
}

interface Captured {
  ctx: Ctx;
  logs: string[];
  errors: string[];
  json: unknown[];
}

/** Minimal Ctx mock — link.run only reads config.libraryPath + log/error/json. */
function makeCtx(libraryPath: string): Captured {
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

describe("skl link --from (LINKED mode)", () => {
  let tmp: string;
  let library: string;
  let devRepo: string;

  beforeEach(async () => {
    tmp = await realpath(await mkdtemp(join(tmpdir(), "skl-link-")));
    library = join(tmp, "library");
    devRepo = join(tmp, "dev");
    await mkdir(library, { recursive: true });
    await mkdir(devRepo, { recursive: true });
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("registers a dev-repo skill as a library symlink", async () => {
    const src = await makeSkillDir(devRepo, "claim-log");
    const { ctx, json } = makeCtx(library);
    const code = await run(["claim-log", "--from", src, "--json"], ctx);

    expect(code).toBe(0);
    const libEntry = join(library, "claim-log");
    const st = await lstat(libEntry);
    expect(st.isSymbolicLink()).toBe(true);
    expect(await realpath(libEntry)).toBe(await realpath(src));
    expect(json[0]).toMatchObject({ ok: true, name: "claim-log", mode: "linked", discarded: false });
  });

  test("derives the name from the dev-repo dir basename when omitted", async () => {
    const src = await makeSkillDir(devRepo, "claim-log");
    const { ctx } = makeCtx(library);
    const code = await run(["--from", src], ctx);

    expect(code).toBe(0);
    const libEntry = join(library, "claim-log");
    expect((await lstat(libEntry)).isSymbolicLink()).toBe(true);
    expect(await realpath(libEntry)).toBe(await realpath(src));
  });

  test("is idempotent — re-running reports 'already'", async () => {
    const src = await makeSkillDir(devRepo, "claim-log");
    const { ctx } = makeCtx(library);
    await run(["claim-log", "--from", src], ctx);

    const { ctx: ctx2, json } = makeCtx(library);
    const code = await run(["claim-log", "--from", src, "--json"], ctx2);
    expect(code).toBe(0);
    expect(json[0]).toMatchObject({ status: "already", mode: "linked" });
  });

  test("refuses to clobber an existing owned library copy without --force", async () => {
    await makeSkillDir(library, "claim-log"); // a real OWNED copy already in the library
    const src = await makeSkillDir(devRepo, "claim-log");
    const { ctx, errors } = makeCtx(library);

    const code = await run(["claim-log", "--from", src], ctx);
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("already exists in the library");
    // unchanged: still a real dir, not a symlink
    expect((await lstat(join(library, "claim-log"))).isSymbolicLink()).toBe(false);
  });

  test("--force replaces an owned copy with the symlink and reports discarded", async () => {
    await makeSkillDir(library, "claim-log");
    const src = await makeSkillDir(devRepo, "claim-log");
    const { ctx, json } = makeCtx(library);

    const code = await run(["claim-log", "--from", src, "--force", "--json"], ctx);
    expect(code).toBe(0);
    expect((await lstat(join(library, "claim-log"))).isSymbolicLink()).toBe(true);
    expect(json[0]).toMatchObject({ discarded: true, mode: "linked" });
  });

  test("drops a stale lockfile entry so update/outdated skip the now-LINKED skill", async () => {
    // An owned import existed (real copy + a github lock entry); now convert to LINKED.
    await makeSkillDir(library, "claim-log");
    await writeFile(
      join(library, "shelf.lock.json"),
      JSON.stringify({
        version: 1,
        entries: {
          "claim-log": { name: "claim-log", source: "github:owner/repo", ref: "abc", channel: "github", installedAt: "2020-01-01T00:00:00.000Z", localEdits: false },
        },
      }),
    );
    const src = await makeSkillDir(devRepo, "claim-log");
    const { ctx } = makeCtx(library);

    const code = await run(["claim-log", "--from", src, "--force"], ctx);
    expect(code).toBe(0);
    const lock = JSON.parse(await readFile(join(library, "shelf.lock.json"), "utf8"));
    expect(lock.entries["claim-log"]).toBeUndefined();
  });

  test("rejects --at and --from together", async () => {
    const src = await makeSkillDir(devRepo, "claim-log");
    const { ctx, errors } = makeCtx(library);
    const code = await run(["claim-log", "--from", src, "--at", "/tmp/x"], ctx);
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("mutually exclusive");
  });

  test("refuses a --from source inside the library", async () => {
    const inside = await makeSkillDir(library, "claim-log");
    const { ctx, errors } = makeCtx(library);
    const code = await run(["other", "--from", inside], ctx);
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("inside the library");
  });

  test("refuses a --from dir with no SKILL.md", async () => {
    const bare = join(devRepo, "bare");
    await mkdir(bare, { recursive: true });
    const { ctx, errors } = makeCtx(library);
    const code = await run(["bare", "--from", bare], ctx);
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("no SKILL.md");
    expect(existsSync(join(library, "bare"))).toBe(false);
  });
});
