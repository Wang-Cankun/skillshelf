// Provenance lockfile read/write + git origin detection for imported skills.
// Lockfile lives at <library>/shelf.lock.json.

import { join } from "node:path";
import { existsSync } from "node:fs";
import type { LockEntry, Lockfile, Provenance } from "../types.ts";

export const LOCKFILE_NAME = "shelf.lock.json";

export function lockfilePath(libraryPath: string): string {
  return join(libraryPath, LOCKFILE_NAME);
}

function emptyLockfile(): Lockfile {
  return { version: 1, entries: {} };
}

/** Read the lockfile at the library root; returns an empty lockfile if absent/invalid. */
export async function readLockfile(libraryPath: string): Promise<Lockfile> {
  const p = lockfilePath(libraryPath);
  if (!existsSync(p)) return emptyLockfile();
  try {
    const text = await Bun.file(p).text();
    const parsed = JSON.parse(text) as Lockfile;
    if (!parsed || typeof parsed !== "object" || typeof parsed.entries !== "object") {
      return emptyLockfile();
    }
    return { version: 1, entries: parsed.entries ?? {} };
  } catch {
    return emptyLockfile();
  }
}

/** Write the lockfile (pretty JSON). */
export async function writeLockfile(libraryPath: string, lock: Lockfile): Promise<void> {
  const p = lockfilePath(libraryPath);
  await Bun.write(p, JSON.stringify(lock, null, 2) + "\n");
}

/** Upsert one entry by name and persist. Returns the updated lockfile. */
export async function recordEntry(
  libraryPath: string,
  entry: LockEntry,
): Promise<Lockfile> {
  const lock = await readLockfile(libraryPath);
  lock.entries[entry.name] = entry;
  await writeLockfile(libraryPath, lock);
  return lock;
}

/** Remove one entry by name and persist. Returns true if it existed. */
export async function removeEntry(libraryPath: string, name: string): Promise<boolean> {
  const lock = await readLockfile(libraryPath);
  if (!(name in lock.entries)) return false;
  delete lock.entries[name];
  await writeLockfile(libraryPath, lock);
  return true;
}

/** Provenance for a skill name from a loaded lockfile, or null. */
export function provenanceForName(lock: Lockfile, name: string): Provenance | null {
  const e = lock.entries[name];
  if (!e) return null;
  return {
    source: e.source,
    ref: e.ref,
    channel: e.channel,
    installedAt: e.installedAt,
    localEdits: e.localEdits,
  };
}

export interface GitOrigin {
  /** remote URL, e.g. https://github.com/owner/repo.git */
  remote: string;
  /** normalized "github:owner/repo" form if it parses, else the remote */
  source: string;
  /** current commit SHA */
  ref: string;
}

function normalizeGithub(remote: string): string {
  // git@github.com:owner/repo.git  |  https://github.com/owner/repo(.git)
  const m =
    remote.match(/github\.com[:/]+([^/]+)\/([^/]+?)(?:\.git)?$/) ?? null;
  if (m) return `github:${m[1]}/${m[2]}`;
  return remote;
}

/**
 * Detect the git origin of a directory (an imported skill that retains a .git).
 * Returns null if not a git repo or git is unavailable. Never throws.
 */
export async function detectGitOrigin(dir: string): Promise<GitOrigin | null> {
  try {
    const remoteProc = Bun.spawnSync(
      ["git", "-C", dir, "config", "--get", "remote.origin.url"],
      { stdout: "pipe", stderr: "ignore" },
    );
    if (remoteProc.exitCode !== 0) return null;
    const remote = remoteProc.stdout.toString().trim();
    if (remote === "") return null;

    const refProc = Bun.spawnSync(["git", "-C", dir, "rev-parse", "HEAD"], {
      stdout: "pipe",
      stderr: "ignore",
    });
    const ref = refProc.exitCode === 0 ? refProc.stdout.toString().trim() : "";

    return { remote, source: normalizeGithub(remote), ref };
  } catch {
    return null;
  }
}

/** Build a LockEntry from a detected git origin. */
export function entryFromGit(
  name: string,
  origin: GitOrigin,
  opts: { channel?: string; installedAt?: string } = {},
): LockEntry {
  return {
    name,
    source: origin.source,
    ref: origin.ref,
    channel: opts.channel ?? "github",
    installedAt: opts.installedAt ?? new Date().toISOString(),
    localEdits: false,
  };
}
