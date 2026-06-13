// Filesystem helpers: realpath-dedupe, safe symlink ops, directory walking.
// Bun built-ins + node:fs/node:path only. No external deps.

import { realpathSync, existsSync, lstatSync, type Dirent } from "node:fs";
import {
  mkdir,
  readdir,
  symlink,
  rm,
  lstat,
  realpath,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

/** Resolve a path to its canonical real location; falls back to resolve() if it doesn't exist. */
export function realpathOrSelf(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}

/** Async variant. */
export async function realpathOrSelfAsync(p: string): Promise<string> {
  try {
    return await realpath(p);
  } catch {
    return resolve(p);
  }
}

/**
 * De-duplicate a list of paths by their realpath (handles aliased mounts like
 * cloud-sync mirror locations). Returns the first-seen path for each realpath.
 */
export function dedupeByRealpath(paths: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paths) {
    const rp = realpathOrSelf(p);
    if (seen.has(rp)) continue;
    seen.add(rp);
    out.push(p);
  }
  return out;
}

export function pathExists(p: string): boolean {
  return existsSync(p);
}

export function isSymlink(p: string): boolean {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

export async function isDirectory(p: string): Promise<boolean> {
  try {
    const st = await lstat(p);
    if (st.isSymbolicLink()) {
      const rp = await realpathOrSelfAsync(p);
      const rst = await lstat(rp).catch(() => null);
      return rst?.isDirectory() ?? false;
    }
    return st.isDirectory();
  } catch {
    return false;
  }
}

/** Create a symlink, creating parent dirs. If `force`, replace any existing entry. */
export async function safeSymlink(
  target: string,
  linkPath: string,
  opts: { force?: boolean } = {},
): Promise<void> {
  await mkdir(dirname(linkPath), { recursive: true });
  if (existsSync(linkPath) || isSymlink(linkPath)) {
    if (!opts.force) {
      // idempotent: if it already points at target, do nothing
      try {
        const cur = await realpath(linkPath);
        if (cur === (await realpathOrSelfAsync(target))) return;
      } catch {
        /* fallthrough to remove */
      }
    }
    await rm(linkPath, { recursive: true, force: true });
  }
  await symlink(target, linkPath);
}

/** Remove a symlink (only if it is a symlink, unless force). Returns true if removed. */
export async function removeSymlink(
  linkPath: string,
  opts: { force?: boolean } = {},
): Promise<boolean> {
  if (!isSymlink(linkPath)) {
    if (!opts.force) return false;
    if (!existsSync(linkPath)) return false;
  }
  await rm(linkPath, { recursive: true, force: true });
  return true;
}

export interface WalkOptions {
  /** max depth (0 = only the root's direct entries). Default Infinity. */
  maxDepth?: number;
  /** directory names to skip entirely (e.g. node_modules). */
  skipDirs?: Set<string>;
  /** follow symlinked dirs. Default false. */
  followSymlinks?: boolean;
}

export interface WalkEntry {
  path: string;
  name: string;
  isDirectory: boolean;
  isSymlink: boolean;
  depth: number;
}

/**
 * Recursively walk a directory yielding entries. Never throws on individual
 * unreadable dirs (skips them). Skips `skipDirs` by name at any depth.
 */
export async function* walk(
  root: string,
  opts: WalkOptions = {},
): AsyncGenerator<WalkEntry> {
  const maxDepth = opts.maxDepth ?? Infinity;
  const skipDirs = opts.skipDirs ?? new Set(["node_modules", ".git"]);
  const follow = opts.followSymlinks ?? false;

  async function* recurse(dir: string, depth: number): AsyncGenerator<WalkEntry> {
    let entries: Dirent[] = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      const link = e.isSymbolicLink();
      let isDir = e.isDirectory();
      if (link) {
        isDir = await isDirectory(full);
      }
      yield { path: full, name: e.name, isDirectory: isDir, isSymlink: link, depth };
      if (isDir && depth < maxDepth) {
        if (skipDirs.has(e.name)) continue;
        if (link && !follow) continue;
        yield* recurse(full, depth + 1);
      }
    }
  }

  yield* recurse(root, 0);
}

/** Ensure a directory exists. */
export async function ensureDir(p: string): Promise<void> {
  await mkdir(p, { recursive: true });
}

/** List immediate subdirectory names of a dir (non-recursive). Empty on error. */
export async function listDirNames(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const out: string[] = [];
    for (const e of entries) {
      if (e.isDirectory()) {
        out.push(e.name);
      } else if (e.isSymbolicLink() && (await isDirectory(join(dir, e.name)))) {
        out.push(e.name);
      }
    }
    return out;
  } catch {
    return [];
  }
}
