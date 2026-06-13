// Bundles = tag queries over domains[]. Resolving a bundle yields every skill
// tagged with the bundle's domain (regardless of physical folder). Since
// loadLibrary already merges the central taxonomy into `domains[]`, membership is
// purely `s.domains.includes(name)` — there is no separate overlay bundle list.

import type { Bundle, Skill } from "../types.ts";

/**
 * Resolve a single bundle name against the library. A skill is in the bundle if
 * its `domains[]` (frontmatter + taxonomy, already merged by loadLibrary) contains
 * the bundle name. Retired skills are excluded by default.
 *
 * Kept async so existing `await` call sites stay unchanged.
 */
export async function resolveBundle(
  skills: Skill[],
  bundleName: string,
  opts: { includeRetired?: boolean } = {},
): Promise<Bundle> {
  const name = bundleName.trim();
  const matched: Skill[] = [];
  for (const s of skills) {
    if (s.retired && !opts.includeRetired) continue;
    if (s.domains.includes(name)) matched.push(s);
  }
  matched.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { name, skills: matched };
}

/**
 * List every available bundle (one per distinct domain tag) with its resolved
 * skills. Useful for `skl ls` with no argument and the trigger-bridge menu.
 *
 * Kept async so existing `await` call sites stay unchanged.
 */
export async function listBundles(
  skills: Skill[],
  opts: { includeRetired?: boolean } = {},
): Promise<Bundle[]> {
  const names = new Set<string>();
  for (const s of skills) {
    if (s.retired && !opts.includeRetired) continue;
    for (const d of s.domains) names.add(d);
  }
  const bundles: Bundle[] = [];
  for (const name of [...names].sort()) {
    bundles.push(await resolveBundle(skills, name, opts));
  }
  return bundles;
}

/** Synchronous resolve when taxonomy was already merged into domains[]. */
export function resolveBundleSync(skills: Skill[], bundleName: string): Bundle {
  const name = bundleName.trim();
  const matched = skills
    .filter((s) => !s.retired && s.domains.includes(name))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { name, skills: matched };
}
