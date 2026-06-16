// Crawl skill roots into Skill[] applying the crawl rules (see docs/ARCHITECTURE.md §6).
//
// Rules:
//   - Dedupe by realpath (aliased mounts like cloud-sync mirror locations).
//   - Treat `.agents/skills` as bridge mirrors of `.claude/skills`: set mirrorOf,
//     do not double-count as an independent skill.
//   - Skip `_retired/`: tag `retired: true`, do not activate.
//   - Ignore any path containing `node_modules`.
//   - Support both `name/SKILL.md` and `skills/name/SKILL.md` layouts.

import { createHash } from "node:crypto";
import { join, basename, sep } from "node:path";
import { readdir } from "node:fs/promises";
import { existsSync, type Dirent } from "node:fs";
import type { Skill } from "../types.ts";
import { parseFrontmatter } from "../lib/frontmatter.ts";
import { realpathOrSelf, isDirectory } from "../lib/fs.ts";

/** Expand a parent dir (like ~/Documents/GitHub) into candidate skill roots. */
export async function expandProjectRoots(parent: string): Promise<string[]> {
  const out: string[] = [];
  if (!existsSync(parent)) return out;
  let entries: Dirent[];
  try {
    entries = await readdir(parent, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name === "node_modules") continue;
    const proj = join(parent, e.name);
    for (const sub of [
      join(proj, ".claude", "skills"),
      join(proj, ".agents", "skills"),
      join(proj, "skills"),
      join(proj, "skill"),
    ]) {
      if (existsSync(sub)) out.push(sub);
    }
  }
  return out;
}

const SKILL_FILE = "SKILL.md";
const RETIRED_DIR = "_retired";

export function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function pathHasSegment(p: string, seg: string): boolean {
  return p.split(sep).includes(seg);
}

/** Pull effective domains from frontmatter (`domains` or `primaryDomain`). */
function readDomains(data: Record<string, unknown>): string[] {
  const out: string[] = [];
  const primary = data.primaryDomain ?? data.primary_domain;
  if (typeof primary === "string" && primary.trim() !== "") out.push(primary.trim());
  const d = data.domains;
  if (Array.isArray(d)) {
    for (const x of d) {
      const s = String(x).trim();
      if (s !== "") out.push(s);
    }
  } else if (typeof d === "string" && d.trim() !== "") {
    out.push(d.trim());
  }
  return [...new Set(out)];
}

/** True if a directory looks like a skill dir (contains SKILL.md). */
function isSkillDir(dir: string): boolean {
  return existsSync(join(dir, SKILL_FILE));
}

async function listRefFiles(skillDir: string, skillName: string): Promise<string[]> {
  const out: string[] = [];
  let entries: Dirent[];
  try {
    entries = await readdir(skillDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === SKILL_FILE) continue;
    if (e.name === `${skillName}.shelf.json`) continue;
    if (e.name === "shelf.lock.json") continue;
    if (e.name === ".DS_Store") continue;
    out.push(join(skillDir, e.name));
  }
  return out.sort();
}

async function buildSkill(
  skillDir: string,
  opts: {
    retired: boolean;
    mirrorOf: string | null;
    primaryDomain: string | null;
    discoveredRoot: string | null;
  },
): Promise<Skill | null> {
  const bodyPath = join(skillDir, SKILL_FILE);
  if (!existsSync(bodyPath)) return null;
  let raw: string;
  try {
    raw = await Bun.file(bodyPath).text();
  } catch {
    return null;
  }
  const { data, body } = parseFrontmatter(raw);
  const dirName = basename(skillDir);
  const name =
    typeof data.name === "string" && data.name.trim() !== ""
      ? data.name.trim()
      : dirName;
  const description =
    typeof data.description === "string" ? data.description.trim() : "";
  const domains = readDomains(data);
  const primaryDomain =
    opts.primaryDomain ?? (domains.length > 0 ? domains[0]! : null);
  const refFiles = await listRefFiles(skillDir, name);

  return {
    name,
    description,
    primaryDomain,
    domains: domains.length > 0 ? domains : primaryDomain ? [primaryDomain] : [],
    path: skillDir,
    bodyPath,
    refFiles,
    source: null,
    retired: opts.retired,
    mirrorOf: opts.mirrorOf,
    contentHash: hashContent(body),
    discoveredRoot: opts.discoveredRoot,
  };
}

/**
 * Find every skill dir under a root, supporting:
 *   - <root>/<name>/SKILL.md
 *   - <root>/skills/<name>/SKILL.md
 *   - <root>/_retired/<name>/SKILL.md  (retired)
 * Returns absolute skill dirs paired with whether they're retired.
 */
async function discoverSkillDirs(
  root: string,
): Promise<Array<{ dir: string; retired: boolean }>> {
  const out: Array<{ dir: string; retired: boolean }> = [];
  if (!existsSync(root)) return out;

  // Bounded recursive descent. A directory containing SKILL.md is a skill leaf.
  // Otherwise it's a grouping dir (domain folder, `skills/`, `.agents/skills/`,
  // `_retired/`, project root) and we recurse. `_retired` taints everything below.
  const SKIP = new Set(["node_modules", ".git"]);
  // Hidden (dot-prefixed) child dirs are skipped during descent — they're caches,
  // editor state, and backups (e.g. `.pre-cloudflare-plugin-backup/`), not active
  // skills — EXCEPT the known agent skill-grouping dot-dirs, which must stay
  // reachable when scanning a project parent. skillshelf is agent-agnostic
  // (ADR-0003): these track the cross-agent ecosystem (`.claude`, `.codex`,
  // `.opencode`, `.cursor`) plus Claude's `.agents` bridge format. (A root passed
  // in directly, e.g. `.codex/skills`, is never filtered here; only its children.)
  const ALLOW_DOT = new Set([".claude", ".agents", ".codex", ".opencode", ".cursor"]);
  const MAX_DEPTH = 8;

  async function recurse(dir: string, depth: number, retired: boolean): Promise<void> {
    if (depth > MAX_DEPTH) return;
    if (isSkillDir(dir)) {
      out.push({ dir, retired });
      return; // do not descend into a skill's own subtree (reference/ etc.)
    }
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (SKIP.has(e.name)) continue;
      // Skip hidden child dirs (backups/caches) but keep skill-grouping dot-dirs.
      if (e.name.startsWith(".") && !ALLOW_DOT.has(e.name)) continue;
      const full = join(dir, e.name);
      if (pathHasSegment(full, "node_modules")) continue;
      const isDir =
        e.isDirectory() || (e.isSymbolicLink() && (await isDirectory(full)));
      if (!isDir) continue;
      const childRetired = retired || e.name === RETIRED_DIR;
      await recurse(full, depth + 1, childRetired);
    }
  }

  await recurse(root, 0, false);
  return out;
}

export interface CrawlOptions {
  /** primary-domain hint applied to all skills found under this root (library mode) */
  primaryDomainOf?: (skillDir: string) => string | null;
}

export interface CrawlResult {
  skills: Skill[];
  /** roots that were skipped because they realpath-dedupe to an earlier root */
  dedupedRoots: string[];
}

/**
 * Crawl a set of roots into Skill[]. Applies realpath-dedupe across roots and
 * across individual skill dirs, marks `.agents/skills` mirrors, tags retired,
 * skips node_modules.
 */
export async function crawl(
  roots: string[],
  opts: CrawlOptions = {},
): Promise<CrawlResult> {
  const dedupedRoots: string[] = [];
  const seenRootReal = new Set<string>();
  const effectiveRoots: string[] = [];
  for (const r of roots) {
    const rp = realpathOrSelf(r);
    if (seenRootReal.has(rp)) {
      dedupedRoots.push(r);
      continue;
    }
    seenRootReal.add(rp);
    effectiveRoots.push(r);
  }

  // Map realpath(skillDir) -> Skill, so aliased copies collapse.
  const byReal = new Map<string, Skill>();
  // Track canonical (.claude / non-.agents) skill dirs by realpath of body,
  // so .agents mirrors can point mirrorOf at them.
  const claudeByName = new Map<string, string>(); // name -> canonical skill dir path

  // First pass: collect all skill dirs with their root + agents flag.
  interface Found {
    dir: string;
    retired: boolean;
    isAgents: boolean;
    root: string;
  }
  const found: Found[] = [];
  for (const root of effectiveRoots) {
    const dirs = await discoverSkillDirs(root);
    for (const d of dirs) {
      // A skill dir is a bridge mirror if it lives under a `.agents` path.
      const isAgents = pathHasSegment(d.dir, ".agents");
      found.push({ dir: d.dir, retired: d.retired, isAgents, root });
    }
  }

  // Record canonical (non-.agents) names first, so mirrors can point at them.
  for (const f of found) {
    if (f.isAgents) continue;
    const name = basename(f.dir);
    if (!claudeByName.has(name)) claudeByName.set(name, f.dir);
  }

  for (const f of found) {
    const real = realpathOrSelf(f.dir);
    if (byReal.has(real)) continue; // aliased duplicate dir

    let mirrorOf: string | null = null;
    if (f.isAgents) {
      const name = basename(f.dir);
      mirrorOf = claudeByName.get(name) ?? null;
    }
    const primaryDomain = opts.primaryDomainOf?.(f.dir) ?? null;
    const skill = await buildSkill(f.dir, {
      retired: f.retired,
      mirrorOf,
      primaryDomain,
      discoveredRoot: f.root,
    });
    if (skill) byReal.set(real, skill);
  }

  return { skills: [...byReal.values()], dedupedRoots };
}

