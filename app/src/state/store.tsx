// UI + optimistic state for the Workbench (ADR-0008/0010). A useReducer +
// context (the deferred-Zustand decision in §0). ADR-0010 collapses the old
// three-tab `view` shell into a single library list sliced by `scope` (Global
// or a project) and `range` (installed-here vs all). The Matrix is retired and
// the Inbox is folded into the left-rail `{kind:"needs"}` filter. The OPTIMISTIC
// overrides (deploy toggles, retired, removed tags, hard-removed) the command
// layer applies before a real `skl` verb confirms — and rolls back on error —
// stay here. Server truth itself lives in TanStack Query (queries.ts); selectors
// merge the two.

import {
  createContext,
  useContext,
  useReducer,
  type ReactNode,
  type Dispatch,
} from "react";
import type { DeployStateName } from "../lib/types";

// ── Scope (ADR-0010 §2/§5) — replaces `view`. "Global" or a project; the GUI
//    keys scopes by the ABSOLUTE project path (RISK 4) and displays a basename.
//    For Global, scope === "Global" and scopePath is null.
export const GLOBAL_SCOPE = "Global";
// ── Range (ADR-0010 §10) — the project view's "Installed here ↔ All skills".
export type Range = "installed" | "all";
export type SortKey = "name" | "attention" | "deployed";
export type SortDir = "asc" | "desc";
export type GroupMode = "list" | "domain" | "family";
export type DrawerTab = "rendered" | "raw" | "expl";
/** Bulk bar mode (delta 2): enable links, remove unlinks (destructive tint). */
export type BulkMode = "enable" | "remove";

export type Filter =
  | { kind: "source"; value: "vendored" | "local" }
  | { kind: "domain"; value: string }
  | { kind: "untagged" }
  // ADR-0010 §6 — the demoted Inbox becomes a smart filter ("Needs attention").
  | { kind: "needs" }
  // Retired view — shows ONLY retired skills; every other filter excludes them.
  | { kind: "retired" }
  | null;

/** An open anomaly-resolution request (delta 3 / ADR-0010 §4 part c). Set when a
 *  warning-glyph cell is clicked; ResolvePopover renders off it. `scopePath` is
 *  the absolute project dir for project scopes (null for Global). */
export interface ResolveTarget {
  skill: string;
  agent: string;
  scope: string;
  scopePath: string | null;
  state: DeployStateName;
  /** true when this `drift` cell is really an `aliased` site (wrong deploy name).
   *  The matrix folds aliased→drift; this carries the pre-fold distinction so
   *  ResolvePopover can offer "Realign name" (delta 3-c). `aliasTarget` is the
   *  library skill the alias points at, for the realign command. */
  aliased?: boolean;
  aliasTarget?: string | null;
  /** on-disk path of the standalone `copy` site (recovered via copySiteFor), so
   *  ResolvePopover can run real `skl link --at <path>` / `skl import --from
   *  <path>` verbs for the copy anomaly (Bug 1). null/absent when unknown. */
  copyPath?: string | null;
}

/** An open "active via Global" info+action request (ADR-0010 inheritance §3).
 *  Set when an INHERITED cell is clicked. InheritedPopover renders off it. Unlike
 *  a pinned/absent cell, an inherited cell is NOT a toggle — you cannot locally
 *  disable a global skill — so this opens an info popover with explicit choices
 *  ("Pin to this project" / "Manage in Global") instead of flipping a symlink.
 *  `scopePath` is the absolute project dir (never null here — inheritance is a
 *  project-only notion, so scope !== Global). */
export interface InheritedTarget {
  skill: string;
  agent: string;
  scope: string;
  scopePath: string | null;
}

export interface Toast {
  msg: string;
  cmd: string;
  /** present = the toast offers Undo; absent/null = no-undo (hard Remove). */
  undo?: (() => void) | null;
}

export interface State {
  // ── navigation (ADR-0010) ──────────────────────────────────────────────
  /** active scope: "Global" or a project basename; identity is `scopePath`. */
  scope: string;
  /** absolute project dir for the active scope (null when scope === Global). */
  scopePath: string | null;
  /** project view range; ignored for Global (always the full library). */
  range: Range;

  filter: Filter;
  search: string;
  sort: SortKey;
  sortDir: SortDir;
  group: GroupMode;
  selected: Record<string, boolean>;
  /** bulk-bar intent (delta 2); the bar shows when `selected` is non-empty. */
  bulkMode: BulkMode;
  dryRun: boolean;

  // optimistic overrides (rolled back on mutation error)
  deployOverrides: Record<string, "on" | "off">; // `${skill}|${agent}|${scope}`
  retired: Record<string, boolean>;
  /** optimistic "promote back to live" — set true while an `unretire` is in
   *  flight so a server-retired skill reappears in live views immediately. */
  unretired: Record<string, boolean>;
  removedTags: Record<string, string[]>;
  removedHard: Record<string, boolean>;

  // drawer
  drawer: string | null;
  drawerTab: DrawerTab;
  drawerFile: string;

  // anomaly-resolution popover (delta 3 part c)
  resolve: ResolveTarget | null;

  // "active via Global" inherited-cell popover (ADR-0010 inheritance §3)
  inherited: InheritedTarget | null;

  // global affordances
  toast: Toast | null;
  /** open type-to-confirm hard-remove request. `name` is the primary/display
   *  skill; `names` (when present) carries the full set for a BULK remove so
   *  RemoveModal can loop `hardRemove` over them. Single-name removes omit
   *  `names` and stay backward-compatible (consumers fall back to `[name]`). */
  confirm: { name: string; names?: string[] } | null;
  confirmText: string;
  error: string | null;
}

export const initialState: State = {
  scope: GLOBAL_SCOPE,
  scopePath: null,
  range: "installed",
  filter: null,
  search: "",
  sort: "name",
  sortDir: "asc",
  group: "list",
  selected: {},
  bulkMode: "enable",
  dryRun: false,
  deployOverrides: {},
  retired: {},
  unretired: {},
  removedTags: {},
  removedHard: {},
  drawer: null,
  drawerTab: "rendered",
  drawerFile: "SKILL.md",
  resolve: null,
  inherited: null,
  toast: null,
  confirm: null,
  confirmText: "",
  error: null,
};

export type Action =
  // navigation
  | { type: "setScope"; scope: string; scopePath?: string | null }
  | { type: "setRange"; range: Range }
  | { type: "setFilter"; filter: Filter }
  | { type: "setSearch"; search: string }
  | { type: "setSort"; sort: SortKey }
  | { type: "toggleSortDir" }
  | { type: "setGroup"; group: GroupMode }
  // selection + bulk
  | { type: "toggleSelect"; name: string }
  | { type: "setSelectedMany"; names: string[]; value: boolean }
  | { type: "clearSelection" }
  | { type: "setBulkMode"; mode: BulkMode }
  | { type: "toggleDryRun" }
  // optimistic overrides
  | { type: "setDeployOverride"; key: string; value: "on" | "off" }
  | { type: "clearDeployOverride"; key: string }
  | { type: "setRetired"; names: string[]; value: boolean }
  | { type: "setUnretired"; names: string[]; value: boolean }
  | { type: "addRemovedTag"; name: string; domain: string }
  | { type: "removeRemovedTag"; name: string; domain: string }
  | { type: "setRemovedHard"; name: string; value: boolean }
  // drawer
  | { type: "openDrawer"; name: string }
  | { type: "closeDrawer" }
  | { type: "setDrawerTab"; tab: DrawerTab }
  | { type: "setDrawerFile"; file: string }
  // resolve flow
  | { type: "openResolve"; target: ResolveTarget }
  | { type: "closeResolve" }
  | { type: "applyResolve" }
  // inherited-cell info popover
  | { type: "openInherited"; target: InheritedTarget }
  | { type: "closeInherited" }
  // global affordances
  | { type: "showToast"; toast: Toast }
  | { type: "hideToast" }
  | { type: "askConfirm"; name: string; names?: string[] }
  | { type: "cancelConfirm" }
  | { type: "setConfirmText"; text: string }
  | { type: "setError"; error: string | null };

function withKey<T>(obj: Record<string, T>, key: string, value: T) {
  return { ...obj, [key]: value };
}
function withoutKey<T>(obj: Record<string, T>, key: string) {
  const next = { ...obj };
  delete next[key];
  return next;
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "setScope":
      // Switching scope clears selection + filter (ADR-0010 integration sweep):
      // a project's row set + smart filters don't carry across scopes.
      return {
        ...state,
        scope: action.scope,
        scopePath:
          action.scope === GLOBAL_SCOPE ? null : action.scopePath ?? null,
        // Global is always the full library; projects default to "installed".
        range: action.scope === GLOBAL_SCOPE ? "all" : "installed",
        selected: {},
        filter: null,
      };
    case "setRange":
      return { ...state, range: action.range };
    case "setFilter":
      return { ...state, filter: action.filter };
    case "setSearch":
      return { ...state, search: action.search };
    case "setSort":
      return { ...state, sort: action.sort };
    case "toggleSortDir":
      return { ...state, sortDir: state.sortDir === "desc" ? "asc" : "desc" };
    case "setGroup":
      return { ...state, group: action.group };
    case "toggleSelect":
      return {
        ...state,
        selected: withKey(
          state.selected,
          action.name,
          !state.selected[action.name],
        ),
      };
    case "setSelectedMany": {
      const selected = { ...state.selected };
      for (const n of action.names) {
        if (action.value) selected[n] = true;
        else delete selected[n];
      }
      return { ...state, selected };
    }
    case "clearSelection":
      return { ...state, selected: {} };
    case "setBulkMode":
      return { ...state, bulkMode: action.mode };
    case "toggleDryRun":
      return { ...state, dryRun: !state.dryRun };
    case "setDeployOverride":
      return {
        ...state,
        deployOverrides: withKey(
          state.deployOverrides,
          action.key,
          action.value,
        ),
      };
    case "clearDeployOverride":
      return {
        ...state,
        deployOverrides: withoutKey(state.deployOverrides, action.key),
      };
    case "setRetired": {
      const retired = { ...state.retired };
      for (const n of action.names) {
        if (action.value) retired[n] = true;
        else delete retired[n];
      }
      return { ...state, retired };
    }
    case "setUnretired": {
      const unretired = { ...state.unretired };
      for (const n of action.names) {
        if (action.value) unretired[n] = true;
        else delete unretired[n];
      }
      return { ...state, unretired };
    }
    case "addRemovedTag": {
      const cur = state.removedTags[action.name] ?? [];
      return {
        ...state,
        removedTags: withKey(state.removedTags, action.name, [
          ...cur,
          action.domain,
        ]),
      };
    }
    case "removeRemovedTag": {
      const cur = state.removedTags[action.name] ?? [];
      return {
        ...state,
        removedTags: withKey(
          state.removedTags,
          action.name,
          cur.filter((d) => d !== action.domain),
        ),
      };
    }
    case "setRemovedHard":
      return action.value
        ? {
            ...state,
            removedHard: withKey(state.removedHard, action.name, true),
            drawer: state.drawer === action.name ? null : state.drawer,
          }
        : { ...state, removedHard: withoutKey(state.removedHard, action.name) };
    case "openDrawer":
      return {
        ...state,
        drawer: action.name,
        drawerFile: "SKILL.md",
        drawerTab: "rendered",
      };
    case "closeDrawer":
      return { ...state, drawer: null };
    case "setDrawerTab":
      return { ...state, drawerTab: action.tab };
    case "setDrawerFile":
      return { ...state, drawerFile: action.file };
    case "openResolve":
      return { ...state, resolve: action.target };
    case "closeResolve":
    case "applyResolve":
      // applyResolve just closes the popover; the command layer runs the chosen
      // verb (or echoes a deferred one). It never blind-toggles (ADR-0010 §4).
      return { ...state, resolve: null };
    case "openInherited":
      return { ...state, inherited: action.target };
    case "closeInherited":
      return { ...state, inherited: null };
    case "showToast":
      return { ...state, toast: action.toast };
    case "hideToast":
      return { ...state, toast: null };
    case "askConfirm":
      return {
        ...state,
        confirm: { name: action.name, names: action.names },
        confirmText: "",
      };
    case "cancelConfirm":
      return { ...state, confirm: null, confirmText: "" };
    case "setConfirmText":
      return { ...state, confirmText: action.text };
    case "setError":
      return { ...state, error: action.error };
    default:
      return state;
  }
}

const StoreContext = createContext<{
  state: State;
  dispatch: Dispatch<Action>;
} | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <StoreContext.Provider value={{ state, dispatch }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
