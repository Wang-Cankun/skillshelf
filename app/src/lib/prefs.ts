// Local UI preferences. Not part of the deterministic `skl` feeds — purely how
// THIS install chooses to present them. Kept in one place so it's obvious what
// is a product fact vs. a personal display choice.

/**
 * Agent ids hidden from the UI (the AGENTS rail, the deployment matrix, the
 * agent filter). The engine still knows about them — this only trims what's
 * shown. Edit this set to bring an agent back. The full registry lives in
 * `src/core/agents.ts` (claude, codex, cursor, opencode, gemini).
 */
export const HIDDEN_AGENT_IDS = new Set<string>([
  "cursor",
  "opencode",
  "gemini",
]);

/** Drop hidden agents from a report's agent list (display filter only). */
export function visibleAgents<T extends { id: string }>(agents: T[]): T[] {
  return agents.filter((a) => !HIDDEN_AGENT_IDS.has(a.id));
}
