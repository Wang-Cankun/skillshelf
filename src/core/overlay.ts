// Sidecar overlay (`<skill>.shelf.json`) read/write/merge.
// Effective skill = upstream frontmatter + overlay.

import { join } from "node:path";
import { existsSync } from "node:fs";
import type { Overlay, Skill } from "../types.ts";

/** Path to a skill's overlay file. */
export function overlayPath(skill: Skill): string {
  return join(skill.path, `${skill.name}.shelf.json`);
}

/** Read a skill's overlay, or null if none / unreadable. */
export async function readOverlay(skill: Skill): Promise<Overlay | null> {
  const p = overlayPath(skill);
  if (!existsSync(p)) return null;
  try {
    const text = await Bun.file(p).text();
    const parsed = JSON.parse(text) as Overlay;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Write a skill's overlay (pretty-printed JSON). */
export async function writeOverlay(skill: Skill, overlay: Overlay): Promise<void> {
  const p = overlayPath(skill);
  await Bun.write(p, JSON.stringify(overlay, null, 2) + "\n");
}

/**
 * Merge an overlay onto a base skill, producing the effective skill.
 * Overlay domains are unioned onto upstream domains (primary stays first).
 * Does not mutate the input.
 */
export function applyOverlay(skill: Skill, overlay: Overlay | null): Skill {
  if (!overlay) return skill;
  const domains = [...skill.domains];
  if (Array.isArray(overlay.domains)) {
    for (const d of overlay.domains) {
      const s = String(d).trim();
      if (s !== "" && !domains.includes(s)) domains.push(s);
    }
  }
  const primaryDomain =
    skill.primaryDomain ?? (domains.length > 0 ? domains[0]! : null);
  return { ...skill, domains, primaryDomain };
}

/** Load + apply a skill's overlay from disk in one step. */
export async function withOverlay(skill: Skill): Promise<Skill> {
  const overlay = await readOverlay(skill);
  return applyOverlay(skill, overlay);
}

/** Bundles a skill belongs to per its overlay (explicit membership). Empty if none. */
export async function overlayBundles(skill: Skill): Promise<string[]> {
  const overlay = await readOverlay(skill);
  if (!overlay?.bundles) return [];
  return overlay.bundles.map((b) => String(b).trim()).filter((b) => b !== "");
}
