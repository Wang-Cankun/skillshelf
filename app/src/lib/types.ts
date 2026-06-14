// Shared TS interfaces mirrored from the real `skl --json` output.
// These are the single source of truth for the UI's data shapes.

export interface Skill {
  name: string;
  description: string;
  primaryDomain: string | null;
  domains: string[];
  path: string;
  retired: boolean;
  mode: "owned" | "linked";
  linkTarget: string | null;
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
  perRoot: ScanPerRoot[];
  duplicateGroups: any[];
  // The real `skl scan --json` emits the per-root candidate rows under
  // `candidates`; `newCandidates` is present only when new skills are found.
  candidates?: any[];
  newCandidates?: any[];
  dedupedRoots?: any[];
  // Additional fields emitted by `skl scan --json` are tolerated.
  [key: string]: any;
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
  /** absolute path to the project's skills directory (.claude/skills) */
  skillsDir: string;
  /** true if `skillsDir` exists on disk */
  skillsDirExists: boolean;
  linkedCount: number;
  unmanaged: StatusUnmanaged[];
  bundles: StatusBundle[];
  linked: StatusLinked[];
  // Additional fields emitted by `skl status --json` are tolerated.
  [key: string]: any;
}
