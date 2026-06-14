// UI + optimistic state for the Workbench (ADR-0008). A useReducer + context
// (the deferred-Zustand decision in §0): view/filter/sort/group/selection/
// matrix-mode/scope live here, as do the OPTIMISTIC overrides (deploy toggles,
// retired, removed tags, hard-removed) that the command layer applies before a
// real `skl` verb confirms — and rolls back on error. Server truth itself lives
// in TanStack Query (queries.ts); selectors merge the two.

import {
  createContext,
  useContext,
  useReducer,
  type ReactNode,
  type Dispatch,
} from "react";

export type View = "inbox" | "matrix" | "library";
export type SortKey = "modified" | "name" | "domain" | "deploys";
export type SortDir = "asc" | "desc";
export type GroupMode = "list" | "domain" | "family";
export type MatrixMode = "domain" | "agent";
export type DrawerTab = "rendered" | "raw" | "expl";

export type Filter =
  | { kind: "source"; value: "vendored" | "local" }
  | { kind: "domain"; value: string }
  | { kind: "untagged" }
  | null;

export interface Toast {
  msg: string;
  cmd: string;
  /** present = the toast offers Undo; absent/null = no-undo (hard Remove). */
  undo?: (() => void) | null;
}

export interface State {
  view: View;
  filter: Filter;
  search: string;
  sort: SortKey;
  sortDir: SortDir;
  group: GroupMode;
  selected: Record<string, boolean>;
  matrixMode: MatrixMode;
  scope: string;
  dryRun: boolean;

  // optimistic overrides (rolled back on mutation error)
  deployOverrides: Record<string, "on" | "off">; // `${skill}|${agent}|${scope}`
  retired: Record<string, boolean>;
  removedTags: Record<string, string[]>;
  removedHard: Record<string, boolean>;

  // drawer
  drawer: string | null;
  drawerTab: DrawerTab;
  drawerFile: string;

  // global affordances
  toast: Toast | null;
  confirm: { name: string } | null;
  confirmText: string;
  error: string | null;
}

export const initialState: State = {
  view: "inbox",
  filter: null,
  search: "",
  sort: "modified",
  sortDir: "desc",
  group: "list",
  selected: {},
  matrixMode: "domain",
  scope: "Global",
  dryRun: false,
  deployOverrides: {},
  retired: {},
  removedTags: {},
  removedHard: {},
  drawer: null,
  drawerTab: "rendered",
  drawerFile: "SKILL.md",
  toast: null,
  confirm: null,
  confirmText: "",
  error: null,
};

export type Action =
  | { type: "setView"; view: View }
  | { type: "setFilter"; filter: Filter; view?: View }
  | { type: "setSearch"; search: string }
  | { type: "setSort"; sort: SortKey }
  | { type: "toggleSortDir" }
  | { type: "setGroup"; group: GroupMode }
  | { type: "toggleSelect"; name: string }
  | { type: "clearSelection" }
  | { type: "setMatrixMode"; mode: MatrixMode }
  | { type: "setScope"; scope: string }
  | { type: "toggleDryRun" }
  | { type: "setDeployOverride"; key: string; value: "on" | "off" }
  | { type: "clearDeployOverride"; key: string }
  | { type: "setRetired"; names: string[]; value: boolean }
  | { type: "addRemovedTag"; name: string; domain: string }
  | { type: "removeRemovedTag"; name: string; domain: string }
  | { type: "setRemovedHard"; name: string; value: boolean }
  | { type: "openDrawer"; name: string }
  | { type: "closeDrawer" }
  | { type: "setDrawerTab"; tab: DrawerTab }
  | { type: "setDrawerFile"; file: string }
  | { type: "showToast"; toast: Toast }
  | { type: "hideToast" }
  | { type: "askConfirm"; name: string }
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
    case "setView":
      return { ...state, view: action.view };
    case "setFilter":
      return {
        ...state,
        filter: action.filter,
        view: action.view ?? "library",
      };
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
    case "clearSelection":
      return { ...state, selected: {} };
    case "setMatrixMode":
      return { ...state, matrixMode: action.mode };
    case "setScope":
      return { ...state, scope: action.scope };
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
    case "showToast":
      return { ...state, toast: action.toast };
    case "hideToast":
      return { ...state, toast: null };
    case "askConfirm":
      return { ...state, confirm: { name: action.name }, confirmText: "" };
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
