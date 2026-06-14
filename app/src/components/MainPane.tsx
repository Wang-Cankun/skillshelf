// Main column (ADR-0008 §3, mockup lines 119-323): the tab row, the per-tab
// toolbar, and the scrolling content area that swaps Inbox/Matrix/Library.
// Self-contained — all state via useStore() + query hooks + useCommands().

import { useStore } from "../state/store";
import type { View, SortKey, GroupMode } from "../state/store";
import { useLibrary, useWhere, useAgents } from "../state/queries";
import { useCommands } from "../state/commands";
import { libraryView, filterLabel } from "../lib/select";
import { deriveInbox } from "../lib/derive";
import { MONO } from "../lib/tokens";
import { InboxView } from "./InboxView";
import { MatrixView } from "./MatrixView";
import { LibraryView } from "./LibraryView";

const ink = "#18181B";
const sub = "#71717A";

function tabStyle(active: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
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
  };
}
function badgeStyle(active: boolean): React.CSSProperties {
  return {
    fontFamily: MONO,
    fontSize: 10.5,
    padding: "1px 6px",
    borderRadius: 20,
    background: active ? "#18181B" : "#F0F0F1",
    color: active ? "#FFFFFF" : "#9A9AA2",
  };
}
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
  const { state, dispatch } = useStore();
  const skills = useLibrary().data ?? [];
  const where = useWhere().data ?? { surfaces: [], sites: [], problems: [] };
  const commands = useCommands();

  const inboxRows = deriveInbox(skills, where);
  const inboxCount = inboxRows.length;
  const matrixCount = skills.filter(
    (s) => !s.retired && !state.removedHard[s.name],
  ).length;
  const lib = libraryView(skills, {
    filter: state.filter,
    search: state.search,
    sort: state.sort,
    sortDir: state.sortDir,
    group: state.group,
    retired: state.retired,
    removedHard: state.removedHard,
  });

  const tabs: { view: View; label: string; badge: number }[] = [
    { view: "inbox", label: "Inbox", badge: inboxCount },
    { view: "matrix", label: "Matrix", badge: matrixCount },
    { view: "library", label: "Library", badge: lib.count },
  ];

  return (
    <main
      style={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        background: "#FAFAFA",
      }}
    >
      {/* TABS */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          padding: "0 14px",
          height: 42,
          borderBottom: "1px solid #E7E7E9",
          background: "#FFFFFF",
        }}
      >
        {tabs.map((t) => {
          const active = state.view === t.view;
          return (
            <button
              key={t.view}
              onClick={() => dispatch({ type: "setView", view: t.view })}
              style={tabStyle(active)}
            >
              {t.label}{" "}
              <span style={badgeStyle(active)}>{t.badge}</span>
            </button>
          );
        })}
      </div>

      {/* PER-TAB TOOLBAR */}
      {state.view === "inbox" ? (
        <InboxToolbar />
      ) : state.view === "matrix" ? (
        <MatrixToolbar />
      ) : (
        <LibraryToolbar />
      )}

      {/* CONTENT SCROLL */}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {state.view === "inbox" ? (
          <InboxView />
        ) : state.view === "matrix" ? (
          <MatrixView />
        ) : (
          <LibraryView />
        )}
      </div>
    </main>
  );

  // ── Inbox toolbar ──────────────────────────────────────────────────────
  function InboxToolbar() {
    const nUntagged = inboxRows.filter((r) => r.severity === "untagged").length;
    const nStub = inboxRows.filter((r) => r.severity === "stub").length;
    const nReview = inboxRows.filter((r) => !r.auto).length;
    const nAuto = inboxRows.filter((r) => r.auto).length;
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "11px 16px",
          borderBottom: "1px solid #EFEFF1",
          background: "#FFFFFF",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Needs attention</span>
          <span style={{ fontSize: 12, color: "#9A9AA2" }}>
            {nUntagged} untagged · {nStub} stub · {nReview} to review
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => dispatch({ type: "toggleDryRun" })}
            style={{
              background: state.dryRun ? "#18181B" : "#FFFFFF",
              color: state.dryRun ? "#FFFFFF" : "#3F3F46",
              border: `1px solid ${state.dryRun ? "#18181B" : "#E2E2E5"}`,
              borderRadius: 7,
              padding: "5px 12px",
              fontSize: 12.5,
              fontWeight: 550,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            ⚙ Dry-run · {state.dryRun ? "on" : "off"}
          </button>
          <button
            onClick={() => commands.autoFix()}
            style={{
              background: "#18181B",
              color: "#FFFFFF",
              border: "1px solid #18181B",
              borderRadius: 7,
              padding: "5px 12px",
              fontSize: 12.5,
              fontWeight: 550,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Auto-fix safe ({nAuto})
          </button>
        </div>
      </div>
    );
  }

  // ── Matrix toolbar ─────────────────────────────────────────────────────
  function MatrixToolbar() {
    const scopes = useAgents().data?.scopes ?? ["Global"];
    const isAgent = state.matrixMode === "agent";
    const modePills: { mode: "domain" | "agent"; label: string }[] = [
      { mode: "domain", label: "Domain" },
      { mode: "agent", label: "Agent" },
    ];
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          padding: "9px 16px",
          borderBottom: "1px solid #EFEFF1",
          background: "#FFFFFF",
          fontSize: 11.5,
          color: "#71717A",
        }}
      >
        <span style={labelStyle}>GRID</span>
        <div style={{ display: "flex", gap: 5 }}>
          {modePills.map((p) => (
            <button
              key={p.mode}
              onClick={() =>
                dispatch({ type: "setMatrixMode", mode: p.mode })
              }
              style={pill(state.matrixMode === p.mode)}
            >
              {p.label}
            </button>
          ))}
        </div>
        {isAgent ? (
          <>
            <span style={dividerStyle} />
            <span style={labelStyle}>SCOPE</span>
            <div style={{ display: "flex", gap: 5 }}>
              {scopes.map((sc) => (
                <button
                  key={sc}
                  onClick={() => dispatch({ type: "setScope", scope: sc })}
                  style={{
                    ...pill(state.scope === sc, "#2563EB"),
                    fontFamily: MONO,
                  }}
                >
                  {sc}
                </button>
              ))}
            </div>
            <span style={{ color: "#B6B6BC" }}>
              project copy shadows global
            </span>
          </>
        ) : (
          <>
            <span style={{ color: "#C7C7CC" }}>·</span>
            <span>● primary &nbsp; ◦ also-tagged</span>
          </>
        )}
      </div>
    );
  }

  // ── Library toolbar ────────────────────────────────────────────────────
  function LibraryToolbar() {
    const sortPills: { sort: SortKey; label: string }[] = [
      { sort: "modified", label: "Modified" },
      { sort: "name", label: "Name" },
      { sort: "domain", label: "Domain" },
      { sort: "deploys", label: "Deploys" },
    ];
    const groupPills: { group: GroupMode; label: string }[] = [
      { group: "list", label: "List" },
      { group: "domain", label: "By domain" },
      { group: "family", label: "By family" },
    ];
    return (
      <div>
        {/* row 1 — search + filter chips + count */}
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
            onChange={(e) =>
              dispatch({ type: "setSearch", search: e.target.value })
            }
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
          <div style={{ display: "flex", gap: 6 }}>
            {state.filter ? (
              <button
                onClick={() =>
                  dispatch({ type: "setFilter", filter: null })
                }
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
                {filterLabel(state.filter)} ✕
              </button>
            ) : null}
            <span
              style={{
                background: "#F4F4F5",
                color: "#52525B",
                borderRadius: 20,
                padding: "3px 10px",
                fontSize: 11.5,
              }}
            >
              + tag filter
            </span>
          </div>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: "#9A9AA2" }}>
            {lib.count} skills
          </span>
        </div>
        {/* row 2 — sort + view */}
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
        </div>
      </div>
    );
  }
}
