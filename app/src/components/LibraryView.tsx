// Library tab content (ADR-0008 §3, mockup lines 270-320). The filter/sort/group
// pipeline lives in libraryView(); this component renders the table + the dark
// sticky bulk bar. ADR-0007: the bulk bar offers only Tag (needs a domain) and
// Retire — Export/Update from upstream are intentionally dropped.

import { useStore } from "../state/store";
import { useLibrary } from "../state/queries";
import { libraryView } from "../lib/select";
import { MONO } from "../lib/tokens";
import { SourceCell } from "./SourceCell";

const headStyle: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: "0.05em",
  color: "#9A9AA2",
};

export function LibraryView() {
  const { state, dispatch } = useStore();
  const skills = useLibrary().data ?? [];

  const view = libraryView(skills, {
    filter: state.filter,
    search: state.search,
    sort: state.sort,
    sortDir: state.sortDir,
    group: state.group,
    retired: state.retired,
    removedHard: state.removedHard,
  });

  // Select-all operates on the CURRENTLY VISIBLE rows (post filter/search), so
  // it never silently selects skills the user can't see.
  const visibleNames = view.buckets.flatMap((b) => b.rows.map((r) => r.name));
  const allSelected =
    visibleNames.length > 0 && visibleNames.every((n) => state.selected[n]);
  const someSelected = visibleNames.some((n) => state.selected[n]);

  return (
    <div style={{ padding: "14px 16px" }}>
      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #E7E7E9",
          borderRadius: 11,
          overflow: "hidden",
        }}
      >
        {/* header row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 0,
            padding: "8px 14px",
            borderBottom: "1px solid #E7E7E9",
            background: "#FBFBFC",
          }}
        >
          <button
            onClick={() =>
              dispatch({
                type: "setSelectedMany",
                names: visibleNames,
                value: !allSelected,
              })
            }
            disabled={visibleNames.length === 0}
            aria-label={allSelected ? "deselect all" : "select all"}
            aria-pressed={allSelected}
            title={allSelected ? "Deselect all" : `Select all ${visibleNames.length}`}
            style={{
              width: 22,
              fontSize: 14,
              lineHeight: 1,
              color: allSelected || someSelected ? "#2563EB" : "#C7C7CC",
              background: "none",
              border: "none",
              padding: 0,
              cursor: visibleNames.length ? "pointer" : "default",
              textAlign: "left",
            }}
          >
            {allSelected ? "☑" : someSelected ? "▣" : "☐"}
          </button>
          <span style={{ ...headStyle, width: 158 }}>SKILL</span>
          <span style={{ ...headStyle, width: 128 }}>DOMAINS</span>
          <span style={{ ...headStyle, width: 220, flexShrink: 0 }}>SOURCE</span>
          <span style={{ ...headStyle, width: 96 }}>MODIFIED</span>
          <span style={{ ...headStyle, width: 64, textAlign: "center" }}>
            DEPLOYS
          </span>
          <span style={{ ...headStyle, flex: 1 }}>DESCRIPTION</span>
        </div>

        {view.buckets.map((bucket, bi) => (
          <div key={bucket.label || `bucket-${bi}`}>
            {bucket.hasLabel ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 14px",
                  background: "#FBFBFC",
                  borderBottom: "1px solid #F0F0F1",
                  fontSize: 10.5,
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                  color: "#9A9AA2",
                }}
              >
                <span>{bucket.label}</span>
                <span style={{ fontFamily: MONO, color: "#C7C7CC" }}>
                  {bucket.count}
                </span>
              </div>
            ) : null}
            {bucket.rows.map((skill) => {
              const checked = !!state.selected[skill.name];
              return (
                <div
                  key={skill.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "8px 14px",
                    borderBottom: "1px solid #F3F3F4",
                    fontSize: 13,
                    borderLeft: `2px solid ${checked ? "#2563EB" : "transparent"}`,
                    background: checked ? "#F5F8FE" : "transparent",
                  }}
                >
                  <button
                    onClick={() =>
                      dispatch({ type: "toggleSelect", name: skill.name })
                    }
                    aria-label={`select ${skill.name}`}
                    aria-pressed={checked}
                    style={{
                      width: 22,
                      fontSize: 14,
                      color: checked ? "#2563EB" : "#C7C7CC",
                      flexShrink: 0,
                      cursor: "pointer",
                      background: "none",
                      border: "none",
                      padding: 0,
                      textAlign: "left",
                    }}
                  >
                    {checked ? "☑" : "☐"}
                  </button>
                  <button
                    onClick={() =>
                      dispatch({ type: "openDrawer", name: skill.name })
                    }
                    style={{
                      width: 158,
                      fontWeight: 560,
                      color: "#18181B",
                      fontFamily: MONO,
                      fontSize: 12,
                      cursor: "pointer",
                      background: "none",
                      border: "none",
                      padding: 0,
                      textAlign: "left",
                    }}
                  >
                    {skill.name}
                  </button>
                  <span
                    style={{ width: 128, color: "#52525B", fontSize: 12 }}
                  >
                    {skill.domains.join(" · ") || "(untagged)"}
                  </span>
                  <span
                    style={{
                      width: 220,
                      flexShrink: 0,
                      overflow: "hidden",
                      display: "inline-flex",
                      alignItems: "center",
                    }}
                  >
                    <SourceCell skill={skill} variant="library" />
                  </span>
                  <span
                    style={{
                      width: 96,
                      fontFamily: MONO,
                      fontSize: 11.5,
                      color: "#71717A",
                    }}
                  >
                    {skill.modifiedAt ? skill.modifiedAt.slice(0, 10) : "—"}
                  </span>
                  <span
                    style={{
                      width: 64,
                      textAlign: "center",
                      fontFamily: MONO,
                      fontSize: 12,
                      color: "#3F3F46",
                    }}
                  >
                    {skill.deployCount ?? 0}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      color: "#71717A",
                      fontSize: 12,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {skill.description}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
