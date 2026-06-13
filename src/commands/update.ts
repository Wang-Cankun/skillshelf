// skl update [name] — re-pull the upstream SKILL.md body for tracked skills.
//
// Invariants (the whole point of this command):
//   - Domain tags are NEVER touched: they live in the central <library>/taxonomy.json
//     (ADR-0002), which is separate from skill bodies, so re-pulling SKILL.md leaves
//     every skill's domains intact. (There is no longer a per-skill overlay file.)
//   - Only the upstream body (SKILL.md + bundled reference files) is replaced.
//   - If the LOCAL body diverged from the previously-installed upstream (the user
//     hand-edited it), DO NOT clobber. Show a diff and skip, unless --force.
//   - Bundled reference files are refreshed alongside SKILL.md.
//
// Read-ish/destructive command. Supports --json for a structured report; --dry-run
// to preview without writing; --force to overwrite diverged local edits.

import { join, basename } from "node:path";
import { existsSync, type Dirent } from "node:fs";
import { cp, rm, readdir } from "node:fs/promises";
import type { Ctx, LockEntry } from "../types.ts";
import { readLockfile, recordEntry } from "../core/provenance.ts";
import {
  parseStoredSource,
  fetchSource,
  cleanupStaging,
  readSkillBody,
  unifiedDiff,
} from "../core/fetch.ts";
import { hashContent } from "../core/crawl.ts";
import { parseFrontmatter } from "../lib/frontmatter.ts";
import { loadLibrary, findByName, entryMode } from "../core/library.ts";

export const meta = {
  name: "update",
  summary: "Re-pull upstream body, preserve domain tags, diff if local body diverged",
  usage: "skl update [name] [--force] [--dry-run] [--json]",
} as const;

type Outcome = "updated" | "uptodate" | "diverged" | "skipped" | "error";

interface Result {
  name: string;
  source: string;
  channel: string;
  fromRef: string;
  toRef: string | null;
  outcome: Outcome;
  note: string;
  diff?: string;
}

/** Body text after frontmatter, for content comparison/hash. */
function bodyOf(text: string): string {
  return parseFrontmatter(text).body;
}

/**
 * Replace SKILL.md + bundled reference files from upstream within a single skill
 * dir. Domain tags and provenance are NOT stored inside the skill dir — the central
 * taxonomy.json and shelf.lock.json both live at the LIBRARY ROOT (ADR-0002), never
 * inside `destDir` — so the only thing to protect here is the skill's own `.git`.
 * We still keep `shelf.lock.json`/`taxonomy.json` in the preserve set defensively,
 * so a stray copy inside a skill dir is never deleted by this cleanup.
 */
async function applyUpstream(destDir: string, upstreamDir: string, _name: string): Promise<void> {
  const PRESERVE = new Set(["shelf.lock.json", "taxonomy.json"]);
  // Remove existing upstream-managed files (everything except lock/taxonomy/.git).
  let entries: Dirent[] = [];
  try {
    entries = await readdir(destDir, { withFileTypes: true });
  } catch {
    /* dest may not exist yet */
  }
  for (const e of entries) {
    if (PRESERVE.has(e.name) || e.name === ".git") continue;
    await rm(join(destDir, e.name), { recursive: true, force: true });
  }
  // Copy fresh upstream content (minus its .git).
  await cp(upstreamDir, destDir, {
    recursive: true,
    force: true,
    filter: (s: string) => basename(s) !== ".git",
  });
}

async function updateOne(
  ctx: Ctx,
  entry: LockEntry,
  destDir: string,
  opts: { force: boolean; dryRun: boolean },
): Promise<Result> {
  const parsed = parseStoredSource(entry.source);
  const fetched = await fetchSource(parsed);
  if (!fetched.ok) {
    await cleanupStaging(fetched.staging);
    return {
      name: entry.name,
      source: entry.source,
      channel: entry.channel,
      fromRef: entry.ref,
      toRef: null,
      outcome: "error",
      note: fetched.error,
    };
  }

  try {
    const upstreamText = await readSkillBody(fetched.skillDir);
    const localPath = join(destDir, "SKILL.md");
    const localText = existsSync(localPath) ? await Bun.file(localPath).text() : "";

    const upstreamBody = bodyOf(upstreamText);
    const localBody = bodyOf(localText);

    const upstreamHash = hashContent(upstreamBody);
    const localHash = hashContent(localBody);

    // Already current: local body matches upstream and ref unchanged.
    if (localHash === upstreamHash && fetched.ref === entry.ref) {
      return {
        name: entry.name,
        source: entry.source,
        channel: entry.channel,
        fromRef: entry.ref,
        toRef: fetched.ref,
        outcome: "uptodate",
        note: "already at latest upstream body",
      };
    }

    // True 3-way divergence: did the USER hand-edit the local body since install?
    // Compare against installedHash (the upstream body recorded at install/update
    // time) — NOT against current upstream, so a normal upstream-moved-forward
    // update is applied, and only genuine local edits are protected.
    // Legacy entries without installedHash fall back to the localEdits flag.
    const userEdited =
      entry.installedHash != null
        ? localHash !== entry.installedHash
        : entry.localEdits === true;
    const localDiverged = userEdited && localHash !== upstreamHash;
    if (localDiverged && !opts.force) {
      const diff = await unifiedDiff(
        localText,
        upstreamText,
        `${entry.name} (local)`,
        `${entry.name} (upstream ${fetched.ref.slice(0, 10)})`,
      );
      return {
        name: entry.name,
        source: entry.source,
        channel: entry.channel,
        fromRef: entry.ref,
        toRef: fetched.ref,
        outcome: "diverged",
        note: "local body diverged from upstream; not clobbering (use --force to overwrite)",
        diff,
      };
    }

    if (opts.dryRun) {
      return {
        name: entry.name,
        source: entry.source,
        channel: entry.channel,
        fromRef: entry.ref,
        toRef: fetched.ref,
        outcome: "updated",
        note: opts.force && localDiverged ? "would overwrite diverged local body (dry-run)" : "would update (dry-run)",
      };
    }

    // Apply: replace body + ref files; domain tags + lock live at the library
    // root (taxonomy.json / shelf.lock.json), untouched by this skill-dir cleanup.
    await applyUpstream(destDir, fetched.skillDir, entry.name);

    // Update lockfile ref + record the new installed body hash + clear localEdits
    // (the on-disk body now equals upstream again, so we are pristine).
    const updatedEntry: LockEntry = {
      ...entry,
      ref: fetched.ref,
      installedAt: new Date().toISOString(),
      localEdits: false,
      installedHash: upstreamHash,
    };
    await recordEntry(ctx.config.libraryPath, updatedEntry);

    return {
      name: entry.name,
      source: entry.source,
      channel: entry.channel,
      fromRef: entry.ref,
      toRef: fetched.ref,
      outcome: "updated",
      note: opts.force && localDiverged ? "overwrote diverged local body" : "upstream body re-pulled; domain tags preserved",
    };
  } catch (err) {
    return {
      name: entry.name,
      source: entry.source,
      channel: entry.channel,
      fromRef: entry.ref,
      toRef: fetched.ref,
      outcome: "error",
      note: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await cleanupStaging(fetched.staging);
  }
}

export async function run(argv: string[], ctx: Ctx): Promise<number> {
  const json = argv.includes("--json");
  const force = argv.includes("--force");
  const dryRun = argv.includes("--dry-run");
  const nameArg = argv.find((a) => !a.startsWith("-")) ?? null;

  try {
    const lock = await readLockfile(ctx.config.libraryPath);
    let entries = Object.values(lock.entries);
    if (nameArg) entries = entries.filter((e) => e.name === nameArg);
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    if (entries.length === 0) {
      if (json) ctx.json({ ok: true, updated: 0, diverged: 0, results: [] });
      else if (nameArg) ctx.error(`no tracked skill named "${nameArg}"`);
      else ctx.log("no tracked third-party skills (lockfile is empty)");
      return nameArg && !json ? 1 : 0;
    }

    // Resolve on-disk dirs via the library so renames/domain folders are honored.
    const library = await loadLibrary(ctx.config.libraryPath);

    const results: Result[] = [];
    for (const entry of entries) {
      // LINKED entries (library/<name> is a symlink to an external dev repo) own their
      // own versioning via their own git. Re-pulling upstream would follow the symlink
      // and clobber the dev repo, so skip them outright (ADR-0004). A stale lock entry
      // can exist if an OWNED import was later converted with `skl link --from --force`.
      if (entryMode(ctx.config.libraryPath, entry.name) === "linked") {
        results.push({
          name: entry.name,
          source: entry.source,
          channel: entry.channel,
          fromRef: entry.ref,
          toRef: null,
          outcome: "skipped",
          note: "LINKED to a dev repo — its own git owns versioning; not pulling upstream",
        });
        continue;
      }
      const skill = findByName(library, entry.name);
      const destDir = skill?.path ?? join(ctx.config.libraryPath, entry.name);
      results.push(await updateOne(ctx, entry, destDir, { force, dryRun }));
    }

    const updated = results.filter((r) => r.outcome === "updated").length;
    const diverged = results.filter((r) => r.outcome === "diverged").length;
    const errored = results.filter((r) => r.outcome === "error").length;

    if (json) {
      ctx.json({ ok: errored === 0, updated, diverged, errors: errored, results });
    } else {
      for (const r of results) {
        const tag =
          r.outcome === "updated"
            ? "updated  "
            : r.outcome === "uptodate"
              ? "current  "
              : r.outcome === "diverged"
                ? "DIVERGED "
                : r.outcome === "error"
                  ? "ERROR    "
                  : "skipped  ";
        ctx.log(`${tag}  ${r.name.padEnd(28)} ${r.note}`);
        if (r.outcome === "diverged" && r.diff) {
          ctx.log("");
          ctx.log(r.diff.trimEnd());
          ctx.log("");
        }
      }
      ctx.log("");
      ctx.log(
        `${results.length} tracked, ${updated} updated, ${diverged} diverged${errored ? `, ${errored} error(s)` : ""}.`,
      );
      if (diverged > 0) ctx.log("re-run with --force to overwrite diverged local bodies.");
    }

    // Non-zero if any error or any unresolved divergence (blocks CI/agents).
    if (errored > 0) return 1;
    return diverged > 0 ? 2 : 0;
  } catch (err) {
    ctx.error("update: failed:", err instanceof Error ? err.message : String(err));
    return 1;
  }
}
