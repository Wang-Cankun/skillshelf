// Floating bulk-action bar (ADR-0010 deltas 1 & 2). Appears when ≥1 skill is
// selected. It drives the SOLE deploy-execution path: one TOGGLE per agent that
// shows how many of the selection are active in the ACTIVE scope ("2/4") and
// calls bulkDeploy against it — deploy the missing ones, or (when all are
// active) undeploy them all. No modal Enable/Remove intent: the word "Remove"
// is reserved for hard-removing from the library. Deploy toggles keep the
// selection (so one batch can go to several agents); Tag/Retire clear it.
// When a domain filter is active it also shows the bundle label and a drift
// hint "N tagged · M selected" (delta 1). Keys: 1–9 toggle agents, Esc clears.

import { useEffect } from "react";
import { useStore, type State } from "../state/store";
import { useLibrary, useAgents } from "../state/queries";
import { useCommands } from "../state/commands";
import { allDomains } from "../lib/select";
import { iconFor } from "../lib/agentIcon";
import { cellStateWithOverride } from "../lib/agents";
import { DomainMenu } from "./DomainMenu";
import { MONO } from "../lib/tokens";
import type { AgentInfo, AgentsReport } from "../lib/types";

const EMPTY_AGENTS: AgentsReport = { agents: [], scopes: [], deployments: {} };

/** Whether the bar is on screen — shared with Toast so it can stack above it. */
export function bulkBarVisible(state: State): boolean {
  // A drawer/modal covers the screen (z 50/51) — don't float the bar over it.
  return (
    Object.values(state.selected).some(Boolean) &&
    !state.drawer &&
    !state.confirm &&
    !state.resolve &&
    !state.inherited
  );
}

export function BulkBar() {
  const { state, dispatch } = useStore();
  const skills = useLibrary().data ?? [];
  const report = useAgents().data ?? EMPTY_AGENTS;
  const commands = useCommands();

  const names = Object.keys(state.selected).filter((k) => state.selected[k]);
  const agents = report.agents;
  const isRetired = state.filter?.kind === "retired";
  const hidden = !bulkBarVisible(state);

  // Per-agent split of the selection in the active scope. `active` = deployed
  // here (Global: clean/source; project: pinned); `addable` = absent or only
  // inherited from Global. Anomalous cells (drift, conflicts…) are left alone —
  // they belong to the resolve popover, not a blind batch.
  const splitFor = (a: AgentInfo) => {
    const active: string[] = [];
    const addable: string[] = [];
    for (const n of names) {
      const st = cellStateWithOverride(
        report,
        state.deployOverrides,
        n,
        a.id,
        state.scope,
        a,
      );
      if (st === "pinned" || st === "clean" || st === "source") active.push(n);
      else if (st === "absent" || st === "inherited") addable.push(n);
    }
    return { active, addable };
  };

  // Deploy what's missing; once everything is active, the toggle undeploys.
  // Only the names that actually change go to bulkDeploy, so its undo inverts
  // exactly this click and never touches pre-existing deployments.
  const toggleAgent = (a: AgentInfo) => {
    const { active, addable } = splitFor(a);
    const on = addable.length > 0;
    const target = on ? addable : active;
    if (!target.length) return;
    void commands.bulkDeploy(
      target,
      a.id,
      state.scope,
      on,
      state.scopePath ?? undefined,
    );
  };

  // Re-subscribes every render (no deps) so the handler always sees the
  // current selection/report — cheap, and avoids a stale-closure ref.
  useEffect(() => {
    if (hidden) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      )
        return;
      if (e.key === "Escape") {
        e.preventDefault();
        dispatch({ type: "clearSelection" });
        return;
      }
      if (isRetired) return;
      const i = Number(e.key) - 1;
      if (Number.isInteger(i) && i >= 0 && i < Math.min(agents.length, 9)) {
        e.preventDefault();
        toggleAgent(agents[i]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (hidden) return null;

  // delta 1 — bundle label + drift hint when a domain filter is active.
  const domainFilter =
    state.filter?.kind === "domain" ? state.filter.value : null;
  const taggedCount = domainFilter
    ? skills.filter((s) => !s.retired && s.domains.includes(domainFilter)).length
    : 0;

  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        bottom: 42,
        transform: "translateX(-50%)",
        zIndex: 40,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 12,
        rowGap: 8,
        width: "max-content",
        maxWidth: "calc(100vw - 48px)",
        padding: "10px 14px",
        background: "#18181B",
        borderRadius: 12,
        color: "#FFFFFF",
        fontSize: 12.5,
        boxShadow: "0 12px 34px rgba(0,0,0,0.28)",
      }}
    >
      <span style={{ display: "flex", flexDirection: "column", whiteSpace: "nowrap" }}>
        <span
          style={{ fontWeight: 650 }}
          title={
            names.slice(0, 20).join("\n") +
            (names.length > 20 ? `\n… +${names.length - 20} more` : "")
          }
        >
          {names.length} selected
        </span>
        {domainFilter ? (
          <span style={{ fontSize: 10.5, color: "#9A9AA2" }}>
            <span style={{ color: "#D4D4D8" }}>{domainFilter}</span> ·{" "}
            {taggedCount} tagged · {names.length} selected
          </span>
        ) : null}
      </span>

      {isRetired ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => {
              void commands.unretire(names);
              dispatch({ type: "clearSelection" });
            }}
            style={darkBtn}
          >
            Unretire
          </button>
          <button
            onClick={() =>
              dispatch({ type: "askConfirm", name: names[0], names })
            }
            style={removeBtn}
          >
            Remove
          </button>
        </div>
      ) : (
      <>
      {/* target scope — what the agent toggles act on */}
      <span
        title={`Deploy toggles act on ${state.scope}`}
        style={{
          fontFamily: MONO,
          fontSize: 11,
          color: "#9A9AA2",
          whiteSpace: "nowrap",
        }}
      >
        → <span style={{ color: "#D4D4D8" }}>{state.scope}</span>
      </span>

      {/* per-agent deploy toggles (ACTIVE scope) */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
        {agents.map((a, i) => {
          const ic = iconFor(a);
          const { active, addable } = splitFor(a);
          const full = active.length === names.length;
          const some = active.length > 0;
          const disabled = !addable.length && !active.length;
          const key = i < 9 ? ` · key ${i + 1}` : "";
          const title = disabled
            ? `${a.name}: selection needs attention here — resolve individually`
            : addable.length
              ? `Deploy ${addable.length} to ${a.name} (${state.scope})${key}`
              : `Undeploy ${active.length} from ${a.name} (${state.scope})${key}`;
          return (
            <button
              key={a.id}
              onClick={() => toggleAgent(a)}
              disabled={disabled}
              aria-pressed={full}
              title={title}
              style={{
                ...applyBtn,
                // Same language as the row toggles: neutral chrome, the icon
                // carries state (solid = deployed, dim = not). Full gets a
                // slightly raised surface; no accent color.
                ...(full
                  ? { background: "#3F3F46", border: "1px solid #52525B" }
                  : {}),
                ...(disabled ? { opacity: 0.45, cursor: "default" } : {}),
              }}
            >
              {ic.svgUrl ? (
                <img
                  src={ic.svgUrl}
                  alt=""
                  style={{
                    width: 13,
                    height: 13,
                    objectFit: "contain",
                    opacity: some ? 1 : 0.4,
                  }}
                />
              ) : (
                <span
                  style={{
                    width: 13,
                    height: 13,
                    borderRadius: "50%",
                    background: ic.color,
                    fontSize: 8,
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: some ? 1 : 0.4,
                  }}
                >
                  {ic.letter}
                </span>
              )}
              {a.short}
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 10.5,
                  color: full ? "#E4E4E7" : "#71717A",
                }}
              >
                {active.length}/{names.length}
              </span>
            </button>
          );
        })}
      </div>

      <span style={{ width: 1, height: 18, background: "#3C3C40" }} />

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <DomainMenu
          domains={allDomains(skills)}
          onPick={(d) => {
            commands.tag(names, d);
            dispatch({ type: "clearSelection" });
          }}
          variant="menu"
          placement="up"
        />
        <button
          onClick={() => {
            commands.retire(names);
            dispatch({ type: "clearSelection" });
          }}
          style={darkBtn}
        >
          Retire
        </button>
      </div>
      </>
      )}

      <span style={{ flex: 1 }} />
      <button
        onClick={() => dispatch({ type: "clearSelection" })}
        aria-label="clear selection"
        title="Clear selection (Esc)"
        style={{
          marginLeft: 2,
          background: "none",
          border: "none",
          color: "#9A9AA2",
          fontSize: 12,
          cursor: "pointer",
          fontFamily: "inherit",
          whiteSpace: "nowrap",
        }}
      >
        ⌫ clear
      </button>
    </div>
  );
}

const darkBtn: React.CSSProperties = {
  background: "#2C2C30",
  color: "#FFFFFF",
  border: "1px solid #3C3C40",
  borderRadius: 7,
  padding: "5px 11px",
  fontSize: 12,
  cursor: "pointer",
  fontFamily: "inherit",
  whiteSpace: "nowrap",
};

const removeBtn: React.CSSProperties = {
  background: "#3A1212",
  color: "#FFFFFF",
  border: "1px solid #5B1A1A",
  borderRadius: 7,
  padding: "5px 11px",
  fontSize: 12,
  cursor: "pointer",
  fontFamily: "inherit",
  whiteSpace: "nowrap",
};

const applyBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  flexShrink: 0,
  background: "#2C2C30",
  color: "#FFFFFF",
  border: "1px solid #3C3C40",
  borderRadius: 7,
  padding: "5px 10px",
  fontSize: 12,
  cursor: "pointer",
  fontFamily: "inherit",
  whiteSpace: "nowrap",
};
