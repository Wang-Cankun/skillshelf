// skl add <src> — install a third-party skill into the library.
//
// Flow:
//   1. parse <src> (github:owner/repo[/path] or a bare registry name)
//   2. shell out (git / `skills`) to DOWNLOAD only — never reinvent fetching
//   3. copy the skill dir into the library under its primary-domain folder
//   4. write a provenance lockfile entry (source + ref + channel + installedAt)
//   5. create an empty overlay (<name>.shelf.json) so taxonomy survives updates
//   6. call the inference tagging hook if one is available, else leave untagged
//
// Read-only commands take --json; add is a write, but still emits a --json
// summary on success for agent consumption.

import { join, basename } from "node:path";
import { existsSync } from "node:fs";
import type { Ctx, Skill, LockEntry } from "../types.ts";
import {
  parseSource,
  fetchSource,
  copySkillDir,
  cleanupStaging,
  readSkillBody,
} from "../core/fetch.ts";
import { parseFrontmatter } from "../lib/frontmatter.ts";
import { hashContent } from "../core/crawl.ts";
import { recordEntry } from "../core/provenance.ts";
import { writeOverlay } from "../core/overlay.ts";
import { ensureDir } from "../lib/fs.ts";

export const meta = {
  name: "add",
  summary: "Install a third-party skill (github:/registry), record provenance, tag",
  usage: "skl add <src> [--domain <d>] [--name <slug>] [--no-infer] [--force] [--json]",
} as const;

interface Flags {
  json: boolean;
  domain: string | null;
  name: string | null;
  infer: boolean;
  force: boolean;
  src: string | null;
}

// A skill slug is lowercase letters/digits/hyphens. This is also a SECURITY
// guard: `name` may be derived from an untrusted third-party SKILL.md frontmatter
// and `domain` from a flag, and both are joined into a library path. Rejecting
// anything outside this charset stops `..`/`/` path traversal out of the library.
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

function parseFlags(argv: string[]): Flags {
  const f: Flags = { json: false, domain: null, name: null, infer: true, force: false, src: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--json") f.json = true;
    else if (a === "--no-infer") f.infer = false;
    else if (a === "--force") f.force = true;
    else if (a === "--domain") f.domain = argv[++i] ?? null;
    else if (a === "--name") f.name = argv[++i] ?? null;
    else if (a === "--domain=" || a.startsWith("--domain=")) f.domain = a.slice("--domain=".length);
    else if (a.startsWith("--name=")) f.name = a.slice("--name=".length);
    else if (!a.startsWith("-") && f.src === null) f.src = a;
  }
  return f;
}

/** Slug from frontmatter `name`, else the source dir name. */
async function deriveName(skillDir: string, override: string | null): Promise<string> {
  if (override && override.trim() !== "") return override.trim();
  const body = await readSkillBody(skillDir);
  const { data } = parseFrontmatter(body);
  if (typeof data.name === "string" && data.name.trim() !== "") return data.name.trim();
  return basename(skillDir);
}

/**
 * Optionally run an AI inference tagging pass over the freshly-installed skill.
 *
 * The taxonomy pass (`skl infer`) is corpus-based and lives in the inference
 * adapters; there is no committed single-skill tagging hook in the public API.
 * To stay decoupled (and to leave the skill *untagged* rather than fail when no
 * hook is present), we look for an OPTIONAL convention module that may export a
 * `tagSkill(skill) => string[]`. The specifier is built at runtime so a missing
 * module degrades gracefully instead of becoming a static import error.
 *
 * A MISSING hook module is expected and stays silent (untagged is valid). But a
 * hook that IS present and THROWS is a real failure — we surface it via `warn`
 * rather than swallowing it, so a bug in an installed tagging hook isn't
 * indistinguishable from "no hook installed". Either way the skill stays
 * untagged (empty overlay). Returns the domains written, if any.
 */
async function maybeInferTags(
  skill: Skill,
  warn?: (msg: string) => void,
): Promise<string[] | null> {
  const candidates = ["../core/infer.ts", "../adapters/inference/tag.ts"];
  for (const rel of candidates) {
    // Non-literal specifier + .catch: a missing optional module degrades to
    // "untagged" at runtime instead of becoming a static resolution error.
    const spec: string = rel;
    const mod: unknown = await import(spec).catch(() => null);
    if (!mod || typeof mod !== "object") continue;
    const hook = (mod as Record<string, unknown>).tagSkill;
    if (typeof hook !== "function") continue;
    // The hook EXISTS: from here, errors are real and must be surfaced.
    try {
      const result = await (hook as (s: Skill) => Promise<string[] | null>)(skill);
      if (Array.isArray(result)) {
        return result.filter((d) => typeof d === "string" && d.trim() !== "");
      }
      return null;
    } catch (err) {
      warn?.(
        `add: inference hook ${rel} failed (skill left untagged): ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }
  return null;
}

export async function run(argv: string[], ctx: Ctx): Promise<number> {
  const flags = parseFlags(argv);
  if (!flags.src) {
    ctx.error("usage:", meta.usage);
    return 1;
  }

  const parsed = parseSource(flags.src);

  // 1+2. DOWNLOAD into a staging dir (shell out only).
  const fetched = await fetchSource(parsed);
  if (!fetched.ok) {
    await cleanupStaging(fetched.staging);
    ctx.error("add: download failed:", fetched.error);
    return 1;
  }

  try {
    // 3. Determine destination in the library.
    const name = await deriveName(fetched.skillDir, flags.name);
    if (!SLUG_RE.test(name)) {
      ctx.error(
        `add: invalid skill name "${name}" — use lowercase letters, digits, and hyphens (override with --name <slug>)`,
      );
      return 1;
    }
    const domainFolder = flags.domain && flags.domain.trim() !== "" ? flags.domain.trim() : null;
    if (domainFolder !== null && !SLUG_RE.test(domainFolder)) {
      ctx.error(
        `add: invalid --domain "${domainFolder}" — use lowercase letters, digits, and hyphens`,
      );
      return 1;
    }
    const destDir = domainFolder
      ? join(ctx.config.libraryPath, domainFolder, name)
      : join(ctx.config.libraryPath, name);

    if (existsSync(destDir) && !flags.force) {
      ctx.error(
        `add: ${name} already exists at ${destDir} (use --force to overwrite, or skl update ${name} to re-pull)`,
      );
      return 1;
    }

    await ensureDir(domainFolder ? join(ctx.config.libraryPath, domainFolder) : ctx.config.libraryPath);
    await copySkillDir(fetched.skillDir, destDir);

    // 4. Provenance lockfile entry. Record the installed body hash so a later
    //    `skl update` can tell a user hand-edit apart from upstream moving forward.
    const installedBody = parseFrontmatter(await readSkillBody(fetched.skillDir)).body;
    // git: sources already encode their subpath as `#subpath` in fetched.source;
    // only github sources use the `@subpath` suffix convention here.
    const subSuffix = parsed.subpath && parsed.channel !== "git" ? `@${parsed.subpath}` : "";
    const entry: LockEntry = {
      name,
      source: `${fetched.source}${subSuffix}`,
      ref: fetched.ref,
      channel: fetched.channel,
      installedAt: new Date().toISOString(),
      localEdits: false,
      installedHash: hashContent(installedBody),
    };
    await recordEntry(ctx.config.libraryPath, entry);

    // 5. Empty overlay so taxonomy survives future updates.
    const installed: Skill = {
      name,
      description: "",
      primaryDomain: domainFolder,
      domains: domainFolder ? [domainFolder] : [],
      path: destDir,
      bodyPath: join(destDir, "SKILL.md"),
      refFiles: [],
      source: {
        source: entry.source,
        ref: entry.ref,
        channel: entry.channel,
        installedAt: entry.installedAt,
        localEdits: false,
      },
      retired: false,
      mirrorOf: null,
      contentHash: "",
    };
    const overlayPathStr = join(destDir, `${name}.shelf.json`);
    if (!existsSync(overlayPathStr)) {
      await writeOverlay(installed, domainFolder ? { domains: [domainFolder] } : {});
    }

    // 6. Inference tagging hook (best-effort, leaves untagged if unavailable).
    let inferredDomains: string[] | null = null;
    if (flags.infer) {
      inferredDomains = await maybeInferTags(installed, (m) => ctx.error(m));
      if (inferredDomains && inferredDomains.length > 0) {
        await writeOverlay(installed, { domains: inferredDomains });
      }
    }

    const summary = {
      ok: true,
      name,
      path: destDir,
      source: entry.source,
      ref: entry.ref,
      channel: entry.channel,
      installedAt: entry.installedAt,
      tagged: Boolean(inferredDomains && inferredDomains.length > 0),
      domains: inferredDomains ?? (domainFolder ? [domainFolder] : []),
    };

    if (flags.json) {
      ctx.json(summary);
    } else {
      ctx.log(`added ${name}`);
      ctx.log(`  path:    ${destDir}`);
      ctx.log(`  source:  ${entry.source}`);
      ctx.log(`  ref:     ${entry.ref || "(unknown)"}`);
      ctx.log(`  channel: ${entry.channel}`);
      if (summary.tagged) ctx.log(`  domains: ${summary.domains.join(", ")}`);
      else ctx.log(`  domains: (untagged — run \`skl infer\` to assign)`);
    }
    return 0;
  } catch (err) {
    ctx.error("add: failed:", err instanceof Error ? err.message : String(err));
    return 1;
  } finally {
    await cleanupStaging(fetched.staging);
  }
}
