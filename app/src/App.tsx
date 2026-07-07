// Workbench shell (ADR-0008 §3). Mirrors the mockup's top-level structure:
// top bar (46px) · three panes (sidebar 234 · main · inspector 312) · health
// strip (30px), plus the global overlays (undo toast, type-to-confirm Remove,
// detail drawer). Every pane is a self-contained container reading the store /
// queries / commands directly — App only composes + owns the load/empty gate.

import {
  useLibrary,
  useWhere,
  useAgents,
  useConfig,
  useScan,
  useStatus,
} from "./state/queries";
import { TopBar } from "./components/TopBar";
import { Sidebar } from "./components/Sidebar";
import { MainPane } from "./components/MainPane";
import { HealthStrip } from "./components/HealthStrip";
import { ErrorBanner, FeedErrorBanner } from "./components/ErrorBanner";
import { UpdateResultsBanner } from "./components/UpdateResultsBanner";
import { Toast } from "./components/Toast";
import { RemoveModal } from "./components/RemoveModal";
import { DetailDrawer } from "./components/DetailDrawer";
import { BulkBar } from "./components/BulkBar";
import { C } from "./lib/tokens";

export default function App() {
  // Kick the core feeds; panes subscribe to whichever they need. The initial
  // load gate mirrors App.svelte: show a spinner until the primary feeds resolve,
  // an error+retry if every feed failed. library/where/agents/config are watched
  // here so a single failed feed is surfaced (W4); scan/status stay unwatched.
  const library = useLibrary();
  const where = useWhere();
  const agents = useAgents();
  const config = useConfig();
  useScan();
  useStatus();

  // W4: gate on OR — keep showing "loading…" until BOTH primary feeds resolve, so
  // a single slow/failed feed can't render the empty-deployment shell as "done".
  const loading = library.isLoading || where.isLoading;
  const allFailed = library.isError && where.isError;

  // W4: with global retry:false (main.tsx) a single failed CORE feed otherwise
  // shows a healthy-looking "0 deployments" app. Surface ANY failed core feed
  // (library/where/agents/config — scan/status are unused by the panes) via an
  // explicit banner with a targeted retry. The catastrophic all-failed path keeps
  // its own full-screen retry, so suppress the banner there to avoid doubling.
  const coreFeeds: Array<{
    label: string;
    isError: boolean;
    refetch: () => void;
  }> = [
    { label: "library", isError: library.isError, refetch: () => void library.refetch() },
    { label: "deployments", isError: where.isError, refetch: () => void where.refetch() },
    { label: "agents", isError: agents.isError, refetch: () => void agents.refetch() },
    { label: "config", isError: config.isError, refetch: () => void config.refetch() },
  ];
  const failedFeeds = coreFeeds.filter((f) => f.isError);

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: "system-ui,-apple-system,'Segoe UI',sans-serif",
        color: C.ink,
        background: C.page,
        overflow: "hidden",
      }}
    >
      <TopBar />
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <Sidebar />
        <div
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            background: C.page,
          }}
        >
          <ErrorBanner />
          {!allFailed && failedFeeds.length > 0 && (
            <FeedErrorBanner
              feeds={failedFeeds.map((f) => f.label)}
              onRetry={() => failedFeeds.forEach((f) => f.refetch())}
            />
          )}
          <UpdateResultsBanner />
          {loading ? (
            <div style={{ padding: 24, fontSize: 12, color: C.faint }}>
              loading…
            </div>
          ) : allFailed ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                padding: 24,
              }}
            >
              <div style={{ fontSize: 12, color: C.red }}>
                could not load any data.
              </div>
              <button
                onClick={() => {
                  void library.refetch();
                  void where.refetch();
                }}
                style={{
                  alignSelf: "flex-start",
                  borderRadius: 6,
                  border: `1px solid ${C.border}`,
                  background: "#fff",
                  padding: "4px 12px",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                retry
              </button>
            </div>
          ) : (
            <MainPane />
          )}
        </div>
      </div>
      <HealthStrip />

      {/* global overlays */}
      <Toast />
      <RemoveModal />
      <DetailDrawer />
      <BulkBar />
    </div>
  );
}
