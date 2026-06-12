// Load the canonical library: crawl the library root, merge overlays into
// effective skills, attach provenance from the lockfile, content-hash, list.

import { existsSync } from "node:fs";
import { basename, dirname, sep } from "node:path";
import type { Skill } from "../types.ts";
import { crawl } from "./crawl.ts";
import { withOverlay } from "./overlay.ts";
import { readLockfile, provenanceForName } from "./provenance.ts";

/**
 * Derive a primary-domain hint from a skill dir inside the library: the first
 * path segment under the library root is the primary-domain folder.
 *   <lib>/bioinfo/foo/SKILL.md -> "bioinfo"
 */
function libraryPrimaryDomain(libraryRoot: string): (dir: string) => string | null {
  const rootParts = libraryRoot.replace(/\/+$/, "").split(sep);
  // Structural folders that are not real domains (bridge/layout dirs).
  const STRUCTURAL = new Set([".agents", ".claude", "skills", "skill", "_retired"]);
  return (dir: string) => {
    const parts = dir.split(sep);
    // dir is <lib>/<domain>/<name>; domain is the segment right after root.
    if (parts.length > rootParts.length + 1) {
      const seg = parts[rootParts.length] ?? null;
      if (seg && !STRUCTURAL.has(seg)) return seg;
    }
    // Not a clean domain folder (e.g. a .agents mirror) — let frontmatter win.
    return null;
  };
}

/**
 * Load the canonical library at `libraryPath` into effective Skill[]:
 * crawl + overlay-merge + provenance attach. Returns [] if the path is missing.
 */
export async function loadLibrary(libraryPath: string): Promise<Skill[]> {
  if (!existsSync(libraryPath)) return [];

  const { skills } = await crawl([libraryPath], {
    primaryDomainOf: libraryPrimaryDomain(libraryPath),
  });

  const lock = await readLockfile(libraryPath);

  const effective: Skill[] = [];
  for (const s of skills) {
    const merged = await withOverlay(s);
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

/** All unique domains across the library (sorted). */
export function listDomains(skills: Skill[]): string[] {
  const set = new Set<string>();
  for (const s of skills) for (const d of s.domains) set.add(d);
  return [...set].sort();
}

export { basename as _basename, dirname as _dirname };
