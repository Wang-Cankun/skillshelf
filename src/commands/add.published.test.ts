// ADR-0012 — published set (manifest allowlist + metadata.internal) + the > 15 count gate.
//
// These tests drive `skl add` over real local git repos (offline `git:` channel,
// HOME-isolated library) exercising:
//   (a) manifest-present repo  -> --all installs only the allowlisted subset
//   (b) --skill reaches an UNPUBLISHED (folder-excluded) skill, never gated
//   (c) metadata.internal:true excluded from --all but installable by name
//   (d) marketplace.json union across plugins
//   (e) the > 15 count gate trips, and --yes bypasses it
//   (f) --list shows the FULL set with published/unpublished/internal markers
//   (g) a no-manifest repo still installs every skill (under the gate)

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "./add.ts";
import { discoverSkills } from "../core/fetch.ts";
import type { Ctx } from "../types.ts";

interface Captured {
  ctx: Ctx;
  logs: string[];
  errors: string[];
  json: unknown[];
}

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

function skillBody(
  name: string,
  opts: { internal?: boolean; internalFlow?: boolean; description?: string } = {},
): string {
  const desc = opts.description ?? `a ${name} skill for testing`;
  // Block style by default; flow style (`metadata: {internal: true}`) exercises the
  // YAML-flow-mapping path so the internal signal can't be bypassed by author style.
  const meta = opts.internalFlow
    ? `metadata: {internal: true}\n`
    : opts.internal
      ? `metadata:\n  internal: true\n`
      : "";
  return `---\nname: ${name}\ndescription: ${desc}\n${meta}---\n\n# ${name}\n\nbody for ${name}\n`;
}

interface SkillSpec {
  /** repo-relative dir, e.g. "engineering/foo" */
  path: string;
  /** frontmatter name (defaults to basename of path) */
  name?: string;
  internal?: boolean;
  /** mark internal via inline flow mapping instead of a block mapping */
  internalFlow?: boolean;
}

/** Build a real local git repo with the given skills + optional manifest files. */
async function makeRepo(
  parent: string,
  skills: SkillSpec[],
  manifest?: { kind: "plugin" | "marketplace"; json: unknown },
): Promise<string> {
  const repo = join(parent, "src-repo");
  await mkdir(repo, { recursive: true });
  for (const s of skills) {
    const dir = join(repo, s.path);
    await mkdir(dir, { recursive: true });
    const nm = s.name ?? s.path.split("/").pop()!;
    await writeFile(
      join(dir, "SKILL.md"),
      skillBody(nm, { internal: s.internal, internalFlow: s.internalFlow }),
    );
  }
  if (manifest) {
    await mkdir(join(repo, ".claude-plugin"), { recursive: true });
    const file = manifest.kind === "plugin" ? "plugin.json" : "marketplace.json";
    await writeFile(join(repo, ".claude-plugin", file), JSON.stringify(manifest.json, null, 2));
  }
  const gitRun = (cmd: string[]) =>
    Bun.spawn(cmd, { cwd: repo, stdout: "ignore", stderr: "ignore" }).exited;
  await gitRun(["git", "init", "-q"]);
  await gitRun(["git", "config", "user.email", "test@example.com"]);
  await gitRun(["git", "config", "user.name", "test"]);
  await gitRun(["git", "add", "-A"]);
  await gitRun(["git", "commit", "-q", "-m", "init"]);
  return repo;
}

describe("ADR-0012 published set + count gate", () => {
  let tmp: string;
  let library: string;

  beforeEach(async () => {
    tmp = await realpath(await mkdtemp(join(tmpdir(), "skl-pub-")));
    library = join(tmp, "library");
    await mkdir(library, { recursive: true });
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  // (a) manifest-present repo -> --all installs only the allowlisted subset.
  test("plugin.json allowlist bounds --all to the listed skills", async () => {
    const repo = await makeRepo(
      tmp,
      [
        { path: "engineering/alpha" },
        { path: "engineering/beta" },
        { path: "deprecated/gamma" },
        { path: "in-progress/delta" },
      ],
      { kind: "plugin", json: { name: "x", skills: ["./engineering/alpha", "./engineering/beta"] } },
    );

    const { ctx, json } = makeCtx(library);
    const code = await run([`git:${repo}`, "--all", "--no-infer", "--json"], ctx);
    expect(code).toBe(0);

    const out = json[0] as { results: Array<{ name: string; status: string }> };
    const installed = out.results.filter((r) => r.status === "installed").map((r) => r.name).sort();
    expect(installed).toEqual(["alpha", "beta"]);
    expect(existsSync(join(library, "alpha", "SKILL.md"))).toBe(true);
    expect(existsSync(join(library, "beta", "SKILL.md"))).toBe(true);
    expect(existsSync(join(library, "gamma"))).toBe(false);
    expect(existsSync(join(library, "delta"))).toBe(false);
  });

  // (b) --skill reaches an UNPUBLISHED (folder-excluded) skill, NOT gated.
  test("--skill installs an unpublished skill the manifest omits", async () => {
    const repo = await makeRepo(
      tmp,
      [
        { path: "engineering/alpha" },
        { path: "deprecated/gamma" },
      ],
      { kind: "plugin", json: { name: "x", skills: ["./engineering/alpha"] } },
    );

    const { ctx, json } = makeCtx(library);
    const code = await run([`git:${repo}`, "--skill", "gamma", "--no-infer", "--json"], ctx);
    expect(code).toBe(0);
    const out = json[0] as { results: Array<{ name: string; status: string }> };
    const gamma = out.results.find((r) => r.name === "gamma")!;
    expect(gamma.status).toBe("installed");
    expect(existsSync(join(library, "gamma", "SKILL.md"))).toBe(true);
  });

  // (c) metadata.internal:true excluded from --all but installable by name.
  test("metadata.internal skill is excluded from --all but installable by --skill", async () => {
    const repo = await makeRepo(
      tmp,
      [
        { path: "engineering/alpha" },
        { path: "engineering/secret", internal: true },
      ],
      { kind: "plugin", json: { name: "x", skills: ["./engineering/alpha", "./engineering/secret"] } },
    );

    // --all skips the internal one even though the manifest lists it.
    const all = makeCtx(library);
    const codeAll = await run([`git:${repo}`, "--all", "--no-infer", "--json"], all.ctx);
    expect(codeAll).toBe(0);
    const outAll = all.json[0] as { results: Array<{ name: string; status: string }> };
    const installedAll = outAll.results.filter((r) => r.status === "installed").map((r) => r.name);
    expect(installedAll).toEqual(["alpha"]);
    expect(existsSync(join(library, "secret"))).toBe(false);

    // ...but --skill reaches it.
    const byName = makeCtx(library);
    const codeName = await run([`git:${repo}`, "--skill", "secret", "--no-infer", "--json"], byName.ctx);
    expect(codeName).toBe(0);
    expect(existsSync(join(library, "secret", "SKILL.md"))).toBe(true);
  });

  // (c2) the internal signal can't be bypassed by writing it as a YAML FLOW mapping
  // (`metadata: {internal: true}`) instead of a block mapping.
  test("flow-style metadata.internal is still excluded from --all", async () => {
    const repo = await makeRepo(
      tmp,
      [
        { path: "engineering/alpha" },
        { path: "engineering/secret", internalFlow: true },
      ],
      { kind: "plugin", json: { name: "x", skills: ["./engineering/alpha", "./engineering/secret"] } },
    );
    const { ctx, json } = makeCtx(library);
    const code = await run([`git:${repo}`, "--all", "--no-infer", "--json"], ctx);
    expect(code).toBe(0);
    const out = json[0] as { results: Array<{ name: string; status: string }> };
    expect(out.results.filter((r) => r.status === "installed").map((r) => r.name)).toEqual(["alpha"]);
    expect(existsSync(join(library, "secret"))).toBe(false);
  });

  // (d) marketplace.json union across plugins.
  test("marketplace.json unions every plugin's skills", async () => {
    const repo = await makeRepo(
      tmp,
      [
        { path: "engineering/alpha" },
        { path: "productivity/beta" },
        { path: "deprecated/gamma" },
      ],
      {
        kind: "marketplace",
        json: {
          plugins: [
            { name: "eng", skills: ["./engineering/alpha"] },
            { name: "prod", skills: ["./productivity/beta"] },
          ],
        },
      },
    );

    const { ctx, json } = makeCtx(library);
    const code = await run([`git:${repo}`, "--all", "--no-infer", "--json"], ctx);
    expect(code).toBe(0);
    const out = json[0] as { results: Array<{ name: string; status: string }> };
    const installed = out.results.filter((r) => r.status === "installed").map((r) => r.name).sort();
    expect(installed).toEqual(["alpha", "beta"]);
    expect(existsSync(join(library, "gamma"))).toBe(false);
  });

  // (e) the count gate trips at > 15 published, and --yes bypasses it.
  test("count gate refuses > 15 published skills; --yes bypasses", async () => {
    // 16 skills, NO manifest -> all 16 are published.
    const specs: SkillSpec[] = Array.from({ length: 16 }, (_, i) => ({
      path: `skills/s${String(i).padStart(2, "0")}`,
    }));
    const repo = await makeRepo(tmp, specs);

    const gated = makeCtx(library);
    const codeGated = await run([`git:${repo}`, "--all", "--no-infer", "--json"], gated.ctx);
    expect(codeGated).toBe(1);
    const errText = gated.errors.join("\n");
    expect(errText).toContain("16");
    expect(errText).toMatch(/--yes/);
    // Nothing installed.
    expect(existsSync(join(library, "s00"))).toBe(false);

    const bypass = makeCtx(library);
    const codeYes = await run([`git:${repo}`, "--all", "--yes", "--no-infer", "--json"], bypass.ctx);
    expect(codeYes).toBe(0);
    const out = bypass.json[0] as { counts: { installed: number } };
    expect(out.counts.installed).toBe(16);
  });

  test("count gate does NOT trip at exactly 15", async () => {
    const specs: SkillSpec[] = Array.from({ length: 15 }, (_, i) => ({
      path: `skills/s${String(i).padStart(2, "0")}`,
    }));
    const repo = await makeRepo(tmp, specs);
    const { ctx, json } = makeCtx(library);
    const code = await run([`git:${repo}`, "--all", "--no-infer", "--json"], ctx);
    expect(code).toBe(0);
    const out = json[0] as { counts: { installed: number } };
    expect(out.counts.installed).toBe(15);
  });

  test("--skill is never gated even over a large repo", async () => {
    const specs: SkillSpec[] = Array.from({ length: 20 }, (_, i) => ({
      path: `skills/s${String(i).padStart(2, "0")}`,
    }));
    const repo = await makeRepo(tmp, specs);
    const { ctx } = makeCtx(library);
    const code = await run([`git:${repo}`, "--skill", "s00,s01", "--no-infer", "--json"], ctx);
    expect(code).toBe(0);
    expect(existsSync(join(library, "s00", "SKILL.md"))).toBe(true);
    expect(existsSync(join(library, "s01", "SKILL.md"))).toBe(true);
  });

  // (f) --list shows the FULL set with published/unpublished/internal markers.
  test("--list marks every skill published/unpublished/internal; never gated", async () => {
    const repo = await makeRepo(
      tmp,
      [
        { path: "engineering/alpha" },
        { path: "deprecated/gamma" },
        { path: "engineering/secret", internal: true },
      ],
      { kind: "plugin", json: { name: "x", skills: ["./engineering/alpha", "./engineering/secret"] } },
    );

    const { ctx, json } = makeCtx(library);
    const code = await run([`git:${repo}`, "--list", "--json"], ctx);
    expect(code).toBe(0);
    const out = json[0] as {
      skills: Array<{ name: string; published: boolean; internal: boolean }>;
    };
    const byName = new Map(out.skills.map((s) => [s.name, s]));
    expect(out.skills.length).toBe(3);
    expect(byName.get("alpha")!.published).toBe(true);
    expect(byName.get("alpha")!.internal).toBe(false);
    expect(byName.get("gamma")!.published).toBe(false); // unlisted by manifest
    expect(byName.get("secret")!.published).toBe(false); // internal excluded
    expect(byName.get("secret")!.internal).toBe(true);
  });

  test("--list is never gated even over a large repo", async () => {
    const specs: SkillSpec[] = Array.from({ length: 30 }, (_, i) => ({
      path: `skills/s${String(i).padStart(2, "0")}`,
    }));
    const repo = await makeRepo(tmp, specs);
    const { ctx, json } = makeCtx(library);
    const code = await run([`git:${repo}`, "--list", "--json"], ctx);
    expect(code).toBe(0);
    const out = json[0] as { skills: unknown[] };
    expect(out.skills.length).toBe(30);
  });

  // (g) no-manifest repo still installs every (valid) discovered skill, under the gate.
  test("no-manifest repo: --all installs every skill (today's behavior)", async () => {
    const repo = await makeRepo(tmp, [
      { path: "skills/alpha" },
      { path: "skills/beta" },
      { path: "skills/gamma" },
    ]);
    const { ctx, json } = makeCtx(library);
    const code = await run([`git:${repo}`, "--all", "--no-infer", "--json"], ctx);
    expect(code).toBe(0);
    const out = json[0] as { counts: { installed: number } };
    expect(out.counts.installed).toBe(3);
  });

  // --dry-run runs over the PUBLISHED set (the set --all would install), never gated.
  test("--dry-run preflights only the published set", async () => {
    const repo = await makeRepo(
      tmp,
      [
        { path: "engineering/alpha" },
        { path: "deprecated/gamma" },
      ],
      { kind: "plugin", json: { name: "x", skills: ["./engineering/alpha"] } },
    );
    const { ctx, json } = makeCtx(library);
    const code = await run([`git:${repo}`, "--all", "--dry-run", "--json"], ctx);
    expect(code).toBe(0);
    const out = json[0] as { skills: Array<{ name: string }>; willInstall: number };
    const names = out.skills.map((s) => s.name).sort();
    expect(names).toEqual(["alpha"]); // gamma is unpublished -> not previewed
    expect(out.willInstall).toBe(1);
  });

  // Discovery still finds EVERYTHING (existence) — the manifest is an allowlist, not a source of truth.
  test("discoverSkills still surfaces all skills, tagged published/internal", async () => {
    const repo = await makeRepo(
      tmp,
      [
        { path: "engineering/alpha" },
        { path: "deprecated/gamma" },
        { path: "engineering/secret", internal: true },
      ],
      { kind: "plugin", json: { name: "x", skills: ["./engineering/alpha", "./engineering/secret"] } },
    );
    // discoverSkills runs against a CHECKOUT root; clone manually to a plain dir.
    const checkout = join(tmp, "checkout");
    await Bun.spawn(["git", "clone", "-q", repo, checkout], { stdout: "ignore", stderr: "ignore" }).exited;
    const found = await discoverSkills(checkout);
    const byName = new Map(found.map((d) => [d.name, d]));
    expect(found.length).toBe(3);
    expect(byName.get("alpha")!.published).toBe(true);
    expect(byName.get("gamma")!.published).toBe(false);
    expect(byName.get("secret")!.published).toBe(false);
    expect(byName.get("secret")!.internal).toBe(true);
  });

  // A manifest entry that points at a path with no valid SKILL.md contributes nothing.
  test("manifest allowlisting a nonexistent path contributes nothing", async () => {
    const repo = await makeRepo(
      tmp,
      [{ path: "engineering/alpha" }],
      { kind: "plugin", json: { name: "x", skills: ["./engineering/alpha", "./does/not/exist"] } },
    );
    const { ctx, json } = makeCtx(library);
    const code = await run([`git:${repo}`, "--all", "--no-infer", "--json"], ctx);
    expect(code).toBe(0);
    const out = json[0] as { counts: { installed: number } };
    expect(out.counts.installed).toBe(1);
  });
});
