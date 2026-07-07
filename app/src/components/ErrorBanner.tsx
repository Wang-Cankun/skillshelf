// Error banner — surfaces state.error (a failed mutation) at the top of the main
// pane. Dismissible; clears state.error on dismiss. Renders nothing when there
// is no error.
//
// W4: FeedErrorBanner reuses the same red-banner shell to surface a failed CORE
// data feed (library / where / agents / config). It is derived from live query
// error state (not the reducer `state.error`, which the mutation contract owns),
// so its affordance is a Retry (refetch) rather than a clear — a failed feed is
// a fact about the data, not a transient message. Without it a single failed
// feed (global retry:false) renders a healthy-looking "0 deployments" shell.

import type { ReactNode } from "react";
import { useStore } from "../state/store";

const bannerStyle = {
  borderBottom: "1px solid #FCA5A5",
  background: "#FEF2F2",
  fontSize: 12,
  color: "#B91C1C",
  padding: "10px 16px",
  display: "flex",
  gap: 12,
  alignItems: "flex-start",
} as const;

function BannerShell({
  children,
  action,
}: {
  children: ReactNode;
  action: ReactNode;
}) {
  return (
    <div role="alert" style={bannerStyle}>
      <span style={{ fontWeight: 700 }}>error</span>
      <span
        style={{
          flex: 1,
          wordBreak: "break-word",
          whiteSpace: "pre-wrap",
        }}
      >
        {children}
      </span>
      {action}
    </div>
  );
}

const dismissBtnStyle = {
  background: "none",
  border: "none",
  color: "#B91C1C",
  cursor: "pointer",
  fontSize: 14,
  lineHeight: 1,
  padding: 0,
} as const;

const retryBtnStyle = {
  background: "none",
  border: "1px solid #FCA5A5",
  borderRadius: 4,
  color: "#B91C1C",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 600,
  lineHeight: 1.4,
  padding: "1px 8px",
} as const;

export function ErrorBanner() {
  const { state, dispatch } = useStore();
  if (!state.error) return null;

  return (
    <BannerShell
      action={
        <button
          aria-label="dismiss error"
          onClick={() => dispatch({ type: "setError", error: null })}
          style={dismissBtnStyle}
        >
          ✕
        </button>
      }
    >
      {state.error}
    </BannerShell>
  );
}

/** W4: surfaces one-or-more failed CORE data feeds. `feeds` is the list of human
 *  labels that failed to load; `onRetry` refetches exactly those. Renders nothing
 *  when no feed failed. */
export function FeedErrorBanner({
  feeds,
  onRetry,
}: {
  feeds: string[];
  onRetry: () => void;
}) {
  if (feeds.length === 0) return null;

  return (
    <BannerShell
      action={
        <button
          aria-label="retry failed feeds"
          onClick={onRetry}
          style={retryBtnStyle}
        >
          retry
        </button>
      }
    >
      {`could not load ${feeds.join(", ")} — some data may be missing or out of date.`}
    </BannerShell>
  );
}
