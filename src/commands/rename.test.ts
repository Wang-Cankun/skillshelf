import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, symlink, rm as fsRm, realpath, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run as renameRun } from "./rename.ts";
import { loadLibrary } from "../core/library.ts";
import type { Ctx } from "../types.ts";

function makeCtx(libraryPath: string) {
  const json: unknown[] = [];
  const errors: string[] = [];
  const ctx = {
    config: { libraryPath },
    libraryPath,
    loadLibrary: () => loadLibrary(libraryPath),
    log: () => {},
    error: (...a: unknown[]) => errors.push(a.join(" ")),
    json: (v: unknown) => json.push(v),
  } as unknown as Ctx;
  return { ctx, json, errors };
}

describe("skl rename — atomic slug move (friction #5)", () => {
  let tmp: string;
  let library: string;

  beforeEach(async () => {
    tmp = await realpath(await mkdtemp(join(tmpdir(), "skl-rename-")));
    library = join(tmp, "library");
    await mkdir(join(library, "alpha"), { recursive: true });
    await writeFile(join(library, "alpha", "SKILL.md"), "---\nname: alpha\ndescription: a\n---\n\nbody\n");
    await writeFile(join(library, "taxonomy.json"), JSON.stringify({ version: 1, skills: { alpha: ["bio"] } }));
    await writeFile(
      join(library, "shelf.lock.json"),
      JSON.stringify({ version: 1, entries: { alpha: { name: "alpha", source: "github:o/r", ref: "x", channel: "github", installedAt: "2020-01-01T00:00:00.000Z", localEdits: false } } }),
    );
  });
  afterEach(async () => {
    await fsRm(tmp, { recursive: true, force: true });
  });

  test("moves dir + frontmatter + taxonomy + lock together", async () => {
    const { ctx } = makeCtx(library);
    const code = await renameRun(["alpha", "alpha2", "--json"], ctx);
    expect(code).toBe(0);

    expect(existsSync(join(library, "alpha"))).toBe(false);
    expect(existsSync(join(library, "alpha2"))).toBe(true);

    const fm = await readFile(join(library, "alpha2", "SKILL.md"), "utf8");
    expect(fm).toContain("name: alpha2");

    const tax = JSON.parse(await readFile(join(library, "taxonomy.json"), "utf8"));
    expect(tax.skills.alpha2).toEqual(["bio"]);
    expect(tax.skills.alpha).toBeUndefined();

    const lock = JSON.parse(await readFile(join(library, "shelf.lock.json"), "utf8"));
    expect(lock.entries.alpha2.name).toBe("alpha2");
    expect(lock.entries.alpha).toBeUndefined();
  });

  test("refuses an existing target name", async () => {
    await mkdir(join(library, "beta"), { recursive: true });
    await writeFile(join(library, "beta", "SKILL.md"), "---\nname: beta\n---\n\nb\n");
    const { ctx, errors } = makeCtx(library);
    const code = await renameRun(["alpha", "beta"], ctx);
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("already exists");
  });

  test("refuses a missing source", async () => {
    const { ctx, errors } = makeCtx(library);
    const code = await renameRun(["ghost", "x"], ctx);
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("not in the library");
  });

  test("a LINKED entry rekeys metadata but leaves the dev-repo SKILL.md untouched", async () => {
    const dev = join(tmp, "dev", "linked");
    await mkdir(dev, { recursive: true });
    await writeFile(join(dev, "SKILL.md"), "---\nname: linked\n---\n\nbody\n");
    await symlink(dev, join(library, "linked"));

    const { ctx, json } = makeCtx(library);
    const code = await renameRun(["linked", "linked2", "--json"], ctx);
    expect(code).toBe(0);
    expect((json[0] as { frontmatterRewritten: boolean }).frontmatterRewritten).toBe(false);
    // dev-repo body is NOT rewritten (we must not edit the dev repo)
    const devFm = await readFile(join(dev, "SKILL.md"), "utf8");
    expect(devFm).toContain("name: linked");
    // library symlink now lives under the new name, still resolving to the dev repo
    expect(existsSync(join(library, "linked2", "SKILL.md"))).toBe(true);
  });
});
