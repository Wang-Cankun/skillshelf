#!/usr/bin/env bun
// ADR-0002 migration: per-skill `<skill>.shelf.json` sidecars -> ONE central
// `<library>/taxonomy.json`, plus a config.roots string[] -> Array<string|RootEntry>
// upgrade. Operates on a REAL skillshelf home.
//
// SAFE BY DEFAULT: this is a DRY RUN unless `--apply` is passed. A dry run reads
// everything, computes the migration, and prints a summary WITHOUT touching disk.
// `--apply` backs up first (aborting if the backup fails), then writes the new
// files and removes the old sidecars + the DISCOVERED_ROOTS scratchpad.
//
// Usage:
//   bun run scripts/migrate-0002-taxonomy.ts [--home <path>] [--apply]
//
// Home resolution order: --home <path>  >  $SKILLSHELF_HOME  >  ~/.skillshelf
//
// On-disk taxonomy format is produced by REUSING writeTaxonomy() from the app core
// so the migrated file is byte-identical to what the running CLI would emit.

import { join, basename, dirname, relative } from "node:path";
import { existsSync } from "node:fs";
import { readdir, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { writeTaxonomy } from "../src/core/taxonomy.ts";
import type { Taxonomy, RootEntry } from "../src/types.ts";

// ---------------------------------------------------------------------------
// args
// ---------------------------------------------------------------------------

interface Args {
  home: string;
  apply: boolean;
}

function parseArgs(argv: string[]): Args {
  let home = process.env.SKILLSHELF_HOME?.trim() || join(homedir(), ".skillshelf");
  let apply = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    if (a === "--apply") {
      apply = true;
    } else if (a === "--home") {
      const next = argv[i + 1];
      if (!next) throw new Error("--home requires a path argument");
      home = next;
      i++;
    } else if (a.startsWith("--home=")) {
      home = a.slice("--home=".length);
    } else {
      throw new Error(`unknown argument: ${a}`);
    }
  }
  return { home, apply };
}

// ---------------------------------------------------------------------------
// sidecar -> taxonomy
// ---------------------------------------------------------------------------

interface SidecarFinding {
  /** absolute path to the .shelf.json file */
  file: string;
  /** skill name = parent directory basename */
  name: string;
  /** parsed, cleaned domains (de-duped, trimmed, non-empty) */
  domains: string[];
  /** could not parse the JSON at all */
  unparseable: boolean;
}

/** Find every `<libraryPath>/<skill>/<anything>.shelf.json` sidecar. */
async function findSidecars(libraryPath: string): Promise<string[]> {
  if (!existsSync(libraryPath)) return [];
  const out: string[] = [];
  const entries = await readdir(libraryPath, { withFileTypes: true });
  for (const e of entries) {
    // Follow symlinked skill dirs too (some library skills are symlinks to an
    // external source dir, e.g. `library/cairn` -> a GitHub checkout). isDirectory()
    // is false for a symlink, so we must also accept isSymbolicLink().
    if (!e.isDirectory() && !e.isSymbolicLink()) continue;
    // Resolve via the under-home library path (NOT the symlink target) so backup
    // and delete operate on paths under <home>; readdir follows the link for us.
    const skillDir = join(libraryPath, e.name);
    let inner: import("node:fs").Dirent[];
    try {
      inner = await readdir(skillDir, { withFileTypes: true });
    } catch {
      continue; // dangling symlink or unreadable dir — skip
    }
    for (const f of inner) {
      // f may itself be a symlink to a file; accept files and file-symlinks.
      if (f.name.endsWith(".shelf.json") && (f.isFile() || f.isSymbolicLink())) {
        out.push(join(skillDir, f.name));
      }
    }
  }
  return out.sort();
}

function cleanDomains(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const d of value) {
    const s = String(d).trim();
    if (s !== "" && !out.includes(s)) out.push(s);
  }
  return out;
}

async function readSidecar(file: string): Promise<SidecarFinding> {
  const name = basename(dirname(file));
  try {
    const text = await Bun.file(file).text();
    const parsed = JSON.parse(text) as unknown;
    const domains =
      parsed && typeof parsed === "object"
        ? cleanDomains((parsed as { domains?: unknown }).domains)
        : [];
    return { file, name, domains, unparseable: false };
  } catch {
    return { file, name, domains: [], unparseable: true };
  }
}

// ---------------------------------------------------------------------------
// DISCOVERED_ROOTS markdown table -> root annotations
// ---------------------------------------------------------------------------

interface RootAnnotation {
  /** the raw "Root" cell, e.g. "~/.claude/skills/" */
  root: string;
  layout?: string;
  notes?: string;
}

/** Parse the `| Root | Layout | Notes |` markdown table out of DISCOVERED_ROOTS. */
function parseDiscoveredRoots(md: string): RootAnnotation[] {
  const rows: RootAnnotation[] = [];
  for (const rawLine of md.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith("|")) continue;
    // split on pipes, drop the leading/trailing empties
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    const root = cells[0];
    if (root === undefined) continue;
    // skip header + separator rows
    if (root === "" || /^Root$/i.test(root) || /^[-:\s]+$/.test(root)) continue;
    const layout = cells[1] ? cells[1] : undefined;
    const notes = cells[2] ? cells[2] : undefined;
    rows.push({ root, layout, notes });
  }
  return rows;
}

/** Normalize a path-ish string for tail matching: drop ~, collapse trailing slash. */
function tailKey(p: string): string {
  let s = p.trim();
  s = s.replace(/^~[/\\]?/, ""); // strip leading ~ or ~/
  s = s.replace(/[/\\]+$/, ""); // strip trailing slashes
  return s;
}

/**
 * Match a config root (absolute) against a DISCOVERED_ROOTS table row by
 * tail-path. The table uses short / ~-relative forms; we test whether the
 * (normalized) absolute path ends with the (normalized) table root.
 */
function matchAnnotation(
  absRoot: string,
  annotations: RootAnnotation[],
): RootAnnotation | null {
  const absKey = absRoot.replace(/[/\\]+$/, "");
  let best: RootAnnotation | null = null;
  let bestLen = -1;
  for (const ann of annotations) {
    const t = tailKey(ann.root);
    if (t === "") continue;
    if (absKey === t || absKey.endsWith("/" + t)) {
      if (t.length > bestLen) {
        best = ann;
        bestLen = t.length;
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// config.json roots upgrade
// ---------------------------------------------------------------------------

interface ConfigShape {
  library?: string;
  globalCore?: string;
  roots?: Array<string | RootEntry>;
  [k: string]: unknown;
}

interface RootUpgradeResult {
  config: ConfigShape;
  upgradedCount: number;
}

/**
 * Upgrade config.roots conservatively: never drop an existing root, only
 * annotate it from the DISCOVERED_ROOTS table when a tail-match is found. A
 * root with no annotation becomes a bare {path}. Existing object entries are
 * preserved as-is. Returns a deep-ish copy; does not mutate the input config.
 */
function upgradeRoots(
  config: ConfigShape,
  annotations: RootAnnotation[],
): RootUpgradeResult {
  const roots = Array.isArray(config.roots) ? config.roots : [];
  let upgradedCount = 0;
  const upgraded: Array<string | RootEntry> = roots.map((entry) => {
    // preserve already-annotated object entries untouched
    if (entry && typeof entry === "object") {
      return { ...entry } as RootEntry;
    }
    const path = String(entry);
    const ann = matchAnnotation(path, annotations);
    const next: RootEntry = { path };
    if (ann?.layout) next.layout = ann.layout;
    if (ann?.notes) next.notes = ann.notes;
    if (next.layout || next.notes) upgradedCount++;
    return next;
  });
  return { config: { ...config, roots: upgraded }, upgradedCount };
}

// ---------------------------------------------------------------------------
// backup
// ---------------------------------------------------------------------------

/**
 * Create `<home>/.migration-0002-backup.tgz` with every *.shelf.json + config.json
 * + DISCOVERED_ROOTS.local.md, stored at paths RELATIVE to home so the archive is
 * portable. Returns false on any failure (caller aborts).
 */
function makeBackup(home: string, sidecarFiles: string[]): boolean {
  const archive = join(home, ".migration-0002-backup.tgz");
  const members: string[] = [];
  for (const f of sidecarFiles) members.push(relative(home, f));
  const configPath = join(home, "config.json");
  if (existsSync(configPath)) members.push("config.json");
  const drPath = join(home, "DISCOVERED_ROOTS.local.md");
  if (existsSync(drPath)) members.push("DISCOVERED_ROOTS.local.md");

  if (members.length === 0) {
    console.warn("  ! nothing to back up (no sidecars/config/scratchpad found)");
    return true;
  }
  // -C home makes tar store the relative member paths under home.
  const res = spawnSync("tar", ["-czf", archive, "-C", home, ...members], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  if (res.error) {
    console.error(`  ! backup failed: ${res.error.message}`);
    return false;
  }
  if (res.status !== 0) {
    console.error(`  ! backup failed: tar exited with code ${res.status}`);
    return false;
  }
  if (!existsSync(archive)) {
    console.error("  ! backup failed: archive was not created");
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const home = args.home;
  const libraryPath = join(home, "library");
  const configPath = join(home, "config.json");
  const drPath = join(home, "DISCOVERED_ROOTS.local.md");

  const mode = args.apply ? "APPLY (writing changes)" : "DRY RUN (no changes)";
  console.log(`skillshelf ADR-0002 migration — ${mode}`);
  console.log(`  home:    ${home}`);
  console.log(`  library: ${libraryPath}`);
  console.log(`  config:  ${configPath}`);
  console.log("");

  if (!existsSync(home)) {
    console.error(`error: home does not exist: ${home}`);
    return 1;
  }

  // --- 1. collect sidecars ------------------------------------------------
  const sidecarFiles = await findSidecars(libraryPath);
  const findings = await Promise.all(sidecarFiles.map(readSidecar));

  const skills: Record<string, string[]> = {};
  const empty: SidecarFinding[] = [];
  const unparseable: SidecarFinding[] = [];
  for (const f of findings) {
    if (f.unparseable) {
      unparseable.push(f);
      continue;
    }
    if (f.domains.length === 0) {
      empty.push(f);
      continue; // SKIP writing an entry for an empty sidecar, but it is reported
    }
    // last-writer-wins union if two sidecars somehow share a name
    const merged = [...(skills[f.name] ?? [])];
    for (const d of f.domains) if (!merged.includes(d)) merged.push(d);
    skills[f.name] = merged;
  }

  const taxonomy: Taxonomy = { version: 1, skills };
  const taxonomyEntries = Object.keys(skills).length;

  // --- 2. config + DISCOVERED_ROOTS roots upgrade -------------------------
  let config: ConfigShape = {};
  let configReadError = false;
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(await Bun.file(configPath).text()) as ConfigShape;
    } catch {
      configReadError = true;
      console.warn(`  ! could not parse config.json — leaving roots untouched`);
    }
  } else {
    console.warn(`  ! config.json not found — nothing to upgrade`);
  }

  let annotations: RootAnnotation[] = [];
  if (existsSync(drPath)) {
    try {
      annotations = parseDiscoveredRoots(await Bun.file(drPath).text());
    } catch {
      console.warn(`  ! could not read DISCOVERED_ROOTS.local.md`);
    }
  }

  const { config: upgradedConfig, upgradedCount } = configReadError
    ? { config, upgradedCount: 0 }
    : upgradeRoots(config, annotations);
  const rootCount = Array.isArray(upgradedConfig.roots)
    ? upgradedConfig.roots.length
    : 0;

  // --- 3. report ----------------------------------------------------------
  console.log("Sidecars:");
  console.log(`  found:           ${sidecarFiles.length}`);
  console.log(`  taxonomy entries: ${taxonomyEntries}`);
  console.log(`  empty (skipped): ${empty.length}`);
  console.log(`  unparseable:     ${unparseable.length}`);
  for (const f of empty) console.log(`    - empty:       ${f.name} (${f.file})`);
  for (const f of unparseable) console.log(`    - unparseable: ${f.name} (${f.file})`);
  console.log("");
  console.log("Roots:");
  console.log(`  total:           ${rootCount}`);
  console.log(`  annotated:       ${upgradedCount}`);
  console.log(`  DISCOVERED_ROOTS table rows: ${annotations.length}`);
  if (existsSync(drPath)) {
    console.log(`  DISCOVERED_ROOTS.local.md: present (will be removed on --apply)`);
  } else {
    console.log(`  DISCOVERED_ROOTS.local.md: absent`);
  }
  console.log("");

  if (!args.apply) {
    console.log("DRY RUN complete — no files were changed.");
    console.log("Re-run with --apply to perform the migration (a backup is taken first).");
    return 0;
  }

  // --- 4. APPLY -----------------------------------------------------------
  console.log("Applying migration...");

  // a. backup first; abort everything if it fails.
  console.log("  backing up sidecars + config + scratchpad...");
  if (!makeBackup(home, sidecarFiles)) {
    console.error("ABORT: backup failed; no changes were made.");
    return 1;
  }
  console.log(`  backup written: ${join(home, ".migration-0002-backup.tgz")}`);

  // b. write taxonomy.json via the app's writer (identical on-disk format).
  await writeTaxonomy(libraryPath, taxonomy);
  console.log(`  wrote ${join(libraryPath, "taxonomy.json")} (${taxonomyEntries} entries)`);

  // c. write upgraded config.json (only if we successfully parsed it).
  if (existsSync(configPath) && !configReadError) {
    await Bun.write(configPath, JSON.stringify(upgradedConfig, null, 2) + "\n");
    console.log(`  wrote ${configPath} (${rootCount} roots, ${upgradedCount} annotated)`);
  } else {
    console.log(`  skipped config.json (missing or unparseable)`);
  }

  // d. delete sidecars.
  let removed = 0;
  for (const f of sidecarFiles) {
    try {
      await unlink(f);
      removed++;
    } catch (e) {
      console.warn(`  ! could not remove ${f}: ${(e as Error).message}`);
    }
  }
  console.log(`  removed ${removed}/${sidecarFiles.length} sidecars`);

  // e. delete DISCOVERED_ROOTS scratchpad.
  if (existsSync(drPath)) {
    try {
      await unlink(drPath);
      console.log(`  removed ${drPath}`);
    } catch (e) {
      console.warn(`  ! could not remove ${drPath}: ${(e as Error).message}`);
    }
  }

  console.log("");
  console.log("APPLY complete.");
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
