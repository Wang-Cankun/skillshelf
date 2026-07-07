// Download plumbing for `skl add` / `skl update`.
//
// skillshelf's value-add is provenance + central taxonomy + bundles — NOT
// downloading. So this module only shells out to commodity tools:
//   - github channel: `git` (clone/ls-remote) + optional `gh api` for latest ref.
//   - vercel-registry channel: the external `skills` CLI (if installed).
//
// Everything here is best-effort and never throws: callers get a discriminated
// FetchResult / RefResult with `ok` and a human `error` string on failure.

import { join, basename, isAbsolute, resolve, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { existsSync, lstatSync, realpathSync, type Dirent } from "node:fs";
import { mkdtemp, rm, readdir, cp } from "node:fs/promises";
import { isDirectory, realpathOrSelf } from "../lib/fs.ts";
import { parseFrontmatter } from "../lib/frontmatter.ts";

export type Channel = "github" | "vercel-registry" | "git";

/** A parsed `skl add <src>` argument. */
export interface ParsedSource {
  channel: Channel;
  /** normalized "github:owner/repo" (no subpath) or the registry skill name */
  source: string;
  /** github owner (github channel only) */
  owner?: string;
  /** github repo (github channel only) */
  repo?: string;
  /** subpath inside the repo to the skill dir, e.g. "skills/foo" ("" if repo root) */
  subpath: string;
  /** the registry skill name (vercel-registry channel only) */
  registryName?: string;
  /** absolute local git repo path / clone URL (git channel only) */
  localPath?: string;
  /** raw input as given */
  raw: string;
}

/**
 * Parse `skl add <src>`.
 *   github:owner/repo                 -> whole repo (skill at root)
 *   github:owner/repo/path/to/skill   -> subpath
 *   https://github.com/owner/repo(/tree/<ref>)?/path  -> normalized
 *   git:/abs/path[#subpath]           -> local git repo / clone URL (offline-friendly)
 *   file:///abs/path[#subpath]        -> same, as a file:// URL
 *   /abs/path or ./rel/path           -> local git repo on disk
 *   <name>                            -> vercel-registry skill name
 * Never throws; returns { channel:"vercel-registry" } for anything that is not
 * recognizably a github reference.
 *
 * The `git` channel exists so a local on-disk git repo (or any clone URL) can be
 * installed and updated without GitHub — `git clone` works against a filesystem
 * path, which keeps the add/update plumbing fully testable offline.
 */
export function parseSource(raw: string): ParsedSource {
  const input = raw.trim();

  // Local git repo / clone URL. Subpath is carried after a `#` so absolute paths
  // (which contain `/`) round-trip cleanly through the lockfile `source` string.
  //   git:/abs/path#subpath  |  file:///abs/path  |  /abs/path  |  ./rel
  let gitTarget: string | null = null;
  if (input.startsWith("git:")) {
    gitTarget = input.slice("git:".length);
  } else if (input.startsWith("file://")) {
    try {
      const hashAt = input.indexOf("#");
      const url = hashAt >= 0 ? input.slice(0, hashAt) : input;
      const frag = hashAt >= 0 ? input.slice(hashAt) : "";
      gitTarget = fileURLToPath(url) + frag;
    } catch {
      gitTarget = null;
    }
  } else if (isAbsolute(input) || input.startsWith("./") || input.startsWith("../")) {
    gitTarget = input;
  }
  if (gitTarget != null) {
    const hashAt = gitTarget.indexOf("#");
    const rawPath = hashAt >= 0 ? gitTarget.slice(0, hashAt) : gitTarget;
    const subpath = (hashAt >= 0 ? gitTarget.slice(hashAt + 1) : "").replace(/^\/+|\/+$/g, "");
    const localPath = isAbsolute(rawPath) ? rawPath : resolve(rawPath);
    return {
      channel: "git",
      source: `git:${localPath}${subpath ? `#${subpath}` : ""}`,
      subpath,
      localPath,
      raw,
    };
  }

  // github:owner/repo[/subpath...]
  let m = input.match(/^github:([^/\s]+)\/([^/\s]+)(?:\/(.+))?$/);
  if (m) {
    const owner = m[1]!;
    const repo = m[2]!.replace(/\.git$/, "");
    const subpath = (m[3] ?? "").replace(/^\/+|\/+$/g, "");
    return {
      channel: "github",
      source: `github:${owner}/${repo}`,
      owner,
      repo,
      subpath,
      raw,
    };
  }

  // https://github.com/owner/repo[/tree/<ref>]/subpath  or git@github.com:owner/repo
  m = input.match(
    /github\.com[:/]+([^/\s]+)\/([^/\s]+?)(?:\.git)?(?:\/(?:tree|blob)\/[^/]+)?(?:\/(.+?))?\/?$/,
  );
  if (m && /github\.com/.test(input)) {
    const owner = m[1]!;
    const repo = m[2]!.replace(/\.git$/, "");
    const subpath = (m[3] ?? "").replace(/^\/+|\/+$/g, "");
    return {
      channel: "github",
      source: `github:${owner}/${repo}`,
      owner,
      repo,
      subpath,
      raw,
    };
  }

  // Fallback: a bare name -> registry channel.
  return {
    channel: "vercel-registry",
    source: input,
    subpath: "",
    registryName: input,
    raw,
  };
}

/** Outcome of a download into a staging directory. */
export type FetchResult =
  | {
      ok: true;
      /** abs path to the skill dir (containing SKILL.md) inside the staging area */
      skillDir: string;
      /** installed ref (commit SHA for github, version/name for registry) */
      ref: string;
      /** abs staging root the caller MUST clean up via cleanupStaging() */
      staging: string;
      channel: Channel;
      source: string;
    }
  | { ok: false; error: string; staging?: string };

/** Outcome of an upstream "latest ref" check. */
export type RefResult =
  | { ok: true; ref: string }
  | { ok: false; error: string };

interface RunResult {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
}

/** Run a command, capturing output. Never throws (missing binary -> ok:false). */
async function run(cmd: string[], cwd?: string): Promise<RunResult> {
  try {
    const proc = Bun.spawn(cmd, {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
    });
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const code = await proc.exited;
    return { ok: code === 0, code, stdout, stderr };
  } catch (err) {
    return {
      ok: false,
      code: -1,
      stdout: "",
      stderr: err instanceof Error ? err.message : String(err),
    };
  }
}

/** True if a binary is on PATH. */
export async function hasBinary(bin: string): Promise<boolean> {
  const r = await run(["which", bin]);
  return r.ok && r.stdout.trim() !== "";
}

/** A skill dir found by discoverSkills(), with the metadata add/list/dry-run need. */
export interface DiscoveredSkill {
  /** frontmatter `name` (fallback: dir basename) — the install slug */
  name: string;
  /** absolute path to the skill dir (containing SKILL.md) inside the checkout */
  dir: string;
  /** repo-relative POSIX subpath from the discovery root ("" if the root itself) */
  subpath: string;
  /** frontmatter `description` ("" if absent) */
  description: string;
  /**
   * frontmatter `metadata.internal === true` — the ecosystem signal for "hide from
   * `--all`" (ADR-0012). An internal skill is never in the published set, but stays
   * discovered (existence) and installable when named explicitly via `--skill`.
   */
  internal: boolean;
  /**
   * In the PUBLISHED set `--all` installs (ADR-0012): listed by a `.claude-plugin`
   * manifest (when one is present) OR every discovered skill (when none is) — AND
   * not `internal`. An unpublished skill installs only via explicit `--skill <name>`.
   */
  published: boolean;
}

// Dirs that never hold installable skills — pruned during discovery so build output,
// deps, and VCS metadata can't masquerade as a skill (or slow the walk).
const DISCOVERY_SKIP = new Set(["node_modules", ".git", "dist", "build", "__pycache__"]);
// Hidden child dirs are skipped EXCEPT the known agent skill-grouping dot-dirs
// (mirrors crawl.ts ALLOW_DOT), so a repo laid out under `.claude/skills/` is seen.
const DISCOVERY_ALLOW_DOT = new Set([".claude", ".agents", ".codex", ".opencode", ".cursor"]);
// Conventional container dirs (relative to the repo root) scanned for flat/catalog
// layouts before the recursive fallback (vercel-labs/skills convention; ADR-0006 §3).
const DISCOVERY_CONTAINERS = ["", "skills", `skills/.curated`, `skills/.experimental`, `skills/.system`];
const DISCOVERY_MAX_DEPTH = 5;

function isSkillDir(dir: string): boolean {
  return existsSync(join(dir, "SKILL.md"));
}

/** True if `childReal` is the root realpath or nested beneath it. */
function containedUnder(childReal: string, rootReal: string): boolean {
  return childReal === rootReal || childReal.startsWith(rootReal + sep);
}

/** True if a subpath tries to climb out of the checkout (`..` segment). */
function subpathClimbs(cleanSub: string): boolean {
  return cleanSub.split("/").includes("..");
}

/**
 * Collect the manifest-declared skill dirs from a `.claude-plugin` manifest at the
 * checkout root (ADR-0012): `plugin.json` (single plugin, `skills: string[]`) and/or
 * `marketplace.json` (multi-plugin; UNION of every plugin's `skills`). Returns the
 * resolved+containment-checked REALPATHS of the declared dirs, or `null` if NEITHER
 * manifest is present (→ no allowlist; every discovered skill is published).
 *
 * The manifest is an ALLOWLIST, not a source of existence: a declared path that has no
 * valid skill simply never matches a discovered dir. Paths follow Claude convention
 * (start with `./`) and are resolved relative to the manifest base (the checkout root),
 * then containment-checked — a path that escapes the checkout (e.g. `../../etc`) is
 * dropped, reusing the same realpath-containment guard discovery uses (security; never
 * regress ADR-0006). Missing/malformed JSON is treated as "no usable entries", not a throw.
 */
async function readManifestAllowlist(root: string, rootReal: string): Promise<Set<string> | null> {
  const pluginPath = join(root, ".claude-plugin", "plugin.json");
  const marketPath = join(root, ".claude-plugin", "marketplace.json");
  const hasPlugin = existsSync(pluginPath);
  const hasMarket = existsSync(marketPath);
  if (!hasPlugin && !hasMarket) return null;

  const declared: string[] = [];
  const readJson = async (p: string): Promise<unknown> => {
    try {
      return JSON.parse(await Bun.file(p).text());
    } catch {
      return null;
    }
  };
  const skillsOf = (obj: unknown): string[] => {
    if (typeof obj !== "object" || obj === null) return [];
    const arr = (obj as Record<string, unknown>).skills;
    return Array.isArray(arr) ? arr.filter((s): s is string => typeof s === "string") : [];
  };

  if (hasPlugin) declared.push(...skillsOf(await readJson(pluginPath)));
  if (hasMarket) {
    const m = await readJson(marketPath);
    const plugins = (m as Record<string, unknown> | null)?.plugins;
    // We honor each plugin's `skills` relative to the checkout root only. A plugin
    // `source`/`pluginRoot` that relocates skills into another repo/subdir is NOT
    // resolved (those entries simply won't match a discovered dir → not published).
    // Ignoring `source` is the SAFE direction (it can't point discovery outside the
    // checkout); resolving it would need its own containment guard (ADR-0012 deferred).
    if (Array.isArray(plugins)) for (const p of plugins) declared.push(...skillsOf(p));
  }

  // Resolve each declared path relative to the checkout root, then containment-check.
  // We key the allowlist by REALPATH so matching a discovered skill (also keyed by its
  // dir realpath) is alias/symlink-canonical.
  const allow = new Set<string>();
  for (const raw of declared) {
    const clean = raw.replace(/^\.\//, "").replace(/^\/+|\/+$/g, "");
    if (clean === "" || subpathClimbs(clean)) continue;
    const abs = join(root, clean);
    const real = realpathOrSelf(abs);
    if (containedUnder(real, rootReal)) allow.add(real);
  }
  return allow;
}

/**
 * Apply the published-set rule (ADR-0012) over discovered skills, in place:
 *   - manifest present → `published` = (dir realpath is in the allowlist) AND not internal
 *   - no manifest      → `published` = NOT internal (already set by buildDiscovered)
 * Discovery itself is unchanged (still surfaces every skill for existence).
 */
function tagPublished(skills: DiscoveredSkill[], allow: Set<string> | null): void {
  if (allow === null) return; // no manifest: keep buildDiscovered's `published = !internal`
  for (const s of skills) {
    s.published = !s.internal && allow.has(realpathOrSelf(s.dir));
  }
}

/**
 * Immediate sub-DIRECTORIES of `dir` (incl. symlinked dirs), minus skip/hidden — and
 * minus any symlinked dir whose realpath ESCAPES `rootReal`. Following an escaping
 * symlink would let a cloned repo's `skills/x -> /etc` pull the host filesystem into
 * discovery (and copy it into the library); containment keeps the walk inside the
 * checkout (security).
 */
async function childDirs(dir: string, rootReal: string): Promise<string[]> {
  let entries: Dirent[] = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    if (DISCOVERY_SKIP.has(e.name)) continue;
    if (e.name.startsWith(".") && !DISCOVERY_ALLOW_DOT.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      out.push(full);
    } else if (e.isSymbolicLink() && (await isDirectory(full))) {
      // Only follow a symlinked dir whose target stays inside the checkout.
      if (containedUnder(realpathOrSelf(full), rootReal)) out.push(full);
    }
  }
  return out;
}

/** Build a DiscoveredSkill from a dir, applying the name+description validity gate. */
async function buildDiscovered(
  dir: string,
  rootReal: string,
  opts: { requireValid: boolean },
): Promise<DiscoveredSkill | null> {
  // Containment: never surface a skill dir whose realpath escapes the checkout (an
  // escaping symlink target), so its content can't be copied into the library and its
  // lockfile subpath can't become a phantom path.
  const dirReal = realpathOrSelf(dir);
  if (!containedUnder(dirReal, rootReal)) return null;
  const md = join(dir, "SKILL.md");
  if (!existsSync(md)) return null;
  let raw: string;
  try {
    raw = await Bun.file(md).text();
  } catch {
    return null;
  }
  const { data } = parseFrontmatter(raw);
  const fmName = typeof data.name === "string" ? data.name.trim() : "";
  const description = typeof data.description === "string" ? data.description.trim() : "";
  // `metadata.internal: true` hides a skill from `--all` (ADR-0012). Read defensively:
  // `metadata` may be absent or a non-object on a malformed/sparse SKILL.md.
  const meta = data.metadata;
  const internal =
    typeof meta === "object" && meta !== null && (meta as Record<string, unknown>).internal === true;
  // A DISCOVERED (walked) skill must declare BOTH name and description — the
  // convention gate that keeps template/example SKILL.md stubs out of `--all`
  // (ADR-0006 §3). An EXPLICIT subpath pointer is exempt (requireValid:false): the
  // user named it, so a sparse SKILL.md still installs. (The single-skill resolution
  // path — locateSkillDir — also tolerates a sparse SKILL.md via locateSingleLenient.)
  if (opts.requireValid && (fmName === "" || description === "")) return null;
  const name = fmName !== "" ? fmName : basename(dirReal);
  // Subpath is computed from the REALPATH (relative to the checkout realpath), so an
  // aliased / symlink-cycle path like `self/x` records the canonical committed `x`.
  const rel = relative(rootReal, dirReal);
  const subpath = rel === "" ? "" : rel.split(sep).join("/");
  // `published` defaults to "in the set unless excluded": true here, then
  // tagPublished() applies the manifest allowlist (when present) over the result.
  // An internal skill is never published regardless of the manifest.
  return { name, dir, subpath, description, internal, published: !internal };
}

/** Bounded recursive fallback: collect every valid skill dir under `start`. */
async function recurseDiscover(
  dir: string,
  rootReal: string,
  depth: number,
  add: (d: DiscoveredSkill | null) => void,
  seen: Set<string>,
): Promise<void> {
  if (depth > DISCOVERY_MAX_DEPTH) return;
  const real = realpathOrSelf(dir);
  if (seen.has(real)) return; // break symlink cycles (self -> ., parent loops)
  seen.add(real);
  if (isSkillDir(dir)) {
    add(await buildDiscovered(dir, rootReal, { requireValid: true }));
    return; // a skill dir is a leaf — never descend into its reference subtree
  }
  for (const child of await childDirs(dir, rootReal)) {
    await recurseDiscover(child, rootReal, depth + 1, add, seen);
  }
}

/**
 * Discover EVERY skill dir under a checkout — the multi-skill generalization of
 * locateSkillDir, behind `skl add --all/--skill/--list/--dry-run` (ADR-0006). One
 * clone, N skills.
 *
 * Strategy (vercel-labs/skills convention, ADR-0006 §3):
 *   - an explicit `subpath` that directly names a skill dir → that one dir (lenient,
 *     no validity gate — preserves `skl add owner/repo/path/to/skill`).
 *   - else scan conventional CONTAINER dirs (repo root, `skills/`, and its
 *     `.curated`/`.experimental`/`.system` subdirs): flat `<name>/SKILL.md` everywhere,
 *     catalog `<cat>/<name>/SKILL.md` only under the `skills/` family (NOT the repo
 *     root — else `examples/`/`templates/` get swept in).
 *   - if the containers yield NOTHING, a bounded recursive fallback (depth ≤
 *     DISCOVERY_MAX_DEPTH) catches oddly-nested repos.
 * De-duplicated by REALPATH (collapses aliases / symlink cycles), sorted by subpath.
 * Symlinks that escape the checkout are never followed or surfaced (security).
 */
export async function discoverSkills(root: string, subpath = ""): Promise<DiscoveredSkill[]> {
  const cleanSub = subpath.replace(/^\/+|\/+$/g, "");
  // A subpath must never climb out of the checkout (`..`): a crafted/stored source
  // could otherwise read & copy foreign content with a non-round-trippable provenance.
  if (subpathClimbs(cleanSub)) return [];
  const base = cleanSub ? join(root, cleanSub) : root;
  if (!existsSync(base)) return [];

  const rootReal = realpathOrSelf(root);
  // Defense-in-depth: the resolved base must still be inside the checkout.
  if (!containedUnder(realpathOrSelf(base), rootReal)) return [];

  // The manifest (if any) lives at the CHECKOUT ROOT and is the published-set allowlist
  // regardless of any discovery subpath scoping (ADR-0012).
  const allow = await readManifestAllowlist(root, rootReal);

  // Explicit pointer: the named subpath IS a skill dir. Return it verbatim (lenient).
  if (cleanSub && isSkillDir(base)) {
    const one = await buildDiscovered(base, rootReal, { requireValid: false });
    if (!one) return [];
    tagPublished([one], allow);
    return [one];
  }

  // De-duplicate by REALPATH (not the raw string) so aliased / symlink-cycle paths
  // collapse to a single entry (mirrors crawl.ts).
  const byReal = new Map<string, DiscoveredSkill>();
  const add = (d: DiscoveredSkill | null): void => {
    if (!d) return;
    const key = realpathOrSelf(d.dir);
    if (!byReal.has(key)) byReal.set(key, d);
  };

  // 1) Conventional container scan (flat depth-1 +, under skills/, catalog depth-2).
  //    When a subpath scopes discovery, the scoped base is the only container.
  const containers = cleanSub
    ? [base]
    : DISCOVERY_CONTAINERS.map((c) => (c ? join(root, c) : root));
  for (const container of containers) {
    if (!existsSync(container)) continue;
    const isRepoRoot = realpathOrSelf(container) === rootReal;
    if (isSkillDir(container)) {
      // The container itself is a skill (e.g. the repo root holds SKILL.md). The repo
      // root is lenient so a bare single-skill repo with a sparse SKILL.md still
      // resolves (today's behavior); deeper containers stay gated.
      add(await buildDiscovered(container, rootReal, { requireValid: !isRepoRoot }));
      continue; // a skill dir has no child skills to scan
    }
    for (const child of await childDirs(container, rootReal)) {
      if (isSkillDir(child)) {
        add(await buildDiscovered(child, rootReal, { requireValid: true })); // flat depth-1
        continue;
      }
      // Catalog (depth-2) is scanned ONLY under the real `skills/`-family containers,
      // never the repo root — else `examples/<x>/SKILL.md` etc. get swept into --all.
      if (isRepoRoot) continue;
      for (const grandchild of await childDirs(child, rootReal)) {
        if (isSkillDir(grandchild)) {
          add(await buildDiscovered(grandchild, rootReal, { requireValid: true })); // catalog depth-2
        }
      }
    }
  }

  // 2) Recursive fallback ONLY if the conventional scan found nothing.
  if (byReal.size === 0) await recurseDiscover(base, rootReal, 0, add, new Set<string>());

  const out = [...byReal.values()].sort((a, b) =>
    a.subpath < b.subpath ? -1 : a.subpath > b.subpath ? 1 : 0,
  );
  tagPublished(out, allow);
  return out;
}

/**
 * Locate the SINGLE skill dir under a checkout subtree (the single-skill add/update
 * path). Strict discovery first (exactly one → its dir; many → null/ambiguous); if
 * strict finds NOTHING, fall back to lenient resolution so a one-skill repo / vendored
 * registry skill whose SKILL.md omits a `description` still resolves (pre-ADR-0006
 * behavior — the single-skill path never required a description).
 */
async function locateSkillDir(root: string, subpath: string): Promise<string | null> {
  const strict = await discoverSkills(root, subpath);
  if (strict.length === 1) return strict[0]!.dir;
  if (strict.length > 1) return null; // genuinely ambiguous — caller errors
  return locateSingleLenient(root, subpath);
}

/**
 * Lenient single-skill resolution (no frontmatter validity gate): exactly one dir with
 * a SKILL.md under the containment-checked scope → its dir; else null. Cycle-safe and
 * never follows a symlink that escapes the checkout.
 */
async function locateSingleLenient(root: string, subpath: string): Promise<string | null> {
  const cleanSub = subpath.replace(/^\/+|\/+$/g, "");
  if (subpathClimbs(cleanSub)) return null;
  const start = cleanSub ? join(root, cleanSub) : root;
  if (!existsSync(start)) return null;
  const rootReal = realpathOrSelf(root);
  if (!containedUnder(realpathOrSelf(start), rootReal)) return null;
  if (isSkillDir(start)) return start;

  const candidates: string[] = [];
  const seen = new Set<string>();
  async function scan(dir: string, depth: number): Promise<void> {
    if (depth > DISCOVERY_MAX_DEPTH || candidates.length > 1) return;
    const real = realpathOrSelf(dir);
    if (seen.has(real)) return;
    seen.add(real);
    if (isSkillDir(dir)) {
      candidates.push(dir);
      return;
    }
    for (const child of await childDirs(dir, rootReal)) {
      await scan(child, depth + 1);
    }
  }
  await scan(start, 0);
  return candidates.length === 1 ? candidates[0]! : null;
}

/**
 * Lenient single-skill DISCOVERY for the implicit single-add path — same resolution as
 * locateSkillDir's fallback, but returns a DiscoveredSkill (with canonical subpath) so
 * `add.ts` (which discovers directly, not via locateSkillDir) can install a one-skill
 * repo whose SKILL.md omits a `description` without the convention gate dropping it.
 */
export async function discoverSingleLenient(
  root: string,
  subpath = "",
): Promise<DiscoveredSkill | null> {
  const dir = await locateSingleLenient(root, subpath);
  if (!dir) return null;
  return buildDiscovered(dir, realpathOrSelf(root), { requireValid: false });
}

/** Outcome of cloning a whole repo into staging (no skill located yet). */
export type RepoFetchResult =
  | { ok: true; checkout: string; ref: string; staging: string; channel: Channel; source: string }
  | { ok: false; error: string; staging?: string };

/**
 * Clone a LOCAL filesystem path via a `file://` URL, never a bare path. A bare
 * local path triggers git's local-clone optimization (hardlink/copy of `.git`),
 * which (a) ignores `--depth` and warns "--depth is ignored in local clones",
 * and (b) intermittently exits non-zero on a just-written repo (observed flaky on
 * macOS CI). `file://` forces the normal fetch transport: `--depth 1` is honored
 * and refs are read through proper machinery. Sources that are already a URL
 * (file://, ssh://, https://) pass through unchanged.
 */
function localCloneUrl(localPath: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(localPath)) return localPath; // already a URL
  return pathToFileURL(isAbsolute(localPath) ? localPath : resolve(localPath)).href;
}

/**
 * A `git clone` failure worth retrying: a TRANSIENT network/TLS fault, not a definitive
 * one (repo not found / auth / 404) which will never succeed and must fail fast. The
 * definitive-failure guard is checked FIRST so a "unable to access … 404" is never mistaken
 * for the transient "unable to access … SSL_ERROR_SYSCALL" handshake blip.
 */
export function isTransientGitError(stderr: string): boolean {
  if (/not found|does not (exist|appear)|repository not found|authentication failed|\b40[134]\b|permission denied|invalid username or password/i.test(stderr)) {
    return false;
  }
  return /ssl_error|ssl_connect|\btls\b|gnutls|connection reset|connection timed out|could not resolve host|recv failure|send failure|unable to access|early eof|rpc failed|temporary failure|operation timed out|connection refused|failed to connect|timed out|remote end hung up|protocol error|unexpected disconnect|kex_exchange_identification|connection closed by remote/i.test(stderr);
}

/**
 * `git ls-remote <url> HEAD` with the same bounded transient-retry as cloneWithRetry — the
 * upstream-ref probe behind `outdated`/`update`'s "has the repo moved?" check. `outdated`
 * fires one of these per tracked skill; a single flaky handshake would otherwise mark a
 * perfectly-reachable skill "unknown" (probe failed). Backoff also staggers a burst of
 * probes so they stop colliding on the transport.
 */
async function lsRemoteWithRetry(url: string): Promise<RunResult> {
  const MAX_ATTEMPTS = 3;
  let last: RunResult = { ok: false, code: -1, stdout: "", stderr: "" };
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    last = await run(["git", "ls-remote", url, "HEAD"]);
    if (last.ok) return last;
    if (attempt === MAX_ATTEMPTS || !isTransientGitError(last.stderr)) return last;
    await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
  }
  return last;
}

/**
 * `git clone --depth 1` with a bounded retry on TRANSIENT network/TLS faults. A single
 * flaky handshake (observed: LibreSSL `SSL_ERROR_SYSCALL`) otherwise fails an ENTIRE `skl
 * update --repo` run — the repo is cloned once for the whole group, so one blip reports
 * "error" for every skill in it. Non-transient failures fail fast (one attempt). The partial
 * checkout dir is removed between attempts so the re-clone starts from a clean slate.
 */
async function cloneWithRetry(cloneTarget: string, checkout: string): Promise<RunResult> {
  const MAX_ATTEMPTS = 3;
  let last: RunResult = { ok: false, code: -1, stdout: "", stderr: "" };
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    last = await run(["git", "clone", "--depth", "1", cloneTarget, checkout]);
    if (last.ok) return last;
    if (attempt === MAX_ATTEMPTS || !isTransientGitError(last.stderr)) return last;
    await rm(checkout, { recursive: true, force: true }).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
  }
  return last;
}

/**
 * Clone a github/git source ONCE into a fresh staging dir and capture HEAD. Shared
 * by the single-skill fetch (fetchGithub/fetchGit) and the repo-wide fetchRepo so a
 * `--all`/`--skill` install clones exactly once and copies N skills out of it.
 */
async function cloneToStaging(
  parsed: ParsedSource,
): Promise<{ ok: true; checkout: string; ref: string; staging: string } | { ok: false; error: string; staging?: string }> {
  if (!(await hasBinary("git"))) {
    return { ok: false, error: "git is not installed (required for the github/git channel)" };
  }
  const cloneTarget =
    parsed.channel === "github"
      ? `https://github.com/${parsed.owner}/${parsed.repo}.git`
      : parsed.localPath
        ? localCloneUrl(parsed.localPath)
        : undefined;
  if (!cloneTarget) return { ok: false, error: `not a cloneable source: ${parsed.raw}` };

  let staging: string;
  try {
    staging = await mkdtemp(join(tmpdir(), "skl-fetch-"));
  } catch (err) {
    return {
      ok: false,
      error: `could not create staging dir: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const checkout = join(staging, "repo");
  const clone = await cloneWithRetry(cloneTarget, checkout);
  if (!clone.ok) {
    return {
      ok: false,
      error: `git clone failed for ${cloneTarget}: ${clone.stderr.trim() || `exit ${clone.code}`}`,
      staging,
    };
  }

  const headProc = await run(["git", "-C", checkout, "rev-parse", "HEAD"]);
  const ref = headProc.ok ? headProc.stdout.trim() : "";
  return { ok: true, checkout, ref, staging };
}

/**
 * Clone a github repo into a fresh staging dir and locate the single skill dir.
 * Shells out to `git clone --depth 1`. The caller cleans up `staging`.
 */
export async function fetchGithub(parsed: ParsedSource): Promise<FetchResult> {
  if (parsed.channel !== "github" || !parsed.owner || !parsed.repo) {
    return { ok: false, error: `not a github source: ${parsed.raw}` };
  }
  const cloned = await cloneToStaging(parsed);
  if (!cloned.ok) return cloned;

  const skillDir = await locateSkillDir(cloned.checkout, parsed.subpath);
  if (!skillDir) {
    return {
      ok: false,
      error: parsed.subpath
        ? `no SKILL.md found at ${parsed.subpath} in ${parsed.source}`
        : `no unambiguous SKILL.md found in ${parsed.source} (specify a subpath, or use --all/--skill/--list)`,
      staging: cloned.staging,
    };
  }
  return { ok: true, skillDir, ref: cloned.ref, staging: cloned.staging, channel: "github", source: parsed.source };
}

/**
 * Clone a local git repo (or any clone URL) into a staging dir and locate the
 * skill dir. Unlike fetchGithub this does not assume a github.com URL, so it
 * works against an on-disk path (offline). The caller cleans up `staging`.
 */
export async function fetchGit(parsed: ParsedSource): Promise<FetchResult> {
  if (parsed.channel !== "git" || !parsed.localPath) {
    return { ok: false, error: `not a git source: ${parsed.raw}` };
  }
  const cloned = await cloneToStaging(parsed);
  if (!cloned.ok) return cloned;

  const skillDir = await locateSkillDir(cloned.checkout, parsed.subpath);
  if (!skillDir) {
    return {
      ok: false,
      error: parsed.subpath
        ? `no SKILL.md found at ${parsed.subpath} in ${parsed.source}`
        : `no unambiguous SKILL.md found in ${parsed.source} (specify a subpath, or use --all/--skill/--list)`,
      staging: cloned.staging,
    };
  }
  return { ok: true, skillDir, ref: cloned.ref, staging: cloned.staging, channel: "git", source: parsed.source };
}

/**
 * Clone a github/git repo ONCE and hand back the checkout root (not a single skill
 * dir), so the caller can discoverSkills() + copy N skills out of one clone — the
 * clone-once-copy-N path behind `skl add --all/--skill` (ADR-0006 §2). The caller
 * cleans up `staging`.
 */
export async function fetchRepo(parsed: ParsedSource): Promise<RepoFetchResult> {
  if (parsed.channel === "github") {
    if (!parsed.owner || !parsed.repo) return { ok: false, error: `not a github source: ${parsed.raw}` };
  } else if (parsed.channel === "git") {
    if (!parsed.localPath) return { ok: false, error: `not a git source: ${parsed.raw}` };
  } else {
    return { ok: false, error: `not a cloneable repo source: ${parsed.raw}` };
  }
  const cloned = await cloneToStaging(parsed);
  if (!cloned.ok) return cloned;
  return {
    ok: true,
    checkout: cloned.checkout,
    ref: cloned.ref,
    staging: cloned.staging,
    channel: parsed.channel,
    source: parsed.source,
  };
}

/**
 * Fetch a registry skill via the external `skills` CLI into a staging dir.
 * Degrades gracefully (ok:false) if `skills` is not installed.
 */
export async function fetchRegistry(parsed: ParsedSource): Promise<FetchResult> {
  const name = parsed.registryName ?? parsed.source;
  if (!(await hasBinary("skills"))) {
    return {
      ok: false,
      error:
        "the `skills` CLI is not installed; cannot fetch from the registry. " +
        "Install it, or use a github: source instead.",
    };
  }

  let staging: string;
  try {
    staging = await mkdtemp(join(tmpdir(), "skl-fetch-"));
  } catch (err) {
    return {
      ok: false,
      error: `could not create staging dir: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // `skills add <name>` vendors into ./.claude/skills or ./skills under cwd.
  const add = await run(["skills", "add", name], staging);
  if (!add.ok) {
    return {
      ok: false,
      error: `\`skills add ${name}\` failed: ${add.stderr.trim() || `exit ${add.code}`}`,
      staging,
    };
  }

  const skillDir = await locateSkillDir(staging, "");
  if (!skillDir) {
    return {
      ok: false,
      error: `\`skills add ${name}\` produced no SKILL.md`,
      staging,
    };
  }

  // Best-effort version: query the registry for the resolved version.
  let ref = name;
  const info = await run(["skills", "info", name]);
  if (info.ok) {
    const v = info.stdout.match(/version[":\s]+([0-9][\w.-]*)/i);
    if (v) ref = v[1]!;
  }

  return { ok: true, skillDir, ref, staging, channel: "vercel-registry", source: name };
}

/** Dispatch a fetch by channel. */
export async function fetchSource(parsed: ParsedSource): Promise<FetchResult> {
  if (parsed.channel === "github") return fetchGithub(parsed);
  if (parsed.channel === "git") return fetchGit(parsed);
  return fetchRegistry(parsed);
}

/**
 * Latest upstream commit SHA for a github source. Prefers `gh api` (auth +
 * subpath-aware), falls back to `git ls-remote`. Never throws.
 */
export async function latestGithubRef(parsed: ParsedSource): Promise<RefResult> {
  if (parsed.channel !== "github" || !parsed.owner || !parsed.repo) {
    return { ok: false, error: `not a github source: ${parsed.source}` };
  }

  // Resolve the repo's default-branch HEAD — the SAME ref `update` records
  // (cloneToStaging does `git clone --depth 1` + `rev-parse HEAD`). We must
  // match it so `outdated` and `update` agree on "latest": a per-subpath check
  // (gh api `commits?path=`) is NOT used because that param does PREFIX matching
  // — `path=skills/dbs` also matches `skills/dbs-content-system`, so a sibling's
  // commit would falsely flag `dbs` as stale forever (the body never changes, so
  // `update` reports "uptodate" and the badge could never clear). Prefer `gh api`
  // (token auth → works for private repos), fall back to `git ls-remote HEAD`.
  if (await hasBinary("gh")) {
    const endpoint = `repos/${parsed.owner}/${parsed.repo}/commits?per_page=1`;
    const r = await run(["gh", "api", endpoint, "--jq", ".[0].sha"]);
    if (r.ok) {
      const sha = r.stdout.trim();
      if (sha && sha !== "null") return { ok: true, ref: sha };
    }
  }

  // Fallback: ls-remote default HEAD.
  if (await hasBinary("git")) {
    const url = `https://github.com/${parsed.owner}/${parsed.repo}.git`;
    const r = await lsRemoteWithRetry(url);
    if (r.ok) {
      const sha = r.stdout.split(/\s+/)[0]?.trim();
      if (sha) return { ok: true, ref: sha };
    }
    return {
      ok: false,
      error: `git ls-remote failed for ${url}: ${r.stderr.trim() || `exit ${r.code}`}`,
    };
  }

  return { ok: false, error: "neither gh nor git is available to check the upstream ref" };
}

/** Latest registry version for a vercel-registry skill name. Degrades gracefully. */
export async function latestRegistryRef(name: string): Promise<RefResult> {
  if (!(await hasBinary("skills"))) {
    return { ok: false, error: "the `skills` CLI is not installed; cannot check the registry" };
  }
  const r = await run(["skills", "info", name]);
  if (!r.ok) {
    return { ok: false, error: `\`skills info ${name}\` failed: ${r.stderr.trim() || `exit ${r.code}`}` };
  }
  const v = r.stdout.match(/version[":\s]+([0-9][\w.-]*)/i);
  return v ? { ok: true, ref: v[1]! } : { ok: true, ref: name };
}

/** Latest upstream commit SHA for a local git source, via `git ls-remote`. */
export async function latestGitRef(parsed: ParsedSource): Promise<RefResult> {
  if (parsed.channel !== "git" || !parsed.localPath) {
    return { ok: false, error: `not a git source: ${parsed.source}` };
  }
  if (!(await hasBinary("git"))) {
    return { ok: false, error: "git is not installed (required for git channel)" };
  }
  const r = await run(["git", "ls-remote", parsed.localPath, "HEAD"]);
  if (r.ok) {
    const sha = r.stdout.split(/\s+/)[0]?.trim();
    if (sha) return { ok: true, ref: sha };
  }
  return {
    ok: false,
    error: `git ls-remote failed for ${parsed.localPath}: ${r.stderr.trim() || `exit ${r.code}`}`,
  };
}

/** Latest upstream ref dispatched by parsed channel. */
export async function latestRef(parsed: ParsedSource): Promise<RefResult> {
  if (parsed.channel === "github") return latestGithubRef(parsed);
  if (parsed.channel === "git") return latestGitRef(parsed);
  return latestRegistryRef(parsed.registryName ?? parsed.source);
}

/**
 * Re-parse a stored lockfile `source` string ("github:owner/repo" possibly with
 * "@subpath" or "/subpath") back into a ParsedSource for ref-checking/re-pull.
 */
export function parseStoredSource(source: string): ParsedSource {
  // git: sources carry their subpath after a `#` and may contain `@` in the
  // path, so they must round-trip verbatim. Only github sources use the
  // "owner/repo@subpath" convention that needs `@`→`/` normalization.
  if (source.startsWith("git:") || source.startsWith("file://")) {
    return parseSource(source);
  }
  // tolerate "github:owner/repo@subpath" and "github:owner/repo/subpath"
  const at = source.replace(/@/, "/");
  return parseSource(at);
}

/**
 * Copy a fetched skill dir into a destination dir (the new home in the library).
 * Excludes the upstream `.git`, and — for SECURITY — drops any symlink whose target
 * escapes the source dir, so a third-party skill containing `notes.txt -> ~/.ssh/id_rsa`
 * (or a dir symlink to outside the checkout) can never copy a live symlink-to-a-secret
 * or external content into the library. Overwrites the destination contents. Returns dest.
 */
export async function copySkillDir(srcDir: string, destDir: string): Promise<string> {
  const srcReal = realpathOrSelf(srcDir);
  await cp(srcDir, destDir, {
    recursive: true,
    force: true,
    filter: (s: string): boolean => {
      if (basename(s) === ".git") return false;
      try {
        if (lstatSync(s).isSymbolicLink()) {
          const real = realpathSync(s); // throws on a broken link → dropped below
          return real === srcReal || real.startsWith(srcReal + sep);
        }
      } catch {
        return false; // unreadable / broken symlink → don't copy it
      }
      return true;
    },
  });
  return destDir;
}

/** Remove a staging directory created by a fetch. Never throws. */
export async function cleanupStaging(staging: string | undefined): Promise<void> {
  if (!staging) return;
  try {
    await rm(staging, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
}

/** Read the SKILL.md body text of a skill dir. "" if absent/unreadable. */
export async function readSkillBody(skillDir: string): Promise<string> {
  const p = join(skillDir, "SKILL.md");
  if (!existsSync(p)) return "";
  try {
    return await Bun.file(p).text();
  } catch {
    return "";
  }
}

/** Produce a unified diff between two texts using the `diff` binary if present. */
export async function unifiedDiff(
  aText: string,
  bText: string,
  aLabel: string,
  bLabel: string,
): Promise<string> {
  let staging: string | null = null;
  try {
    staging = await mkdtemp(join(tmpdir(), "skl-diff-"));
    const aPath = join(staging, "a");
    const bPath = join(staging, "b");
    await Bun.write(aPath, aText);
    await Bun.write(bPath, bText);
    const r = await run([
      "diff",
      "-u",
      "--label",
      aLabel,
      "--label",
      bLabel,
      aPath,
      bPath,
    ]);
    // diff exits 1 when files differ; that is success for us.
    if (r.stdout.trim() !== "") return r.stdout;
    if (r.ok) return ""; // identical
    return r.stdout || r.stderr;
  } catch {
    return "(diff unavailable)";
  } finally {
    await cleanupStaging(staging ?? undefined);
  }
}
