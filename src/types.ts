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
 * `domains` is the *effective* tag list (upstream frontmatter + taxonomy merged).
 */
export interface Skill {
  /** unique slug, from frontmatter `name` or directory name */
  name: string;
  /** frontmatter `description` (may be multi-line) */
  description: string;
  /** derived view = effective `domains[0]` (post-taxonomy merge); null if the skill has no domains. NOT folder-derived (see ADR-0001). */
  primaryDomain: string | null;
  /** effective domain tags (primary first), de-duplicated */
  domains: string[];
  /** absolute path to the skill directory (the dir containing SKILL.md) */
  path: string;
  /** absolute path to the SKILL.md body file */
  bodyPath: string;
  /** absolute paths to bundled reference files (everything in the dir besides SKILL.md / lock) */
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
 * The central domain taxonomy (`<library>/taxonomy.json`). Maps each skill name
 * to its domain tags. Replaces the per-skill `<skill>.shelf.json` sidecars
 * (see docs/adr/0002-central-taxonomy-not-sidecars.md): one logical table (skill -> domains)
 * lives in ONE file at the library root instead of fragmented across 100+ files.
 * Holds *your* domain assignments, which survive upstream `update` (taxonomy.json
 * is separate from skill bodies, so re-pulling SKILL.md never touches tags).
 */
export interface Taxonomy {
  version: 1;
  /** skill name -> its domain tags (primary first), de-duped */
  skills: Record<string, string[]>;
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
  /**
   * Provenance was ADOPTED (`skl track`/`skl migrate`) for a skill already in the
   * library, WITHOUT verifying its body against the real upstream baseline. true =
   * the ref/installedHash describe the LOCAL copy as an assumed baseline only; the
   * upstream body was never fetched and compared, so `update` must be conservative
   * (always diff, require --force) and `outdated` reports "adopted" rather than
   * stale/current. Cleared (set false) once `update` reconciles against real
   * upstream — the entry then "graduates" to a normal tracked entry. Optional;
   * absent/false = a normally-installed (verified) entry. See ADR-0011.
   */
  adopted?: boolean;
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
 * How a discovered deployment entry relates to the library (see `skl where`).
 *   - `linked`       — a symlink whose realpath is inside the library (clean deploy)
 *   - `foreign-link` — a symlink resolving OUTSIDE the library (a second source)
 *   - `source`       — a real dir that IS the canonical external source the library
 *                      symlinks AT (linked-bookshelf mode); not a redundant copy
 *   - `copy`         — a real skill dir (untracked, or drifted vs a library skill)
 *   - `dead`         — a symlink whose target no longer exists
 *   - `aliased`      — a symlink resolving INTO the library, but whose link-name
 *                      differs from the library skill it points at (e.g. a deployed
 *                      `nuwa` → `<lib>/huashu-nuwa`). Clean by realpath, but the
 *                      name mismatch hides the real skill from name-keyed views.
 */
export type DeploymentKind = "linked" | "foreign-link" | "source" | "copy" | "dead" | "aliased";

/** One skill entry found in a deployment surface (a dir tools read skills from). */
export interface DeploymentSite {
  /** entry basename (the skill name as deployed) */
  name: string;
  /** the surface dir this entry was found directly under */
  surface: string;
  /** absolute path of the entry */
  path: string;
  kind: DeploymentKind;
  /** raw symlink target (as stored); null for a real copy */
  target: string | null;
  /** true if a library skill of this name exists */
  inLibrary: boolean;
  /** for a `copy` of a library skill: its SKILL.md body diverged from the library copy */
  drift: boolean;
}

/**
 * The computed deployment map (`skl where`): every place a skill is deployed across
 * the scanned surfaces, classified. Derived from reality (no stored state).
 */
export interface DeploymentReport {
  /** surfaces actually scanned (existing dirs, realpath-de-duplicated) */
  surfaces: string[];
  /** every classified entry across all surfaces */
  sites: DeploymentSite[];
  /** the subset that is not a clean `linked` deployment */
  problems: DeploymentSite[];
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

/**
 * A custom / overridden agent registered in config (ADR-0010 delta 4). Merged
 * with the built-in AGENT_SEEDS at report time: an entry whose `id` matches a seed
 * OVERRIDES it (e.g. to set an icon, color, or non-standard skills dir); a new id
 * APPENDS a custom agent; `hidden:true` removes a seed/detected agent from the
 * matrix. This is registry/navigation metadata only — deployment truth is always
 * derived from the filesystem (see Config.projects note).
 */
export interface AgentConfigEntry {
  /** stable agent id (the `.<id>` dotdir segment) */
  id: string;
  /** display name */
  name: string;
  /** short label for dense UI */
  short: string;
  /** override the GLOBAL skills dir (default ~/.<id>/skills) */
  global?: string;
  /** override the project-relative convention (default .<id>/skills) */
  projConvention?: string;
  /** provider-icons key (optional; falls back to agent-icons/<id> then first letter) */
  icon?: string;
  /** hex tint (optional) */
  color?: string;
  /** hide a detected/seed agent from the matrix */
  hidden?: boolean;
  /**
   * whether the agent loads its GLOBAL skills dir (~/.<id>/skills) in EVERY
   * project, so a global-only skill is effectively active everywhere (ADR-0010
   * inheritance). Omitted = inherit (true) — the ~/.x/skills convention; set
   * false for a custom agent that does NOT auto-load its global dir per project.
   */
  inheritsGlobal?: boolean;
}

/** Resolved configuration for a skillshelf invocation. */
export interface Config {
  /** absolute path to the canonical library (skill content) */
  libraryPath: string;
  /** absolute path to the global-core symlink target (~/.claude/skills) */
  globalCoreTarget: string;
  /** persisted, absolute, de-duplicated scan roots (`skl scan` searches these) */
  roots: string[];
  /** custom/overridden agent registry entries (ADR-0010 delta 4); defaulted to [] */
  agents: AgentConfigEntry[];
  /**
   * persisted, absolute, de-duplicated project dirs the GUI shows as scope rows
   * (ADR-0010 §5a). NAVIGATION state only — never deployment truth. An added-but-
   * empty project survives here so it stays a selectable scope; its cells are still
   * derived all-absent from reality.
   */
  projects: string[];
  /** absolute path to the config file that was read, if any */
  configFile: string | null;
  /** absolute path of the config file roots would be persisted to (read or default) */
  configFilePath: string;
  /** how libraryPath was resolved */
  source: "env" | "config" | "default";
}

/**
 * A persisted scan-root entry. Either a bare path string, or an annotated object.
 * `layout` and `notes` are INFORMATIONAL only — crawl auto-detects layout and
 * nothing consumes either field programmatically; they exist so a human can
 * annotate why a root is tracked. On read, an entry is normalized to its absolute
 * `path` string for crawling.
 */
export interface RootEntry {
  /** the scan-root path (may use ~; normalized to absolute on read) */
  path: string;
  /** informational hint about the root's layout (not consumed by crawl) */
  layout?: string;
  /** free-form note about why this root is tracked */
  notes?: string;
}

/** Optional on-disk config file (~/.skillshelf/config.json). */
export interface ConfigFile {
  /** override library path */
  library?: string;
  /** override global-core target */
  globalCore?: string;
  /**
   * persisted scan roots (`skl scan`). Each entry may be a bare path string or an
   * annotated {path, layout?, notes?} object. On read both forms normalize to an
   * absolute path string (layout/notes are informational; see RootEntry).
   */
  roots?: Array<string | RootEntry>;
  /** custom/overridden agent registry entries (ADR-0010 delta 4). */
  agents?: AgentConfigEntry[];
  /**
   * persisted nav projects (ADR-0010 §5a). Each entry may be a bare path string or
   * an annotated {path, name?} object; both normalize to an absolute path string on
   * read (the optional `name` is informational — the GUI displays the basename).
   */
  projects?: Array<string | { path: string; name?: string }>;
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
  /** load the canonical library (effective skills, taxonomy merged) */
  loadLibrary: () => Promise<Skill[]>;
  /** configured scan roots (absolute, de-duplicated); convenience alias for config.roots */
  roots: string[];
  /** add a scan root: expands ~, makes absolute, de-dupes, persists to config.json. Returns the updated roots. */
  addRoot: (path: string) => Promise<string[]>;
  /** remove a scan root by resolved path (inverse of addRoot); persists to config.json. Returns the updated roots + whether one was removed. */
  removeRoot: (path: string) => Promise<{ roots: string[]; removed: boolean }>;
  /** add a nav project (ADR-0010 §5a): expands ~, makes absolute, de-dupes, persists. Returns the updated projects. */
  addProject: (path: string) => Promise<string[]>;
  /** remove a nav project by resolved path (inverse of addProject); persists. Returns the updated projects + whether one was removed. */
  removeProject: (path: string) => Promise<{ projects: string[]; removed: boolean }>;
  /** add/override a custom agent (ADR-0010 delta 4): matching id overrides, new id appends; persists. Returns the updated custom-agent list. */
  addAgent: (entry: AgentConfigEntry) => Promise<AgentConfigEntry[]>;
  /** remove a custom agent by id (inverse of addAgent); persists. Returns the updated custom-agent list + whether one was removed. */
  removeAgent: (id: string) => Promise<{ agents: AgentConfigEntry[]; removed: boolean }>;
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
