// Floating bulk-action bar (ADR-0010 deltas 1 & 2). Appears when ≥1 skill is
// selected. It now drives the SOLE deploy-execution path: a [Enable | Remove]
// segmented control (Remove gets a destructive tint) + one button per visible
// agent that calls bulkDeploy(names, agentId, scope, on=mode==="enable") against
// the ACTIVE scope. When a domain filter is active it also shows the bundle label
// and a drift hint "N tagged · M selected" (delta 1). Tag/Retire stay available.

import { useStore } from "../state/store";
import { useLibrary, useAgents } from "../state/queries";
import { useCommands } from "../state/commands";
import { allDomains } from "../lib/select";
import { iconFor } from "../lib/agentIcon";
import { DomainMenu } from "./DomainMenu";
import { MONO } from "../lib/tokens";
import type { AgentsReport } from "../lib/types";

const EMPTY_AGENTS: AgentsReport = { agents: [], scopes: [], deployments: {} };

export function BulkBar() {
  const { state, dispatch } = useStore();
  const skills = useLibrary().data ?? [];
  const report = useAgents().data ?? EMPTY_AGENTS;
  const commands = useCommands();

  const names = Object.keys(state.selected).filter((k) => state.selected[k]);
  if (!names.length) return null;
  // A drawer covers the screen (z 50/51) — don't float the bar over it.
  if (state.drawer) return null;

  const on = state.bulkMode === "enable";
  const agents = report.agents;

  // delta 1 — bundle label + drift hint when a domain filter is active.
  const domainFilter =
    state.filter?.kind === "domain" ? state.filter.value : null;
  const taggedCount = domainFilter
    ? skills.filter((s) => !s.retired && s.domains.includes(domainFilter)).length
    : 0;

  const runBulk = (agentId: string) => {
    void commands.bulkDeploy(
      names,
      agentId,
      state.scope,
      on,
      state.scopePath ?? undefined,
    );
    dispatch({ type: "clearSelection" });
  };

  const modePill = (mode: "enable" | "remove"): React.CSSProperties => {
    const active = state.bulkMode === mode;
    const destructive = mode === "remove";
    return {
      background: active ? (destructive ? "#7F1D1D" : "#2563EB") : "#2C2C30",
      color: active ? "#FFFFFF" : "#9A9AA2",
      border: `1px solid ${active ? (destructive ? "#991B1B" : "#2563EB") : "#3C3C40"}`,
      borderRadius: 6,
      padding: "4px 10px",
      fontSize: 11.5,
      fontWeight: active ? 600 : 500,
      cursor: "pointer",
      fontFamily: "inherit",
      whiteSpace: "nowrap",
    };
  };

  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        bottom: 42,
        transform: "translateX(-50%)",
        zIndex: 40,
        display: "flex",
        alignItems: "center",
        gap: 12,
        maxWidth: "min(880px, calc(100vw - 48px))",
        padding: "10px 14px",
        background: "#18181B",
        borderRadius: 12,
        color: "#FFFFFF",
        fontSize: 12.5,
        boxShadow: "0 12px 34px rgba(0,0,0,0.28)",
      }}
    >
      <span style={{ display: "flex", flexDirection: "column", whiteSpace: "nowrap" }}>
        <span style={{ fontWeight: 650 }}>▸ {names.length} selected</span>
        {domainFilter ? (
          <span style={{ fontSize: 10.5, color: "#9A9AA2" }}>
            <span style={{ color: "#D4D4D8" }}>{domainFilter}</span> ·{" "}
            {taggedCount} tagged · {names.length} selected
          </span>
        ) : null}
      </span>

      {/* delta 2 — Enable | Remove segmented control */}
      <div style={{ display: "flex", gap: 4 }}>
        <button
          onClick={() => dispatch({ type: "setBulkMode", mode: "enable" })}
          style={modePill("enable")}
        >
          Enable
        </button>
        <button
          onClick={() => dispatch({ type: "setBulkMode", mode: "remove" })}
          style={modePill("remove")}
        >
          Remove
        </button>
      </div>

      {/* per-agent apply buttons (deploy to the ACTIVE scope) */}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {agents.map((a) => {
          const ic = iconFor(a);
          return (
            <button
              key={a.id}
              onClick={() => runBulk(a.id)}
              title={`${on ? "Enable" : "Remove"} ${names.length} · ${a.name} (${state.scope})`}
              style={{
                ...applyBtn,
                ...(on
                  ? {}
                  : { background: "#3A1212", border: "1px solid #5B1A1A" }),
              }}
            >
              {ic.svgUrl ? (
                <img
                  src={ic.svgUrl}
                  alt=""
                  style={{ width: 13, height: 13, objectFit: "contain" }}
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
                  }}
                >
                  {ic.letter}
                </span>
              )}
              {a.short}
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

      <span style={{ flex: 1 }} />
      <span
        style={{
          fontFamily: MONO,
          fontSize: 11,
          color: "#9A9AA2",
          whiteSpace: "nowrap",
        }}
      >
        {state.scope}
      </span>
      <button
        onClick={() => dispatch({ type: "clearSelection" })}
        aria-label="clear selection"
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

const applyBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
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
