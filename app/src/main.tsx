import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import App from "./App";
import { StoreProvider } from "./state/store";
import { checkForUpdates } from "./lib/updater";

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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <StoreProvider>
        <App />
      </StoreProvider>
    </QueryClientProvider>
  </StrictMode>,
);
