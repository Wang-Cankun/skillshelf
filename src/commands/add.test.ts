import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "./add.ts";
import type { Ctx } from "../types.ts";

interface Captured {
  ctx: Ctx;
  logs: string[];
  errors: string[];
  json: unknown[];
}

/** Minimal Ctx mock — add.run reads config.libraryPath + log/error/json. */
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

function skillBody(name: string): string {
  return `---\nname: ${name}\ndescription: a ${name} skill for testing\n---\n\n# ${name}\n\nbody for ${name}\n`;
}

/** Build a real local git repo holding the given skills, for offline `git:` add. */
async function makeGitRepo(parent: string, skills: string[]): Promise<string> {
  const repo = join(parent, "src-repo");
  await mkdir(repo, { recursive: true });
  for (const s of skills) {
    await mkdir(join(repo, s), { recursive: true });
    await writeFile(join(repo, s, "SKILL.md"), skillBody(s));
  }
  const run = (cmd: string[]) =>
    Bun.spawn(cmd, { cwd: repo, stdout: "ignore", stderr: "ignore" }).exited;
  await run(["git", "init", "-q"]);
  await run(["git", "config", "user.email", "test@example.com"]);
  await run(["git", "config", "user.name", "test"]);
  await run(["git", "add", "-A"]);
  await run(["git", "commit", "-q", "-m", "init"]);
  return repo;
}

describe("skl add — retired-aware collision", () => {
  let tmp: string;
  let library: string;

  beforeEach(async () => {
    tmp = await realpath(await mkdtemp(join(tmpdir(), "skl-add-")));
    library = join(tmp, "library");
    await mkdir(library, { recursive: true });
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("--all over a repo where one name is retired: skips it (no duplicate), installs the rest", async () => {
    const repo = await makeGitRepo(tmp, ["caveman", "tdd"]);
    // Retire "caveman": a tombstone under _retired/, NO active copy.
    await mkdir(join(library, "_retired", "caveman"), { recursive: true });
    await writeFile(join(library, "_retired", "caveman", "SKILL.md"), skillBody("caveman"));

    const { ctx, json } = makeCtx(library);
    const code = await run([`git:${repo}`, "--all", "--no-infer", "--json"], ctx);
    expect(code).toBe(0);

    const out = json[0] as {
      results: Array<{ name: string; status: string; verdict: string; reason: string }>;
    };
    const caveman = out.results.find((r) => r.name === "caveman")!;
    const tdd = out.results.find((r) => r.name === "tdd")!;

    expect(caveman.status).toBe("skipped");
    expect(caveman.verdict).toBe("retired");
    expect(caveman.reason).toContain("skl unretire caveman");

    // No active duplicate beside the tombstone.
    expect(existsSync(join(library, "caveman"))).toBe(false);
    expect(existsSync(join(library, "_retired", "caveman"))).toBe(true);

    // The non-colliding name still installs.
    expect(tdd.status).toBe("installed");
    expect(existsSync(join(library, "tdd", "SKILL.md"))).toBe(true);
  });

  test("single add of a retired name refuses (exit 1, no duplicate)", async () => {
    const repo = await makeGitRepo(tmp, ["caveman"]);
    await mkdir(join(library, "_retired", "caveman"), { recursive: true });
    await writeFile(join(library, "_retired", "caveman", "SKILL.md"), skillBody("caveman"));

    const { ctx, errors } = makeCtx(library);
    const code = await run([`git:${repo}`, "--no-infer"], ctx);
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("skl unretire caveman");
    expect(existsSync(join(library, "caveman"))).toBe(false);
  });

  test("active-collision still refuses without --force (no regression)", async () => {
    const repo = await makeGitRepo(tmp, ["tdd"]);
    // An ACTIVE copy already exists.
    await mkdir(join(library, "tdd"), { recursive: true });
    await writeFile(join(library, "tdd", "SKILL.md"), skillBody("tdd") + "local edit\n");

    const { ctx, errors } = makeCtx(library);
    const code = await run([`git:${repo}`, "--no-infer"], ctx);
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("already exists");
  });
});
