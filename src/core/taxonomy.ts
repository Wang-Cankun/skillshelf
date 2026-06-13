// Central domain taxonomy (`<library>/taxonomy.json`) read/write/merge.
//
// ADR-0002 reverses the per-skill sidecar design (`<skill>.shelf.json`): instead
// of fragmenting one logical table (skill -> domains) across 100+ tiny files, the
// whole mapping lives in ONE file at the library root, beside shelf.lock.json.
//
// Shape: { "version": 1, "skills": { "<skill-name>": ["domain1","domain2"], ... } }
//
// It lives UNDER the library (library-portable; travels with the library content),
// not in config.json (which is machine-local: absolute paths). Because it is
// separate from skill bodies, `skl update` re-pulling SKILL.md never touches domain
// tags — the same survives-upstream-update guarantee the sidecar gave, centralized.

import { join } from "node:path";
import { existsSync } from "node:fs";
import type { Skill, Taxonomy } from "../types.ts";

/** Path to the central taxonomy file at the library root. */
export function taxonomyPath(libraryPath: string): string {
  return join(libraryPath, "taxonomy.json");
}

/** An empty, valid taxonomy. */
function emptyTaxonomy(): Taxonomy {
  return { version: 1, skills: {} };
}

/**
 * Read the central taxonomy at the library root; returns an empty taxonomy if
 * absent/invalid. Tolerant of malformed values: every skill entry is coerced to a
 * de-duped string[] of trimmed, non-empty domains.
 */
export async function readTaxonomy(libraryPath: string): Promise<Taxonomy> {
  const p = taxonomyPath(libraryPath);
  if (!existsSync(p)) return emptyTaxonomy();
  try {
    const text = await Bun.file(p).text();
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object") return emptyTaxonomy();
    const raw = (parsed as { skills?: unknown }).skills;
    const skills: Record<string, string[]> = {};
    if (raw && typeof raw === "object") {
      for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
        if (!Array.isArray(value)) continue;
        const out: string[] = [];
        for (const d of value) {
          const s = String(d).trim();
          if (s !== "" && !out.includes(s)) out.push(s);
        }
        skills[name] = out;
      }
    }
    return { version: 1, skills };
  } catch {
    return emptyTaxonomy();
  }
}

/**
 * Write the taxonomy (pretty 2-space JSON + trailing newline) with skill keys
 * SORTED for stable diffs.
 */
export async function writeTaxonomy(libraryPath: string, tax: Taxonomy): Promise<void> {
  const sorted: Record<string, string[]> = {};
  for (const name of Object.keys(tax.skills).sort()) {
    sorted[name] = tax.skills[name]!;
  }
  const out: Taxonomy = { version: 1, skills: sorted };
  await Bun.write(taxonomyPath(libraryPath), JSON.stringify(out, null, 2) + "\n");
}

/** Domains recorded for a skill name in the taxonomy. Empty if none. */
export function domainsForName(tax: Taxonomy, name: string): string[] {
  return tax.skills[name] ?? [];
}

/**
 * Merge the taxonomy's domains onto a base skill, producing the effective skill.
 * Taxonomy domains are unioned onto the skill's existing domains (existing first,
 * then taxonomy, de-duped, non-empty); `primaryDomain` is recomputed as the
 * effective `domains[0]` (or null). Pure — does not mutate the input.
 * (Mirrors the old applyOverlay semantics.)
 */
export function applyTaxonomy(skill: Skill, tax: Taxonomy): Skill {
  const domains = [...skill.domains];
  for (const d of domainsForName(tax, skill.name)) {
    const s = String(d).trim();
    if (s !== "" && !domains.includes(s)) domains.push(s);
  }
  const primaryDomain = domains.length > 0 ? domains[0]! : null;
  return { ...skill, domains, primaryDomain };
}

/**
 * Record domains for a skill name centrally: read the taxonomy, union the given
 * domains with any existing entry (de-duped, trimmed, non-empty), write it back.
 * Used by `add` when a domain is known at add time.
 */
export async function setDomainsForName(
  libraryPath: string,
  name: string,
  domains: string[],
): Promise<void> {
  const tax = await readTaxonomy(libraryPath);
  const merged = [...(tax.skills[name] ?? [])];
  for (const d of domains) {
    const s = String(d).trim();
    if (s !== "" && !merged.includes(s)) merged.push(s);
  }
  tax.skills[name] = merged;
  await writeTaxonomy(libraryPath, tax);
}
