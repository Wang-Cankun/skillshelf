// Workbench shell (ADR-0008 §3). Mirrors the mockup's top-level structure:
// top bar (46px) · three panes (sidebar 234 · main · inspector 312) · health
// strip (30px), plus the global overlays (undo toast, type-to-confirm Remove,
// detail drawer). Every pane is a self-contained container reading the store /
// queries / commands directly — App only composes + owns the load/empty gate.

import { useLibrary, useWhere, useScan, useStatus } from "./state/queries";
import { TopBar } from "./components/TopBar";
import { Sidebar } from "./components/Sidebar";
import { MainPane } from "./components/MainPane";
import { Inspector } from "./components/Inspector";
import { HealthStrip } from "./components/HealthStrip";
import { ErrorBanner } from "./components/ErrorBanner";
import { Toast } from "./components/Toast";
import { RemoveModal } from "./components/RemoveModal";
import { DetailDrawer } from "./components/DetailDrawer";
import { C } from "./lib/tokens";

export default function App() {
  // Kick the four core feeds; panes subscribe to whichever they need. The
  // initial load gate mirrors App.svelte: show a spinner until the primary feed
  // resolves, an error+retry if every feed failed.
  const library = useLibrary();
  const where = useWhere();
  useScan();
  useStatus();

  const loading = library.isLoading && where.isLoading;
  const allFailed = library.isError && where.isError;

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
            display: "flex",
            flexDirection: "column",
            background: C.page,
          }}
        >
          <ErrorBanner />
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
        <Inspector />
      </div>
      <HealthStrip />

      {/* global overlays */}
      <Toast />
      <RemoveModal />
      <DetailDrawer />
    </div>
  );
}
