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
  /** count of server-retired skills — drives the "🗄 Retired" smart row. */
  retired: number;
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
  const retired = skills.reduce((n, s) => (s.retired ? n + 1 : n), 0);
  return { total: live.length, vendored, local, untagged, retired, domains, domainMax };
}

function matchesFilter(
  s: Skill,
  filter: Filter,
  needsNames: Set<string> | null,
): boolean {
  if (!filter) return true;
  if (filter.kind === "source") return (s.source ?? "local") === filter.value;
  if (filter.kind === "domain") return s.domains.includes(filter.value);
  if (filter.kind === "untagged") return s.domains.length === 0;
  // `needs` (ADR-0010 §6, the folded Inbox) needs the deployment feed, which this
  // pure Skill-only selector can't see — the caller computes the source-of-truth
  // `needsAttentionNames` set and passes it in, so the pipeline filters by the
  // SAME predicate the sidebar badge counts (Bug 3). No `where` → empty set.
  if (filter.kind === "needs") return needsNames?.has(s.name) ?? false;
  // `retired` is a row-SET selector (handled by the retired predicate in
  // libraryView, which inverts the live exclusion); it imposes no extra
  // per-skill column filter here, so match everything.
  if (filter.kind === "retired") return true;
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
  if (key === "deployed") {
    // deployment breadth — how many surfaces this skill is on.
    x = a.deployCount ?? 0;
    y = b.deployCount ?? 0;
  } else if (key === "attention") {
    // ADR-0010 sort by "needs attention". Anomaly state lives in the agents
    // report, not on Skill, so this pure selector can only tie-break by name;
    // S3's list pipeline reorders by real anomaly weight before render.
    x = a.name;
    y = b.name;
  } else {
    // "name" (default).
    x = a.name;
    y = b.name;
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
    /** optimistic "promote back to live" override (decision #3/#7): an
     *  unretired skill drops out of the Retired view and reappears in live
     *  views immediately, before the refetch confirms. */
    unretired: Record<string, boolean>;
    removedHard: Record<string, boolean>;
    /** source-of-truth set for the `{kind:"needs"}` filter (ADR-0010 §6). null
     *  when the deployment feed isn't loaded yet → the needs filter matches none. */
    needsNames?: Set<string> | null;
  },
): LibraryView {
  // A row is "retired" when server truth or the optimistic retire override says
  // so, UNLESS an optimistic unretire promotes it back (decision #3). removedHard
  // is always excluded everywhere.
  const isRetired = (s: Skill) =>
    (s.retired || opts.retired[s.name]) && !opts.unretired[s.name];
  const wantRetired = opts.filter?.kind === "retired";
  let rows = skills.filter(
    (s) =>
      !opts.removedHard[s.name] &&
      // retired view: ONLY retired rows; every other filter: EXCLUDE retired.
      (wantRetired ? isRetired(s) : !isRetired(s)) &&
      matchesFilter(s, opts.filter, opts.needsNames ?? null) &&
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
  } else if (opts.group === "vendor") {
    // Group vendored rows by their upstream owner/repo; everything else (local
    // and unattributed) falls into one "local" bucket. The SkillList header
    // hangs a per-vendor "Update" action off each github-vendored bucket.
    const m = new Map<string, Skill[]>();
    for (const r of rows) {
      const g = r.source === "vendored" && r.origin ? r.origin : "local";
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(r);
    }
    buckets = [...m.entries()]
      .sort((a, b) =>
        // local bucket last; otherwise larger vendors first
        a[0] === "local" ? 1 : b[0] === "local" ? -1 : b[1].length - a[1].length,
      )
      .map(([label, rs]) => ({
        label,
        hasLabel: true,
        count: rs.length,
        rows: rs,
      }));
  } else {
    buckets = [{ label: "", hasLabel: false, count: rows.length, rows }];
  }
  return { count, buckets };
}

/** Every domain currently in use across the live library, sorted. The real
 *  selectable tag set — drives the tag/filter pickers (no fabricated domains). */
export function allDomains(skills: Skill[]): string[] {
  const set = new Set<string>();
  for (const s of skills) {
    if (s.retired) continue;
    for (const d of s.domains) set.add(d);
  }
  return [...set].sort();
}

export function filterLabel(filter: Filter): string {
  if (!filter) return "";
  if (filter.kind === "domain") return filter.value;
  if (filter.kind === "source")
    return filter.value === "vendored" ? "vendored" : "local";
  return "untagged";
}
