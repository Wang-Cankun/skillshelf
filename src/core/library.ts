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

/** All unique domains across the library (sorted). */
export function listDomains(skills: Skill[]): string[] {
  const set = new Set<string>();
  for (const s of skills) for (const d of s.domains) set.add(d);
  return [...set].sort();
}

export { basename as _basename, dirname as _dirname };
