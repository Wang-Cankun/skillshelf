// Unit tests for the pure library selectors (aggregates + libraryView), focused
// on the Retired view contract (decision #3/#10). Pure functions over synthetic
// Skill[] — no DOM, so they run under `bun test` from the repo root.
//
// Focus: live views EXCLUDE retired rows; the {kind:"retired"} filter shows ONLY
// retired rows; the optimistic `retired`/`unretired` overrides flip a row between
// the two sets immediately; and aggregates().retired counts server-retired rows.

import { test, expect, describe } from "bun:test";
import type { Skill } from "./types.ts";
import type { Filter } from "../state/store.ts";
import { aggregates, libraryView } from "./select.ts";

function skill(p: Partial<Skill> & { name: string }): Skill {
  return {
    name: p.name,
    description: p.description ?? `desc for ${p.name}`,
    primaryDomain: p.primaryDomain ?? (p.domains?.[0] ?? null),
    domains: p.domains ?? [],
    path: p.path ?? `/lib/${p.name}`,
    retired: p.retired ?? false,
    mode: p.mode ?? "owned",
    linkTarget: p.linkTarget ?? null,
    source: p.source ?? "local",
    deployCount: p.deployCount ?? 0,
  };
}

/** Defaults for the libraryView opts so tests vary only what they assert. */
function view(
  skills: Skill[],
  o: Partial<Parameters<typeof libraryView>[1]> = {},
) {
  return libraryView(skills, {
    filter: o.filter ?? null,
    search: o.search ?? "",
    sort: o.sort ?? "name",
    sortDir: o.sortDir ?? "asc",
    group: o.group ?? "list",
    retired: o.retired ?? {},
    unretired: o.unretired ?? {},
    removedHard: o.removedHard ?? {},
    needsNames: o.needsNames ?? null,
  });
}

/** Flatten a LibraryView's buckets to the set of row names it contains. */
function names(v: ReturnType<typeof libraryView>): string[] {
  return v.buckets.flatMap((b) => b.rows.map((r) => r.name)).sort();
}

const RETIRED_FILTER: Filter = { kind: "retired" };

const fixture: Skill[] = [
  skill({ name: "live-a", domains: ["web"], source: "local" }),
  skill({ name: "live-b", domains: ["data"], source: "vendored" }),
  skill({ name: "old-a", retired: true, domains: ["web"] }),
  skill({ name: "old-b", retired: true, domains: ["docs"] }),
];

describe("aggregates().retired", () => {
  test("counts server-retired skills; live counts ignore them", () => {
    const agg = aggregates(fixture);
    expect(agg.retired).toBe(2);
    // total/vendored/local/untagged are computed over the live (non-retired) set.
    expect(agg.total).toBe(2);
    expect(agg.vendored).toBe(1);
    expect(agg.local).toBe(1);
  });

  test("zero when nothing is retired", () => {
    expect(aggregates([skill({ name: "x" })]).retired).toBe(0);
  });
});

describe("libraryView — live views exclude retired", () => {
  test("default (null) filter shows only live rows", () => {
    expect(names(view(fixture))).toEqual(["live-a", "live-b"]);
  });

  test("a domain filter never surfaces a retired row sharing that domain", () => {
    // old-a is retired AND tagged web — it must stay out of the live web view.
    const v = view(fixture, { filter: { kind: "domain", value: "web" } });
    expect(names(v)).toEqual(["live-a"]);
  });
});

describe("libraryView — retired view shows only retired", () => {
  test("{kind:'retired'} returns exactly the retired rows", () => {
    expect(names(view(fixture, { filter: RETIRED_FILTER }))).toEqual([
      "old-a",
      "old-b",
    ]);
  });

  test("search still applies within the retired view", () => {
    const v = view(fixture, { filter: RETIRED_FILTER, search: "old-a" });
    expect(names(v)).toEqual(["old-a"]);
  });
});

describe("libraryView — optimistic overrides", () => {
  test("optimistic retire[name] moves a live skill into the retired view", () => {
    const retired = { "live-a": true };
    expect(names(view(fixture, { retired }))).toEqual(["live-b"]);
    expect(names(view(fixture, { filter: RETIRED_FILTER, retired }))).toEqual([
      "live-a",
      "old-a",
      "old-b",
    ]);
  });

  test("optimistic unretire promotes a server-retired skill back to live", () => {
    const unretired = { "old-a": true };
    // old-a reappears in the live view…
    expect(names(view(fixture, { unretired }))).toEqual([
      "live-a",
      "live-b",
      "old-a",
    ]);
    // …and drops out of the retired view.
    expect(
      names(view(fixture, { filter: RETIRED_FILTER, unretired })),
    ).toEqual(["old-b"]);
  });

  test("removedHard is excluded from both live and retired views", () => {
    const removedHard = { "old-a": true, "live-a": true };
    expect(names(view(fixture, { removedHard }))).toEqual(["live-b"]);
    expect(
      names(view(fixture, { filter: RETIRED_FILTER, removedHard })),
    ).toEqual(["old-b"]);
  });
});
