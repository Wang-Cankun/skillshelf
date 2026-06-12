// Load the canonical library: crawl the library root, merge overlays into
// effective skills, attach provenance from the lockfile, content-hash, list.

import { existsSync } from "node:fs";
import { basename, dirname } from "node:path";
import type { Skill } from "../types.ts";
import { crawl } from "./crawl.ts";
import { withOverlay } from "./overlay.ts";
import { readLockfile, provenanceForName } from "./provenance.ts";

/**
 * Load the canonical library at `libraryPath` into effective Skill[]:
 * crawl + overlay-merge + provenance attach. Returns [] if the path is missing.
 *
 * Library layout is FLAT and non-semantic (`library/<name>/`). Domain membership
 * lives entirely in tags (frontmatter + overlay); `primaryDomain` is the derived
 * view `domains[0]` of the *effective* (overlay-merged) tags, or null if a skill
 * has no domains. See docs/adr/0001-domain-is-tags-not-folders.md.
 */
export async function loadLibrary(libraryPath: string): Promise<Skill[]> {
  if (!existsSync(libraryPath)) return [];

  const { skills } = await crawl([libraryPath]);

  const lock = await readLockfile(libraryPath);

  const effective: Skill[] = [];
  for (const s of skills) {
    const merged = await withOverlay(s);
    // primaryDomain is derived from the EFFECTIVE (post-overlay) tags: domains[0].
    const withPrimary: Skill = {
      ...merged,
      primaryDomain: merged.domains.length > 0 ? merged.domains[0]! : null,
    };
    const prov = provenanceForName(lock, withPrimary.name);
    effective.push(prov ? { ...withPrimary, source: prov } : withPrimary);
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

/** All unique domains across the library (sorted). */
export function listDomains(skills: Skill[]): string[] {
  const set = new Set<string>();
  for (const s of skills) for (const d of s.domains) set.add(d);
  return [...set].sort();
}

export { basename as _basename, dirname as _dirname };
