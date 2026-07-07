// Health strip (30px) — ADR-0008 §3, mockup lines 365-374. Footer summary of
// the real library: totals on the left, the four provenance/health counts on
// the right. `local edits` is honestly 0 (not tracked yet); `stub` counts skills
// whose description is still the scaffold default.

import { useLibrary } from "../state/queries";
import { aggregates } from "../lib/select";
import { stubCount } from "../lib/derive";
import { C, MONO } from "../lib/tokens";

export function HealthStrip() {
  const skills = useLibrary().data ?? [];
  const agg = aggregates(skills);

  const localEdits = 0; // not tracked yet — honest
  // Same predicate AND population (live/non-retired) as needsAttentionNames, so the
  // footer "N stub" count always matches the inbox's stub triage.
  const stub = stubCount(skills);

  return (
    <div
      style={{
        flex: "0 0 30px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        background: "#FFFFFF",
        borderTop: "1px solid #E7E7E9",
        fontSize: 11.5,
        color: "#71717A",
        fontFamily: MONO,
      }}
    >
      <span>
        {agg.total} skills · {agg.domains.length} domains · 1 source repo
      </span>
      <div style={{ display: "flex", gap: 16 }}>
        <span style={{ color: C.blue }}>◆ {agg.vendored} vendored</span>
        <span style={{ color: C.green }}>✓ {localEdits} local edits</span>
        <span style={{ color: C.amber }}>🏷 {agg.untagged} untagged</span>
        <span style={{ color: C.gray }}>◆ {stub} stub</span>
      </div>
    </div>
  );
}
