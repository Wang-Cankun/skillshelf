// Deployment inventory (`skl where`) — invert the library into "where is each
// skill deployed?". Deployment surfaces (~/.claude/skills, .agents/skills,
// codex/skills, …) are FLAT dirs of skill entries, so rather than fight crawl's
// recursive realpath-dedup (which discards the alias paths we need), we list each
// surface's direct entries and classify them against the library.
//
// Computed from reality — no stored state. See docs/adr (deployment visibility).

import { join, sep } from "node:path";
import { existsSync, type Dirent } from "node:fs";
import { readdir, readlink } from "node:fs/promises";
import type { DeploymentKind, DeploymentReport, DeploymentSite, Skill } from "../types.ts";
import { realpathOrSelf, isSymlink } from "../lib/fs.ts";
import { hashContent } from "./crawl.ts";
import { parseFrontmatter } from "../lib/frontmatter.ts";

const SKILL_FILE = "SKILL.md";

/** Hash a candidate's SKILL.md body the SAME way crawl does (frontmatter stripped). */
async function bodyHash(skillDir: string): Promise<string | null> {
  try {
    const raw = await Bun.file(join(skillDir, SKILL_FILE)).text();
    return hashContent(parseFrontmatter(raw).body);
  } catch {
    return null;
  }
}

/**
 * Inventory every deployment surface: for each direct entry, decide whether it is
 * a clean symlink into the library, a symlink to a foreign source, a real copy
 * (possibly drifted), or a dead link. `libSkills` supplies library names + body
 * hashes for drift detection. Surfaces are realpath-de-duplicated (Dropbox aliases)
 * and missing surfaces are skipped.
 */
export async function inventoryDeployments(
  surfaces: string[],
  libraryPath: string,
  libSkills: Skill[],
): Promise<DeploymentReport> {
  const libReal = realpathOrSelf(libraryPath);
  const libPrefix = libReal.endsWith(sep) ? libReal : libReal + sep;
  const libNames = new Set(libSkills.map((s) => s.name));
  const libHash = new Map(libSkills.map((s) => [s.name, s.contentHash] as const));

  // De-dupe surfaces by realpath (CloudStorage/Dropbox aliases the same vault);
  // never scan the library itself as a "surface".
  const seen = new Set<string>([libReal]);
  const realSurfaces: string[] = [];
  for (const s of surfaces) {
    if (!existsSync(s)) continue;
    const rp = realpathOrSelf(s);
    if (seen.has(rp)) continue;
    seen.add(rp);
    realSurfaces.push(s);
  }

  const sites: DeploymentSite[] = [];
  for (const surface of realSurfaces) {
    let entries: Dirent[];
    try {
      entries = await readdir(surface, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const full = join(surface, e.name);

      let kind: DeploymentKind;
      let target: string | null = null;
      let drift = false;

      if (isSymlink(full)) {
        target = await readlink(full).catch(() => null);
        if (!existsSync(full)) {
          kind = "dead";
        } else {
          const real = realpathOrSelf(full);
          kind = real === libReal || real.startsWith(libPrefix) ? "linked" : "foreign-link";
        }
      } else if (e.isDirectory() && existsSync(join(full, SKILL_FILE))) {
        // Linked-bookshelf mode: the library entry of this name may itself be a
        // symlink pointing AT this very dir (the dev-repo source). If so, this is
        // the canonical `source`, not a redundant `copy` — skip the drift check.
        const real = realpathOrSelf(full);
        const libEntryReal = realpathOrSelf(join(libraryPath, e.name));
        if (libNames.has(e.name) && real === libEntryReal) {
          kind = "source";
        } else {
          kind = "copy";
          const want = libHash.get(e.name);
          if (want) {
            const got = await bodyHash(full);
            drift = got != null && got !== want;
          }
        }
      } else {
        continue; // loose file or non-skill dir — not a deployment entry
      }

      sites.push({
        name: e.name,
        surface,
        path: full,
        kind,
        target,
        inLibrary: libNames.has(e.name),
        drift,
      });
    }
  }

  sites.sort((a, b) =>
    a.name !== b.name
      ? a.name < b.name ? -1 : 1
      : a.surface < b.surface ? -1 : a.surface > b.surface ? 1 : 0,
  );
  const problems = sites.filter((s) => s.kind !== "linked" && s.kind !== "source");
  return { surfaces: realSurfaces, sites, problems };
}

/** Group sites by skill name (stable order, names sorted). */
export function sitesByName(report: DeploymentReport): Map<string, DeploymentSite[]> {
  const m = new Map<string, DeploymentSite[]>();
  for (const s of report.sites) {
    const arr = m.get(s.name) ?? [];
    arr.push(s);
    m.set(s.name, arr);
  }
  return m;
}

/** One-line suggested fix for a flagged site (empty string for clean `linked`). */
export function suggestionFor(site: DeploymentSite): string {
  switch (site.kind) {
    case "dead":
      return "broken link — remove it";
    case "foreign-link":
      return `points outside the library (2nd source) — \`skl link ${site.name} --at ${site.path}\` to repoint at the library`;
    case "copy":
      if (!site.inLibrary) return `untracked copy — \`skl import ${site.name} --from ${site.path}\``;
      return site.drift
        ? `drifted copy — review, then \`skl link ${site.name} --at ${site.path}\` to collapse`
        : `redundant copy — \`skl link ${site.name} --at ${site.path}\` to dedupe to a symlink`;
    default:
      return "";
  }
}
