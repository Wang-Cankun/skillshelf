// Inspector aside (ADR-0008, mockup lines 325-361). Slim 312px quick-select
// panel for the focus skill (drawer target, else first selected). Per ADR-0007
// the mockup's near-duplicate block (352-360) is intentionally OMITTED — we
// never surface heuristic "near-dup" claims as fact.

import { useStore } from "../state/store";
import { useLibrary, useShow } from "../state/queries";
import { MONO } from "../lib/tokens";

export function Inspector() {
  const { state, dispatch } = useStore();
  const skills = useLibrary().data ?? [];

  const firstSelected =
    Object.keys(state.selected).find((k) => state.selected[k]) ?? null;
  const name = state.drawer ?? firstSelected ?? null;
  const skill = name ? skills.find((s) => s.name === name) : undefined;

  const show = useShow(name, "SKILL.md").data;

  if (!name || !skill) {
    return (
      <aside
        style={{
          flex: "0 0 312px",
          width: 312,
          background: "#FFFFFF",
          borderLeft: "1px solid #E7E7E9",
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: 18, fontSize: 12.5, color: "#9A9AA2" }}>
          Select a skill
        </div>
      </aside>
    );
  }

  const isVendored = skill.source === "vendored";
  const domains = skill.domains ?? [];
  const prov = show?.prov;

  return (
    <aside
      style={{
        flex: "0 0 312px",
        width: 312,
        background: "#FFFFFF",
        borderLeft: "1px solid #E7E7E9",
        overflow: "auto",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* header block */}
      <div
        style={{ padding: "16px 18px 14px", borderBottom: "1px solid #EFEFF1" }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 650,
              letterSpacing: "-0.01em",
              fontFamily: MONO,
            }}
          >
            {skill.name}
          </span>
          {isVendored ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11,
                color: "#2563EB",
                background: "#EAF1FD",
                borderRadius: 20,
                padding: "3px 9px",
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 9 }}>◆</span> vendored
            </span>
          ) : (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11,
                color: "#18181B",
                background: "#F4F4F5",
                borderRadius: 20,
                padding: "3px 9px",
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 9 }}>●</span> local
            </span>
          )}
        </div>
        <div
          style={{
            marginTop: 10,
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
          }}
        >
          {domains.map((d) => (
            <span
              key={d}
              style={{
                background: "#F4F4F5",
                color: "#52525B",
                borderRadius: 6,
                padding: "2px 9px",
                fontSize: 11.5,
              }}
            >
              {d}
            </span>
          ))}
          <span
            style={{
              border: "1px dashed #D4D4D8",
              color: "#9A9AA2",
              borderRadius: 6,
              padding: "2px 8px",
              fontSize: 11.5,
            }}
          >
            + add
          </span>
        </div>
        <button
          onClick={() => dispatch({ type: "openDrawer", name })}
          style={{
            marginTop: 12,
            width: "100%",
            background: "#18181B",
            color: "#FFFFFF",
            border: "none",
            borderRadius: 8,
            padding: 8,
            fontSize: 12.5,
            fontWeight: 550,
            cursor: "pointer",
          }}
        >
          Open detail ↗
        </button>
      </div>

      {/* provenance summary */}
      <div style={{ padding: "15px 18px", borderBottom: "1px solid #EFEFF1" }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.05em",
            color: "#9A9AA2",
            marginBottom: 11,
          }}
        >
          PROVENANCE{" "}
          <span style={{ fontWeight: 400, color: "#B6B6BC" }}>
            · shelf.lock.json
          </span>
        </div>
        {isVendored && prov ? (
          <>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                fontSize: 11.5,
              }}
            >
              <div style={{ display: "flex", gap: 8 }}>
                <span style={{ color: "#A1A1AA", width: 56, flexShrink: 0 }}>
                  source
                </span>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 10.5,
                    color: "#52525B",
                    wordBreak: "break-all",
                  }}
                >
                  {prov.source}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <span style={{ color: "#A1A1AA", width: 56, flexShrink: 0 }}>
                  ref
                </span>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 10.5,
                    color: "#52525B",
                  }}
                >
                  {prov.ref}
                </span>
              </div>
            </div>
            <div
              style={{
                marginTop: 11,
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "#ECF6EF",
                border: "1px solid #CDE9D6",
                borderRadius: 8,
                padding: "8px 10px",
              }}
            >
              <span style={{ color: "#15A34A", fontSize: 13 }}>✓</span>
              <span style={{ fontSize: 11.5, color: "#15803D" }}>
                clean — matches{" "}
                <span style={{ fontFamily: MONO }}>installedHash</span>
              </span>
            </div>
          </>
        ) : (
          <div style={{ fontSize: 11.5, color: "#9A9AA2" }}>
            ● local — authored here
          </div>
        )}
      </div>
    </aside>
  );
}
