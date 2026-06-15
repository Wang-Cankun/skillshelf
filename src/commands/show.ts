// `skl show <name>` — print the SKILL.md instruction layer (the body after
// frontmatter) and list the bundled reference files. By default only PATHS are
// listed; the agent Reads them on demand (manual progressive disclosure: cheap
// by default, deep on demand).
//
// `--file <relpath>` opens one bundled file: its CONTENTS are printed (or
// carried in `--json` `body`). The path is resolved INSIDE the skill dir — any
// attempt to escape it (`..`, absolute) is refused. This is what powers the
// drawer's file navigator: one deterministic verb per file, code or prose.

import { join, resolve, sep } from "node:path";
import { readdir } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import type { Dirent } from "node:fs";
import type { Ctx, Skill } from "../types.ts";
import { findByName, entryModeInfo } from "../core/library.ts";
import { parseFrontmatter } from "../lib/frontmatter.ts";

export const meta = {
  name: "show",
  summary: "Print SKILL.md body; list (or open with --file) reference files",
  usage: "skl show <name> [--file <relpath>] [--json]",
} as const;

const SKILL_FILE = "SKILL.md";
const SKIP_DIRS = new Set([".git", "node_modules"]);
// Refuse to dump anything that smells binary or is too big to be a readable
// reference. Keeps `--file` honest: it serves text, not blobs.
const MAX_FILE_BYTES = 2_000_000;

async function bodyOf(skill: Skill): Promise<string> {
  const raw = await Bun.file(skill.bodyPath).text();
  const { body, hasFrontmatter } = parseFrontmatter(raw);
  return hasFrontmatter ? body : raw;
}

/**
 * Recursively enumerate every bundled file AND directory under the skill dir
 * (absolute paths), excluding SKILL.md, the lock/sidecar, and VCS/noise dirs.
 * Directory entries are emitted too so the UI can render a tree. Sorted so a
 * directory always precedes its children (lexical: "ref" < "ref/x").
 */
async function walkRefFiles(
  skillDir: string,
  skillName: string,
): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === ".DS_Store") continue;
      if (dir === skillDir) {
        if (e.name === SKILL_FILE) continue;
        if (e.name === `${skillName}.shelf.json`) continue;
        if (e.name === "shelf.lock.json") continue;
      }
      const abs = join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        out.push(abs);
        await walk(abs);
      } else {
        out.push(abs);
      }
    }
  }
  await walk(skillDir);
  return out.sort();
}

/**
 * Resolve a user-supplied `--file` path INSIDE the skill dir. Returns the
 * absolute path, or null if it escapes the dir / does not exist / is not a
 * regular file / is too large.
 */
function resolveBundledFile(skillDir: string, rel: string): string | null {
  const root = resolve(skillDir);
  const abs = resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + sep)) return null; // escape attempt
  if (!existsSync(abs)) return null;
  const st = statSync(abs);
  if (!st.isFile()) return null;
  if (st.size > MAX_FILE_BYTES) return null;
  return abs;
}

export async function run(argv: string[], ctx: Ctx): Promise<number> {
  try {
    const json = argv.includes("--json");
    let fileArg: string | undefined;
    const positional: string[] = [];
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i]!;
      if (a === "--json") continue;
      if (a === "--file") {
        fileArg = argv[++i];
        continue;
      }
      if (a.startsWith("--file=")) {
        fileArg = a.slice("--file=".length);
        continue;
      }
      if (a.startsWith("--")) continue;
      positional.push(a);
    }
    const name = positional[0];

    if (!name) {
      ctx.error("usage: " + meta.usage);
      return 1;
    }

    const skills = await ctx.loadLibrary();
    const skill = findByName(skills, name);
    if (!skill) {
      ctx.error(`No skill named "${name}". Try: skl search ${name}`);
      return 1;
    }

    // Which file are we serving? SKILL.md (default) gets frontmatter stripped;
    // any other bundled file is served verbatim.
    const wantsFile = fileArg && fileArg !== SKILL_FILE && fileArg !== ".";
    let body: string;
    let file = SKILL_FILE;
    if (wantsFile) {
      const abs = resolveBundledFile(skill.path, fileArg!);
      if (!abs) {
        ctx.error(`No readable file "${fileArg}" in skill "${name}".`);
        return 1;
      }
      body = await Bun.file(abs).text();
      file = fileArg!;
    } else {
      body = await bodyOf(skill);
    }

    if (json) {
      const { mode, linkTarget } = entryModeInfo(ctx.libraryPath, skill.name);
      ctx.json({
        name: skill.name,
        description: skill.description,
        primaryDomain: skill.primaryDomain,
        domains: skill.domains,
        path: skill.path,
        bodyPath: skill.bodyPath,
        file,
        body,
        refFiles: await walkRefFiles(skill.path, skill.name),
        retired: skill.retired,
        source: skill.source,
        mode,
        linkTarget,
      });
      return 0;
    }

    ctx.log(body.replace(/\n+$/, ""));

    // The reference-file index is part of the SKILL.md view only; when a
    // specific file is opened its contents are the whole output.
    if (!wantsFile && skill.refFiles.length) {
      ctx.log("");
      ctx.log(`# Reference files (${skill.refFiles.length}) — Read on demand:`);
      for (const f of skill.refFiles) ctx.log(f);
    }
    return 0;
  } catch (err) {
    ctx.error(`show failed: ${(err as Error).message}`);
    return 1;
  }
}
