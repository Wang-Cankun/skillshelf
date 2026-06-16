// `skl import <name> --from <path>` — turn ONE candidate (a skill discovered in
// an external root) into a managed library skill.
//
//   skl import <name> --from <path> [--copy] [--as <slug>] [--force] [--json]
//
// Flat layout (ADR-0001): the skill always lands at <library>/<name>/. No domain
// is decided here — import is a thin, deterministic primitive (move + symlink-back).
// Tagging happens AFTER, via `skl infer`.
//
// Default behavior = MOVE the candidate dir into the library, then leave a SYMLINK
// at the original <path> pointing at the library copy, so old paths still resolve
// (e.g. ~/.claude/skills/<name> keeps working).
//
//   --copy          copy instead of move; leave the original untouched (project repos)
//   --no-link-back  move WITHOUT leaving a symlink — the original location is emptied.
//                   Use to THIN a root (e.g. drop a skill out of ~/.claude/skills so it
//                   stops auto-loading; reach it on demand via `skl use`). Implies move.
//   --as <slug>     import under a different library name than <name>
//   --force         overwrite an existing same-named library skill
//
// Provenance: these are the user's OWN skills, not third-party — source is null and
// NO lockfile entry is written (that is `add`'s job). Import is purely mechanical
// (move + symlink-back, or --copy); domain tags are applied later by `skl infer`
// into the central <library>/taxonomy.json, which never touches the SKILL.md body.

import { join, basename, resolve } from "node:path";
import { existsSync } from "node:fs";
import { rename, cp, rm } from "node:fs/promises";
import type { Ctx } from "../types.ts";
import {
  ensureDir,
  safeSymlink,
  isDirectory,
  isSymlink,
  realpathOrSelfAsync,
} from "../lib/fs.ts";
import { entryStatus } from "../core/library.ts";
import { SLUG_RE } from "../core/lifecycle.ts";

export const meta = {
  name: "import",
  summary: "Adopt your own skill into the library (move + symlink-back, or --copy)",
  usage: "skl import <name> --from <path> [--copy | --no-link-back] [--follow] [--as <slug>] [--force] [--json]",
} as const;

interface Flags {
  name: string | null;
  from: string | null;
  as: string | null;
  copy: boolean;
  noLinkBack: boolean;
  follow: boolean;
  force: boolean;
  json: boolean;
}

function parseFlags(argv: string[]): { flags: Flags } | { error: string } {
  const flags: Flags = {
    name: null,
    from: null,
    as: null,
    copy: false,
    noLinkBack: false,
    follow: false,
    force: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--from") {
      const v = argv[++i];
      if (v === undefined) return { error: "--from requires a value" };
      flags.from = v;
    } else if (a.startsWith("--from=")) {
      flags.from = a.slice("--from=".length);
    } else if (a === "--as") {
      const v = argv[++i];
      if (v === undefined) return { error: "--as requires a value" };
      flags.as = v;
    } else if (a.startsWith("--as=")) {
      flags.as = a.slice("--as=".length);
    } else if (a === "--copy") {
      flags.copy = true;
    } else if (a === "--no-link-back" || a === "--no-link") {
      flags.noLinkBack = true;
    } else if (a === "--follow" || a === "--deref") {
      flags.follow = true;
    } else if (a === "--force") {
      flags.force = true;
    } else if (a === "--json") {
      flags.json = true;
    } else if (a.startsWith("--")) {
      return { error: `unknown argument: ${a}` };
    } else if (flags.name === null) {
      flags.name = a;
    } else {
      return { error: `unexpected argument: ${a}` };
    }
  }
  return { flags };
}

/**
 * Move srcDir -> destDir. Prefers an atomic rename; falls back to copy+remove on
 * EXDEV (cross-device, e.g. when the library lives on a different mount than the
 * candidate). destDir's parent must already exist.
 */
async function moveDir(srcDir: string, destDir: string): Promise<void> {
  try {
    await rename(srcDir, destDir);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== "EXDEV") throw err;
    await cp(srcDir, destDir, {
      recursive: true,
      force: true,
      filter: (s: string) => basename(s) !== ".git",
    });
    await rm(srcDir, { recursive: true, force: true });
  }
}

export async function run(argv: string[], ctx: Ctx): Promise<number> {
  const parsed = parseFlags(argv);
  if ("error" in parsed) {
    ctx.error(`skl import: ${parsed.error}`);
    ctx.error(`usage: ${meta.usage}`);
    return 1;
  }
  const flags = parsed.flags;

  if (!flags.name || flags.name.trim() === "") {
    ctx.error("skl import: a <name> is required");
    ctx.error(`usage: ${meta.usage}`);
    return 1;
  }
  if (!flags.from || flags.from.trim() === "") {
    ctx.error("skl import: --from <path> is required");
    ctx.error(`usage: ${meta.usage}`);
    return 1;
  }
  if (flags.copy && flags.noLinkBack) {
    ctx.error(
      "skl import: --copy and --no-link-back are mutually exclusive (--copy keeps the original; --no-link-back removes it)",
    );
    return 1;
  }
  if (flags.follow && flags.noLinkBack) {
    ctx.error(
      "skl import: --follow copies the dereferenced target; it cannot be combined with --no-link-back (a move option)",
    );
    return 1;
  }

  // The library name is --as if given, else <name>.
  const targetName = (flags.as ?? flags.name).trim();
  if (!SLUG_RE.test(targetName)) {
    ctx.error(
      `skl import: invalid skill name "${targetName}" — use lowercase letters, digits, and hyphens (e.g. my-skill)`,
    );
    return 1;
  }

  // Resolve the candidate path (absolute). Do NOT realpath it: if it is already a
  // symlink we want to operate on the link location the user pointed at.
  const fromPath = resolve(flags.from.trim());

  try {
    if (!existsSync(fromPath)) {
      ctx.error(`skl import: --from path does not exist: ${fromPath}`);
      return 1;
    }
    if (!(await isDirectory(fromPath))) {
      ctx.error(`skl import: --from must be a skill directory: ${fromPath}`);
      return 1;
    }
    if (!existsSync(join(fromPath, "SKILL.md"))) {
      ctx.error(
        `skl import: no SKILL.md found in ${fromPath} — not a skill directory`,
      );
      return 1;
    }

    // Symlink safety (option b): a symlinked source dir is refused unless --follow.
    // Without it, a move would `rename` the LINK (the library would point back at the
    // target and own no real copy) and a copy would copy the link itself. With
    // --follow we dereference to the real target and COPY its contents (below).
    const linkSource = isSymlink(fromPath);
    if (linkSource && !flags.follow) {
      const tgt = await realpathOrSelfAsync(fromPath);
      ctx.error(`skl import: --from is a symlink (${fromPath} -> ${tgt}).`);
      ctx.error(
        "Refusing to import a symlink source: a move would relocate the link, not the content.",
      );
      ctx.error(
        "Re-run with --follow (alias --deref) to dereference and copy the target's real contents into the library.",
      );
      return 1;
    }

    const libraryPath = ctx.config.libraryPath;
    // Flat, non-semantic layout (ADR-0001): always <library>/<name>/.
    const destDir = join(libraryPath, targetName);

    // Retired-aware guard: refuse if the name exists ONLY as a retired tombstone
    // (<library>/_retired/<name>). Importing beside it would strand a duplicate and
    // break `skl unretire`; --force overwrites an ACTIVE copy, not a retired one, so
    // this fires regardless. The user must unretire first (or import under --as).
    const status = entryStatus(libraryPath, targetName);
    if (status.retired && !status.active) {
      ctx.error(
        `skl import: a retired '${targetName}' exists — run \`skl unretire ${targetName}\` first (or import under another name with --as <slug>)`,
      );
      return 1;
    }

    // Idempotency guard: refuse to clobber an existing library skill unless --force
    // (or the user re-aimed with --as). This protects a managed copy from a stray
    // re-import.
    if (existsSync(destDir) && !flags.force) {
      ctx.error(
        `skl import: ${targetName} already exists at ${destDir} — pass --force to overwrite, or --as <slug> to import under another name`,
      );
      return 1;
    }

    // If --from already IS the library copy (a re-run pointing at the symlink, or
    // the dir itself), there is nothing to move. Detect by realpath equality.
    const fromReal = await realpathOrSelfAsync(fromPath);
    const destReal = existsSync(destDir) ? await realpathOrSelfAsync(destDir) : destDir;
    if (fromReal === destReal) {
      ctx.error(
        `skl import: ${fromPath} already resolves to the library copy at ${destDir} — nothing to import`,
      );
      return 1;
    }

    await ensureDir(libraryPath);
    if (existsSync(destDir)) {
      // --force: replace the existing managed copy.
      await rm(destDir, { recursive: true, force: true });
    }

    // A symlinked source with --follow: copy the dereferenced TARGET's contents
    // (never move — that would relocate the canonical store the link points at).
    const srcDir = linkSource ? await realpathOrSelfAsync(fromPath) : fromPath;
    const mode: "move" | "copy" = linkSource ? "copy" : flags.copy ? "copy" : "move";
    let linkedBack = false;

    if (mode === "copy") {
      // Copy into the library; leave the original untouched (no symlink-back).
      await cp(srcDir, destDir, {
        recursive: true,
        force: true,
        filter: (s: string) => basename(s) !== ".git",
      });
    } else {
      // Move the dir into the library. By default symlink the old location back so
      // existing paths keep resolving; with --no-link-back leave the original empty
      // (thinning a root, e.g. removing a skill from ~/.claude/skills' auto-load).
      await moveDir(fromPath, destDir);
      if (!flags.noLinkBack) {
        await safeSymlink(destDir, fromPath, { force: true });
        linkedBack = true;

        // Verify the symlink actually resolves to the library copy after the move.
        const linkReal = await realpathOrSelfAsync(fromPath);
        const movedReal = await realpathOrSelfAsync(destDir);
        if (linkReal !== movedReal) {
          ctx.error(
            `skl import: symlink-back verification failed — ${fromPath} resolves to ${linkReal}, expected ${movedReal}`,
          );
          return 1;
        }
      }
    }

    // Import is mechanical: no domain is decided here. Domain tags are applied
    // later via `skl infer` into the central <library>/taxonomy.json — never into
    // the upstream SKILL.md. These are the user's own skills: source/provenance is
    // null and NO lockfile entry is written.

    const summary = {
      ok: true,
      name: targetName,
      from: fromPath,
      to: destDir,
      mode,
      linkedBack,
      followed: linkSource,
    };

    if (flags.json) {
      ctx.json(summary);
    } else {
      ctx.log(`imported ${targetName}`);
      ctx.log(`  from:  ${fromPath}`);
      if (linkSource) ctx.log(`  follow: ${fromPath} -> ${srcDir} (copied target contents)`);
      ctx.log(`  to:    ${destDir}`);
      ctx.log(`  mode:  ${mode}`);
      if (linkedBack) ctx.log(`  link:  ${fromPath} -> ${destDir} (old path still resolves)`);
      else if (mode === "move") ctx.log(`  note:  original location emptied (no symlink-back) — reach it via \`skl use\``);
      ctx.log("Run `skl infer` to tag it and `skl index` to list it.");
    }
    return 0;
  } catch (err) {
    ctx.error(
      `skl import: failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }
}
