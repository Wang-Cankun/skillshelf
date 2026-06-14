// Sidebar (234px) — ADR-0008 §3, mockup lines 74-116 + renderVals 657-684.
// Three sections (Smart Views · By Domain · Provenance) plus the pinned dbskill
// card. Self-contained: reads aggregates from the real library, the inbox count
// from deriveInbox, and active state from the store. Filters dispatch through
// the store using the FROZEN Filter contract (source value = "vendored"/"local").

import type { CSSProperties } from "react";
import { useStore } from "../state/store";
import type { Filter } from "../state/store";
import { useLibrary, useWhere } from "../state/queries";
import { aggregates } from "../lib/select";
import { deriveInbox } from "../lib/derive";
import { C, MONO, domainHue } from "../lib/tokens";

const caption: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: "0.09em",
  color: "#A1A1AA",
  padding: "0 8px 7px",
};

const sameFilter = (a: Filter, b: Filter) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function Sidebar() {
  const { state, dispatch } = useStore();
  const skills = useLibrary().data ?? [];
  const where = useWhere().data;
  const agg = aggregates(skills);
  const inboxCount = where ? deriveInbox(skills, where).length : 0;

  const setFilter = (filter: Filter) =>
    dispatch({ type: "setFilter", filter, view: "library" });

  const filterActive = (f: Filter) =>
    state.view === "library" && sameFilter(state.filter, f);

  // ── SMART VIEWS ──────────────────────────────────────────────────────────
  const smartRowStyle = (active: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 9,
    padding: "5px 8px",
    borderRadius: 7,
    fontSize: 12.5,
    cursor: "pointer",
    background: active ? "#F4F4F5" : "transparent",
    color: active ? C.ink : "#3F3F46",
    fontWeight: active ? 550 : 450,
    border: "none",
    width: "100%",
    textAlign: "left",
    fontFamily: "inherit",
  });
  const glyphStyle = (color: string): CSSProperties => ({
    color,
    fontSize: 11,
    width: 14,
    textAlign: "center",
  });
  const countStyle: CSSProperties = {
    fontFamily: MONO,
    fontSize: 11,
    color: C.faint,
  };

  const vendoredFilter: Filter = { kind: "source", value: "vendored" };
  const localFilter: Filter = { kind: "source", value: "local" };
  const untaggedFilter: Filter = { kind: "untagged" };

  interface SmartRow {
    glyph: string;
    label: string;
    count: number;
    color: string;
    onClick: () => void;
    active: boolean;
  }
  const smartRows: SmartRow[] = [
    {
      glyph: "⚠",
      label: "Needs attention",
      count: inboxCount,
      color: C.amber,
      onClick: () => dispatch({ type: "setView", view: "inbox" }),
      active: state.view === "inbox",
    },
    {
      glyph: "◆",
      label: "Vendored · tracked",
      count: agg.vendored,
      color: C.blue,
      onClick: () => setFilter(vendoredFilter),
      active: filterActive(vendoredFilter),
    },
    {
      glyph: "●",
      label: "Local · authored",
      count: agg.local,
      color: C.ink,
      onClick: () => setFilter(localFilter),
      active: filterActive(localFilter),
    },
    {
      glyph: "🏷",
      label: "Untagged",
      count: agg.untagged,
      color: C.amber,
      onClick: () => setFilter(untaggedFilter),
      active: filterActive(untaggedFilter),
    },
    {
      glyph: "◇",
      label: "All skills",
      count: agg.total,
      color: C.sub,
      onClick: () => setFilter(null),
      active: filterActive(null),
    },
  ];

  // ── BY DOMAIN ────────────────────────────────────────────────────────────
  const domainRowStyle = (active: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "4px 8px",
    borderRadius: 6,
    fontSize: 12.5,
    cursor: "pointer",
    background: active ? "#F4F4F5" : "transparent",
    color: active ? C.ink : "#52525B",
    fontWeight: active ? 550 : 450,
    border: "none",
    width: "100%",
    textAlign: "left",
    fontFamily: "inherit",
  });

  // ── PROVENANCE ───────────────────────────────────────────────────────────
  const provRowStyle = (active: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "4px 8px",
    borderRadius: 6,
    fontSize: 12,
    cursor: "pointer",
    background: active ? "#F4F4F5" : "transparent",
    color: active ? C.ink : "#52525B",
    fontWeight: active ? 550 : 450,
    border: "none",
    width: "100%",
    textAlign: "left",
    fontFamily: "inherit",
  });
  interface ProvRow {
    glyph: string;
    label: string;
    count: number;
    color: string;
    filter: Filter;
  }
  const provRows: ProvRow[] = [
    {
      glyph: "◆",
      label: "Vendored (dbskill)",
      count: agg.vendored,
      color: C.blue,
      filter: vendoredFilter,
    },
    {
      glyph: "●",
      label: "Local / authored",
      count: agg.local,
      color: C.ink,
      filter: localFilter,
    },
    {
      glyph: "🏷",
      label: "Untagged",
      count: agg.untagged,
      color: C.amber,
      filter: untaggedFilter,
    },
  ];

  return (
    <aside
      style={{
        flex: "0 0 234px",
        width: 234,
        background: "#FFFFFF",
        borderRight: "1px solid #E7E7E9",
        overflow: "auto",
        padding: "14px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      {/* SMART VIEWS */}
      <div>
        <div style={caption}>SMART VIEWS</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {smartRows.map((r) => (
            <button
              key={r.label}
              onClick={r.onClick}
              style={smartRowStyle(r.active)}
            >
              <span style={glyphStyle(r.color)}>{r.glyph}</span>
              <span style={{ flex: 1 }}>{r.label}</span>
              <span style={countStyle}>{r.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* BY DOMAIN */}
      <div>
        <div style={caption}>BY DOMAIN · {agg.domains.length}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {agg.domains.map(({ domain, count }) => {
            const hue = domainHue(domain);
            const filter: Filter = { kind: "domain", value: domain };
            const active = filterActive(filter);
            return (
              <button
                key={domain}
                onClick={() => setFilter(filter)}
                style={domainRowStyle(active)}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 2,
                    background: hue,
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1 }}>{domain}</span>
                <span
                  style={{
                    width: 42,
                    height: 4,
                    borderRadius: 3,
                    background: "#F0F0F1",
                    overflow: "hidden",
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      height: "100%",
                      width:
                        Math.round((count / agg.domainMax) * 100) + "%",
                      background: hue,
                      opacity: 0.55,
                      borderRadius: 3,
                    }}
                  />
                </span>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    color: "#A1A1AA",
                    width: 20,
                    textAlign: "right",
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* PROVENANCE */}
      <div>
        <div style={caption}>PROVENANCE</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {provRows.map((r) => (
            <button
              key={r.label}
              onClick={() => setFilter(r.filter)}
              style={provRowStyle(filterActive(r.filter))}
            >
              <span style={glyphStyle(r.color)}>{r.glyph}</span>
              <span style={{ flex: 1 }}>{r.label}</span>
              <span
                style={{ fontFamily: MONO, fontSize: 11, color: "#A1A1AA" }}
              >
                {r.count}
              </span>
            </button>
          ))}
        </div>
        <div
          style={{
            marginTop: 7,
            padding: "7px 9px",
            background: "#FAFAFA",
            border: "1px solid #EFEFF1",
            borderRadius: 8,
            fontFamily: MONO,
            fontSize: 10,
            color: "#9A9AA2",
            lineHeight: 1.5,
          }}
        >
          <span style={{ color: "#2563EB" }}>◆</span> dbskill
          <br />@a58f647 · pinned
        </div>
      </div>
    </aside>
  );
}
