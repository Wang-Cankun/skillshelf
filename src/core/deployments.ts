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

/**
 * Hash a candidate's SKILL.md body (frontmatter stripped, same as crawl) AND return its
 * frontmatter `description`. Drift must consider BOTH: the body, and the description —
 * because the deployed `description` is load-bearing (agents read it to decide when to
 * trigger a skill), so a copy with an identical body but a customized description is a
 * real divergence that `where --fix` must NOT silently dedupe away.
 */
async function readDeployed(skillDir: string): Promise<{ hash: string; description: string } | null> {
  try {
    const raw = await Bun.file(join(skillDir, SKILL_FILE)).text();
    const fm = parseFrontmatter(raw);
    return { hash: hashContent(fm.body), description: String(fm.data.description ?? "") };
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
  const libDesc = new Map(libSkills.map((s) => [s.name, s.description] as const));
  // realpath -> library skill name, for skills that are themselves link-shelved
  // (library/<name> is a symlink out to a dev repo). A deployment link that
  // resolves to such a skill's realpath is a CLEAN library deploy, not a
  // 2nd-source foreign-link — even though its realpath sits outside the library.
  const libRealToName = new Map(
    libSkills.map((s) => [realpathOrSelf(s.path), s.name] as const),
  );

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
          const insideLib = real === libReal || real.startsWith(libPrefix);
          // A link-shelved library skill resolves OUTSIDE the library (to its dev
          // repo), but deploying it is still a clean library deploy — match on the
          // library skill realpaths so it isn't mislabelled `foreign-link`.
          const shelvedName = libRealToName.get(real);
          if (insideLib || shelvedName) {
            kind = "linked";
            // Aliased: resolves to a library skill, but the deployed link-name
            // differs from that skill's name (e.g. `nuwa` -> <lib>/huashu-nuwa). By
            // realpath it looks clean, but a name-keyed view (agents/status) would
            // miss the real skill — flag it so `where --problems` surfaces it.
            const resolvedName = insideLib
              ? real.startsWith(libPrefix)
                ? real.slice(libPrefix.length).split(sep)[0]
                : ""
              : (shelvedName ?? "");
            if (resolvedName && resolvedName !== e.name) kind = "aliased";
          } else {
            kind = "foreign-link";
          }
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
            const got = await readDeployed(full);
            // Drift if the body differs OR the (load-bearing) description differs —
            // either makes this copy non-identical, so `where --fix` leaves it `manual`
            // rather than replacing it with a symlink and discarding the difference.
            drift =
              got != null &&
              (got.hash !== want || got.description !== (libDesc.get(e.name) ?? ""));
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

/**
 * What `skl where --fix` may do automatically for a flagged site. Only DETERMINISTIC,
 * non-destructive remediations are auto-applied (skillshelf never guesses which copy
 * wins). Everything that needs a human decision is "manual".
 *   - remove-dead : the symlink's target is gone — removing it loses nothing.
 *   - dedupe-copy : a real copy whose body MATCHES the library (inLibrary && !drift) —
 *                   safe to replace with a symlink into the library.
 *   - manual      : drifted copy / foreign-link / untracked copy — a real decision
 *                   (which wins, or import) that --fix must not make silently.
 */
export type RemediationAction = "remove-dead" | "dedupe-copy" | "manual";

export function remediationFor(site: DeploymentSite): RemediationAction {
  if (site.kind === "dead") return "remove-dead";
  if (site.kind === "copy" && site.inLibrary && !site.drift) return "dedupe-copy";
  return "manual";
}

/** One-line suggested fix for a flagged site (empty string for clean `linked`). */
export function suggestionFor(site: DeploymentSite): string {
  switch (site.kind) {
    case "dead":
      return "broken link — remove it";
    case "aliased":
      return `link-name differs from the library skill it points at — rename the link to match, or \`skl link\` it to the right skill`;
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
