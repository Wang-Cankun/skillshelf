// Top bar (46px) — ADR-0008 §3, mockup lines 46-69. Logo + brand, a centered
// search-pill placeholder (cmdk deferred → rendered as a div, not an input),
// and a live/dev status indicator keyed off IS_TAURI.

import { useLibrary } from "../state/queries";
import { aggregates } from "../lib/select";
import { MONO } from "../lib/tokens";
import { IS_TAURI } from "../lib/skl";

export function TopBar() {
  const skills = useLibrary().data ?? [];
  const total = aggregates(skills).total;

  return (
    <div
      style={{
        flex: "0 0 46px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "0 16px",
        background: "#FFFFFF",
        borderBottom: "1px solid #E7E7E9",
      }}
    >
      {/* logo + brand */}
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: 5,
            background: "#18181B",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: "#FAFAFA",
            }}
          />
        </div>
        <span
          style={{ fontWeight: 680, fontSize: 14, letterSpacing: "-0.01em" }}
        >
          skillshelf
        </span>
        <span
          style={{
            fontSize: 12,
            color: "#A1A1AA",
            borderLeft: "1px solid #E7E7E9",
            paddingLeft: 9,
          }}
        >
          workbench
        </span>
      </div>

      {/* centered search pill (visual placeholder — cmdk deferred) */}
      <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            width: 420,
            maxWidth: "100%",
            height: 30,
            padding: "0 11px",
            border: "1px solid #E7E7E9",
            borderRadius: 8,
            background: "#FAFAFA",
            color: "#9A9AA2",
            fontSize: 12.5,
          }}
        >
          <div
            style={{
              width: 11,
              height: 11,
              border: "1.5px solid #B6B6BC",
              borderRadius: "50%",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                width: 5,
                height: 1.5,
                background: "#B6B6BC",
                transform: "rotate(45deg)",
                right: -4,
                bottom: 0,
                borderRadius: 1,
              }}
            />
          </div>
          <span style={{ flex: 1 }}>
            Search {total} skills, run a command…
          </span>
          <span
            style={{
              fontFamily: MONO,
              fontSize: 11,
              background: "#FFFFFF",
              border: "1px solid #E7E7E9",
              borderRadius: 5,
              padding: "1px 6px",
              color: "#71717A",
            }}
          >
            ⌘K
          </span>
        </div>
      </div>

      {/* live / dev status */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          fontSize: 12,
          color: "#71717A",
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: IS_TAURI ? "#15A34A" : "#A1A1AA",
            animation: IS_TAURI ? "var(--animate-livepulse)" : undefined,
          }}
        />
        <span>{IS_TAURI ? "Live" : "dev"}</span>
        <span style={{ fontFamily: MONO, fontSize: 11, color: "#A1A1AA" }}>
          FSEvents
        </span>
      </div>
    </div>
  );
}
