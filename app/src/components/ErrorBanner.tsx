// Error banner — surfaces state.error (a failed mutation / load) at the top of
// the main pane. Dismissible; clears state.error on dismiss. Renders nothing
// when there is no error.

import { useStore } from "../state/store";

export function ErrorBanner() {
  const { state, dispatch } = useStore();
  if (!state.error) return null;

  return (
    <div
      role="alert"
      style={{
        borderBottom: "1px solid #FCA5A5",
        background: "#FEF2F2",
        fontSize: 12,
        color: "#B91C1C",
        padding: "10px 16px",
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
      }}
    >
      <span style={{ fontWeight: 700 }}>error</span>
      <span
        style={{
          flex: 1,
          wordBreak: "break-word",
          whiteSpace: "pre-wrap",
        }}
      >
        {state.error}
      </span>
      <button
        aria-label="dismiss error"
        onClick={() => dispatch({ type: "setError", error: null })}
        style={{
          background: "none",
          border: "none",
          color: "#B91C1C",
          cursor: "pointer",
          fontSize: 14,
          lineHeight: 1,
          padding: 0,
        }}
      >
        ✕
      </button>
    </div>
  );
}
