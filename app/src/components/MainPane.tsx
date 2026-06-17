// Main column (ADR-0010). The old three-tab Inbox/Matrix/Library shell is gone:
// the top row is now a SCOPE SWITCHER — ● Global · <each project> · + Add project
// — and below it the search/filter/sort toolbar, the CountBar (per-agent counts +
// agent-settings gear), the project "Installed here ↔ All" range toggle, and the
// scrolling SkillList. Inbox folded into the sidebar's {kind:"needs"} filter;
// the Matrix is retired.
//
// Toolbar lives at module scope (stable identity) so its search input keeps focus
// across re-renders — the same fix the previous tab toolbars needed.

import { useState } from "react";
import { useStore } from "../state/store";
import type { SortKey, GroupMode } from "../state/store";
import { GLOBAL_SCOPE } from "../state/store";
import { useLibrary, useConfig } from "../state/queries";
import { useCommands } from "../state/commands";
import { filterLabel, allDomains } from "../lib/select";
import { projectScopeName } from "../lib/skl";
import { pickDirectory } from "../lib/pickDir";
import { MONO } from "../lib/tokens";
import { DomainMenu } from "./DomainMenu";
import { CountBar } from "./CountBar";
import { SkillList } from "./SkillList";

const ink = "#18181B";
const sub = "#71717A";

function pill(active: boolean, accent?: string): React.CSSProperties {
  const a = accent ?? "#18181B";
  return {
    background: active ? a : "#F4F4F5",
    color: active ? "#FFFFFF" : "#52525B",
    border: `1px solid ${active ? a : "#E7E7E9"}`,
    borderRadius: 6,
    padding: "3px 11px",
    fontSize: 11.5,
    cursor: "pointer",
    fontFamily: "inherit",
  };
}
const labelStyle: React.CSSProperties = {
  color: "#A1A1AA",
  fontWeight: 600,
  letterSpacing: "0.03em",
};
const dividerStyle: React.CSSProperties = {
  width: 1,
  height: 16,
  background: "#E7E7E9",
  margin: "0 2px",
};

export function MainPane() {
  return (
    <main
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        background: "#FAFAFA",
      }}
    >
      <ScopeSwitcher />
      <LibraryToolbar />
      <CountBar />
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <SkillList />
      </div>
    </main>
  );
}

// ── Scope switcher (replaces the 3-tab row) ────────────────────────────────
function ScopeSwitcher() {
  const { state, dispatch } = useStore();
  const commands = useCommands();
  const projects = useConfig().data?.projects ?? [];
  const [adding, setAdding] = useState(false);

  const tab = (
    label: string,
    active: boolean,
    onClick: () => void,
    glyph?: string,
  ) => (
    <button
      key={label}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 42,
        padding: "0 13px",
        background: "none",
        border: "none",
        borderBottom: `2px solid ${active ? ink : "transparent"}`,
        color: active ? ink : sub,
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        cursor: "pointer",
        fontFamily: "inherit",
        whiteSpace: "nowrap",
      }}
    >
      {glyph ? <span style={{ fontSize: 10 }}>{glyph}</span> : null}
      {label}
    </button>
  );

  const addProject = async () => {
    if (adding) return;
    setAdding(true);
    try {
      // Native directory picker (window.prompt is a no-op in Tauri's WRY webview);
      // browser dev falls back to a prompt inside pickDirectory().
      const path = await pickDirectory();
      if (!path) return;
      const ok = await commands.addProject(path);
      if (ok)
        dispatch({
          type: "setScope",
          scope: projectScopeName(path),
          scopePath: path,
        });
    } finally {
      setAdding(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        padding: "0 14px",
        height: 42,
        borderBottom: "1px solid #E7E7E9",
        background: "#FFFFFF",
        overflowX: "auto",
      }}
    >
      {tab(
        "Global",
        state.scope === GLOBAL_SCOPE,
        () => dispatch({ type: "setScope", scope: GLOBAL_SCOPE }),
        "●",
      )}
      {projects.map((p) => {
        const nm = projectScopeName(p);
        return tab(nm, state.scope === nm, () =>
          dispatch({ type: "setScope", scope: nm, scopePath: p }),
        );
      })}
      <button
        onClick={() => void addProject()}
        disabled={adding}
        style={{
          height: 42,
          padding: "0 11px",
          background: "none",
          border: "none",
          color: "#71717A",
          fontSize: 12.5,
          fontWeight: 500,
          cursor: adding ? "default" : "pointer",
          fontFamily: "inherit",
          whiteSpace: "nowrap",
        }}
      >
        {adding ? "…" : "+ Add project"}
      </button>
    </div>
  );
}

// ── Search / filter / sort toolbar (kept; Inbox/Matrix toolbars dropped) ────
function LibraryToolbar() {
  const { state, dispatch } = useStore();
  const skills = useLibrary().data ?? [];

  const sortPills: { sort: SortKey; label: string }[] = [
    { sort: "name", label: "Name" },
    { sort: "attention", label: "Attention" },
    { sort: "deployed", label: "Deployed" },
  ];
  const groupPills: { group: GroupMode; label: string }[] = [
    { group: "list", label: "List" },
    { group: "domain", label: "By domain" },
    { group: "family", label: "By family" },
    { group: "vendor", label: "By vendor" },
  ];

  const isProject = state.scope !== GLOBAL_SCOPE;

  return (
    <div>
      {/* row 1 — search + filter chips + range toggle */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "9px 16px",
          borderBottom: "1px solid #F3F3F4",
          background: "#FFFFFF",
        }}
      >
        <input
          aria-label="search skills"
          value={state.search}
          onChange={(e) => dispatch({ type: "setSearch", search: e.target.value })}
          placeholder="Fuzzy search name, description, tags…"
          style={{
            width: 260,
            height: 28,
            padding: "0 10px",
            border: "1px solid #E7E7E9",
            borderRadius: 7,
            background: "#FAFAFA",
            fontSize: 12.5,
            color: "#18181B",
            fontFamily: "inherit",
            outline: "none",
          }}
        />
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {state.filter ? (
            <button
              onClick={() => dispatch({ type: "setFilter", filter: null })}
              style={{
                background: "#EAF1FD",
                color: "#2563EB",
                border: "none",
                borderRadius: 20,
                padding: "3px 10px",
                fontSize: 11.5,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {state.filter.kind === "needs"
                ? "needs attention"
                : filterLabel(state.filter)}{" "}
              ✕
            </button>
          ) : null}
          <DomainMenu
            domains={allDomains(skills)}
            onPick={(d) =>
              dispatch({
                type: "setFilter",
                filter: { kind: "domain", value: d },
              })
            }
            variant="filter"
          />
        </div>
        <span style={{ flex: 1 }} />
        {/* range toggle: Installed ↔ All. In a project the installed set is the
            pinned-here symlinks (label "Pinned here"); in Global it's the skills
            installed into the Global agent dirs. Default is installed-only in a
            project (anti-sparse) and all in Global (see store setScope). */}
        <div style={{ display: "flex", gap: 5 }}>
          <button
            onClick={() => dispatch({ type: "setRange", range: "installed" })}
            style={pill(state.range === "installed")}
          >
            {isProject ? "Pinned here" : "Installed"}
          </button>
          <button
            onClick={() => dispatch({ type: "setRange", range: "uninstalled" })}
            style={pill(state.range === "uninstalled")}
          >
            {isProject ? "Not pinned" : "Uninstalled"}
          </button>
          <button
            onClick={() => dispatch({ type: "setRange", range: "all" })}
            style={pill(state.range === "all")}
          >
            All skills
          </button>
        </div>
      </div>
      {/* row 2 — sort + group */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          padding: "8px 16px",
          borderBottom: "1px solid #EFEFF1",
          background: "#FFFFFF",
          fontSize: 11.5,
        }}
      >
        <span style={labelStyle}>SORT</span>
        <div style={{ display: "flex", gap: 5 }}>
          {sortPills.map((p) => (
            <button
              key={p.sort}
              onClick={() => dispatch({ type: "setSort", sort: p.sort })}
              style={pill(state.sort === p.sort)}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => dispatch({ type: "toggleSortDir" })}
            style={{
              background: "#FFFFFF",
              border: "1px solid #E7E7E9",
              borderRadius: 6,
              padding: "3px 9px",
              fontSize: 11.5,
              cursor: "pointer",
              fontFamily: MONO,
              color: "#3F3F46",
            }}
          >
            {state.sortDir === "desc" ? "↓" : "↑"}
          </button>
        </div>
        <span style={dividerStyle} />
        <span style={labelStyle}>VIEW</span>
        <div style={{ display: "flex", gap: 5 }}>
          {groupPills.map((p) => (
            <button
              key={p.group}
              onClick={() => dispatch({ type: "setGroup", group: p.group })}
              style={pill(state.group === p.group)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        {/* No library-wide "Update all" — it swept all vendors in one blocking
            clone (froze the UI) and dumped a wall of results. Update is now
            per-vendor: switch to "By vendor" and use the per-group Update action
            (SkillList header → commands.updateVendor). */}
      </div>
    </div>
  );
}
