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

/**
 * Add domains to a skill's taxonomy entry (union). Returns which were newly added vs
 * already present, plus the resulting list — so `skl tag` can report precisely
 * instead of silently no-op'ing. Only writes if something changed.
 */
export async function addDomainsForName(
  libraryPath: string,
  name: string,
  domains: string[],
): Promise<{ added: string[]; already: string[]; domains: string[] }> {
  const tax = await readTaxonomy(libraryPath);
  const cur = [...(tax.skills[name] ?? [])];
  const added: string[] = [];
  const already: string[] = [];
  for (const d of domains) {
    const s = String(d).trim();
    if (s === "") continue;
    if (cur.includes(s)) already.push(s);
    else {
      cur.push(s);
      added.push(s);
    }
  }
  if (added.length > 0) {
    tax.skills[name] = cur;
    await writeTaxonomy(libraryPath, tax);
  }
  return { added, already, domains: cur };
}

/**
 * Remove ONE domain from a skill's taxonomy entry. Returns true if it was present
 * and removed; false if the skill had no such taxonomy domain (caller errors rather
 * than silently no-op'ing — a typo'd untag should be visible). Drops the skill's key
 * entirely if it becomes empty.
 */
export async function removeDomainForName(
  libraryPath: string,
  name: string,
  domain: string,
): Promise<boolean> {
  const tax = await readTaxonomy(libraryPath);
  const cur = tax.skills[name];
  if (!cur || !cur.includes(domain)) return false;
  const next = cur.filter((d) => d !== domain);
  if (next.length === 0) delete tax.skills[name];
  else tax.skills[name] = next;
  await writeTaxonomy(libraryPath, tax);
  return true;
}

/**
 * Deterministically rename a domain across the WHOLE library taxonomy (every skill
 * tagged `oldDomain` becomes `newDomain`, de-duped, position preserved). This is the
 * pure rename the AI `infer` pass cannot promise — no re-reasoning, no other tag
 * touched. Returns the names of skills changed. Only writes if at least one changed.
 */
export async function renameDomainAcrossLibrary(
  libraryPath: string,
  oldDomain: string,
  newDomain: string,
): Promise<string[]> {
  const tax = await readTaxonomy(libraryPath);
  const changed: string[] = [];
  for (const [name, domains] of Object.entries(tax.skills)) {
    if (!domains.includes(oldDomain)) continue;
    const next: string[] = [];
    for (const d of domains) {
      const v = d === oldDomain ? newDomain : d;
      if (!next.includes(v)) next.push(v);
    }
    tax.skills[name] = next;
    changed.push(name);
  }
  if (changed.length > 0) await writeTaxonomy(libraryPath, tax);
  return changed;
}
