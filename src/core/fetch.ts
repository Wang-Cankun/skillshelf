// Download plumbing for `skl add` / `skl update`.
//
// skillshelf's value-add is provenance + central taxonomy + bundles — NOT
// downloading. So this module only shells out to commodity tools:
//   - github channel: `git` (clone/ls-remote) + optional `gh api` for latest ref.
//   - vercel-registry channel: the external `skills` CLI (if installed).
//
// Everything here is best-effort and never throws: callers get a discriminated
// FetchResult / RefResult with `ok` and a human `error` string on failure.

import { join, basename, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { existsSync, type Dirent } from "node:fs";
import { mkdtemp, rm, readdir, cp } from "node:fs/promises";
import { isDirectory } from "../lib/fs.ts";

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

/** Locate the single skill dir (containing SKILL.md) under a checkout subtree. */
async function locateSkillDir(root: string, subpath: string): Promise<string | null> {
  const start = subpath ? join(root, subpath) : root;
  if (!existsSync(start)) return null;
  if (existsSync(join(start, "SKILL.md"))) return start;

  // No SKILL.md at the named path: search shallowly for exactly one skill dir.
  const candidates: string[] = [];
  async function scan(dir: string, depth: number): Promise<void> {
    if (depth > 4 || candidates.length > 1) return;
    let entries: Dirent[] = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.some((e) => e.isFile() && e.name === "SKILL.md")) {
      candidates.push(dir);
      return; // don't descend into a skill subtree
    }
    for (const e of entries) {
      if (e.name === ".git" || e.name === "node_modules") continue;
      const full = join(dir, e.name);
      if (e.isDirectory() || (e.isSymbolicLink() && (await isDirectory(full)))) {
        await scan(full, depth + 1);
      }
    }
  }
  await scan(start, 0);
  return candidates.length === 1 ? candidates[0]! : null;
}

/**
 * Clone a github repo into a fresh staging dir and locate the skill dir.
 * Shells out to `git clone --depth 1`. The caller cleans up `staging`.
 */
export async function fetchGithub(parsed: ParsedSource): Promise<FetchResult> {
  if (parsed.channel !== "github" || !parsed.owner || !parsed.repo) {
    return { ok: false, error: `not a github source: ${parsed.raw}` };
  }
  if (!(await hasBinary("git"))) {
    return { ok: false, error: "git is not installed (required for github channel)" };
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

  const checkout = join(staging, "repo");
  const url = `https://github.com/${parsed.owner}/${parsed.repo}.git`;
  const clone = await run(["git", "clone", "--depth", "1", url, checkout]);
  if (!clone.ok) {
    return {
      ok: false,
      error: `git clone failed for ${url}: ${clone.stderr.trim() || `exit ${clone.code}`}`,
      staging,
    };
  }

  const headProc = await run(["git", "-C", checkout, "rev-parse", "HEAD"]);
  const ref = headProc.ok ? headProc.stdout.trim() : "";

  const skillDir = await locateSkillDir(checkout, parsed.subpath);
  if (!skillDir) {
    return {
      ok: false,
      error: parsed.subpath
        ? `no SKILL.md found at ${parsed.subpath} in ${parsed.source}`
        : `no unambiguous SKILL.md found in ${parsed.source} (specify a subpath)`,
      staging,
    };
  }

  return { ok: true, skillDir, ref, staging, channel: "github", source: parsed.source };
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
  if (!(await hasBinary("git"))) {
    return { ok: false, error: "git is not installed (required for git channel)" };
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

  const checkout = join(staging, "repo");
  const clone = await run(["git", "clone", "--depth", "1", parsed.localPath, checkout]);
  if (!clone.ok) {
    return {
      ok: false,
      error: `git clone failed for ${parsed.localPath}: ${clone.stderr.trim() || `exit ${clone.code}`}`,
      staging,
    };
  }

  const headProc = await run(["git", "-C", checkout, "rev-parse", "HEAD"]);
  const ref = headProc.ok ? headProc.stdout.trim() : "";

  const skillDir = await locateSkillDir(checkout, parsed.subpath);
  if (!skillDir) {
    return {
      ok: false,
      error: parsed.subpath
        ? `no SKILL.md found at ${parsed.subpath} in ${parsed.source}`
        : `no unambiguous SKILL.md found in ${parsed.source} (specify a subpath)`,
      staging,
    };
  }

  return { ok: true, skillDir, ref, staging, channel: "git", source: parsed.source };
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

  // Prefer gh api: gives the latest commit touching the subpath if one is set.
  if (await hasBinary("gh")) {
    const path = parsed.subpath ? `&path=${encodeURIComponent(parsed.subpath)}` : "";
    const endpoint = `repos/${parsed.owner}/${parsed.repo}/commits?per_page=1${path}`;
    const r = await run(["gh", "api", endpoint, "--jq", ".[0].sha"]);
    if (r.ok) {
      const sha = r.stdout.trim();
      if (sha && sha !== "null") return { ok: true, ref: sha };
    }
  }

  // Fallback: ls-remote default HEAD (repo-level, not subpath-aware).
  if (await hasBinary("git")) {
    const url = `https://github.com/${parsed.owner}/${parsed.repo}.git`;
    const r = await run(["git", "ls-remote", url, "HEAD"]);
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
 * Excludes the upstream .git. Overwrites the destination contents. Returns dest.
 */
export async function copySkillDir(srcDir: string, destDir: string): Promise<string> {
  await cp(srcDir, destDir, {
    recursive: true,
    force: true,
    filter: (s: string) => basename(s) !== ".git",
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
