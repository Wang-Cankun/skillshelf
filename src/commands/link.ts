// `skl link <name> --at <path>` — collapse a redundant copy into a symlink to the
// library. The inverse companion of `import`'s symlink-back: where `import` MOVES a
// skill into the library and leaves a symlink behind, `link` takes a skill the library
// ALREADY owns and replaces some *other* on-disk copy of it with a symlink into the
// library — fulfilling the one-canonical-copy rule for locations that were never
// consolidated (e.g. an old `.claude/skills/<name>` duplicate).
//
//   skl link <name> --at <path> [--force] [--json]
//
//   <name>     a skill that already exists in the library (<library>/<name>)
//   --at       the redundant copy to replace with a symlink into the library
//   --force    proceed even if <path>'s body differs from the library copy
//              (the divergent copy is DISCARDED). Without it, a content mismatch is
//              refused — pick a winner explicitly: keep library (this, with --force)
//              or make <path> canonical (`skl import <name> --from <path> --force`).
//
// Safety: never touches the library copy; refuses to operate on a path inside the
// library; idempotent when <path> already points at the library copy.

import { join, resolve, basename } from "node:path";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import type { Ctx } from "../types.ts";
import { parseFrontmatter } from "../lib/frontmatter.ts";
import {
  isDirectory,
  isSymlink,
  safeSymlink,
  realpathOrSelfAsync,
} from "../lib/fs.ts";

export const meta = {
  name: "link",
  summary: "Replace a redundant copy of an owned skill with a symlink into the library",
  usage: "skl link <name> --at <path> [--force] [--json]",
} as const;

interface Flags {
  name: string | null;
  at: string | null;
  force: boolean;
  json: boolean;
}

function parseFlags(argv: string[]): { flags: Flags } | { error: string } {
  const flags: Flags = { name: null, at: null, force: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--at") {
      const v = argv[++i];
      if (v === undefined) return { error: "--at requires a <path>" };
      flags.at = v;
    } else if (a.startsWith("--at=")) {
      flags.at = a.slice("--at=".length);
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

  if (!flags.name || flags.name.trim() === "") {
    ctx.error("skl link: a <name> is required");
    ctx.error(`usage: ${meta.usage}`);
    return 1;
  }
  if (!flags.at || flags.at.trim() === "") {
    ctx.error("skl link: --at <path> is required");
    ctx.error(`usage: ${meta.usage}`);
    return 1;
  }

  const name = flags.name.trim();
  const atPath = resolve(flags.at.trim());
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
        if (flags.json) ctx.json(summary);
        else ctx.log(`link: ${atPath} already points at the library copy of ${name}`);
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
    if (flags.json) {
      ctx.json(summary);
    } else {
      ctx.log(`linked ${basename(atPath)} -> ${libDir}`);
      if (discarded) ctx.log("  (discarded the redundant copy; old path now resolves to the library)");
    }
    return 0;
  } catch (err) {
    ctx.error(`skl link: failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
