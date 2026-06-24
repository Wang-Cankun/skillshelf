// Agent surfaces — the dirs agents read skills from.
//
// skillshelf is agent-agnostic (ADR-0003): the library is a single, neutral
// source; each agent has its own skill dir convention. The cross-agent ecosystem
// (cf. vercel-labs/skills) standardizes on `~/<agent>/skills` (global) and
// `./<agent>/skills` (project), e.g. `.claude`, `.codex`, `.opencode`, `.cursor`.
//
// This is the SEED of a fuller agent-surface registry. For now it lists the
// well-known GLOBAL surfaces so read-side commands (`skl where`) can show
// cross-agent sprawl without manual `--add-root`. The deploy side (writing into a
// chosen agent surface) is a later step; see ADR-0003.

import { homedir } from "node:os";
import { join } from "node:path";

/** A known agent and its global skill-dir convention. */
export interface AgentSurface {
  /** ecosystem agent id (aligned with the vercel-labs/skills naming) */
  agent: string;
  /** absolute path to the agent's GLOBAL skills dir */
  path: string;
}

/**
 * Well-known GLOBAL agent skill dirs on this machine. Existence is NOT checked
 * here (callers realpath-dedupe + skip missing); this is just the convention map.
 */
export function knownAgentSurfaces(home: string = homedir()): AgentSurface[] {
  return [
    { agent: "claude-code", path: join(home, ".claude", "skills") },
    { agent: "codex", path: join(home, ".codex", "skills") },
    // codex's own vendored copies live a level deeper
    { agent: "codex", path: join(home, ".codex", "vendor_imports", "skills", "skills") },
    { agent: "opencode", path: join(home, ".opencode", "skills") },
    { agent: "cursor", path: join(home, ".cursor", "skills") },
    // Keep in sync with the agent registry in core/agents.ts: every agent the
    // matrix advertises must have its global surface scanned, or `installed`
    // can disagree with the (empty) matrix. See agents.test.ts coverage check.
    { agent: "gemini", path: join(home, ".gemini", "skills") },
    { agent: "omp", path: join(home, ".omp", "agent", "skills") },
  ];
}

/** Just the paths (convenience for surface unions). */
export function knownAgentSurfacePaths(home: string = homedir()): string[] {
  return knownAgentSurfaces(home).map((s) => s.path);
}
