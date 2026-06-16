// Filesystem helpers: realpath-dedupe, safe symlink ops, directory walking.
// Bun built-ins + node:fs/node:path only. No external deps.

import { realpathSync, existsSync, lstatSync } from "node:fs";
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
