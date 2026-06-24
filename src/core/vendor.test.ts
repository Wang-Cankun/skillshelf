// Unit tests for core/vendor.ts — the curator's library-WRITE boundary. Exercises
// installSkill (copy + provenance + verdict), adopt/track (offline provenance attach),
// and the shared guard suite (retired-tombstone, symlink-escape, safe-name) directly at
// the engine interface, on a REAL temp library dir (local-substitutable fs). The deep
// operations are tested here once; the command tests (add/track/migrate/import/link)
// remain the integration safety net for the parse/render shells.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm, realpath, symlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { parseFrontmatter } from "../lib/frontmatter.ts";
import { readLockfile } from "./provenance.ts";
import { loadLibrary } from "./library.ts";
import type { DiscoveredSkill } from "./fetch.ts";
import {
  installSkill,
  adopt,
  track,
  driftVerdict,
  destDirFor,
  nearestExisting,
  destEscapesLibrary,
  writesThroughSymlink,
  isRetiredOnly,
  bodyOf,
  type InstallOptions,
} from "./vendor.ts";

function skillBody(name: string, body = `body for ${name}`): string {
  return `---\nname: ${name}\ndescription: a ${name} skill for testing\n---\n\n# ${name}\n\n${body}\n`;
}

function bodyHash(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

/** Materialize a staging skill dir (the DiscoveredSkill.dir installSkill copies FROM). */
async function makeStagedSkill(parent: string, name: string, body?: string): Promise<DiscoveredSkill> {
  const dir = join(parent, "staging", name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "SKILL.md"), skillBody(name, body));
  return { name, dir, subpath: name, description: `a ${name} skill for testing`, internal: false, published: true };
}

/** A complete InstallOptions for a single-skill install; override per case. */
function installOpts(libraryPath: string, over: Partial<InstallOptions> = {}): InstallOptions {
  return {
    libraryPath,
    domainFolder: null,
    nameOverride: null,
    sourceStr: "github:owner/repo",
    ref: "abc123",
    channel: "github",
    infer: true,
    force: false,
    multi: false,
    ...over,
  };
}

describe("vendor.installSkill — copy + provenance + verdict", () => {
  let tmp: string;
  let library: string;

  beforeEach(async () => {
    tmp = await realpath(await mkdtemp(join(tmpdir(), "skl-vendor-")));
    library = join(tmp, "library");
    await mkdir(library, { recursive: true });
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("installs a fresh skill: copies the dir, records a lock entry, verdict=new", async () => {
    const skill = await makeStagedSkill(tmp, "foo");
    const o = await installSkill(skill, installOpts(library));

    expect(o.status).toBe("installed");
    expect(o.verdict).toBe("new");
    expect(o.name).toBe("foo");
    expect(o.path).toBe(join(library, "foo"));
    expect(existsSync(join(library, "foo", "SKILL.md"))).toBe(true);

    const lock = await readLockfile(library);
    const e = lock.entries.foo!;
    expect(e.source).toBe("github:owner/repo");
    expect(e.ref).toBe("abc123");
    expect(e.channel).toBe("github");
    expect(e.localEdits).toBe(false);
    const expectedBody = parseFrontmatter(skillBody("foo")).body;
    expect(e.installedHash).toBe(bodyHash(expectedBody));
  });

  test("multi mode re-installs an identical body losslessly (verdict=identical)", async () => {
    // SINGLE mode refuses ANY existing dest without --force (legacy rule), so the lossless
    // identical re-install is exercised through multi mode, which installs new+identical.
    const skill = await makeStagedSkill(tmp, "foo");
    await installSkill(skill, installOpts(library, { multi: true }));
    const o = await installSkill(skill, installOpts(library, { multi: true }));
    expect(o.status).toBe("installed");
    expect(o.verdict).toBe("identical");
    expect(o.reason).toContain("identical");
  });

  test("single mode refuses ANY existing dest without --force (legacy rule)", async () => {
    const skill = await makeStagedSkill(tmp, "foo");
    await installSkill(skill, installOpts(library));
    const o = await installSkill(skill, installOpts(library));
    expect(o.status).toBe("error");
    expect(o.verdict).toBe("identical");
    expect(o.reason).toContain("already exists");
  });

  test("a differing local body needs --force: single mode errors without it", async () => {
    const skill = await makeStagedSkill(tmp, "foo", "ORIGINAL");
    await installSkill(skill, installOpts(library));
    // Mutate upstream so the staged body now differs from the installed copy.
    const drifted = await makeStagedSkill(tmp, "foo", "UPSTREAM MOVED ON");
    const o = await installSkill(drifted, installOpts(library));
    expect(o.status).toBe("error");
    expect(o.verdict).toBe("differs");
    expect(o.reason).toContain("already exists");
  });

  test("--force overwrites a differing body and reports the force reason", async () => {
    await installSkill(await makeStagedSkill(tmp, "foo", "ORIGINAL"), installOpts(library));
    const o = await installSkill(
      await makeStagedSkill(tmp, "foo", "FORCED"),
      installOpts(library, { force: true }),
    );
    expect(o.status).toBe("installed");
    expect(o.verdict).toBe("differs");
    expect(o.reason).toContain("--force");
  });

  test("multi mode skips a differing body without --force (no clobber)", async () => {
    await installSkill(await makeStagedSkill(tmp, "foo", "ORIGINAL"), installOpts(library));
    const o = await installSkill(
      await makeStagedSkill(tmp, "foo", "DRIFTED"),
      installOpts(library, { multi: true }),
    );
    expect(o.status).toBe("skipped");
    expect(o.reason).toContain("not overwriting");
  });

  test("a domain folder lands the skill under it and tags the taxonomy", async () => {
    const skill = await makeStagedSkill(tmp, "foo");
    const o = await installSkill(skill, installOpts(library, { domainFolder: "data" }));
    expect(o.status).toBe("installed");
    expect(o.path).toBe(join(library, "data", "foo"));
    expect(o.domains).toEqual(["data"]);
    expect(existsSync(join(library, "data", "foo", "SKILL.md"))).toBe(true);
  });

  test("nameOverride renames the install slug", async () => {
    const skill = await makeStagedSkill(tmp, "foo");
    const o = await installSkill(skill, installOpts(library, { nameOverride: "bar" }));
    expect(o.name).toBe("bar");
    expect(existsSync(join(library, "bar", "SKILL.md"))).toBe(true);
  });
});

describe("vendor.installSkill — guard suite", () => {
  let tmp: string;
  let library: string;

  beforeEach(async () => {
    tmp = await realpath(await mkdtemp(join(tmpdir(), "skl-vendor-g-")));
    library = join(tmp, "library");
    await mkdir(library, { recursive: true });
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("rejects a path-escaping name before it reaches the filesystem", async () => {
    const skill = await makeStagedSkill(tmp, "foo");
    const o = await installSkill(skill, installOpts(library, { nameOverride: "../../etc" }));
    expect(o.status).toBe("error");
    expect(o.reason).toContain("invalid skill name");
  });

  test("refuses to install beside a retired-only tombstone (regardless of --force)", async () => {
    // Tombstone: <library>/_retired/foo with no active slot.
    await mkdir(join(library, "_retired", "foo"), { recursive: true });
    await writeFile(join(library, "_retired", "foo", "SKILL.md"), skillBody("foo"));
    expect(isRetiredOnly(library, "foo")).toBe(true);

    const skill = await makeStagedSkill(tmp, "foo");
    const o = await installSkill(skill, installOpts(library, { force: true }));
    expect(o.status).toBe("skipped");
    expect(o.verdict).toBe("retired");
    expect(o.reason).toContain("skl unretire foo");
    // Nothing was written to the active slot.
    expect(existsSync(join(library, "foo"))).toBe(false);
  });

  test("single mode refuses to write THROUGH a leaf symlink even with --force", async () => {
    // <library>/foo is a symlink pointing at an external dev repo.
    const dev = join(tmp, "dev-foo");
    await mkdir(dev, { recursive: true });
    await writeFile(join(dev, "SKILL.md"), skillBody("foo", "DEV REPO"));
    await symlink(dev, join(library, "foo"));

    const skill = await makeStagedSkill(tmp, "foo", "NEW");
    const o = await installSkill(skill, installOpts(library, { force: true }));
    expect(o.status).toBe("error");
    expect(o.reason).toContain("symlink");
    // The dev repo's body is untouched.
    const devBody = await Bun.file(join(dev, "SKILL.md")).text();
    expect(devBody).toContain("DEV REPO");
  });

  test("multi mode skips a write through a symlinked DOMAIN folder (ancestor escape)", async () => {
    // <library>/ext -> /external; installing under --domain ext must not write through it.
    const external = join(tmp, "external");
    await mkdir(external, { recursive: true });
    await symlink(external, join(library, "ext"));

    const skill = await makeStagedSkill(tmp, "foo");
    const o = await installSkill(skill, installOpts(library, { domainFolder: "ext", multi: true }));
    expect(o.status).toBe("skipped");
    expect(o.reason).toContain("symlink");
    expect(existsSync(join(external, "foo"))).toBe(false);
  });
});

describe("vendor guard primitives (pure-ish, fs-anchored)", () => {
  let tmp: string;
  let library: string;

  beforeEach(async () => {
    tmp = await realpath(await mkdtemp(join(tmpdir(), "skl-vendor-p-")));
    library = join(tmp, "library");
    await mkdir(library, { recursive: true });
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("destDirFor honors the optional domain folder", () => {
    expect(destDirFor("/lib", null, "foo")).toBe(join("/lib", "foo"));
    expect(destDirFor("/lib", "data", "foo")).toBe(join("/lib", "data", "foo"));
  });

  test("nearestExisting climbs to the closest on-disk ancestor", () => {
    const deep = join(library, "a", "b", "c");
    expect(nearestExisting(deep)).toBe(library);
  });

  test("destEscapesLibrary: a fresh in-library dest is NOT an escape", () => {
    expect(destEscapesLibrary(library, join(library, "foo"))).toBe(false);
  });

  test("destEscapesLibrary / writesThroughSymlink: a symlinked ancestor escaping the library is caught", async () => {
    const external = join(tmp, "external");
    await mkdir(external, { recursive: true });
    await symlink(external, join(library, "ext"));
    const dest = join(library, "ext", "foo");
    expect(destEscapesLibrary(library, dest)).toBe(true);
    expect(writesThroughSymlink(library, dest)).toBe(true);
  });

  test("writesThroughSymlink: a leaf symlink dest is caught", async () => {
    const dev = join(tmp, "dev");
    await mkdir(dev, { recursive: true });
    await symlink(dev, join(library, "foo"));
    expect(writesThroughSymlink(library, join(library, "foo"))).toBe(true);
  });

  test("bodyOf strips frontmatter to the body the hashes operate on", () => {
    expect(bodyOf(skillBody("foo", "HELLO"))).toContain("HELLO");
    expect(bodyOf(skillBody("foo", "HELLO"))).not.toContain("name: foo");
  });

  test("driftVerdict: new vs identical vs differs against a destination", async () => {
    const skill = await makeStagedSkill(tmp, "foo", "ORIGINAL");
    const dest = join(library, "foo");
    expect(await driftVerdict(skill, dest)).toBe("new");

    await installSkill(skill, installOpts(library));
    expect(await driftVerdict(skill, dest)).toBe("identical");

    const drifted = await makeStagedSkill(tmp, "foo", "CHANGED");
    expect(await driftVerdict(drifted, dest)).toBe("differs");
  });
});

describe("vendor.adopt / vendor.track — offline provenance attach", () => {
  let tmp: string;
  let library: string;

  beforeEach(async () => {
    tmp = await realpath(await mkdtemp(join(tmpdir(), "skl-vendor-a-")));
    library = join(tmp, "library");
    await mkdir(join(library, "foo"), { recursive: true });
    await writeFile(join(library, "foo", "SKILL.md"), skillBody("foo", "LOCAL BODY"));
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("attaches an adopted entry with the LOCAL body hash and empty ref (no network)", async () => {
    const lib = await loadLibrary(library);
    const res = await adopt(library, lib, { name: "foo", source: "github:owner/repo" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.adopted).toBe(true);
    expect(res.ref).toBe("");
    const expectedBody = parseFrontmatter(skillBody("foo", "LOCAL BODY")).body;
    expect(res.installedHash).toBe(bodyHash(expectedBody));

    const lock = await readLockfile(library);
    expect(lock.entries.foo!.adopted).toBe(true);
    expect(lock.entries.foo!.source).toBe("github:owner/repo");
  });

  test("track is the same implementation as adopt (alias)", () => {
    expect(track).toBe(adopt);
  });

  test("an explicit --ref is trusted: adopted=false", async () => {
    const lib = await loadLibrary(library);
    const res = await adopt(library, lib, { name: "foo", source: "github:owner/repo", ref: "deadbeef" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.adopted).toBe(false);
    expect(res.ref).toBe("deadbeef");
  });

  test("fails (with a bring-it-in hint) when the skill is not in the library", async () => {
    const lib = await loadLibrary(library);
    const res = await adopt(library, lib, { name: "ghost", source: "github:owner/repo" });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toContain("not in the library");
    expect(res.hint).toBeDefined();
  });

  test("refuses to re-adopt an already-tracked skill without --force", async () => {
    const lib = await loadLibrary(library);
    await adopt(library, lib, { name: "foo", source: "github:owner/repo" });
    const again = await adopt(library, lib, { name: "foo", source: "github:owner/repo" });
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.reason).toContain("already tracked");
  });

  test("--force re-adopts an existing entry", async () => {
    const lib = await loadLibrary(library);
    await adopt(library, lib, { name: "foo", source: "github:owner/repo" });
    const forced = await adopt(library, lib, { name: "foo", source: "github:owner/repo2", force: true });
    expect(forced.ok).toBe(true);
    if (!forced.ok) return;
    expect(forced.source).toBe("github:owner/repo2");
  });

  test("a github subpath round-trips in the add.ts @-convention", async () => {
    const lib = await loadLibrary(library);
    const res = await adopt(library, lib, { name: "foo", source: "github:owner/repo@skills/foo" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.source).toBe("github:owner/repo@skills/foo");
  });

  test("refuses a LINKED entry (its dev repo owns versioning)", async () => {
    // Replace library/foo with a symlink to an external dev repo -> entryMode=linked.
    const dev = join(tmp, "dev-foo");
    await mkdir(dev, { recursive: true });
    await writeFile(join(dev, "SKILL.md"), skillBody("foo", "DEV"));
    await rm(join(library, "foo"), { recursive: true, force: true });
    await symlink(dev, join(library, "foo"));

    const lib = await loadLibrary(library);
    const res = await adopt(library, lib, { name: "foo", source: "github:owner/repo" });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toContain("LINKED");
  });
});
