// Undo toast (ADR-0008, mockup lines 376-388). Dark bottom-center pill driven
// by state.toast. Auto-dismisses after 6s; Undo (when offered) calls the
// command-layer reversal closure stored on the toast.

import { useEffect } from "react";
import { useStore } from "../state/store";
import { MONO } from "../lib/tokens";

export function Toast() {
  const { state, dispatch } = useStore();
  const toast = state.toast;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => dispatch({ type: "hideToast" }), 6000);
    return () => clearTimeout(t);
  }, [toast, dispatch]);

  if (!toast) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        bottom: 46,
        transform: "translateX(-50%)",
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        gap: 14,
        background: "#18181B",
        color: "#FFFFFF",
        borderRadius: 11,
        padding: "10px 12px 10px 16px",
        boxShadow: "0 12px 34px rgba(0,0,0,.28)",
        animation: "var(--animate-toast-in)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 13, fontWeight: 550 }}>{toast.msg}</span>
        <span style={{ fontFamily: MONO, fontSize: 10.5, color: "#9A9AA2" }}>
          {toast.cmd}
        </span>
      </div>
      {toast.undo ? (
        <button
          onClick={() => toast.undo?.()}
          style={{
            background: "#2C2C30",
            border: "1px solid #3C3C40",
            color: "#FFFFFF",
            borderRadius: 7,
            padding: "5px 13px",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Undo
        </button>
      ) : null}
      <button
        onClick={() => dispatch({ type: "hideToast" })}
        style={{
          background: "none",
          border: "none",
          color: "#71717A",
          fontSize: 14,
          cursor: "pointer",
          lineHeight: 1,
        }}
      >
        ✕
      </button>
    </div>
  );
}
