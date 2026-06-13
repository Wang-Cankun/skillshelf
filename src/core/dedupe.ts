// Group duplicate / drifted skills by name + content hash.
// Classify a canonical copy vs divergent (drifted) copies vs exact duplicates.

import type { DuplicateGroup, Skill } from "../types.ts";

/**
 * Rank a skill as a canonical candidate. Higher is more canonical.
 * Preference: non-mirror > non-retired > has-domains > has-provenance(third-party kept) > path length (shorter).
 */
function canonicalScore(s: Skill): number {
  let score = 0;
  if (!s.mirrorOf) score += 1000; // real file, not a bridge mirror
  if (!s.retired) score += 500; // active over retired
  if (s.domains.length > 0) score += 100; // tagged
  score += Math.max(0, 50 - Math.min(50, s.path.length / 4)); // prefer shorter path
  return score;
}

/**
 * Group skills that share a `name`. For each group:
 *   - pick `canonical` by canonicalScore
 *   - `duplicates` = other copies with the SAME contentHash as canonical
 *   - `divergent` = copies with a DIFFERENT contentHash (drift)
 *   - `identical` = every copy shares one hash
 * Single-copy names are not returned (no duplication).
 */
export function findDuplicates(skills: Skill[]): DuplicateGroup[] {
  const byName = new Map<string, Skill[]>();
  for (const s of skills) {
    const arr = byName.get(s.name);
    if (arr) arr.push(s);
    else byName.set(s.name, [s]);
  }

  const groups: DuplicateGroup[] = [];
  for (const [name, copies] of byName) {
    if (copies.length < 2) continue;
    const sorted = [...copies].sort((a, b) => canonicalScore(b) - canonicalScore(a));
    const canonical = sorted[0]!;
    const rest = sorted.slice(1);
    const duplicates = rest.filter((s) => s.contentHash === canonical.contentHash);
    const divergent = rest.filter((s) => s.contentHash !== canonical.contentHash);
    const hashes = new Set(copies.map((s) => s.contentHash));
    groups.push({
      name,
      canonical,
      duplicates,
      divergent,
      identical: hashes.size === 1,
    });
  }
  groups.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return groups;
}

/**
 * Groups that have at least one divergent (drifted) copy — the ones needing
 * human review during migration.
 */
export function driftedGroups(groups: DuplicateGroup[]): DuplicateGroup[] {
  return groups.filter((g) => g.divergent.length > 0);
}

/** Exact-duplicate groups (identical content in multiple non-mirror locations). */
export function exactDuplicateGroups(groups: DuplicateGroup[]): DuplicateGroup[] {
  return groups.filter((g) => g.identical && g.duplicates.length > 0);
}

/**
 * A copy that is a faithful bridge mirror of the canonical: it points at the
 * canonical (`mirrorOf`) AND has identical content. Such a copy is the intended
 * `.agents/skills` <-> `.claude/skills` relationship, not a conflict to resolve.
 */
function isFaithfulMirror(s: Skill, canonical: Skill): boolean {
  return (
    s.mirrorOf != null &&
    s.mirrorOf === canonical.path &&
    s.contentHash === canonical.contentHash
  );
}

/**
 * User-facing conflict view: strip faithful mirrors from each group and drop any
 * group that is *nothing but* faithful mirrors. A mirror that has DRIFTED (different
 * content from its canonical) is kept — a stale bridge is a genuine signal.
 *
 * `findDuplicates` deliberately keeps mirrors (the raw grouping is the source of
 * truth for tests/other consumers); this filter is the presentation policy `scan`
 * applies so the report shows only decisions the user actually has to make.
 */
export function genuineConflictGroups(groups: DuplicateGroup[]): DuplicateGroup[] {
  const out: DuplicateGroup[] = [];
  for (const g of groups) {
    const duplicates = g.duplicates.filter((s) => !isFaithfulMirror(s, g.canonical));
    const divergent = g.divergent.filter((s) => !isFaithfulMirror(s, g.canonical));
    if (duplicates.length === 0 && divergent.length === 0) continue;
    const hashes = new Set(
      [g.canonical, ...duplicates, ...divergent].map((s) => s.contentHash),
    );
    out.push({ ...g, duplicates, divergent, identical: hashes.size === 1 });
  }
  return out;
}
