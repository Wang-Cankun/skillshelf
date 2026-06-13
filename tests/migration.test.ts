// Migration flow coverage (scan -> import): deterministic, no network.
//
// Builds temp roots on disk with hand-written SKILL.md candidates — including a
// duplicate across two roots and a drifted (same-name, different-body) pair —
// and points config/SKILLSHELF at a throwaway library, then exercises:
//
//   skl scan   — candidate discovery, duplicate + drift classification, per-root
//                counts, "candidate" semantics, --add-root persistence, and the
//                configured-roots fallback when no positional roots are given.
//   skl import — move + symlink-back (original becomes a symlink resolving to the
//                library copy; library holds the real dir; empty overlay created;
//                NO lockfile entry), --copy (original stays real), idempotent
//                refusal on an existing name, --as rename, --force overwrite.
//
// Plus the primaryDomain rule (ADR-0001): null until tags are applied; once an
// overlay carries domains, primaryDomain = domains[0].

import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { existsSync } from "node:fs";
import {
  mkdtemp,
  mkdir,
  writeFile,
  rm,
  lstat,
  realpath,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { loadContext } from "../src/config.ts";
import type { Ctx, CommandModule } from "../src/types.ts";
import * as scan from "../src/commands/scan.ts";
import * as importCmd from "../src/commands/import.ts";
import * as linkCmd from "../src/commands/link.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function scratch(prefix: string): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), prefix));
  cleanups.push(() => rm(d, { recursive: true, force: true }));
  return d;
}

/** Write a SKILL.md candidate dir under `root`. `body` differentiates contentHash. */
async function writeSkill(
  root: string,
  name: string,
  opts: { domains?: string[]; body?: string } = {},
): Promise<string> {
  const dir = join(root, name);
  await mkdir(dir, { recursive: true });
  const domainsLine =
    opts.domains && opts.domains.length
      ? `domains: [${opts.domains.join(", ")}]\n`
      : "";
  const body = opts.body ?? `# ${name}\nbody of ${name}\n`;
  await writeFile(
    join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${name} desc\n${domainsLine}---\n${body}`,
  );
  return dir;
}

/**
 * A capturing Ctx wired to a custom config file path + library, so --add-root
 * persistence and the configured-roots fallback are exercised against real disk.
 * (The shared helpers.ts makeCtx forces env library + the default config path;
 * here we need to control configFilePath and pre-seed roots.)
 */
async function makeCtxAt(opts: {
  library: string;
  configFilePath: string;
}): Promise<{ ctx: Ctx; buf: { out: string[]; err: string[]; json: unknown[] } }> {
  const env: NodeJS.ProcessEnv = { SKILLSHELF_LIBRARY: opts.library };
  const base = await loadContext({ env, configFilePath: opts.configFilePath });
  const buf = { out: [] as string[], err: [] as string[], json: [] as unknown[] };
  const fmt = (args: unknown[]) =>
    args.map((a) => (typeof a === "string" ? a : String(a))).join(" ");
  const ctx: Ctx = {
    ...base,
    log: (...a: unknown[]) => buf.out.push(fmt(a)),
    error: (...a: unknown[]) => buf.err.push(fmt(a)),
    json: (v: unknown) => buf.json.push(v),
  };
  return { ctx, buf };
}

/** Run a command's run() against a given ctx, capturing the exit code. */
async function runWith(
  mod: CommandModule,
  argv: string[],
  ctx: Ctx,
  buf: { out: string[]; err: string[]; json: unknown[] },
): Promise<{ code: number; out: string; err: string; json: unknown[] }> {
  const code = await mod.run(argv, ctx);
  return { code, out: buf.out.join("\n"), err: buf.err.join("\n"), json: buf.json };
}

// ---------------------------------------------------------------------------
// scan
// ---------------------------------------------------------------------------

describe("skl scan (migration discovery)", () => {
  test("finds candidates, classifies a duplicate + a drift group, counts per root", async () => {
    const rootA = await scratch("skl-mig-a-");
    const rootB = await scratch("skl-mig-b-");
    const libDir = await scratch("skl-mig-lib-");
    const library = join(libDir, "library");
    const cfg = join(await scratch("skl-mig-cfg-"), "config.json");

    // rootA: a unique skill, plus a "dup" and a "drift" copy.
    await writeSkill(rootA, "alpha", { domains: ["coding"] });
    await writeSkill(rootA, "dup", { body: "# dup\nshared body\n" });
    await writeSkill(rootA, "drift", { body: "# drift\nversion ONE\n" });
    // rootB: the SAME "dup" body (exact duplicate) and a DIFFERENT "drift" body.
    await writeSkill(rootB, "dup", { body: "# dup\nshared body\n" });
    await writeSkill(rootB, "drift", { body: "# drift\nversion TWO — diverged\n" });

    const { ctx, buf } = await makeCtxAt({ library, configFilePath: cfg });
    const r = await runWith(scan, [rootA, rootB, "--json"], ctx, buf);
    expect(r.code).toBe(0);

    const j = r.json[0] as any;

    // Candidate semantics: every discovered skill is a candidate (not yet in the
    // library). 3 under rootA + 2 under rootB = 5.
    expect(j.totals.candidates).toBe(5);
    const candNames = j.candidates.map((c: any) => c.name).sort();
    expect(candNames).toEqual(["alpha", "drift", "drift", "dup", "dup"]);
    // Candidates carry their attributing root and are not yet in any library.
    for (const c of j.candidates) {
      expect([rootA, rootB]).toContain(c.root);
      expect(c.path.startsWith(c.root)).toBe(true);
    }

    // Per-root counts.
    const perRoot = Object.fromEntries(
      j.perRoot.map((p: any) => [p.root, p.candidates]),
    );
    expect(perRoot[rootA]).toBe(3);
    expect(perRoot[rootB]).toBe(2);

    // Group classification: "dup" is an exact duplicate, "drift" is drift.
    const groups = Object.fromEntries(j.duplicateGroups.map((g: any) => [g.name, g]));
    expect(Object.keys(groups).sort()).toEqual(["drift", "dup"]);

    expect(groups.dup.kind).toBe("duplicate");
    expect(groups.dup.identical).toBe(true);
    expect(groups.dup.divergent.length).toBe(0);
    expect(groups.dup.locations.length).toBe(2);

    expect(groups.drift.kind).toBe("drift");
    expect(groups.drift.identical).toBe(false);
    expect(groups.drift.divergent.length).toBe(1);
    expect(groups.drift.recommendation).toContain("differ");

    // Totals expose the split.
    expect(j.totals.driftGroups).toBe(1);
    expect(j.totals.exactDuplicateGroups).toBe(1);
    expect(j.totals.duplicateGroups).toBe(2);
    // "alpha" is unique — not in any group.
    expect(groups.alpha).toBeUndefined();
  });

  test("--add-root persists into config.json and is idempotent", async () => {
    const rootA = await scratch("skl-mig-addr-");
    await writeSkill(rootA, "solo", { domains: ["x"] });
    const libDir = await scratch("skl-mig-addr-lib-");
    const library = join(libDir, "library");
    const cfg = join(await scratch("skl-mig-addr-cfg-"), "config.json");

    const a = await makeCtxAt({ library, configFilePath: cfg });
    const r1 = await runWith(scan, ["--add-root", rootA, "--json"], a.ctx, a.buf);
    expect(r1.code).toBe(0);
    const j1 = r1.json[0] as any;
    // Roots are absolutized (not realpath-resolved), so an already-absolute path
    // persists verbatim.
    expect(j1.roots).toContain(rootA);

    // Persisted to disk under `roots`.
    expect(existsSync(cfg)).toBe(true);
    const onDisk = JSON.parse(await Bun.file(cfg).text());
    expect(onDisk.roots).toContain(rootA);

    // Re-adding the same root is a no-op (still exactly one entry).
    const b = await makeCtxAt({ library, configFilePath: cfg });
    const r2 = await runWith(scan, ["--add-root", rootA, "--json"], b.ctx, b.buf);
    const j2 = r2.json[0] as any;
    expect(j2.roots.filter((x: string) => x === (j1.roots[0] as string)).length).toBe(1);
    expect(j2.roots.length).toBe(j1.roots.length);
  });

  test("uses configured roots when no positional roots are passed", async () => {
    const rootA = await scratch("skl-mig-cfgroot-");
    await writeSkill(rootA, "configured-skill", { domains: ["x"] });
    const libDir = await scratch("skl-mig-cfgroot-lib-");
    const library = join(libDir, "library");
    const cfgDir = await scratch("skl-mig-cfgroot-cfg-");
    const cfg = join(cfgDir, "config.json");

    // Persist the root first.
    const a = await makeCtxAt({ library, configFilePath: cfg });
    await runWith(scan, ["--add-root", rootA, "--json"], a.ctx, a.buf);

    // A fresh ctx (re-reads config) with NO positional roots must fall back to it.
    const b = await makeCtxAt({ library, configFilePath: cfg });
    expect(b.ctx.roots).toContain(rootA);
    const r = await runWith(scan, ["--json"], b.ctx, b.buf);
    expect(r.code).toBe(0);
    const j = r.json[0] as any;
    expect(j.candidates.map((c: any) => c.name)).toContain("configured-skill");
    expect(j.perRoot.map((p: any) => p.root)).toContain(rootA);
  });

  // Fix #1 regression: a skill reached through a SYMLINK inside a root must still
  // be attributed to that root. Previously rootOf() realpath'd the path, so the
  // symlink target (outside the root) fell to root:null and per-root undercounted.
  test("attributes a symlinked candidate to its declared root (no root:null)", async () => {
    const root = await scratch("skl-mig-link-");
    await writeSkill(root, "alpha", { domains: ["x"] });
    // A skill that physically lives OUTSIDE the root, surfaced via a symlink inside it.
    const extRoot = await scratch("skl-mig-link-ext-");
    const target = await writeSkill(extRoot, "linked", {});
    await symlink(target, join(root, "linked"));

    const libDir = await scratch("skl-mig-link-lib-");
    const library = join(libDir, "library");
    const cfg = join(await scratch("skl-mig-link-cfg-"), "config.json");

    const { ctx, buf } = await makeCtxAt({ library, configFilePath: cfg });
    const r = await runWith(scan, [root, "--json"], ctx, buf);
    expect(r.code).toBe(0);
    const j = r.json[0] as any;

    expect(j.totals.candidates).toBe(2);
    const perRootSum = j.perRoot.reduce((a: number, p: any) => a + p.candidates, 0);
    expect(perRootSum).toBe(j.totals.candidates);
    expect(j.candidates.filter((c: any) => c.root === null).length).toBe(0);

    const perRoot = Object.fromEntries(j.perRoot.map((p: any) => [p.root, p.candidates]));
    expect(perRoot[root]).toBe(2);
    const linked = j.candidates.find((c: any) => c.name === "linked");
    expect(linked.root).toBe(root);
    expect(linked.path.startsWith(root)).toBe(true);
  });

  // Fix #2: a faithful `.agents` bridge mirror of a `.claude` skill is the intended
  // relationship, not a conflict — it must NOT be reported as a duplicate/drift group.
  // A mirror that has DRIFTED (different body) is still surfaced as drift.
  test("suppresses faithful .agents/.claude mirrors but keeps drifted ones", async () => {
    const root = await scratch("skl-mig-mirror-");
    const claudeSkills = join(root, ".claude", "skills");
    const agentsSkills = join(root, ".agents", "skills");

    // foo: identical in both -> faithful mirror -> suppressed.
    await writeSkill(claudeSkills, "foo", { body: "# foo\nshared body\n" });
    await writeSkill(agentsSkills, "foo", { body: "# foo\nshared body\n" });
    // bar: drifted between the two -> kept as drift.
    await writeSkill(claudeSkills, "bar", { body: "# bar\nversion ONE\n" });
    await writeSkill(agentsSkills, "bar", { body: "# bar\nversion TWO — diverged\n" });

    const libDir = await scratch("skl-mig-mirror-lib-");
    const library = join(libDir, "library");
    const cfg = join(await scratch("skl-mig-mirror-cfg-"), "config.json");

    const { ctx, buf } = await makeCtxAt({ library, configFilePath: cfg });
    const r = await runWith(scan, [root, "--json"], ctx, buf);
    expect(r.code).toBe(0);
    const j = r.json[0] as any;

    const groups = Object.fromEntries(j.duplicateGroups.map((g: any) => [g.name, g]));
    // The faithful mirror is gone from the conflict view...
    expect(groups.foo).toBeUndefined();
    // ...but the drifted one remains, classified as drift.
    expect(groups.bar).toBeDefined();
    expect(groups.bar.kind).toBe("drift");
  });
});

// ---------------------------------------------------------------------------
// import
// ---------------------------------------------------------------------------

describe("skl import (consolidation)", () => {
  test("default move + symlink-back: original becomes a symlink to the library copy", async () => {
    const root = await scratch("skl-imp-move-");
    const orig = await writeSkill(root, "mover", {});
    const libDir = await scratch("skl-imp-move-lib-");
    const library = join(libDir, "library");
    const cfg = join(await scratch("skl-imp-move-cfg-"), "config.json");

    const { ctx, buf } = await makeCtxAt({ library, configFilePath: cfg });
    const r = await runWith(importCmd, ["mover", "--from", orig, "--json"], ctx, buf);
    expect(r.code).toBe(0);
    const j = r.json[0] as any;
    expect(j.ok).toBe(true);
    expect(j.mode).toBe("move");
    expect(j.linkedBack).toBe(true);

    const dest = join(library, "mover");
    // Library has a REAL directory with the SKILL.md body.
    expect((await lstat(dest)).isDirectory()).toBe(true);
    expect(existsSync(join(dest, "SKILL.md"))).toBe(true);

    // Original location is now a SYMLINK resolving to the library copy.
    expect((await lstat(orig)).isSymbolicLink()).toBe(true);
    expect(await realpath(orig)).toBe(await realpath(dest));

    // Empty overlay created so taxonomy can be applied later.
    const overlay = join(dest, "mover.shelf.json");
    expect(existsSync(overlay)).toBe(true);
    expect(JSON.parse(await Bun.file(overlay).text())).toEqual({});

    // NO lockfile entry (these are the user's own skills, not third-party).
    expect(existsSync(join(library, "shelf.lock.json"))).toBe(false);
  });

  test("--copy leaves the original a real dir and still creates the library copy", async () => {
    const root = await scratch("skl-imp-copy-");
    const orig = await writeSkill(root, "copier", {});
    const libDir = await scratch("skl-imp-copy-lib-");
    const library = join(libDir, "library");
    const cfg = join(await scratch("skl-imp-copy-cfg-"), "config.json");

    const { ctx, buf } = await makeCtxAt({ library, configFilePath: cfg });
    const r = await runWith(
      importCmd,
      ["copier", "--from", orig, "--copy", "--json"],
      ctx,
      buf,
    );
    expect(r.code).toBe(0);
    expect((r.json[0] as any).mode).toBe("copy");
    expect((r.json[0] as any).linkedBack).toBe(false);

    // Original stays a real (non-symlink) directory.
    const st = await lstat(orig);
    expect(st.isDirectory()).toBe(true);
    expect(st.isSymbolicLink()).toBe(false);

    // Library copy exists as a real dir.
    const dest = join(library, "copier");
    expect((await lstat(dest)).isDirectory()).toBe(true);
    expect(existsSync(join(dest, "SKILL.md"))).toBe(true);
  });

  test("--no-link-back moves into library and EMPTIES the original (thinning)", async () => {
    const root = await scratch("skl-imp-nolink-");
    const orig = await writeSkill(root, "thinned", {});
    const libDir = await scratch("skl-imp-nolink-lib-");
    const library = join(libDir, "library");
    const cfg = join(await scratch("skl-imp-nolink-cfg-"), "config.json");

    const { ctx, buf } = await makeCtxAt({ library, configFilePath: cfg });
    const r = await runWith(
      importCmd,
      ["thinned", "--from", orig, "--no-link-back", "--json"],
      ctx,
      buf,
    );
    expect(r.code).toBe(0);
    expect((r.json[0] as any).mode).toBe("move");
    expect((r.json[0] as any).linkedBack).toBe(false);

    // Original location is gone entirely (no symlink left behind).
    expect(existsSync(orig)).toBe(false);

    // Library copy is a real dir with the body.
    const dest = join(library, "thinned");
    expect((await lstat(dest)).isDirectory()).toBe(true);
    expect(existsSync(join(dest, "SKILL.md"))).toBe(true);
  });

  test("--copy and --no-link-back are mutually exclusive", async () => {
    const root = await scratch("skl-imp-excl-");
    const orig = await writeSkill(root, "both", {});
    const libDir = await scratch("skl-imp-excl-lib-");
    const library = join(libDir, "library");
    const cfg = join(await scratch("skl-imp-excl-cfg-"), "config.json");

    const { ctx, buf } = await makeCtxAt({ library, configFilePath: cfg });
    const r = await runWith(
      importCmd,
      ["both", "--from", orig, "--copy", "--no-link-back"],
      ctx,
      buf,
    );
    expect(r.code).toBe(1);
    expect(buf.err.join("\n")).toContain("mutually exclusive");
  });

  test("idempotent refusal: importing onto an existing name fails without --force", async () => {
    const root = await scratch("skl-imp-idem-");
    const orig1 = await writeSkill(root, "twin", { body: "# twin\nfirst\n" });
    const libDir = await scratch("skl-imp-idem-lib-");
    const library = join(libDir, "library");
    const cfg = join(await scratch("skl-imp-idem-cfg-"), "config.json");

    const a = await makeCtxAt({ library, configFilePath: cfg });
    const first = await runWith(importCmd, ["twin", "--from", orig1, "--json"], a.ctx, a.buf);
    expect(first.code).toBe(0);

    // A second, distinct candidate of the same name in a different root.
    const root2 = await scratch("skl-imp-idem2-");
    const orig2 = await writeSkill(root2, "twin", { body: "# twin\nsecond\n" });
    const b = await makeCtxAt({ library, configFilePath: cfg });
    const second = await runWith(importCmd, ["twin", "--from", orig2, "--json"], b.ctx, b.buf);
    expect(second.code).toBe(1);
    expect(second.err).toContain("already exists");
    // The original second candidate is untouched (still a real dir, not moved).
    expect((await lstat(orig2)).isDirectory()).toBe(true);
    expect((await lstat(orig2)).isSymbolicLink()).toBe(false);
  });

  test("--as imports under a different library name", async () => {
    const root = await scratch("skl-imp-as-");
    const orig = await writeSkill(root, "raw-name", {});
    const libDir = await scratch("skl-imp-as-lib-");
    const library = join(libDir, "library");
    const cfg = join(await scratch("skl-imp-as-cfg-"), "config.json");

    const { ctx, buf } = await makeCtxAt({ library, configFilePath: cfg });
    const r = await runWith(
      importCmd,
      ["raw-name", "--from", orig, "--as", "renamed", "--json"],
      ctx,
      buf,
    );
    expect(r.code).toBe(0);
    expect((r.json[0] as any).name).toBe("renamed");

    // Lands under the renamed slug, with a matching overlay file name.
    const dest = join(library, "renamed");
    expect((await lstat(dest)).isDirectory()).toBe(true);
    expect(existsSync(join(dest, "renamed.shelf.json"))).toBe(true);
    expect(existsSync(join(library, "raw-name"))).toBe(false);
  });

  test("rejects a path-traversal --as slug and never escapes the library", async () => {
    const root = await scratch("skl-imp-trav-");
    const orig = await writeSkill(root, "legit", {});
    const libDir = await scratch("skl-imp-trav-lib-");
    const library = join(libDir, "library");
    const cfg = join(await scratch("skl-imp-trav-cfg-"), "config.json");

    const { ctx, buf } = await makeCtxAt({ library, configFilePath: cfg });
    const r = await runWith(
      importCmd,
      ["legit", "--from", orig, "--as", "../../etc/evil", "--json"],
      ctx,
      buf,
    );
    // SLUG_RE rejects the traversal BEFORE any filesystem mutation.
    expect(r.code).toBe(1);
    expect(buf.err.join("\n")).toContain("invalid skill name");
    // The candidate is untouched (not moved, not symlinked).
    expect((await lstat(orig)).isSymbolicLink()).toBe(false);
    expect((await lstat(orig)).isDirectory()).toBe(true);
    // Nothing was written outside (or inside) the library.
    expect(existsSync(join(libDir, "etc"))).toBe(false);
    expect(existsSync(library)).toBe(false);
  });

  test("--force overwrites an existing library skill", async () => {
    const root = await scratch("skl-imp-force-");
    const orig1 = await writeSkill(root, "victim", { body: "# victim\nOLD body\n" });
    const libDir = await scratch("skl-imp-force-lib-");
    const library = join(libDir, "library");
    const cfg = join(await scratch("skl-imp-force-cfg-"), "config.json");

    const a = await makeCtxAt({ library, configFilePath: cfg });
    await runWith(importCmd, ["victim", "--from", orig1, "--json"], a.ctx, a.buf);

    const dest = join(library, "victim");
    expect(await Bun.file(join(dest, "SKILL.md")).text()).toContain("OLD body");

    // A new, distinct candidate of the same name; --force replaces the managed copy.
    const root2 = await scratch("skl-imp-force2-");
    const orig2 = await writeSkill(root2, "victim", { body: "# victim\nNEW body\n" });
    const b = await makeCtxAt({ library, configFilePath: cfg });
    const r = await runWith(
      importCmd,
      ["victim", "--from", orig2, "--force", "--json"],
      b.ctx,
      b.buf,
    );
    expect(r.code).toBe(0);
    expect(await Bun.file(join(dest, "SKILL.md")).text()).toContain("NEW body");
  });

  // Fix #3: a symlinked source dir is refused unless --follow (option b). A move
  // would rename the LINK (library owns no real copy); a copy would copy the link.
  test("refuses a symlinked --from without --follow", async () => {
    const root = await scratch("skl-imp-link-");
    const target = await writeSkill(root, "tgt", { body: "# tgt\nreal body\n" });
    const link = join(root, "lnk");
    await symlink(target, link);
    const libDir = await scratch("skl-imp-link-lib-");
    const library = join(libDir, "library");
    const cfg = join(await scratch("skl-imp-link-cfg-"), "config.json");

    const { ctx, buf } = await makeCtxAt({ library, configFilePath: cfg });
    const r = await runWith(importCmd, ["linked", "--from", link, "--json"], ctx, buf);
    expect(r.code).toBe(1);
    expect(buf.err.join("\n")).toContain("--follow");

    // The link and its target are untouched; nothing landed in the library.
    expect((await lstat(link)).isSymbolicLink()).toBe(true);
    expect(existsSync(join(target, "SKILL.md"))).toBe(true);
    expect(existsSync(join(library, "linked"))).toBe(false);
  });

  test("--follow dereferences the symlink and copies the target into the library", async () => {
    const root = await scratch("skl-imp-follow-");
    const target = await writeSkill(root, "tgt", { body: "# tgt\nreal body\n" });
    const link = join(root, "lnk");
    await symlink(target, link);
    const libDir = await scratch("skl-imp-follow-lib-");
    const library = join(libDir, "library");
    const cfg = join(await scratch("skl-imp-follow-cfg-"), "config.json");

    const { ctx, buf } = await makeCtxAt({ library, configFilePath: cfg });
    const r = await runWith(
      importCmd,
      ["linked", "--from", link, "--follow", "--json"],
      ctx,
      buf,
    );
    expect(r.code).toBe(0);
    const j = r.json[0] as any;
    expect(j.mode).toBe("copy");
    expect(j.followed).toBe(true);

    // The library owns a REAL directory (not a symlink) with the body.
    const dest = join(library, "linked");
    const st = await lstat(dest);
    expect(st.isSymbolicLink()).toBe(false);
    expect(st.isDirectory()).toBe(true);
    expect(await Bun.file(join(dest, "SKILL.md")).text()).toContain("real body");

    // Source link + its target are left intact (library holds an independent copy).
    expect((await lstat(link)).isSymbolicLink()).toBe(true);
    const tst = await lstat(target);
    expect(tst.isDirectory()).toBe(true);
    expect(tst.isSymbolicLink()).toBe(false);
  });

  test("--follow and --no-link-back are mutually exclusive", async () => {
    const root = await scratch("skl-imp-follow-excl-");
    const target = await writeSkill(root, "tgt", {});
    const link = join(root, "lnk");
    await symlink(target, link);
    const libDir = await scratch("skl-imp-follow-excl-lib-");
    const library = join(libDir, "library");
    const cfg = join(await scratch("skl-imp-follow-excl-cfg-"), "config.json");

    const { ctx, buf } = await makeCtxAt({ library, configFilePath: cfg });
    const r = await runWith(
      importCmd,
      ["linked", "--from", link, "--follow", "--no-link-back"],
      ctx,
      buf,
    );
    expect(r.code).toBe(1);
    expect(buf.err.join("\n")).toContain("cannot be combined");
  });
});

// ---------------------------------------------------------------------------
// primaryDomain after import (ADR-0001)
// ---------------------------------------------------------------------------

describe("primaryDomain after import (tags, not folders)", () => {
  test("null until tags applied; equals domains[0] once an overlay adds domains", async () => {
    const root = await scratch("skl-imp-pd-");
    // Candidate has NO domains in frontmatter.
    const orig = await writeSkill(root, "untagged", {});
    const libDir = await scratch("skl-imp-pd-lib-");
    const library = join(libDir, "library");
    const cfg = join(await scratch("skl-imp-pd-cfg-"), "config.json");

    const { ctx, buf } = await makeCtxAt({ library, configFilePath: cfg });
    const r = await runWith(importCmd, ["untagged", "--from", orig, "--json"], ctx, buf);
    expect(r.code).toBe(0);

    const { loadLibrary, findByName } = await import("../src/core/library.ts");

    // Freshly imported, untagged: primaryDomain is null.
    const lib0 = await loadLibrary(library);
    const s0 = findByName(lib0, "untagged")!;
    expect(s0.domains).toEqual([]);
    expect(s0.primaryDomain).toBeNull();

    // Write an overlay with domains; primaryDomain becomes domains[0].
    const dest = join(library, "untagged");
    await writeFile(
      join(dest, "untagged.shelf.json"),
      JSON.stringify({ domains: ["writing", "green-card"] }, null, 2) + "\n",
    );
    const lib1 = await loadLibrary(library);
    const s1 = findByName(lib1, "untagged")!;
    expect(s1.domains).toEqual(["writing", "green-card"]);
    expect(s1.primaryDomain).toBe("writing");
  });
});

// ---------------------------------------------------------------------------
// link — collapse a redundant copy into a symlink to the library (the inverse
// companion of import's symlink-back). Fulfills the one-canonical-copy rule for
// locations that were never consolidated.
// ---------------------------------------------------------------------------

describe("skl link (thin a redundant copy)", () => {
  /** Seed a real skill dir directly in the library (no import needed). */
  async function seedLibrarySkill(
    library: string,
    name: string,
    body: string,
  ): Promise<string> {
    return writeSkill(library, name, { body });
  }

  test("identical duplicate: replaced with a symlink into the library (no --force)", async () => {
    const libDir = await scratch("skl-link-lib-");
    const library = join(libDir, "library");
    const cfg = join(await scratch("skl-link-cfg-"), "config.json");
    await seedLibrarySkill(library, "foo", "# foo\nshared body\n");

    // A redundant real copy elsewhere with IDENTICAL body.
    const dupRoot = await scratch("skl-link-dup-");
    const dup = await writeSkill(dupRoot, "foo", { body: "# foo\nshared body\n" });

    const { ctx, buf } = await makeCtxAt({ library, configFilePath: cfg });
    const r = await runWith(linkCmd, ["foo", "--at", dup, "--json"], ctx, buf);
    expect(r.code).toBe(0);
    const j = r.json[0] as any;
    expect(j.status).toBe("linked");
    expect(j.discarded).toBe(true);

    // The duplicate is now a symlink resolving to the library copy.
    expect((await lstat(dup)).isSymbolicLink()).toBe(true);
    expect(await realpath(dup)).toBe(await realpath(join(library, "foo")));
    // The library copy is untouched.
    expect(await Bun.file(join(library, "foo", "SKILL.md")).text()).toContain("shared body");
  });

  test("divergent copy: refused without --force (nothing mutated)", async () => {
    const libDir = await scratch("skl-link-div-lib-");
    const library = join(libDir, "library");
    const cfg = join(await scratch("skl-link-div-cfg-"), "config.json");
    await seedLibrarySkill(library, "foo", "# foo\nLIBRARY body\n");

    const dupRoot = await scratch("skl-link-div-dup-");
    const dup = await writeSkill(dupRoot, "foo", { body: "# foo\nDIFFERENT body\n" });

    const { ctx, buf } = await makeCtxAt({ library, configFilePath: cfg });
    const r = await runWith(linkCmd, ["foo", "--at", dup], ctx, buf);
    expect(r.code).toBe(1);
    expect(buf.err.join("\n")).toContain("differs");
    // The divergent copy is left untouched (still a real dir).
    expect((await lstat(dup)).isSymbolicLink()).toBe(false);
    expect((await lstat(dup)).isDirectory()).toBe(true);
  });

  test("--force discards a divergent copy and links it; library copy wins", async () => {
    const libDir = await scratch("skl-link-force-lib-");
    const library = join(libDir, "library");
    const cfg = join(await scratch("skl-link-force-cfg-"), "config.json");
    await seedLibrarySkill(library, "foo", "# foo\nLIBRARY body\n");

    const dupRoot = await scratch("skl-link-force-dup-");
    const dup = await writeSkill(dupRoot, "foo", { body: "# foo\nstale DIFFERENT body\n" });

    const { ctx, buf } = await makeCtxAt({ library, configFilePath: cfg });
    const r = await runWith(linkCmd, ["foo", "--at", dup, "--force", "--json"], ctx, buf);
    expect(r.code).toBe(0);

    // Duplicate is now a symlink; the library (winner) content is unchanged.
    expect((await lstat(dup)).isSymbolicLink()).toBe(true);
    expect(await realpath(dup)).toBe(await realpath(join(library, "foo")));
    expect(await Bun.file(join(library, "foo", "SKILL.md")).text()).toContain("LIBRARY body");
  });

  test("idempotent: a path already pointing at the library copy is a no-op", async () => {
    const libDir = await scratch("skl-link-idem-lib-");
    const library = join(libDir, "library");
    const cfg = join(await scratch("skl-link-idem-cfg-"), "config.json");
    await seedLibrarySkill(library, "foo", "# foo\nbody\n");

    const dupRoot = await scratch("skl-link-idem-dup-");
    const dup = join(dupRoot, "foo");
    await symlink(join(library, "foo"), dup);

    const { ctx, buf } = await makeCtxAt({ library, configFilePath: cfg });
    const r = await runWith(linkCmd, ["foo", "--at", dup, "--json"], ctx, buf);
    expect(r.code).toBe(0);
    expect((r.json[0] as any).status).toBe("already");
    expect((await lstat(dup)).isSymbolicLink()).toBe(true);
  });

  test("refuses when the skill is not in the library", async () => {
    const libDir = await scratch("skl-link-missing-lib-");
    const library = join(libDir, "library");
    const cfg = join(await scratch("skl-link-missing-cfg-"), "config.json");
    await mkdir(library, { recursive: true });

    const dupRoot = await scratch("skl-link-missing-dup-");
    const dup = await writeSkill(dupRoot, "ghost", {});

    const { ctx, buf } = await makeCtxAt({ library, configFilePath: cfg });
    const r = await runWith(linkCmd, ["ghost", "--at", dup], ctx, buf);
    expect(r.code).toBe(1);
    expect(buf.err.join("\n")).toContain("not in the library");
    // Untouched.
    expect((await lstat(dup)).isSymbolicLink()).toBe(false);
  });

  test("safety: refuses to operate on a path inside the library", async () => {
    const libDir = await scratch("skl-link-inside-lib-");
    const library = join(libDir, "library");
    const cfg = join(await scratch("skl-link-inside-cfg-"), "config.json");
    await seedLibrarySkill(library, "foo", "# foo\nbody\n");

    const { ctx, buf } = await makeCtxAt({ library, configFilePath: cfg });
    const r = await runWith(linkCmd, ["foo", "--at", join(library, "foo")], ctx, buf);
    expect(r.code).toBe(1);
    // It is the library copy itself.
    expect(buf.err.join("\n")).toMatch(/library copy itself|inside the library/);
  });
});
