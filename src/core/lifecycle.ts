// Library-lifecycle MUTATIONS — the inverse/edit side of the library that the read
// layer (loadLibrary, where, ls/index) already fully understands but had no write
// primitives for. Every mutation here keeps the three state surfaces consistent in
// ONE operation, because an agent hand-doing them (mv + edit taxonomy.json + edit
// shelf.lock.json) reliably half-does it:
//
//   1. the on-disk entry  (<library>/<name>/  or  <library>/_retired/<name>/)
//   2. the central taxonomy  (<library>/taxonomy.json)         — domain tags
//   3. the provenance lockfile  (<library>/shelf.lock.json)    — upstream tracking
//
// Callers regenerate INDEX.md via reindexLibrary() after a mutation so the catalog
// never lists a skill that moved or vanished.

import { join } from "node:path";
import { existsSync } from "node:fs";
import { rename, rm, readdir } from "node:fs/promises";
import { isSymlink, ensureDir } from "../lib/fs.ts";
import { parseFrontmatter, serializeFrontmatter } from "../lib/frontmatter.ts";
import { readTaxonomy, writeTaxonomy } from "./taxonomy.ts";
import { readLockfile, writeLockfile } from "./provenance.ts";
import { loadLibrary } from "./library.ts";
import { writeIndex } from "./indexgen.ts";

const RETIRED_DIR = "_retired";

/**
 * Reject a skill name that is not a single path segment — the choke point that keeps
 * a crafted/typo'd/agent-supplied `name` (e.g. "../../etc") from escaping the library
 * when it reaches `join(libraryPath, name)` and then `rm`/`rename`. A name with no path
 * separator and no `.`/`..` cannot resolve outside its parent dir, so containment is
 * guaranteed without over-restricting otherwise-unusual existing slugs. Throws on a bad
 * name; every name-keyed mutation funnels through locateEntry, so validating here covers
 * removeSkill / retireSkill / unretireSkill / renameSkill in one place.
 */
export function assertSafeName(name: string): void {
  if (
    name === "" ||
    name === "." ||
    name === ".." ||
    name.includes("/") ||
    name.includes("\\") ||
    name.includes("\0")
  ) {
    throw new Error(`invalid skill name '${name}' — must be a single name, no path separators or '..'`);
  }
}

/** Regenerate INDEX.md from the current library state. Returns the path written. */
export async function reindexLibrary(libraryPath: string): Promise<string> {
  const skills = await loadLibrary(libraryPath);
  return writeIndex(libraryPath, skills);
}

/** Where a skill entry physically lives, if anywhere. */
export interface EntryLocation {
  /** the active path <library>/<name> exists (real dir or symlink) */
  active: boolean;
  /** the retired path <library>/_retired/<name> exists */
  retired: boolean;
  /** the resolved path to operate on (active preferred), or null if absent */
  path: string | null;
  /** true if the located entry is a symlink (a LINKED bookshelf entry) */
  isLink: boolean;
}

/** Locate a skill entry across the active and retired locations. */
export function locateEntry(libraryPath: string, name: string): EntryLocation {
  assertSafeName(name);
  const activePath = join(libraryPath, name);
  const retiredPath = join(libraryPath, RETIRED_DIR, name);
  const active = existsSync(activePath) || isSymlink(activePath);
  const retired = existsSync(retiredPath) || isSymlink(retiredPath);
  const path = active ? activePath : retired ? retiredPath : null;
  const isLink = path ? isSymlink(path) : false;
  return { active, retired, path, isLink };
}

export interface RemoveResult {
  name: string;
  removedPath: string;
  wasRetired: boolean;
  wasLink: boolean;
  taxonomyDropped: boolean;
  lockDropped: boolean;
}

/**
 * Delete a skill from the library entirely: remove its dir (or symlink — removing a
 * LINKED entry's symlink never touches the dev repo it points at) AND drop its
 * taxonomy + lockfile entries, so no stale state is left behind. Throws if absent.
 */
export async function removeSkill(libraryPath: string, name: string): Promise<RemoveResult> {
  const loc = locateEntry(libraryPath, name);
  if (!loc.path) throw new Error(`'${name}' is not in the library`);

  // rm on a symlink removes the link, not its target (the dev repo stays intact).
  await rm(loc.path, { recursive: true, force: true });

  const tax = await readTaxonomy(libraryPath);
  const taxonomyDropped = name in tax.skills;
  if (taxonomyDropped) {
    delete tax.skills[name];
    await writeTaxonomy(libraryPath, tax);
  }

  const lock = await readLockfile(libraryPath);
  const lockDropped = name in lock.entries;
  if (lockDropped) {
    delete lock.entries[name];
    await writeLockfile(libraryPath, lock);
  }

  // prune an empty _retired/ dir so removal leaves no orphaned scaffolding.
  await pruneRetiredIfEmpty(libraryPath);

  return {
    name,
    removedPath: loc.path,
    wasRetired: loc.retired && !loc.active,
    wasLink: loc.isLink,
    taxonomyDropped,
    lockDropped,
  };
}

/**
 * Soft-delete: move an active skill into <library>/_retired/<name>/. Retired skills
 * are kept (read-side already renders them struck-through / "(retired)") but excluded
 * from bundles and deployment. Taxonomy/lock entries are preserved (provenance). The
 * inverse of unretireSkill.
 */
export async function retireSkill(libraryPath: string, name: string): Promise<string> {
  const loc = locateEntry(libraryPath, name);
  if (!loc.active) {
    if (loc.retired) throw new Error(`'${name}' is already retired`);
    throw new Error(`'${name}' is not in the library`);
  }
  const dest = join(libraryPath, RETIRED_DIR, name);
  if (existsSync(dest) || isSymlink(dest)) {
    throw new Error(`a retired '${name}' already exists at ${dest}`);
  }
  await ensureDir(join(libraryPath, RETIRED_DIR));
  await rename(join(libraryPath, name), dest);
  return dest;
}

/** Inverse of retireSkill: move a retired skill back to the active location. */
export async function unretireSkill(libraryPath: string, name: string): Promise<string> {
  const loc = locateEntry(libraryPath, name);
  if (!loc.retired) throw new Error(`'${name}' is not retired`);
  const dest = join(libraryPath, name);
  if (existsSync(dest) || isSymlink(dest)) {
    throw new Error(`an active '${name}' already exists at ${dest}`);
  }
  await rename(join(libraryPath, RETIRED_DIR, name), dest);
  await pruneRetiredIfEmpty(libraryPath);
  return dest;
}

export interface RenameResult {
  from: string;
  to: string;
  movedPath: string;
  frontmatterRewritten: boolean;
  taxonomyMoved: boolean;
  lockMoved: boolean;
  wasRetired: boolean;
}

/**
 * Rename a skill's slug, moving every coupled piece of state together: the library
 * dir, the SKILL.md frontmatter `name:`, the taxonomy key, and the lockfile key. A
 * hand `mv` alone leaves a half-renamed skill (dir=new, frontmatter/taxonomy=old).
 * Does NOT repoint external deploy symlinks (they point at the old library path) —
 * callers should re-run `skl use` / `skl where` after; reported as a caveat.
 */
export async function renameSkill(
  libraryPath: string,
  from: string,
  to: string,
): Promise<RenameResult> {
  const loc = locateEntry(libraryPath, from);
  if (!loc.path) throw new Error(`'${from}' is not in the library`);
  if (locateEntry(libraryPath, to).path) {
    throw new Error(`'${to}' already exists in the library — choose another name`);
  }

  const wasRetired = loc.retired && !loc.active;
  const srcDir = loc.path;
  const destDir = wasRetired ? join(libraryPath, RETIRED_DIR, to) : join(libraryPath, to);
  await rename(srcDir, destDir);

  // The dir move is the only hard-to-reverse step; the frontmatter rewrite + taxonomy
  // + lock re-keying that follow are coupled (a crash between frontmatter-name=`to` and
  // taxonomy-key=`to` would strand the skill's tags — name derives from frontmatter but
  // tags key off the taxonomy). Wrap them so a thrown write rolls the dir move back:
  // rename becomes all-or-nothing for the realistic IO/permission failure, instead of
  // leaving a half-renamed skill.
  try {
    // Rewrite the SKILL.md frontmatter name: to match the new slug (if it has one and
    // it named the old slug). For a LINKED entry the SKILL.md lives in the dev repo —
    // skip the body rewrite (we must not edit the dev repo); only the library-side
    // metadata (taxonomy/lock) is rekeyed.
    let frontmatterRewritten = false;
    const skillMd = join(destDir, "SKILL.md");
    if (!loc.isLink && existsSync(skillMd)) {
      const raw = await Bun.file(skillMd).text();
      const fm = parseFrontmatter(raw);
      if (fm.hasFrontmatter && fm.data.name === from) {
        fm.data.name = to;
        await Bun.write(skillMd, serializeFrontmatter(fm.data, fm.body));
        frontmatterRewritten = true;
      }
    }

    const tax = await readTaxonomy(libraryPath);
    let taxonomyMoved = false;
    if (from in tax.skills) {
      tax.skills[to] = tax.skills[from]!;
      delete tax.skills[from];
      await writeTaxonomy(libraryPath, tax);
      taxonomyMoved = true;
    }

    const lock = await readLockfile(libraryPath);
    let lockMoved = false;
    if (from in lock.entries) {
      lock.entries[to] = { ...lock.entries[from]!, name: to };
      delete lock.entries[from];
      await writeLockfile(libraryPath, lock);
      lockMoved = true;
    }

    return { from, to, movedPath: destDir, frontmatterRewritten, taxonomyMoved, lockMoved, wasRetired };
  } catch (err) {
    // Best-effort rollback of the dir move so a failed rename leaves the original intact.
    await rename(destDir, srcDir).catch(() => {});
    throw err;
  }
}

/** Remove <library>/_retired/ if it is present and empty. Best-effort. */
async function pruneRetiredIfEmpty(libraryPath: string): Promise<void> {
  const dir = join(libraryPath, RETIRED_DIR);
  if (!existsSync(dir)) return;
  try {
    const entries = await readdir(dir);
    if (entries.length === 0) await rm(dir, { recursive: true, force: true });
  } catch {
    /* leave it */
  }
}
