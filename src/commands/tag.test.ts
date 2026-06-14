import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run as tagRun } from "./tag.ts";
import { run as untagRun } from "./untag.ts";
import { run as retagRun } from "./retag.ts";
import { loadLibrary } from "../core/library.ts";
import { readTaxonomy } from "../core/taxonomy.ts";
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

async function writeSkill(library: string, name: string, frontmatterDomains?: string[]) {
  const dir = join(library, name);
  await mkdir(dir, { recursive: true });
  const dom = frontmatterDomains ? `domains: [${frontmatterDomains.join(", ")}]\n` : "";
  await writeFile(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${name}\n${dom}---\n\nbody\n`);
}

describe("skl tag/untag/retag — surgical taxonomy edits (friction #4)", () => {
  let tmp: string;
  let library: string;

  beforeEach(async () => {
    tmp = await realpath(await mkdtemp(join(tmpdir(), "skl-tag-")));
    library = join(tmp, "library");
    await writeSkill(library, "alpha", ["bio"]); // bio is a FRONTMATTER domain
    await writeSkill(library, "beta");
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("tag adds new domains and reports already-present ones", async () => {
    const { ctx, json } = makeCtx(library);
    await tagRun(["alpha", "coding", "nlp", "--json"], ctx);
    expect(json[0]).toMatchObject({ added: ["coding", "nlp"], already: [] });

    const { ctx: c2, json: j2 } = makeCtx(library);
    await tagRun(["alpha", "coding", "--json"], c2);
    expect(j2[0]).toMatchObject({ added: [], already: ["coding"] });
  });

  test("tag refuses an unknown skill", async () => {
    const { ctx, errors } = makeCtx(library);
    const code = await tagRun(["ghost", "x"], ctx);
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("not in the library");
  });

  test("untag removes a taxonomy domain", async () => {
    const { ctx } = makeCtx(library);
    await tagRun(["beta", "coding", "nlp"], ctx);
    const { ctx: c2, json } = makeCtx(library);
    const code = await untagRun(["beta", "coding", "--json"], c2);
    expect(code).toBe(0);
    expect(json[0]).toMatchObject({ removed: "coding", domains: ["nlp"] });
  });

  test("untag a frontmatter domain explains it can't be removed from the taxonomy", async () => {
    const { ctx, errors } = makeCtx(library);
    const code = await untagRun(["alpha", "bio"], ctx);
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("frontmatter");
  });

  test("untag a never-present domain errors (no silent no-op)", async () => {
    const { ctx, errors } = makeCtx(library);
    const code = await untagRun(["beta", "zzz"], ctx);
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("not tagged");
  });

  test("retag renames a domain across the whole taxonomy deterministically", async () => {
    const { ctx } = makeCtx(library);
    await tagRun(["alpha", "ml"], ctx);
    await tagRun(["beta", "ml"], makeCtx(library).ctx);

    const { ctx: c3, json } = makeCtx(library);
    const code = await retagRun(["ml", "machine-learning", "--json"], c3);
    expect(code).toBe(0);
    expect((json[0] as { changed: string[] }).changed.sort()).toEqual(["alpha", "beta"]);

    const tax = await readTaxonomy(library);
    expect(tax.skills.alpha).toContain("machine-learning");
    expect(tax.skills.beta).toContain("machine-learning");
    expect(tax.skills.alpha).not.toContain("ml");
  });

  test("retag a domain no skill carries is a clean no-op (changed:[])", async () => {
    const { ctx, json } = makeCtx(library);
    const code = await retagRun(["nonexistent", "whatever", "--json"], ctx);
    expect(code).toBe(0);
    expect((json[0] as { changed: string[] }).changed).toEqual([]);
  });
});
