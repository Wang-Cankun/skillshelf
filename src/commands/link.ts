// `skl link` — manage the symlink relationship between the library and on-disk copies.
//
// Two modes (the bookshelf model, ADR-0004):
//
//   skl link <name> --at <path>          OWNED side. The library already owns <name>; replace
//                                        some other on-disk copy at <path> with a symlink INTO
//                                        the library — fulfilling the one-canonical-copy rule for
//                                        locations that were never consolidated (e.g. an old
//                                        `.claude/skills/<name>` duplicate).
//
//   skl link [<name>] --from <dev-repo>  LINKED side. Register an external dev-repo skill as a
//                                        library entry: make <library>/<name> a symlink pointing
//                                        AT the dev repo, which stays canonical. The inverse of
//                                        --at — the library shelves a reference instead of owning
//                                        the bytes (for skills you actively develop in their own
//                                        git repo). Name defaults to the dev-repo dir's basename.
//
//   --force   --at:   replace even if <path>'s body differs from the library copy (the divergent
//                     copy is DISCARDED). Without it, a content mismatch is refused — pick a
//                     winner: keep library (this, with --force) or make <path> canonical
//                     (`skl import <name> --from <path> --force`).
//             --from: replace an existing library entry (its current contents are DISCARDED).
//   --json    machine-readable summary.
//
// Safety: --at never touches the library copy and refuses paths inside the library; --from
// refuses a source inside the library; both verify the resulting symlink resolves as intended and
// are idempotent when the link already points where intended.

import { join, resolve, basename } from "node:path";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import type { Ctx } from "../types.ts";
import { parseFrontmatter } from "../lib/frontmatter.ts";
import { removeEntry } from "../core/provenance.ts";
import {
  isDirectory,
  isSymlink,
  safeSymlink,
  realpathOrSelfAsync,
} from "../lib/fs.ts";
import { isRetiredOnly } from "../core/vendor.ts";
import { render, type CommandResult } from "../core/report.ts";

export const meta = {
  name: "link",
  summary: "Link a skill to the library: collapse a copy (--at) or shelve a dev repo (--from)",
  usage: "skl link <name> --at <path>  |  skl link [<name>] --from <dev-repo>  [--force] [--json]",
} as const;

interface Flags {
  name: string | null;
  at: string | null;
  from: string | null;
  force: boolean;
  json: boolean;
}

function parseFlags(argv: string[]): { flags: Flags } | { error: string } {
  const flags: Flags = { name: null, at: null, from: null, force: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--at") {
      const v = argv[++i];
      if (v === undefined) return { error: "--at requires a <path>" };
      flags.at = v;
    } else if (a.startsWith("--at=")) {
      flags.at = a.slice("--at=".length);
    } else if (a === "--from") {
      const v = argv[++i];
      if (v === undefined) return { error: "--from requires a <dev-repo path>" };
      flags.from = v;
    } else if (a.startsWith("--from=")) {
      flags.from = a.slice("--from=".length);
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

/** sha-256 of a SKILL.md body (frontmatter stripped) — matches crawl/dedupe hashing. */
async function bodyHash(skillMdPath: string): Promise<string | null> {
  if (!existsSync(skillMdPath)) return null;
  try {
    const raw = await Bun.file(skillMdPath).text();
    const { body } = parseFrontmatter(raw);
    return createHash("sha256").update(body, "utf8").digest("hex");
  } catch {
    return null;
  }
}

export async function run(argv: string[], ctx: Ctx): Promise<number> {
  const parsed = parseFlags(argv);
  if ("error" in parsed) {
    ctx.error(`skl link: ${parsed.error}`);
    ctx.error(`usage: ${meta.usage}`);
    return 1;
  }
  const flags = parsed.flags;

  if (flags.at && flags.from) {
    ctx.error("skl link: --at and --from are mutually exclusive (collapse a copy vs. shelve a dev repo)");
    ctx.error(`usage: ${meta.usage}`);
    return 1;
  }
  if (!flags.at && !flags.from) {
    ctx.error("skl link: one of --at <path> or --from <dev-repo> is required");
    ctx.error(`usage: ${meta.usage}`);
    return 1;
  }

  return flags.from
    ? await runFrom(flags, ctx)
    : await runAt(flags, ctx);
}

/**
 * LINKED mode: register an external dev-repo skill as a library symlink. The library entry
 * <library>/<name> becomes a symlink pointing AT the dev repo (which stays canonical).
 */
async function runFrom(flags: Flags, ctx: Ctx): Promise<number> {
  const fromPath = resolve(flags.from!.trim());
  const name = (flags.name?.trim()) || basename(fromPath);
  if (!name || name === "." || name === "/") {
    ctx.error("skl link: could not determine a <name> — pass one explicitly");
    return 1;
  }
  const libraryPath = ctx.config.libraryPath;
  const libDir = join(libraryPath, name);

  try {
    // The source must be a real skill dir (has a SKILL.md).
    if (!existsSync(fromPath) || !(await isDirectory(fromPath))) {
      ctx.error(`skl link: --from must be an existing directory: ${fromPath}`);
      return 1;
    }
    if (!existsSync(join(fromPath, "SKILL.md"))) {
      ctx.error(`skl link: ${fromPath} has no SKILL.md (not a skill dir).`);
      return 1;
    }

    // Refuse a source inside the library — that would link the library to itself.
    const fromReal = await realpathOrSelfAsync(fromPath);
    const libRoot = await realpathOrSelfAsync(libraryPath);
    if (fromReal === libRoot || fromReal.startsWith(libRoot + "/")) {
      ctx.error(`skl link: --from is inside the library (${fromPath}) — nothing to register`);
      return 1;
    }

    // Idempotent: library entry is already a symlink resolving to this source.
    if (isSymlink(libDir)) {
      const cur = await realpathOrSelfAsync(libDir);
      if (cur === fromReal) {
        const summary = { ok: true, name, from: fromPath, to: libDir, status: "already" as const, mode: "linked" as const, discarded: false };
        const result: CommandResult = {
          json: summary,
          human: (emit) => emit(`link: library/${name} already points at ${fromPath}`),
        };
        render(ctx, flags.json, result);
        return 0;
      }
    }

    // Retired-aware guard (shared with add/import via core/vendor.ts): refuse if the name
    // exists ONLY as a retired tombstone (<library>/_retired/<name>). Shelving a symlink
    // beside it would strand a duplicate and break `skl unretire`; --force replaces an
    // ACTIVE entry, not a retired one, so this fires regardless. The user must unretire
    // first. The bespoke wording stays here; the predicate is shared.
    if (isRetiredOnly(libraryPath, name)) {
      ctx.error(`skl link: a retired '${name}' exists — run \`skl unretire ${name}\` first.`);
      return 1;
    }

    // An existing library entry won't be clobbered silently.
    const exists = existsSync(libDir) || isSymlink(libDir);
    if (exists && !flags.force) {
      ctx.error(`skl link: '${name}' already exists in the library (${libDir}).`);
      ctx.error("Pass --force to replace it with a symlink to the dev repo (its current contents are discarded).");
      return 1;
    }
    const discarded = exists && !isSymlink(libDir); // a real OWNED copy is being dropped
    if (exists) await rm(libDir, { recursive: true, force: true });
    await safeSymlink(fromPath, libDir, { force: true });

    // Verify the library entry resolves to the dev repo.
    const linkReal = await realpathOrSelfAsync(libDir);
    if (linkReal !== fromReal) {
      ctx.error(`skl link: verification failed — library/${name} resolves to ${linkReal}, expected ${fromReal}`);
      return 1;
    }

    // A LINKED entry is not a tracked github import — drop any stale lock entry so
    // `skl update`/`outdated` never try to pull upstream into the dev repo (ADR-0004).
    await removeEntry(libraryPath, name);

    const summary = { ok: true, name, from: fromPath, to: libDir, status: "linked" as const, mode: "linked" as const, discarded };
    const result: CommandResult = {
      json: summary,
      human: (emit) => {
        emit(`shelved ${name} -> ${fromPath} (LINKED)`);
        if (discarded) emit("  (discarded the previous owned library copy; library now points at the dev repo)");
      },
    };
    render(ctx, flags.json, result);
    return 0;
  } catch (err) {
    ctx.error(`skl link: failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

/**
 * OWNED mode: replace a redundant on-disk copy at <path> with a symlink INTO the library copy
 * the library already owns.
 */
async function runAt(flags: Flags, ctx: Ctx): Promise<number> {
  if (!flags.name || flags.name.trim() === "") {
    ctx.error("skl link: a <name> is required with --at");
    ctx.error(`usage: ${meta.usage}`);
    return 1;
  }

  const name = flags.name.trim();
  const atPath = resolve(flags.at!.trim());
  const libraryPath = ctx.config.libraryPath;
  const libDir = join(libraryPath, name);

  try {
    // The library must already own this skill — link points AT the canonical copy.
    if (!existsSync(libDir) || !existsSync(join(libDir, "SKILL.md"))) {
      ctx.error(
        `skl link: '${name}' is not in the library (${libDir}). Import it first with \`skl import\`.`,
      );
      return 1;
    }

    const libReal = await realpathOrSelfAsync(libDir);

    // Idempotent: already a symlink resolving to the library copy.
    if (isSymlink(atPath)) {
      const cur = await realpathOrSelfAsync(atPath);
      if (cur === libReal) {
        const summary = { ok: true, name, at: atPath, to: libDir, status: "already" as const, discarded: false };
        const result: CommandResult = {
          json: summary,
          human: (emit) => emit(`link: ${atPath} already points at the library copy of ${name}`),
        };
        render(ctx, flags.json, result);
        return 0;
      }
    }

    // Safety: never operate on the library copy itself or anything inside the library.
    const atReal = await realpathOrSelfAsync(atPath);
    if (atReal === libReal) {
      ctx.error(`skl link: --at is the library copy itself (${atPath}) — nothing to do`);
      return 1;
    }
    const libRoot = await realpathOrSelfAsync(libraryPath);
    if (atReal === libRoot || atReal.startsWith(libRoot + "/")) {
      ctx.error(`skl link: refusing to operate on a path inside the library (${atPath})`);
      return 1;
    }

    // If the target exists as a real dir, require it to look like a skill and compare
    // content. A body mismatch means a real decision the tool won't make silently.
    if (existsSync(atPath) && !isSymlink(atPath)) {
      if (!(await isDirectory(atPath))) {
        ctx.error(`skl link: --at must be a directory (the redundant copy): ${atPath}`);
        return 1;
      }
      const atSkillMd = join(atPath, "SKILL.md");
      if (!existsSync(atSkillMd) && !flags.force) {
        ctx.error(
          `skl link: ${atPath} has no SKILL.md (not a skill dir). Pass --force to replace it anyway.`,
        );
        return 1;
      }
      if (existsSync(atSkillMd) && !flags.force) {
        const [a, b] = await Promise.all([
          bodyHash(atSkillMd),
          bodyHash(join(libDir, "SKILL.md")),
        ]);
        if (a !== b) {
          ctx.error(
            `skl link: ${atPath} differs from the library copy of '${name}'.`,
          );
          ctx.error(
            "Pass --force to discard the divergent copy and replace it with a symlink,",
          );
          ctx.error(
            `or make this copy canonical instead: \`skl import ${name} --from ${atPath} --force\`.`,
          );
          return 1;
        }
      }
    }

    // Replace the redundant copy with a symlink into the library.
    const discarded = existsSync(atPath) && !isSymlink(atPath);
    if (existsSync(atPath) || isSymlink(atPath)) {
      await rm(atPath, { recursive: true, force: true });
    }
    await safeSymlink(libDir, atPath, { force: true });

    // Verify the link resolves to the library copy.
    const linkReal = await realpathOrSelfAsync(atPath);
    if (linkReal !== libReal) {
      ctx.error(
        `skl link: verification failed — ${atPath} resolves to ${linkReal}, expected ${libReal}`,
      );
      return 1;
    }

    const summary = { ok: true, name, at: atPath, to: libDir, status: "linked" as const, discarded };
    const result: CommandResult = {
      json: summary,
      human: (emit) => {
        emit(`linked ${basename(atPath)} -> ${libDir}`);
        if (discarded) emit("  (discarded the redundant copy; old path now resolves to the library)");
      },
    };
    render(ctx, flags.json, result);
    return 0;
  } catch (err) {
    ctx.error(`skl link: failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
