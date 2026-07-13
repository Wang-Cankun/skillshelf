// Shared TS interfaces mirrored from the real `skl --json` output.
// Zod schemas in schemas.ts are the runtime source of truth and INFER these
// shapes; the hand-written interfaces here remain for the loaders/legacy fixture
// typing and must stay structurally compatible with the schemas.

export type SkillSource = "vendored" | "local";

export interface Skill {
  name: string;
  description: string;
  primaryDomain: string | null;
  domains: string[];
  path: string;
  retired: boolean;
  mode: "owned" | "linked";
  linkTarget: string | null;
  // ── ADR-0008 §7.1 additions to `ls --json` (optional: real skl emits them
  //    once shipped; fixtures derive them) ──────────────────────────────────
  source?: SkillSource;
  /** Real upstream origin for vendored skills, e.g. "jimliu/baoyu-skills"; null for local. */
  origin?: string | null;
  /** Provenance transport/registry kind, e.g. "github" / "local"; gates the SOURCE click-through. */
  channel?: string | null;
  modifiedAt?: string | null;
  createdAt?: string | null;
  deployCount?: number;
}

export interface DeploymentSite {
  name: string;
  surface: string;
  path: string;
  kind: "linked" | "foreign-link" | "source" | "copy" | "dead" | "aliased";
  target: string | null;
  inLibrary: boolean;
  drift: boolean;
}

export interface DeploymentReport {
  surfaces: string[];
  sites: DeploymentSite[];
  problems: DeploymentSite[];
}

// ── `outdated --json` (ADR-0009): update-aware SOURCE column (a FACT layer —
//    hash/ref compare). One row per upstream-TRACKED skill. ───────────────────
export type OutdatedStatus =
  | "stale"
  | "current"
  | "unknown"
  | "linked"
  | "diverged"
  // `adopted` (ADR-0011): provenance known, baseline unverified. The CLI emits it;
  // it renders as no badge (UpdateBadge only reacts to stale/diverged/orphaned).
  | "adopted";
export interface OutdatedRow {
  name: string;
  channel?: string | null;
  source?: string;
  installedRef: string;
  latestRef: string | null;
  status: OutdatedStatus;
  note: string;
}
export interface OutdatedReport {
  ok: boolean;
  checked: number;
  stale: number;
  diverged?: number;
  rows: OutdatedRow[];
}

// ── `update [name] --json` (ADR-0013): reconciles per-repo, reports structural
//    drift. "orphaned" = tracked subpath gone, library copy KEPT (non-destructive);
//    `relocatedFrom` = a rename was auto-followed (orthogonal flag on a normal
//    body outcome, never an outcome value); `newAvailable` = published-but-untracked
//    skills per source repo (update NEVER installs them). ────────────────────────
export type UpdateOutcome =
  | "updated"
  | "uptodate"
  | "diverged"
  | "skipped"
  | "error"
  | "orphaned";
export interface UpdateResult {
  name: string;
  source: string;
  channel: string;
  fromRef: string;
  toRef: string | null;
  outcome: UpdateOutcome;
  note: string;
  diff?: string;
  relocatedFrom?: string;
}
export interface RepoAdditions {
  repo: string;
  names: string[];
}
export interface UpdateReport {
  ok: boolean;
  updated: number;
  diverged: number;
  errors?: number;
  orphaned?: number;
  results: UpdateResult[];
  newAvailable?: RepoAdditions[];
}

export interface ScanPerRoot {
  root: string;
  candidates: number;
  new: number;
}

export interface ScanTotals {
  roots: number;
  candidates: number;
  new: number;
  duplicateGroups: number;
  driftGroups: number;
  exactDuplicateGroups: number;
}

export interface ScanReport {
  roots: string[];
  totals: ScanTotals;
  perRoot: unknown[];
  duplicateGroups: unknown[];
  candidates?: unknown[];
  newCandidates?: unknown[];
  dedupedRoots?: unknown[];
  [key: string]: unknown;
}

export interface StatusUnmanaged {
  name: string;
  inLibrary: boolean;
}

export interface StatusBundle {
  name: string;
  skills: string[];
}

export interface StatusLinked {
  link: string;
  target: string;
  skill: string;
  inLibrary: boolean;
  domains: string[];
}

export interface StatusReport {
  projectRoot: string;
  skillsDir: string;
  skillsDirExists: boolean;
  linkedCount: number;
  unmanaged: unknown[];
  bundles: unknown[];
  linked: unknown[];
  [key: string]: unknown;
}

// ── ADR-0008 §6/§7.3 multi-agent ──────────────────────────────────────────
export type DeployStateName =
  | "clean"
  | "source"
  | "drift"
  | "copy"
  | "dead"
  | "absent";

export interface AgentInfo {
  id: string;
  name: string;
  short: string;
  global: string; // ~/.<id>/skills
  projConvention: string; // .<id>/skills
  installed: boolean;
  /**
   * true if the agent auto-loads its GLOBAL skills dir (~/.<id>/skills) in EVERY
   * project, so a global-only skill is effectively active everywhere with no
   * project symlink (ADR-0010 "inherited from Global" model). Default true (the
   * ~/.x/skills convention); a custom agent may be false. Drives the derived
   * 'inherited' cell state — an agent with inheritsGlobal=false never inherits.
   */
  inheritsGlobal: boolean;
  // ── ADR-0010 §9 additions (custom-agent registration, delta 4) ───────────
  /** provider-icons key (svg picker); falls back to agent-icons/<id> then letter. */
  icon?: string;
  /** hex tint for the chip/letter fallback when no svg matches. */
  color?: string;
  /** true = user-registered via the agents config block (not a built-in seed). */
  custom?: boolean;
}

/**
 * Resolved config slice the GUI needs: the user `agents` block (delta 4) and the
 * persisted nav-projects list (§5a). Mirrors `skl projects --json` (`{projects}`)
 * plus the custom-agent entries the engine merges into `agents --json`.
 * NAVIGATION state only — never deployment truth (derive-from-FS invariant).
 */
export interface AppConfig {
  /** user-registered custom agents (from the config `agents` block). */
  agents: AgentInfo[];
  /** persisted absolute project dirs selectable as scopes. */
  projects: string[];
}

/** Per (skill, agent) deployment truth: global state + per-project states. */
export interface AgentDeployment {
  g?: DeployStateName; // global state (omitted = absent)
  p?: Record<string, DeployStateName>; // project name -> state
}

export interface AgentsReport {
  agents: AgentInfo[];
  scopes: string[]; // ['Global', ...projectNames]
  /** skill name -> agent id -> deployment */
  deployments: Record<string, Record<string, AgentDeployment>>;
}

// ── ADR-0008 §7.2 `show --json` ───────────────────────────────────────────
export interface RefFile {
  path: string;
  kind: "md" | "json" | "dir" | "other";
  depth: number;
}

export interface Frontmatter {
  name: string;
  description: string;
  triggers: string[];
  license: string;
}

/** `skl diff <name> --json` — drift View-diff payload (read-only). */
export interface DiffReport {
  name: string;
  site: string;
  library: string;
  identical: boolean;
  diff: string;
}

export interface ShowReport {
  name: string;
  body: string;
  frontmatter: Frontmatter;
  refFiles: RefFile[];
  prov?: {
    source: string;
    ref: string;
    hash: string;
    localEdits: boolean;
  } | null;
}
