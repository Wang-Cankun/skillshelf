// `skl migrate [--from <path>]` — bulk-adopt provenance from a VENDOR skill lock
// (e.g. ~/.agents/.skill-lock.json) for skills ALREADY in your library (ADR-0011).
//
//   skl migrate [--from <path>] [--dry-run] [--resolve] [--force] [--json]
//
// A thin adapter over `track`: it reads a foreign (vendor) lockfile, maps each vendor
// entry to an `skl` source, and — for skills already in the library — calls the same
// `trackOne` logic `skl track` uses. It NEVER installs/downloads: a skill not in the
// library is REPORTED ONLY (with the `skl add <src>` line to bring it in). The vendor's
// own hashes/refs are NOT reused (a vendor tree-SHA is not skl's body sha256, and a
// vendor branch is not a commit) — so every adopted entry is `adopted: true` unless
// --resolve verifies it.
//
// Buckets: ✓ tracked · ⊘ skipped (already tracked) · ⚠ not in library · (not trackable).

import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import type { Ctx } from "../types.ts";
import { loadLibrary, findByName } from "../core/library.ts";
import { readLockfile } from "../core/provenance.ts";
import { trackOne } from "./track.ts";

export const meta = {
  name: "migrate",
  summary: "Bulk-adopt provenance from a vendor skill-lock for skills already in your library",
  usage: "skl migrate [--from <path>] [--dry-run] [--resolve] [--force] [--json]",
} as const;

/** The default vendor lock location (the `agents`/`skills` CLI convention). */
function defaultVendorLock(): string {
  return join(homedir(), ".agents", ".skill-lock.json");
}

/** One entry in the vendor lock (the shape we adapt from). */
interface VendorEntry {
  source?: string;
  sourceType?: "github" | "git" | "local" | "well-known" | string;
  sourceUrl?: string;
  skillPath?: string;
  skillFolderHash?: string;
  installedAt?: string;
  ref?: string;
}

interface VendorLock {
  version?: number;
  skills?: Record<string, VendorEntry>;
}

interface Flags {
  from: string | null;
  dryRun: boolean;
  resolve: boolean;
  force: boolean;
  json: boolean;
}

function parseFlags(argv: string[]): { flags: Flags } | { error: string } {
  const flags: Flags = { from: null, dryRun: false, resolve: false, force: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--from") {
      const v = argv[++i];
      if (v === undefined) return { error: "--from requires a <path>" };
      flags.from = v;
    } else if (a.startsWith("--from=")) {
      flags.from = a.slice("--from=".length);
    } else if (a === "--dry-run") {
      flags.dryRun = true;
    } else if (a === "--resolve") {
      flags.resolve = true;
    } else if (a === "--force") {
      flags.force = true;
    } else if (a === "--json") {
      flags.json = true;
    } else if (a.startsWith("--")) {
      return { error: `unknown argument: ${a}` };
    } else {
      return { error: `unexpected argument: ${a}` };
    }
  }
  return { flags };
}

/** True if the parsed JSON looks like the vendor lock format (signature detection). */
function isVendorLock(parsed: unknown): parsed is VendorLock {
  if (!parsed || typeof parsed !== "object") return false;
  const p = parsed as Record<string, unknown>;
  if (p.version !== 3) return false;
  if (!p.skills || typeof p.skills !== "object") return false;
  // Carry the vendor signature: at least one entry with a skillFolderHash.
  const skills = p.skills as Record<string, unknown>;
  return Object.values(skills).some(
    (e) => e && typeof e === "object" && "skillFolderHash" in (e as object),
  );
}

/** POSIX dirname of a skillPath ("dir/SKILL.md" -> "dir"; "SKILL.md" -> ""). */
function skillDir(skillPath: string | undefined): string {
  if (!skillPath) return "";
  const norm = skillPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const i = norm.lastIndexOf("/");
  return i >= 0 ? norm.slice(0, i) : "";
}

/**
 * Map a vendor entry to an `skl` source string, or null when it's not trackable.
 *   github      → `github:owner/repo` (+ `@<dir>` if skillPath has a dir)
 *   git         → `git:<sourceUrl>` (+ `#<dir>`)
 *   local/well-known → null (no upstream to track)
 * NOTE: the vendor `ref` (a branch) and `skillFolderHash` (a tree SHA) are deliberately
 * NOT propagated — they are not skl's commit ref / body sha256.
 */
function mapVendorSource(entry: VendorEntry): string | null {
  const dir = skillDir(entry.skillPath);
  const type = entry.sourceType;
  if (type === "github") {
    if (!entry.source) return null;
    return `github:${entry.source}${dir ? `@${dir}` : ""}`;
  }
  if (type === "git") {
    if (!entry.sourceUrl) return null;
    return `git:${entry.sourceUrl}${dir ? `#${dir}` : ""}`;
  }
  // local / well-known → not trackable (no upstream baseline).
  return null;
}

interface TrackedRow { name: string; source: string; ref: string; adopted: boolean; note: string }
interface SkippedRow { name: string; reason: string }
interface MissingRow { name: string; source: string }
interface NotTrackableRow { name: string; sourceType: string }

export async function run(argv: string[], ctx: Ctx): Promise<number> {
  const parsed = parseFlags(argv);
  if ("error" in parsed) {
    ctx.error(`skl migrate: ${parsed.error}`);
    ctx.error(`usage: ${meta.usage}`);
    return 1;
  }
  const flags = parsed.flags;
  const fromPath = flags.from && flags.from.trim() !== "" ? flags.from.trim() : defaultVendorLock();
  const libraryPath = ctx.config.libraryPath;

  try {
    if (!existsSync(fromPath)) {
      ctx.error(`skl migrate: vendor lock not found: ${fromPath}`);
      ctx.error("Point at one with --from <path>, or install skills via the vendor CLI first.");
      return 1;
    }

    let vendorParsed: unknown;
    try {
      vendorParsed = JSON.parse(await Bun.file(fromPath).text());
    } catch (err) {
      ctx.error(`skl migrate: could not parse ${fromPath}: ${err instanceof Error ? err.message : String(err)}`);
      return 1;
    }
    if (!isVendorLock(vendorParsed)) {
      ctx.error(`skl migrate: ${fromPath} is not a recognized vendor skill-lock (expected {version:3, skills:{…}}).`);
      return 1;
    }
    const vendorSkills = vendorParsed.skills ?? {};

    const library = await loadLibrary(libraryPath);
    const lock = await readLockfile(libraryPath);

    const tracked: TrackedRow[] = [];
    const skipped: SkippedRow[] = [];
    const missing: MissingRow[] = [];
    const notTrackable: NotTrackableRow[] = [];

    // Stable iteration order by name.
    const names = Object.keys(vendorSkills).sort();
    for (const name of names) {
      const entry = vendorSkills[name]!;
      const source = mapVendorSource(entry);
      if (source === null) {
        notTrackable.push({ name, sourceType: entry.sourceType ?? "unknown" });
        continue;
      }

      const inLibrary = Boolean(findByName(library, name));
      if (!inLibrary) {
        // REPORT ONLY — migrate never installs/downloads.
        missing.push({ name, source });
        continue;
      }

      // Already tracked → skip unless --force.
      if (lock.entries[name] && !flags.force) {
        skipped.push({ name, reason: "already tracked" });
        continue;
      }

      if (flags.dryRun) {
        tracked.push({ name, source, ref: "", adopted: true, note: "would track (dry-run)" });
        continue;
      }

      const res = await trackOne(libraryPath, library, {
        name,
        source,
        resolve: flags.resolve,
        force: flags.force,
      });
      if (res.ok) {
        tracked.push({ name, source: res.source, ref: res.ref, adopted: res.adopted, note: res.note });
      } else {
        // A guard tripped at track time (e.g. LINKED, source didn't round-trip) — surface it.
        skipped.push({ name, reason: res.reason });
      }
    }

    if (flags.json) {
      ctx.json({
        ok: true,
        action: "migrate",
        from: fromPath,
        dryRun: flags.dryRun,
        counts: {
          tracked: tracked.length,
          skipped: skipped.length,
          notInLibrary: missing.length,
          notTrackable: notTrackable.length,
        },
        tracked,
        skipped,
        notInLibrary: missing,
        notTrackable,
      });
      return 0;
    }

    ctx.log(`migrate from ${fromPath}${flags.dryRun ? " (dry-run)" : ""}:`);
    ctx.log("");
    for (const r of tracked) {
      ctx.log(`  ✓ tracked      ${r.name.padEnd(28)} ${r.source}${r.adopted ? "  (adopted)" : ""}${r.note ? `  — ${r.note}` : ""}`);
    }
    for (const r of skipped) {
      ctx.log(`  ⊘ skipped      ${r.name.padEnd(28)} ${r.reason}`);
    }
    for (const r of missing) {
      ctx.log(`  ⚠ not in library  ${r.name.padEnd(25)} bring it in: skl add ${r.source}`);
    }
    for (const r of notTrackable) {
      ctx.log(`  · not trackable ${r.name.padEnd(27)} sourceType=${r.sourceType} (no upstream)`);
    }
    ctx.log("");
    ctx.log(
      `✓ tracked ${tracked.length} · ⊘ skipped ${skipped.length} (already tracked) · ⚠ not in library ${missing.length} · not trackable ${notTrackable.length}`,
    );
    if (missing.length > 0) ctx.log("Skills not in your library were only reported — `skl add <src>` to install them, then re-run migrate.");
    return 0;
  } catch (err) {
    ctx.error(`skl migrate: failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
