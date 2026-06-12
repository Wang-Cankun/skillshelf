// Bundles = tag queries over domains[]. Resolving a bundle yields every skill
// tagged with the bundle's domain (regardless of physical folder). Plus explicit
// overlay bundle membership.

import type { Bundle, Skill } from "../types.ts";
import { overlayBundles } from "./overlay.ts";

/**
 * Resolve a single bundle name against the library. A skill is in the bundle if:
 *   - its `domains[]` contains the bundle name, OR
 *   - its overlay `bundles[]` lists the bundle name.
 * Retired skills are excluded by default.
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
    if (s.domains.includes(name)) {
      matched.push(s);
      continue;
    }
    const ob = await overlayBundles(s);
    if (ob.includes(name)) matched.push(s);
  }
  matched.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { name, skills: matched };
}

/**
 * List every available bundle (one per distinct domain tag) with its resolved
 * skills. Useful for `skl ls` with no argument and the trigger-bridge menu.
 */
export async function listBundles(
  skills: Skill[],
  opts: { includeRetired?: boolean } = {},
): Promise<Bundle[]> {
  const names = new Set<string>();
  for (const s of skills) {
    if (s.retired && !opts.includeRetired) continue;
    for (const d of s.domains) names.add(d);
    for (const b of await overlayBundles(s)) names.add(b);
  }
  const bundles: Bundle[] = [];
  for (const name of [...names].sort()) {
    bundles.push(await resolveBundle(skills, name, opts));
  }
  return bundles;
}

/** Synchronous resolve when overlays were already merged into domains[]. */
export function resolveBundleSync(skills: Skill[], bundleName: string): Bundle {
  const name = bundleName.trim();
  const matched = skills
    .filter((s) => !s.retired && s.domains.includes(name))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { name, skills: matched };
}
