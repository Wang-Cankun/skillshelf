// Unit tests for the agent deployment matrix + deploy-target parsing (ADR-0008
// §7.3/§7.4). Pure functions over synthetic DeploymentReports — no disk needed
// (a fake $HOME keeps `installed` deterministic).

import { test, expect, describe } from "bun:test";
import type { DeploymentReport, DeploymentSite } from "../types.ts";
import {
  agentIdForSurface,
  scopeForSurface,
  stateForSite,
  computeAgentsReport,
  agentDeployDir,
  parseDeployTarget,
  isKnownAgent,
  isCleanSite,
  resolveReadTarget,
} from "./agents.ts";
import { knownAgentSurfacePaths } from "./surfaces.ts";

const HOME = "/home/u";

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

describe("agentIdForSurface", () => {
  test("matches the .<id> dotdir segment", () => {
    expect(agentIdForSurface("/home/u/.claude/skills")).toBe("claude");
    expect(agentIdForSurface("/x/proj/.codex/skills")).toBe("codex");
    expect(agentIdForSurface("/x/.cursor/skills")).toBe("cursor");
    expect(agentIdForSurface("/x/.opencode/skills")).toBe("opencode");
  });
  test("returns null for a non-agent surface", () => {
    expect(agentIdForSurface("/Volumes/x/Project/foo/skills")).toBeNull();
    expect(agentIdForSurface("/home/u/.skillshelf/library")).toBeNull();
  });
});

describe("scopeForSurface", () => {
  test("Global when directly under $HOME", () => {
    expect(scopeForSurface("/home/u/.claude/skills", "claude", HOME)).toBe("Global");
  });
  test("project name when enclosed in a project dir", () => {
    expect(scopeForSurface("/work/BMI_infra/.claude/skills", "claude", HOME)).toBe("BMI_infra");
    expect(scopeForSurface("/a/b/meeting-ai-web/.codex/skills", "codex", HOME)).toBe("meeting-ai-web");
  });
});

describe("stateForSite", () => {
  test("maps kind + drift to a deploy state", () => {
    expect(stateForSite(site({ name: "a", surface: "/s", kind: "linked" }))).toBe("clean");
    expect(stateForSite(site({ name: "a", surface: "/s", kind: "source" }))).toBe("source");
    expect(stateForSite(site({ name: "a", surface: "/s", kind: "copy", drift: false }))).toBe("copy");
    expect(stateForSite(site({ name: "a", surface: "/s", kind: "copy", drift: true }))).toBe("drift");
    expect(stateForSite(site({ name: "a", surface: "/s", kind: "foreign-link" }))).toBe("copy");
    expect(stateForSite(site({ name: "a", surface: "/s", kind: "dead" }))).toBe("dead");
    expect(stateForSite(site({ name: "a", surface: "/s", kind: "aliased" }))).toBe("drift");
  });
});

describe("resolveReadTarget", () => {
  test("--project with no --agent injects every agent's project surface", () => {
    const r = resolveReadTarget(["where", "--project", "/tmp/p"], HOME, "/cwd");
    if ("error" in r) throw new Error(r.error);
    expect(r.projectDir).toBe("/tmp/p");
    expect(r.agentId).toBeNull();
    expect(r.extraSurfaces).toContain("/tmp/p/.claude/skills");
    expect(r.extraSurfaces).toContain("/tmp/p/.codex/skills");
    expect(r.extraSurfaces).toContain("/tmp/p/.gemini/skills");
  });
  test("--agent narrows the injected surface to one agent", () => {
    const r = resolveReadTarget(["x", "--agent", "codex", "--project", "/tmp/p"], HOME, "/cwd");
    if ("error" in r) throw new Error(r.error);
    expect(r.extraSurfaces).toEqual(["/tmp/p/.codex/skills"]);
  });
  test("leaves the command's own flags + positionals in `rest`", () => {
    const r = resolveReadTarget(["cairn", "--problems", "--json", "--project", "/tmp/p"], HOME, "/cwd");
    if ("error" in r) throw new Error(r.error);
    expect(r.rest).toEqual(["cairn", "--problems", "--json"]);
  });
  test("relative --project resolves under cwd; no --project = no surfaces", () => {
    const rel = resolveReadTarget(["--project", "sub"], HOME, "/cwd/proj");
    if ("error" in rel) throw new Error(rel.error);
    expect(rel.projectDir).toBe("/cwd/proj/sub");
    const none = resolveReadTarget(["cairn"], HOME, "/cwd");
    if ("error" in none) throw new Error(none.error);
    expect(none.extraSurfaces).toEqual([]);
  });
  test("rejects an unknown agent", () => {
    expect("error" in resolveReadTarget(["--agent", "nope"], HOME, "/cwd")).toBe(true);
  });
});

describe("computeAgentsReport", () => {
  const report: DeploymentReport = {
    surfaces: [],
    sites: [
      site({ name: "alpha", surface: "/home/u/.claude/skills", kind: "linked" }),
      site({ name: "alpha", surface: "/work/proj/.codex/skills", kind: "copy", drift: true }),
      site({ name: "beta", surface: "/home/u/.cursor/skills", kind: "dead" }),
      site({ name: "gamma", surface: "/some/plain/skills", kind: "linked" }), // no agent → ignored
    ],
    problems: [],
  };
  const r = computeAgentsReport(report, HOME);

  test("registers the 5 known agents (installed=false under a fake HOME)", () => {
    expect(r.agents.map((a) => a.id)).toEqual(["claude", "codex", "cursor", "opencode", "gemini"]);
    expect(r.agents.every((a) => a.installed === false)).toBe(true);
    expect(r.agents[0]!.global).toBe("~/.claude/skills");
  });
  test("folds sites into skill × agent × scope state", () => {
    expect(r.deployments.alpha!.claude!.g).toBe("clean");
    expect(r.deployments.alpha!.codex!.p!.proj).toBe("drift");
    expect(r.deployments.beta!.cursor!.g).toBe("dead");
  });
  test("ignores non-agent surfaces", () => {
    expect(r.deployments.gamma).toBeUndefined();
  });
  test("scopes = Global first, then sorted project names", () => {
    expect(r.scopes[0]).toBe("Global");
    expect(r.scopes).toContain("proj");
  });
});

describe("agentDeployDir", () => {
  test("global = ~/.<id>/skills", () => {
    expect(agentDeployDir("claude", "global", HOME, "/cwd")).toBe("/home/u/.claude/skills");
  });
  test("project = <root>/.<id>/skills (absolute or under cwd)", () => {
    expect(agentDeployDir("codex", { project: "/tmp/p" }, HOME, "/cwd")).toBe("/tmp/p/.codex/skills");
    expect(agentDeployDir("codex", { project: "rel" }, HOME, "/cwd")).toBe("/cwd/rel/.codex/skills");
  });
});

describe("parseDeployTarget", () => {
  test("default (no flags) = cwd project .claude/skills", () => {
    const p = parseDeployTarget(["myskill"], HOME, "/cwd/myproj");
    expect("error" in p).toBe(false);
    if ("error" in p) return;
    expect(p.positionals).toEqual(["myskill"]);
    expect(p.target.agentId).toBe("claude");
    expect(p.target.dir).toBe("/cwd/myproj/.claude/skills");
  });
  test("--agent <id> --global targets the agent's global dir", () => {
    const p = parseDeployTarget(["myskill", "--agent", "codex", "--global"], HOME, "/cwd");
    if ("error" in p) throw new Error(p.error);
    expect(p.positionals).toEqual(["myskill"]); // flag value not mistaken for the skill name
    expect(p.target.agentId).toBe("codex");
    expect(p.target.scope).toBe("Global");
    expect(p.target.dir).toBe("/home/u/.codex/skills");
  });
  test("--project resolves a named project dir", () => {
    const p = parseDeployTarget(["s", "--agent", "claude", "--project", "/tmp/proj"], HOME, "/cwd");
    if ("error" in p) throw new Error(p.error);
    expect(p.target.dir).toBe("/tmp/proj/.claude/skills");
    expect(p.target.scope).toBe("proj");
  });
  test("--json is ignored by the parser", () => {
    const p = parseDeployTarget(["s", "--json", "--agent", "claude", "--global"], HOME, "/cwd");
    if ("error" in p) throw new Error(p.error);
    expect(p.positionals).toEqual(["s"]);
  });
  test("rejects unknown agent", () => {
    const p = parseDeployTarget(["s", "--agent", "bogus"], HOME, "/cwd");
    expect("error" in p).toBe(true);
  });
  test("rejects --global + --project together", () => {
    const p = parseDeployTarget(["s", "--global", "--project", "x"], HOME, "/cwd");
    expect("error" in p).toBe(true);
  });
  test("rejects an unknown flag", () => {
    const p = parseDeployTarget(["s", "--frobnicate"], HOME, "/cwd");
    expect("error" in p).toBe(true);
  });
});

describe("isKnownAgent", () => {
  test("knows the registry ids", () => {
    expect(isKnownAgent("claude")).toBe(true);
    expect(isKnownAgent("gemini")).toBe(true);
    expect(isKnownAgent("nope")).toBe(false);
  });
});

describe("isCleanSite", () => {
  test("✓ states (linked + canonical source) count as clean", () => {
    expect(isCleanSite(site({ name: "a", surface: "/s", kind: "linked" }))).toBe(true);
    expect(isCleanSite(site({ name: "a", surface: "/s", kind: "source" }))).toBe(true);
    expect(isCleanSite(site({ name: "a", surface: "/s", kind: "copy" }))).toBe(false);
    expect(isCleanSite(site({ name: "a", surface: "/s", kind: "dead" }))).toBe(false);
  });
});

describe("registry / surface consistency", () => {
  // Every agent the matrix advertises MUST have its global surface scanned, or
  // `installed` can disagree with an empty matrix (the divergence bug).
  test("every advertised agent has a scanned global surface", () => {
    const report = computeAgentsReport({ surfaces: [], sites: [], problems: [] }, HOME);
    const paths = knownAgentSurfacePaths();
    for (const a of report.agents) {
      const matched = paths.some((p) => agentIdForSurface(p) === a.id);
      expect(matched).toBe(true);
    }
  });
});

describe("codex vendor_imports exclusion", () => {
  test("vendor_imports sites do not collapse into the codex Global cell", () => {
    const r = computeAgentsReport(
      {
        surfaces: [],
        sites: [
          site({ name: "x", surface: "/home/u/.codex/skills", kind: "linked" }),
          site({ name: "x", surface: "/home/u/.codex/vendor_imports/skills/skills", kind: "copy", drift: true }),
        ],
        problems: [],
      },
      HOME,
    );
    // the real global link wins; the vendored copy is excluded (not RANK-collapsed to drift)
    expect(r.deployments.x!.codex!.g).toBe("clean");
  });
});
