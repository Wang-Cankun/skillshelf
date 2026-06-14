// Pure selectors over the real library — sidebar aggregates + the Library
// tab's filter/sort/group pipeline (ADR-0008 §3/§4). Hand-rolled per §0
// (TanStack Table deferred until 1000s of rows); the 113-row library is fine.

import type { Skill } from "./types";
import type { Filter, SortKey, SortDir, GroupMode } from "../state/store";

export interface Aggregates {
  total: number;
  vendored: number;
  local: number;
  untagged: number;
  /** domain -> count, sorted desc by count */
  domains: { domain: string; count: number }[];
  domainMax: number;
}

export function aggregates(skills: Skill[]): Aggregates {
  const live = skills.filter((s) => !s.retired);
  let vendored = 0;
  let local = 0;
  let untagged = 0;
  const dc = new Map<string, number>();
  for (const s of live) {
    if (s.source === "vendored") vendored++;
    else local++;
    if (s.domains.length === 0) untagged++;
    for (const d of s.domains) dc.set(d, (dc.get(d) ?? 0) + 1);
  }
  const domains = [...dc.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain));
  const domainMax = domains.reduce((m, d) => Math.max(m, d.count), 0);
  return { total: live.length, vendored, local, untagged, domains, domainMax };
}

function matchesFilter(s: Skill, filter: Filter): boolean {
  if (!filter) return true;
  if (filter.kind === "source") return (s.source ?? "local") === filter.value;
  if (filter.kind === "domain") return s.domains.includes(filter.value);
  if (filter.kind === "untagged") return s.domains.length === 0;
  return true;
}

function matchesSearch(s: Skill, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    s.name.toLowerCase().includes(needle) ||
    s.description.toLowerCase().includes(needle) ||
    s.domains.some((d) => d.toLowerCase().includes(needle))
  );
}

function primary(s: Skill): string {
  return s.primaryDomain ?? s.domains[0] ?? "_unclassified";
}

function compare(a: Skill, b: Skill, key: SortKey, dir: SortDir): number {
  const sign = dir === "desc" ? -1 : 1;
  let x: string | number;
  let y: string | number;
  if (key === "name") {
    x = a.name;
    y = b.name;
  } else if (key === "domain") {
    x = primary(a);
    y = primary(b);
  } else if (key === "deploys") {
    x = a.deployCount ?? 0;
    y = b.deployCount ?? 0;
  } else {
    // modified — null/untracked always sorts last regardless of direction.
    if (!a.modifiedAt && !b.modifiedAt) return a.name < b.name ? -1 : 1;
    if (!a.modifiedAt) return 1;
    if (!b.modifiedAt) return -1;
    x = a.modifiedAt;
    y = b.modifiedAt;
  }
  // Apply direction to the primary key; keep the name tie-break always asc.
  if (x < y) return -1 * sign;
  if (x > y) return 1 * sign;
  return a.name < b.name ? -1 : 1;
}

export interface LibraryBucket {
  label: string;
  hasLabel: boolean;
  count: number;
  rows: Skill[];
}

export interface LibraryView {
  count: number;
  buckets: LibraryBucket[];
}

export function libraryView(
  skills: Skill[],
  opts: {
    filter: Filter;
    search: string;
    sort: SortKey;
    sortDir: SortDir;
    group: GroupMode;
    retired: Record<string, boolean>;
    removedHard: Record<string, boolean>;
  },
): LibraryView {
  let rows = skills.filter(
    (s) =>
      !s.retired &&
      !opts.retired[s.name] &&
      !opts.removedHard[s.name] &&
      matchesFilter(s, opts.filter) &&
      matchesSearch(s, opts.search),
  );
  const count = rows.length;
  rows = rows.slice().sort((a, b) => compare(a, b, opts.sort, opts.sortDir));

  let buckets: LibraryBucket[];
  if (opts.group === "domain") {
    const m = new Map<string, Skill[]>();
    for (const r of rows) {
      const g = primary(r) || "_unclassified";
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(r);
    }
    buckets = [...m.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([label, rs]) => ({
        label,
        hasLabel: true,
        count: rs.length,
        rows: rs,
      }));
  } else if (opts.group === "family") {
    const m = new Map<string, Skill[]>();
    for (const r of rows) {
      const g = r.name.split("-")[0];
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(r);
    }
    buckets = [...m.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([label, rs]) => ({
        label: `${label}-*`,
        hasLabel: true,
        count: rs.length,
        rows: rs,
      }));
  } else {
    buckets = [{ label: "", hasLabel: false, count: rows.length, rows }];
  }
  return { count, buckets };
}

export function filterLabel(filter: Filter): string {
  if (!filter) return "";
  if (filter.kind === "domain") return filter.value;
  if (filter.kind === "source")
    return filter.value === "vendored" ? "vendored" : "local";
  return "untagged";
}
