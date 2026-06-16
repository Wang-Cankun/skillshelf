import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import App from "./App";
import { StoreProvider } from "./state/store";
import { checkForUpdates } from "./lib/updater";
import { useFsEventsSync } from "./hooks/useFsEventsSync";

// Best-effort desktop auto-update check. Inert in the browser and until the
// updater is activated (see docs/RELEASING.md); never blocks startup.
void checkForUpdates();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

/** Mounts the FSEvents live-sync listener once, inside the QueryClientProvider
 *  so `queryClient` is the same instance the rest of the app uses. No-op in the
 *  browser (see useFsEventsSync). */
function FsEventsListener() {
  useFsEventsSync(queryClient);
  return null;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <FsEventsListener />
      <StoreProvider>
        <App />
      </StoreProvider>
    </QueryClientProvider>
  </StrictMode>,
);
