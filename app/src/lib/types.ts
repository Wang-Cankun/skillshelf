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
  modifiedAt?: string | null;
  createdAt?: string | null;
  deployCount?: number;
}

export interface DeploymentSite {
  name: string;
  surface: string;
  path: string;
  kind: "linked" | "foreign-link" | "source" | "copy" | "dead";
  target: string | null;
  inLibrary: boolean;
  drift: boolean;
}

export interface DeploymentReport {
  surfaces: string[];
  sites: DeploymentSite[];
  problems: DeploymentSite[];
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
