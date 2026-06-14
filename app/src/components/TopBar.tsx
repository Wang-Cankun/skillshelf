// Top bar (46px) — ADR-0008 §3. Logo + brand on the left, a live/dev status
// indicator (keyed off IS_TAURI) on the right. The centered search/command pill
// was removed — the real search lives in the Library toolbar (cmdk deferred).

import { MONO } from "../lib/tokens";
import { IS_TAURI } from "../lib/skl";

export function TopBar() {
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

      {/* spacer (search pill removed) keeps the status indicator right-aligned */}
      <div style={{ flex: 1 }} />

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
