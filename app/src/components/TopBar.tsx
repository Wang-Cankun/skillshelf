// Top bar (46px) — ADR-0008 §3. Logo + brand on the left, a live/dev status
// indicator (keyed off IS_TAURI) on the right. The centered search/command pill
// was removed — the real search lives in the Library toolbar (cmdk deferred).

import { useEffect, useState } from "react";
import { MONO } from "../lib/tokens";
import { IS_TAURI } from "../lib/skl";
import { useFsSyncStatus } from "../hooks/useFsEventsSync";

export function TopBar() {
  const { active, lastTick } = useFsSyncStatus();

  // Brief "synced" pulse for ~1.2s after each received fs-changed event.
  const [synced, setSynced] = useState(false);
  useEffect(() => {
    if (lastTick === null) return;
    setSynced(true);
    const t = setTimeout(() => setSynced(false), 1200);
    return () => clearTimeout(t);
  }, [lastTick]);

  // Honest badge state:
  //  - browser (!IS_TAURI): grey dot, "dev" — there is no watcher.
  //  - desktop, listener subscribed: green "Live"; flashes "synced" on events.
  //  - desktop, not yet subscribed: amber dot, "Live" pending (no pulse).
  const dotColor = !IS_TAURI ? "#A1A1AA" : active ? "#15A34A" : "#D4A017";
  const label = !IS_TAURI ? "dev" : synced ? "synced" : "Live";
  const pulse = IS_TAURI && active;

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
            background: dotColor,
            transform: synced ? "scale(1.4)" : undefined,
            transition: "transform 150ms ease, background 150ms ease",
            animation: pulse ? "var(--animate-livepulse)" : undefined,
          }}
        />
        <span>{label}</span>
        <span style={{ fontFamily: MONO, fontSize: 11, color: "#A1A1AA" }}>
          FSEvents
        </span>
      </div>
    </div>
  );
}
