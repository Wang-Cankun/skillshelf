// skillshelf — domain model + command contract.
// This file is the source-of-truth type surface every command author codes against.

/**
 * Where an imported / third-party skill came from. `null` for hand-written skills.
 * Mirrors the provenance lockfile shape (see Lockfile / LockEntry below).
 */
export interface Provenance {
  /** e.g. "github:owner/repo@path" */
  source: string;
  /** installed commit SHA or version tag */
  ref: string;
  /** where it was fetched from */
  channel: "github" | "vercel-registry" | string;
  /** ISO-8601 timestamp of install */
  installedAt: string;
  /** true if the local upstream body diverged from the pristine fetched copy */
  localEdits: boolean;
}

/**
 * A single skill as discovered on disk (crawl) or in the canonical library.
 * `domains` is the *effective* tag list (upstream frontmatter + overlay merged).
 */
export interface Skill {
  /** unique slug, from frontmatter `name` or directory name */
  name: string;
  /** frontmatter `description` (may be multi-line) */
  description: string;
  /** derived view = effective `domains[0]` (post-overlay); null if the skill has no domains. NOT folder-derived (see ADR-0001). */
  primaryDomain: string | null;
  /** effective domain tags (primary first), de-duplicated */
  domains: string[];
  /** absolute path to the skill directory (the dir containing SKILL.md) */
  path: string;
  /** absolute path to the SKILL.md body file */
  bodyPath: string;
  /** absolute paths to bundled reference files (everything in the dir besides SKILL.md / overlay / lock) */
  refFiles: string[];
  /** provenance for third-party skills; null for hand-written */
  source: Provenance | null;
  /** true if found under a _retired/ dir — tagged, not activated */
  retired: boolean;
  /** if this is a bridge mirror (.agents/skills) of another skill, the canonical skill's path; else null */
  mirrorOf: string | null;
  /** sha-256 of the SKILL.md body content (for dedupe/drift detection) */
  contentHash: string;
  /** the scan root this skill was discovered under (literal crawl root); absent for library/synthetic skills */
  discoveredRoot?: string | null;
}

/**
 * Sidecar overlay stored as `<skill>.shelf.json` next to SKILL.md.
 * Holds *your* additions that survive upstream `update`.
 */
export interface Overlay {
  /** extra/override domain tags */
  domains?: string[];
  /** explicit bundle membership names */
  bundles?: string[];
  /** free-form notes */
  notes?: string;
}

/** A single provenance lockfile entry. */
export interface LockEntry {
  name: string;
  /** e.g. "github:owner/repo@path" */
  source: string;
  /** installed commit SHA or version tag */
  ref: string;
  channel: "github" | "vercel-registry" | string;
  /** ISO-8601 */
  installedAt: string;
  /** true if upstream body diverged locally */
  localEdits: boolean;
  /**
   * Hash of the upstream SKILL.md body as it was at install/update time.
   * Enables true 3-way divergence: local == installedHash => user did NOT edit
   * (safe to re-pull even if upstream moved); local != installedHash => user
   * hand-edited (do not clobber without --force). Optional for legacy entries.
   */
  installedHash?: string;
}

/** The whole lockfile (`shelf.lock.json` at the library root). */
export interface Lockfile {
  version: 1;
  entries: Record<string, LockEntry>;
}

/**
 * A bundle = a tag query over `domains[]`. Resolving a bundle yields every skill
 * tagged with the bundle's domain. Bundles are virtual, never folders.
 */
export interface Bundle {
  /** bundle name == the domain tag it queries (e.g. "bioinfo") */
  name: string;
  /** skills resolved into this bundle */
  skills: Skill[];
}

/**
 * A duplicate/drift group produced by dedupe: skills sharing a name (and/or hash).
 * `canonical` is the chosen authoritative copy; `divergent` are drifted copies.
 */
export interface DuplicateGroup {
  name: string;
  /** the chosen canonical skill (prefers library/non-mirror/non-retired) */
  canonical: Skill;
  /** other copies that differ in content hash (drifted) */
  divergent: Skill[];
  /** exact-duplicate copies (same hash, different path) */
  duplicates: Skill[];
  /** true if every copy shares the same content hash */
  identical: boolean;
}

/**
 * Snapshot fed to the AI inference pass (`skl infer`). Deterministic core only
 * assembles this; the LLM call lives elsewhere.
 */
export interface InferenceCorpus {
  skills: Array<{
    name: string;
    description: string;
    currentDomains: string[];
    bodyPreview: string;
  }>;
  /** domain vocabulary observed across the library */
  observedDomains: string[];
  generatedAt: string;
}

/** Resolved configuration for a skillshelf invocation. */
export interface Config {
  /** absolute path to the canonical library (skill content) */
  libraryPath: string;
  /** absolute path to the global-core symlink target (~/.claude/skills) */
  globalCoreTarget: string;
  /** persisted, absolute, de-duplicated scan roots (`skl scan` searches these) */
  roots: string[];
  /** absolute path to the config file that was read, if any */
  configFile: string | null;
  /** absolute path of the config file roots would be persisted to (read or default) */
  configFilePath: string;
  /** how libraryPath was resolved */
  source: "env" | "config" | "default";
}

/** Optional on-disk config file (~/.skillshelf/config.json). */
export interface ConfigFile {
  /** override library path */
  library?: string;
  /** override global-core target */
  globalCore?: string;
  /** persisted scan roots (`skl scan`) */
  roots?: string[];
}

/**
 * The execution context handed to every command's `run()`.
 * Built by `loadContext()` in src/config.ts.
 */
export interface Ctx {
  /** resolved config (paths + provenance) */
  config: Config;
  /** convenience alias for config.libraryPath */
  libraryPath: string;
  /** load the canonical library (effective skills, overlays merged) */
  loadLibrary: () => Promise<Skill[]>;
  /** configured scan roots (absolute, de-duplicated); convenience alias for config.roots */
  roots: string[];
  /** add a scan root: expands ~, makes absolute, de-dupes, persists to config.json. Returns the updated roots. */
  addRoot: (path: string) => Promise<string[]>;
  /** human-readable logging to stdout */
  log: (...args: unknown[]) => void;
  /** machine-parseable single-line JSON to stdout */
  json: (value: unknown) => void;
  /** error logging to stderr */
  error: (...args: unknown[]) => void;
}

/** Metadata every command module must export. */
export interface CommandMeta {
  name: string;
  summary: string;
  usage: string;
}

/** The function signature every command module must export as `run`. */
export type CommandRun = (argv: string[], ctx: Ctx) => Promise<number>;

/** Full shape of a command module (`src/commands/*.ts`). */
export interface CommandModule {
  meta: CommandMeta;
  run: CommandRun;
}
