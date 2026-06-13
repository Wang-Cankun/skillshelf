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
