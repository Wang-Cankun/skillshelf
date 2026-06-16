// Unit tests for the override-aware three-state cell resolver (ADR-0010
// inheritance). Pure functions over synthetic AgentsReports — no DOM, so they
// run under `bun test` from the repo root alongside the engine suite.
//
// Focus: cellStateWithOverride must honour BOTH optimistic overrides so a
// just-pinned/just-unpinned cell flips immediately instead of lagging the
// un-refetched report. The "off" path is the regression guard (a stale report
// state must not resurface as `pinned` after an unpin).

import { test, expect, describe } from "bun:test";
import type { AgentInfo, AgentsReport, DeployStateName } from "./types.ts";
import { cellStateWithOverride, effectiveCounts, cellStateFor } from "./agents.ts";

function agent(p: Partial<AgentInfo> & { id: string }): AgentInfo {
  return {
    id: p.id,
    name: p.name ?? p.id,
    short: p.short ?? p.id,
    global: p.global ?? `~/.${p.id}/skills`,
    projConvention: p.projConvention ?? `.${p.id}/skills`,
    installed: p.installed ?? true,
    inheritsGlobal: p.inheritsGlobal ?? true,
    custom: p.custom,
  };
}

/** Build a one-skill, one-agent report with given global + project states. */
function report(
  a: AgentInfo,
  states: { g?: DeployStateName; p?: Record<string, DeployStateName> },
  scopes: string[] = ["Global", "Proj"],
): AgentsReport {
  return {
    agents: [a],
    scopes,
    deployments: { s: { [a.id]: { g: states.g, p: states.p } } },
  };
}

const KEY = "s|claude|Proj";

describe("cellStateWithOverride — 'on' override (optimistic PIN)", () => {
  test("absent cell reads pinned immediately", () => {
    const a = agent({ id: "claude" });
    const r = report(a, {});
    expect(cellStateWithOverride(r, {}, "s", "claude", "Proj", a)).toBe("absent");
    expect(cellStateWithOverride(r, { [KEY]: "on" }, "s", "claude", "Proj", a)).toBe(
      "pinned",
    );
  });
});

describe("cellStateWithOverride — 'off' override (optimistic UNPIN)", () => {
  test("pinned project cell flips off immediately (no stale pinned)", () => {
    // Non-inheriting agent: the floor after unpin is plain absent.
    const a = agent({ id: "claude", inheritsGlobal: false });
    const r = report(a, { g: "clean", p: { Proj: "clean" } });
    // Without the override the stale report still reads pinned…
    expect(cellStateWithOverride(r, {}, "s", "claude", "Proj", a)).toBe("pinned");
    // …with the "off" override it must NOT resurface that stale pinned.
    expect(cellStateWithOverride(r, { [KEY]: "off" }, "s", "claude", "Proj", a)).toBe(
      "absent",
    );
  });

  test("inheriting agent w/ clean Global drops back to inherited, not absent", () => {
    const a = agent({ id: "claude", inheritsGlobal: true });
    const r = report(a, { g: "clean", p: { Proj: "clean" } });
    expect(cellStateWithOverride(r, {}, "s", "claude", "Proj", a)).toBe("pinned");
    // Skill is still active here via Global → inherited, never stale pinned.
    expect(cellStateWithOverride(r, { [KEY]: "off" }, "s", "claude", "Proj", a)).toBe(
      "inherited",
    );
  });

  test("Global scope 'off' override floors to absent", () => {
    const a = agent({ id: "claude" });
    const r = report(a, { g: "clean" });
    const gkey = "s|claude|Global";
    expect(cellStateWithOverride(r, { [gkey]: "off" }, "s", "claude", "Global", a)).toBe(
      "absent",
    );
  });

  test("unset cell with active Global still surfaces inherited (no override)", () => {
    const a = agent({ id: "claude", inheritsGlobal: true });
    const r = report(a, { g: "clean" });
    expect(cellStateWithOverride(r, {}, "s", "claude", "Proj", a)).toBe("inherited");
  });
});

describe("cellStateFor — inheritance edge cases", () => {
  test("non-inheriting agent with global-only deployment returns absent in project scope", () => {
    // inheritsGlobal=false: even though global is clean, no project pin → absent (not inherited)
    const a = agent({ id: "claude", inheritsGlobal: false });
    const r = report(a, { g: "clean" });
    expect(cellStateFor(r, "s", "claude", "Proj", a)).toBe("absent");
  });

  test("project anomaly (drift) takes precedence over inherited", () => {
    // inheritsGlobal=true + global active + project has drift → returns 'drift', not 'inherited'
    const a = agent({ id: "claude", inheritsGlobal: true });
    const r = report(a, { g: "clean", p: { Proj: "drift" } });
    expect(cellStateFor(r, "s", "claude", "Proj", a)).toBe("drift");
  });

  test("project anomaly (copy) takes precedence over inherited", () => {
    const a = agent({ id: "claude", inheritsGlobal: true });
    const r = report(a, { g: "clean", p: { Proj: "copy" } });
    expect(cellStateFor(r, "s", "claude", "Proj", a)).toBe("copy");
  });

  test("inheriting agent with global-active + no project pin returns inherited in project scope", () => {
    const a = agent({ id: "claude", inheritsGlobal: true });
    const r = report(a, { g: "clean" });
    expect(cellStateFor(r, "s", "claude", "Proj", a)).toBe("inherited");
  });

  test("inheriting agent with global-active in Global scope does NOT return inherited", () => {
    // Global scope: returns the raw global state, not 'inherited'
    const a = agent({ id: "claude", inheritsGlobal: true });
    const r = report(a, { g: "clean" });
    const state = cellStateFor(r, "s", "claude", "Global", a);
    expect(state).not.toBe("inherited");
    expect(state).toBe("clean");
  });
});

describe("effectiveCounts stays consistent with the cell after unpin", () => {
  test("unpinning a pinned inherited cell keeps it counted as inherited", () => {
    const a = agent({ id: "claude", inheritsGlobal: true });
    const r = report(a, { g: "clean", p: { Proj: "clean" } });
    const before = effectiveCounts(r, [a], "Proj", [{ name: "s" }], {});
    expect(before.claude).toEqual({ pinned: 1, inherited: 0, effective: 1 });
    const after = effectiveCounts(r, [a], "Proj", [{ name: "s" }], { [KEY]: "off" });
    // pinned→inherited: still effectively active, breakdown shifts.
    expect(after.claude).toEqual({ pinned: 0, inherited: 1, effective: 1 });
  });

  test("unpinning a non-inheriting agent's cell drops it from effective", () => {
    const a = agent({ id: "claude", inheritsGlobal: false });
    const r = report(a, { g: "clean", p: { Proj: "clean" } });
    const after = effectiveCounts(r, [a], "Proj", [{ name: "s" }], { [KEY]: "off" });
    expect(after.claude).toEqual({ pinned: 0, inherited: 0, effective: 0 });
  });
});
