// Library tab content (ADR-0008 §3, mockup lines 270-320). The filter/sort/group
// pipeline lives in libraryView(); this component renders the table + the dark
// sticky bulk bar. ADR-0007: the bulk bar offers only Tag (needs a domain) and
// Retire — Export/Update from upstream are intentionally dropped.

import { useMemo } from "react";
import { useStore } from "../state/store";
import { useLibrary } from "../state/queries";
import { useCommands } from "../state/commands";
import { libraryView } from "../lib/select";
import { MONO } from "../lib/tokens";

const headStyle: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: "0.05em",
  color: "#9A9AA2",
};

export function LibraryView() {
  const { state, dispatch } = useStore();
  const skills = useLibrary().data ?? [];
  const commands = useCommands();

  const view = libraryView(skills, {
    filter: state.filter,
    search: state.search,
    sort: state.sort,
    sortDir: state.sortDir,
    group: state.group,
    retired: state.retired,
    removedHard: state.removedHard,
  });

  const selectedNames = Object.keys(state.selected).filter(
    (k) => state.selected[k],
  );
  const showBulk = selectedNames.length > 0;

  const domainOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of skills) for (const d of s.domains) set.add(d);
    return [...set].sort();
  }, [skills]);

  const bulkEcho = useMemo(() => {
    const names = selectedNames.length > 2 ? "<names…>" : selectedNames.join(" ");
    return `skl tag ${names} <domain>`;
  }, [selectedNames]);

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
          <span style={{ ...headStyle, width: 22 }} />
          <span style={{ ...headStyle, width: 158 }}>SKILL</span>
          <span style={{ ...headStyle, width: 128 }}>DOMAINS</span>
          <span style={{ ...headStyle, width: 150 }}>SOURCE</span>
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
              const isVendor = skill.source === "vendored";
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
                  <span style={{ width: 150 }}>
                    {isVendor ? (
                      <span
                        style={{
                          color: "#2563EB",
                          fontFamily: MONO,
                          fontSize: 11,
                          background: "#EFF4FE",
                          borderRadius: 5,
                          padding: "2px 7px",
                        }}
                      >
                        dbskill
                      </span>
                    ) : (
                      <span style={{ color: "#9A9AA2", fontSize: 11.5 }}>
                        local
                      </span>
                    )}
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

      {showBulk ? (
        <div
          style={{
            position: "sticky",
            bottom: 0,
            display: "flex",
            alignItems: "center",
            gap: 11,
            marginTop: 12,
            padding: "10px 14px",
            background: "#18181B",
            borderRadius: 11,
            color: "#FFFFFF",
            fontSize: 12.5,
            boxShadow: "0 8px 26px rgba(0,0,0,0.20)",
          }}
        >
          <span style={{ fontWeight: 600 }}>
            ▸ {selectedNames.length} selected
          </span>
          <div
            style={{
              display: "flex",
              gap: 7,
              marginLeft: 4,
              alignItems: "center",
            }}
          >
            <select
              aria-label="bulk tag domain"
              value=""
              onChange={(e) => {
                const domain = e.target.value;
                if (domain) {
                  commands.tag(selectedNames, domain);
                  dispatch({ type: "clearSelection" });
                }
              }}
              style={{
                background: "#2C2C30",
                color: "#FFFFFF",
                border: "1px solid #3C3C40",
                borderRadius: 7,
                padding: "5px 11px",
                fontSize: 12,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <option value="">Tag…</option>
              {domainOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                commands.retire(selectedNames);
                dispatch({ type: "clearSelection" });
              }}
              style={{
                background: "#2C2C30",
                color: "#FFFFFF",
                border: "1px solid #3C3C40",
                borderRadius: 7,
                padding: "5px 11px",
                fontSize: 12,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Retire
            </button>
            <span
              style={{ fontFamily: MONO, fontSize: 11, color: "#9A9AA2" }}
            >
              {bulkEcho}
            </span>
          </div>
          <span style={{ flex: 1 }} />
          <button
            onClick={() => dispatch({ type: "clearSelection" })}
            style={{
              cursor: "pointer",
              color: "#9A9AA2",
              fontSize: 12,
              background: "none",
              border: "none",
              fontFamily: "inherit",
            }}
          >
            ⌫ clear
          </button>
        </div>
      ) : null}
    </div>
  );
}
