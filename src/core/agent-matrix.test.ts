// Unit tests for the node-free shared fold (src/core/agent-matrix.ts) — the
// surface→agent→scope math shared by the engine and the app's browser fallback.
// Pure functions over synthetic DeploymentSites; no disk, no network.

import { test, expect, describe } from "bun:test";
import type { DeploymentSite } from "../types.ts";
import {
  agentIdForSurface,
  scopeForSurface,
  stateForSite,
  isAgentMatrixSurface,
  RANK,
  foldAgentMatrix,
} from "./agent-matrix.ts";

const HOME = "/home/u";
const IDS = ["claude", "codex", "cursor", "opencode", "gemini", "pi"] as const;

function site(p: Partial<DeploymentSite> & { name: string; surface: string }): DeploymentSite {
  return {
    name: p.name,
    surface: p.surface,
    path: p.path ?? `${p.surface}/${p.name}`,
    kind: p.kind ?? "linked",
    target: p.target ?? null,
    inLibrary: p.inLibrary ?? true,
    drift: p.drift ?? false,
  };
}

describe("agentIdForSurface honors `ids` ordering", () => {
  test("returns the FIRST matching id in the given order (custom precedence)", () => {
    // A surface that could match two ids: the caller's order decides the winner.
    const s = "/work/proj/.walrus/skills";
    expect(agentIdForSurface(s, ["walrus", "claude"])).toBe("walrus");
    // walrus not in the id set → no match (the engine never widened to it).
    expect(agentIdForSurface(s, ["claude", "codex"])).toBeNull();
  });
  test("matches segment, trailing dotdir, and trailing /skills", () => {
    expect(agentIdForSurface("/home/u/.claude/skills", IDS)).toBe("claude");
    expect(agentIdForSurface("/x/proj/.codex", IDS)).toBe("codex");
    expect(agentIdForSurface("/Volumes/x/foo/skills", IDS)).toBeNull();
  });
});

describe("scopeForSurface", () => {
  test("Global when directly under HOME", () => {
    expect(scopeForSurface("/home/u/.claude/skills", "claude", HOME)).toBe("Global");
  });
  test("project name when enclosed in a project dir", () => {
    expect(scopeForSurface("/work/infra-repo/.claude/skills", "claude", HOME)).toBe("infra-repo");
  });
  test("home=null never reads Global — falls back to the basename, no crash", () => {
    // The app's inferHome heuristic can miss; a null home must not throw and must
    // resolve a non-Global scope from the enclosing dir name.
    expect(scopeForSurface("/home/u/.claude/skills", "claude", null)).toBe("u");
    expect(scopeForSurface("/work/proj/.codex/skills", "codex", null)).toBe("proj");
  });
});

describe("stateForSite — the UNIFIED superset", () => {
  test("base kinds map as before", () => {
    expect(stateForSite(site({ name: "a", surface: "/s", kind: "linked" }))).toBe("clean");
    expect(stateForSite(site({ name: "a", surface: "/s", kind: "source" }))).toBe("source");
    expect(stateForSite(site({ name: "a", surface: "/s", kind: "copy", drift: false }))).toBe("copy");
    expect(stateForSite(site({ name: "a", surface: "/s", kind: "foreign-link" }))).toBe("copy");
    expect(stateForSite(site({ name: "a", surface: "/s", kind: "dead" }))).toBe("dead");
    expect(stateForSite(site({ name: "a", surface: "/s", kind: "aliased" }))).toBe("drift");
  });
  test("linked + drift -> drift (the app's surviving half of the merge)", () => {
    expect(stateForSite(site({ name: "a", surface: "/s", kind: "linked", drift: true }))).toBe("drift");
  });
  test("copy + drift -> drift (the engine's half — app gains this, was silently dropped)", () => {
    expect(stateForSite(site({ name: "a", surface: "/s", kind: "copy", drift: true }))).toBe("drift");
  });
});

describe("isAgentMatrixSurface", () => {
  test("excludes vendor_imports surfaces", () => {
    expect(isAgentMatrixSurface("/home/u/.codex/skills")).toBe(true);
    expect(isAgentMatrixSurface("/home/u/.codex/vendor_imports/skills/skills")).toBe(false);
  });
});

describe("foldAgentMatrix", () => {
  test("folds skill × agent × scope, strongest RANK wins on collision", () => {
    // Two sites collide on the SAME (skill, agent, scope): keep the stronger.
    const sites = [
      site({ name: "alpha", surface: "/home/u/.claude/skills", kind: "linked" }), // clean=1
      site({ name: "alpha", surface: "/home/u/.claude/skills", kind: "dead" }), // dead=5
    ];
    const m = foldAgentMatrix(sites, { home: HOME, agentIds: IDS });
    expect(RANK.dead).toBeGreaterThan(RANK.clean);
    expect(m.deployments.alpha!.claude!.g).toBe("dead");
  });

  test("buckets Global vs project scope; non-agent surfaces ignored", () => {
    const sites = [
      site({ name: "alpha", surface: "/home/u/.claude/skills", kind: "linked" }),
      site({ name: "alpha", surface: "/work/proj/.codex/skills", kind: "copy", drift: true }),
      site({ name: "gamma", surface: "/some/plain/skills", kind: "linked" }), // no agent
    ];
    const m = foldAgentMatrix(sites, { home: HOME, agentIds: IDS });
    expect(m.deployments.alpha!.claude!.g).toBe("clean");
    expect(m.deployments.alpha!.codex!.p!.proj).toBe("drift");
    expect(m.deployments.gamma).toBeUndefined();
    expect(m.scopes[0]).toBe("Global");
    expect(m.scopes).toContain("proj");
  });

  test("vendor_imports excluded, not RANK-collapsed into the global cell", () => {
    const sites = [
      site({ name: "x", surface: "/home/u/.codex/skills", kind: "linked" }),
      site({ name: "x", surface: "/home/u/.codex/vendor_imports/skills/skills", kind: "copy", drift: true }),
    ];
    const m = foldAgentMatrix(sites, { home: HOME, agentIds: IDS });
    // the real global link wins; the vendored drift copy is excluded.
    expect(m.deployments.x!.codex!.g).toBe("clean");
  });

  test("extraScopes union as scope rows with NO phantom deployments", () => {
    const sites = [site({ name: "alpha", surface: "/home/u/.claude/skills", kind: "linked" })];
    const m = foldAgentMatrix(sites, {
      home: HOME,
      agentIds: IDS,
      extraScopes: ["scratch", "webapp"],
    });
    expect(m.scopes).toContain("scratch");
    expect(m.scopes).toContain("webapp");
    // empty project scopes fabricate nothing — only the real Global link exists.
    expect(m.deployments.alpha!.claude!.g).toBe("clean");
    expect(m.deployments.alpha!.claude!.p).toBeUndefined();
  });

  test("home=null reads non-Global scopes without crashing", () => {
    const sites = [site({ name: "alpha", surface: "/work/proj/.codex/skills", kind: "linked" })];
    const m = foldAgentMatrix(sites, { home: null, agentIds: IDS });
    expect(m.deployments.alpha!.codex!.p!.proj).toBe("clean");
    // with no home, the ~/.claude/skills site is bucketed under its basename, not Global.
    const g = foldAgentMatrix(
      [site({ name: "beta", surface: "/home/u/.claude/skills", kind: "linked" })],
      { home: null, agentIds: IDS },
    );
    expect(g.deployments.beta!.claude!.g).toBeUndefined();
    expect(g.deployments.beta!.claude!.p!.u).toBe("clean");
  });

  test("custom-agent surface detected via a widened id set", () => {
    const sites = [site({ name: "x", surface: "/work/proj/.walrus/skills", kind: "linked" })];
    const m = foldAgentMatrix(sites, { home: HOME, agentIds: [...IDS, "walrus"] });
    expect(m.deployments.x!.walrus!.p!.proj).toBe("clean");
  });
});
