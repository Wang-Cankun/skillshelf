import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run as useRun } from "./use.ts";
import { run as dropRun } from "./drop.ts";
import { loadLibrary } from "../core/library.ts";
import type { Ctx } from "../types.ts";

function makeCtx(libraryPath: string) {
  const json: unknown[] = [];
  const ctx = {
    config: { libraryPath },
    libraryPath,
    loadLibrary: () => loadLibrary(libraryPath),
    log: () => {},
    error: () => {},
    json: (v: unknown) => json.push(v),
  } as unknown as Ctx;
  return { ctx, json };
}

async function writeSkill(library: string, name: string, domain: string) {
  const dir = join(library, name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${name}\ndomains: [${domain}]\n---\n\nbody\n`);
}

describe("skl use/drop — single-skill deploy (friction #2)", () => {
  let tmp: string;
  let library: string;
  let project: string;
  let prevCwd: string;

  beforeEach(async () => {
    tmp = await realpath(await mkdtemp(join(tmpdir(), "skl-use-")));
    library = join(tmp, "library");
    project = join(tmp, "project");
    await mkdir(project, { recursive: true });
    await writeSkill(library, "alpha", "bio");
    await writeSkill(library, "beta", "bio");
    prevCwd = process.cwd();
    process.chdir(project);
  });
  afterEach(async () => {
    process.chdir(prevCwd);
    await rm(tmp, { recursive: true, force: true });
  });

  test("`use <skill>` deploys exactly one skill (kind: skill)", async () => {
    const { ctx, json } = makeCtx(library);
    const code = await useRun(["alpha", "--json"], ctx);
    expect(code).toBe(0);
    const out = json[0] as { kind: string; linked: Array<{ name: string; status: string }> };
    expect(out.kind).toBe("skill");
    expect(out.linked).toHaveLength(1);
    expect(out.linked[0]!.name).toBe("alpha");
  });

  test("`use <bundle>` still resolves the whole tag query (kind: bundle)", async () => {
    const { ctx, json } = makeCtx(library);
    await useRun(["bio", "--json"], ctx);
    const out = json[0] as { kind: string; linked: unknown[] };
    expect(out.kind).toBe("bundle");
    expect(out.linked).toHaveLength(2);
  });

  test("a skill name shadows bundle resolution (skill-first)", async () => {
    // name a skill the same as no domain — exact-name match wins
    const { ctx, json } = makeCtx(library);
    await useRun(["beta", "--json"], ctx);
    expect((json[0] as { kind: string }).kind).toBe("skill");
  });

  test("`drop <skill>` undoes `use <skill>` symmetrically", async () => {
    const { ctx } = makeCtx(library);
    await useRun(["alpha", "--json"], ctx);
    const { ctx: ctx2, json } = makeCtx(library);
    const code = await dropRun(["alpha", "--json"], ctx2);
    expect(code).toBe(0);
    const out = json[0] as { results: Array<{ status: string }>; removed: number };
    expect(out.removed).toBe(1);
    expect(out.results[0]!.status).toBe("removed");
  });

  test("unknown name is a clean empty-bundle error, not a crash", async () => {
    const { ctx, json } = makeCtx(library);
    const code = await useRun(["does-not-exist", "--json"], ctx);
    expect(code).toBe(1);
    expect((json[0] as { error: string }).error).toBe("empty-bundle");
  });

  test("use/drop --project against a fresh EMPTY project dir creates + symmetrically removes (ADR-0010 §5a)", async () => {
    // A brand-new project dir with no .claude/skills yet — the GUI deploy path.
    const fresh = join(tmp, "fresh-project");
    await mkdir(fresh, { recursive: true });

    const { ctx, json } = makeCtx(library);
    const code = await useRun(["alpha", "--agent", "claude", "--project", fresh, "--json"], ctx);
    expect(code).toBe(0);
    const out = json[0] as {
      scope: string;
      agent: string;
      skillsDir: string;
      linked: Array<{ name: string; status: string }>;
    };
    expect(out.agent).toBe("claude");
    expect(out.scope).toBe("fresh-project"); // scope = project basename
    expect(out.skillsDir).toBe(join(fresh, ".claude", "skills"));
    expect(existsSync(join(fresh, ".claude", "skills"))).toBe(true);
    expect(existsSync(join(fresh, ".claude", "skills", "alpha"))).toBe(true);
    expect(out.linked[0]!.status).toBe("linked");

    const { ctx: ctx2, json: json2 } = makeCtx(library);
    const dcode = await dropRun(["alpha", "--agent", "claude", "--project", fresh, "--json"], ctx2);
    expect(dcode).toBe(0);
    const dout = json2[0] as { removed: number; results: Array<{ status: string }> };
    expect(dout.removed).toBe(1);
    expect(existsSync(join(fresh, ".claude", "skills", "alpha"))).toBe(false);
  });
});
