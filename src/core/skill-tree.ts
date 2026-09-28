import { lstat, readdir, readFile, readlink, realpath } from "node:fs/promises";
import { join } from "node:path";
import { unifiedDiff } from "./fetch.ts";

/** Compare everything that replacing a skill directory would discard. No hashes,
 * ignored files, or traversal through nested symlinks. Read errors fail closed.
 * Root symlinks are resolved because a library entry may be LINKED. */
export async function compareSkillTrees(
  library: string,
  deployed: string,
  renderDiff = false,
): Promise<{ identical: boolean; diff: string }> {
  const [aRoot, bRoot] = await Promise.all([realpath(library), realpath(deployed)]);
  if (aRoot === bRoot) return { identical: true, diff: "" };
  const changes: string[] = [];
  const kind = (s: Awaited<ReturnType<typeof lstat>>) =>
    s.isSymbolicLink() ? "symlink" : s.isDirectory() ? "directory" : s.isFile() ? "file" : "special";

  async function compare(relative: string): Promise<void> {
    const a = join(aRoot, relative), b = join(bRoot, relative);
    const [as, bs] = await Promise.all([lstat(a), lstat(b)]);
    const ak = kind(as), bk = kind(bs), label = relative || ".";
    if (ak !== bk) {
      changes.push(`${label}: type changed (${ak} -> ${bk})\n`);
      return;
    }
    if (ak === "symlink") {
      const [at, bt] = await Promise.all([readlink(a), readlink(b)]);
      if (at !== bt) changes.push(`${label}: symlink target changed (${at} -> ${bt})\n`);
      return;
    }
    if (ak === "special") throw new Error(`Cannot safely compare special entry: ${label}`);
    if ((as.mode & 0o7777) !== (bs.mode & 0o7777)) {
      changes.push(`${label}: permissions changed (${(as.mode & 0o7777).toString(8)} -> ${(bs.mode & 0o7777).toString(8)})\n`);
    }
    if (ak === "directory") {
      const [an, bn] = await Promise.all([readdir(a), readdir(b)]);
      const aNames = new Set(an), bNames = new Set(bn);
      for (const name of [...new Set([...an, ...bn])].sort()) {
        const child = relative ? `${relative}/${name}` : name;
        if (!aNames.has(name)) changes.push(`${child}: only in deployed copy\n`);
        else if (!bNames.has(name)) changes.push(`${child}: only in library\n`);
        else await compare(child);
      }
      return;
    }
    const [ab, bb] = await Promise.all([readFile(a), readFile(b)]);
    if (ab.equals(bb)) return;
    if (renderDiff && !ab.includes(0) && !bb.includes(0)) {
      changes.push(`${label}: contents changed\n` + await unifiedDiff(ab.toString("utf8"), bb.toString("utf8"), `library/${label}`, `deployed/${label}`));
    } else changes.push(`${label}: ${renderDiff ? "binary contents" : "contents"} changed\n`);
  }
  await compare("");
  return { identical: changes.length === 0, diff: changes.join("") };
}
