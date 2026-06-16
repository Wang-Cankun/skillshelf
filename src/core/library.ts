// Load the canonical library: crawl the library root, merge the central taxonomy
// into effective skills, attach provenance from the lockfile, content-hash, list.

import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { Skill } from "../types.ts";
import { crawl } from "./crawl.ts";
import { readTaxonomy, applyTaxonomy } from "./taxonomy.ts";
import { readLockfile, provenanceForName } from "./provenance.ts";
import { isSymlink, realpathOrSelf } from "../lib/fs.ts";

/**
 * Load the canonical library at `libraryPath` into effective Skill[]:
 * crawl + taxonomy-merge + provenance attach. Returns [] if the path is missing.
 *
 * Library layout is FLAT and non-semantic (`library/<name>/`). Domain membership
 * lives entirely in tags (frontmatter + central taxonomy.json); `primaryDomain`
 * is the derived view `domains[0]` of the *effective* (taxonomy-merged) tags, or
 * null if a skill has no domains. See docs/adr/0001-domain-is-tags-not-folders.md
 * and docs/adr/0002-central-taxonomy-not-sidecars.md.
 */
export async function loadLibrary(libraryPath: string): Promise<Skill[]> {
  if (!existsSync(libraryPath)) return [];

  const { skills } = await crawl([libraryPath]);

  // Read the central taxonomy + lockfile ONCE before the loop (both live at the
  // library root, beside the skill dirs).
  const tax = await readTaxonomy(libraryPath);
  const lock = await readLockfile(libraryPath);

  const effective: Skill[] = [];
  for (const s of skills) {
    // applyTaxonomy unions taxonomy domains onto frontmatter domains and recomputes
    // primaryDomain = effective domains[0] (or null).
    const merged = applyTaxonomy(s, tax);
    const prov = provenanceForName(lock, merged.name);
    effective.push(prov ? { ...merged, source: prov } : merged);
  }
  // stable ordering: primaryDomain then name
  effective.sort((a, b) => {
    const da = a.primaryDomain ?? "~";
    const db = b.primaryDomain ?? "~";
    if (da !== db) return da < db ? -1 : 1;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
  return effective;
}

/** Filter out retired skills (the activatable set). */
export function activeSkills(skills: Skill[]): Skill[] {
  return skills.filter((s) => !s.retired);
}

/** Find a skill by exact name (first match). */
export function findByName(skills: Skill[], name: string): Skill | undefined {
  return skills.find((s) => s.name === name);
}

/** Fuzzy search over name + description. Returns matches scored, best first. */
export function searchSkills(skills: Skill[], query: string): Skill[] {
  const q = query.toLowerCase().trim();
  if (q === "") return [];
  const terms = q.split(/\s+/);
  const scored: Array<{ skill: Skill; score: number }> = [];
  for (const s of skills) {
    const name = s.name.toLowerCase();
    const desc = s.description.toLowerCase();
    const domains = s.domains.join(" ").toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (name === t) score += 100;
      else if (name.includes(t)) score += 40;
      if (desc.includes(t)) score += 10;
      if (domains.includes(t)) score += 15;
    }
    if (score > 0) scored.push({ skill: s, score });
  }
  scored.sort((a, b) => b.score - a.score || (a.skill.name < b.skill.name ? -1 : 1));
  return scored.map((x) => x.skill);
}

/** A library entry's storage mode (ADR-0004). */
export type EntryMode = "owned" | "linked";

/**
 * Derive a library entry's mode from the filesystem — never stored, so it can't go
 * stale (per ADR-0004's realpath-based classification). LINKED = the library entry
 * `<library>/<name>` is a symlink resolving OUTSIDE the library (it points at an
 * external dev repo that stays canonical). OWNED = a real directory, or a symlink
 * resolving inside the library.
 *
 * Callers use this to keep upstream-pull commands (`outdated`, `update`) away from
 * LINKED entries: their canonical source is their own git, and following the symlink
 * to re-pull a github body would clobber the dev repo.
 */
export function entryMode(libraryPath: string, name: string): EntryMode {
  const entry = join(libraryPath, name);
  if (!isSymlink(entry)) return "owned";
  const real = realpathOrSelf(entry);
  const libRoot = realpathOrSelf(libraryPath);
  return real === libRoot || real.startsWith(libRoot + "/") ? "owned" : "linked";
}

/** Mode plus, for a LINKED entry, the external dev-repo path it resolves to. */
export interface EntryModeInfo {
  mode: EntryMode;
  /** the realpath a LINKED entry points at (the canonical dev repo); null when owned */
  linkTarget: string | null;
}

/**
 * Like entryMode, but also surfaces the dev-repo target for a LINKED entry — so
 * `ls`/`show --json` can report a skill's storage mode as a first-class field instead
 * of forcing an agent to `ls -la` the library and eyeball symlinks (ADR-0004).
 */
export function entryModeInfo(libraryPath: string, name: string): EntryModeInfo {
  const entry = join(libraryPath, name);
  if (!isSymlink(entry)) return { mode: "owned", linkTarget: null };
  const real = realpathOrSelf(entry);
  const libRoot = realpathOrSelf(libraryPath);
  const owned = real === libRoot || real.startsWith(libRoot + "/");
  return owned ? { mode: "owned", linkTarget: null } : { mode: "linked", linkTarget: real };
}

/** Directory holding retired (soft-deleted) tombstones, relative to the library root. */
export const RETIRED_DIR = "_retired";

/**
 * Reject a skill name that is not a single path segment — the choke point that keeps a
 * crafted/typo'd/agent-supplied `name` (e.g. "../../etc") from escaping the library when
 * it reaches `join(libraryPath, name)` and then `rm`/`rename`/copy. A name with no path
 * separator and no `.`/`..` cannot resolve outside its parent dir, so containment is
 * guaranteed without over-restricting otherwise-unusual existing slugs. Throws on a bad
 * name. Lives here (not in lifecycle.ts) so it sits beside entryStatus — the single
 * existence-resolution primitive both the read guards (add/import/new/link) and the write
 * mutations (lifecycle.ts re-exports it) funnel through.
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

/** Whether a name occupies the active and/or retired slot in the library. */
export interface EntryStatus {
  /** <library>/<name> exists (real dir or symlink) */
  active: boolean;
  /** <library>/_retired/<name> exists (real dir or symlink) */
  retired: boolean;
}

/**
 * Single source of truth for "is this name taken?" across BOTH locations a skill can
 * live: the active slot <library>/<name> and the retired tombstone
 * <library>/_retired/<name>. Existence = existsSync OR isSymlink, so a LINKED entry (a
 * symlink whose target may be absent) still counts as present. Name-validated via
 * assertSafeName so a path-escaping `name` can never be joined; collision guards in
 * add/import/new/link and the write mutations in lifecycle.ts (which delegates locateEntry
 * to this) both resolve existence here, so the active+retired rule lives in exactly one
 * place. Kept dependency-free of lifecycle.ts to avoid an import cycle.
 */
export function entryStatus(libraryPath: string, name: string): EntryStatus {
  assertSafeName(name);
  const activePath = join(libraryPath, name);
  const retiredPath = join(libraryPath, RETIRED_DIR, name);
  return {
    active: existsSync(activePath) || isSymlink(activePath),
    retired: existsSync(retiredPath) || isSymlink(retiredPath),
  };
}

/** All unique domains across the library (sorted). */
export function listDomains(skills: Skill[]): string[] {
  const set = new Set<string>();
  for (const s of skills) for (const d of s.domains) set.add(d);
  return [...set].sort();
}

export { basename as _basename, dirname as _dirname };
