// Real filesystem live-sync (ADR-0008 §0). The Rust side (notify watcher in
// src-tauri/src/lib.rs) emits a single debounced "skl://fs-changed" event when
// anything changes under the watched dirs (library, global agent skill dirs,
// persisted project dirs). Here we listen for that event and invalidate the
// server-state queries so changes made OUTSIDE the app (skl CLI, manual file
// moves) live-update the UI.
//
// In the browser (!IS_TAURI) there is no watcher, so this is a no-op and the
// TopBar badge honestly shows "dev".

import { useEffect, useSyncExternalStore } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { IS_TAURI } from "../lib/skl";
import { qk } from "../state/queries";

/** Exact Tauri event name — must match the Rust emit (CONTRACT). */
export const FS_CHANGED_EVENT = "skl://fs-changed";

// --- tiny external store so the TopBar badge reflects the REAL watcher ---
// `active`  : the listener is subscribed (IS_TAURI && listen() resolved)
// `lastTick`: timestamp (ms) of the most recent received event, or null.

type FsSyncState = { active: boolean; lastTick: number | null };

let state: FsSyncState = { active: false, lastTick: null };
const listeners = new Set<() => void>();

function emitChange() {
  for (const l of listeners) l();
}

function setState(next: Partial<FsSyncState>) {
  state = { ...state, ...next };
  emitChange();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): FsSyncState {
  return state;
}

/**
 * Read the live watcher status for UI (e.g. the TopBar badge). Re-renders the
 * caller when the listener subscribes/unsubscribes or an event arrives.
 */
export function useFsSyncStatus(): FsSyncState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Mount once at the app root. When IS_TAURI, subscribes to "skl://fs-changed"
 * and invalidates the library/where/agents/config queries on each event.
 * Cleans up on unmount. No-op in the browser.
 */
export function useFsEventsSync(queryClient: QueryClient): void {
  useEffect(() => {
    if (!IS_TAURI) return;

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      // Dynamic import so the browser build never pulls Tauri IPC.
      const { listen } = await import("@tauri-apps/api/event");
      const stop = await listen(FS_CHANGED_EVENT, () => {
        setState({ lastTick: Date.now() });
        void queryClient.invalidateQueries({ queryKey: qk.library });
        void queryClient.invalidateQueries({ queryKey: qk.where });
        void queryClient.invalidateQueries({ queryKey: qk.agents });
        void queryClient.invalidateQueries({ queryKey: qk.config });
      });

      if (cancelled) {
        // Unmounted before listen() resolved (StrictMode double-invoke): drop it.
        stop();
        return;
      }
      unlisten = stop;
      setState({ active: true });
    })();

    return () => {
      cancelled = true;
      unlisten?.();
      setState({ active: false });
    };
  }, [queryClient]);
}
