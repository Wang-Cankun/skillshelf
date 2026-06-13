import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, symlink, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "./outdated.ts";
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
