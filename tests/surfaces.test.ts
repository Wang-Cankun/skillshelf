// Agent-surface registry seed (ADR-0003): the well-known global skill dirs that
// `skl where` unions in so cross-agent sprawl shows up without manual --add-root.

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { knownAgentSurfaces, knownAgentSurfacePaths } from "../src/core/surfaces.ts";

describe("knownAgentSurfaces", () => {
  test("maps the cross-agent ecosystem to <home>/.<agent>/skills paths", () => {
    const home = "/tmp/fake-home";
    const paths = knownAgentSurfacePaths(home);

    expect(paths).toContain(join(home, ".claude", "skills"));
    expect(paths).toContain(join(home, ".codex", "skills"));
    expect(paths).toContain(join(home, ".codex", "vendor_imports", "skills", "skills"));
    expect(paths).toContain(join(home, ".opencode", "skills"));
    expect(paths).toContain(join(home, ".cursor", "skills"));

    // every entry is absolute and rooted at the given home
    for (const p of paths) expect(p.startsWith(home + "/")).toBe(true);
  });

  test("carries an ecosystem agent id per surface", () => {
    const agents = new Set(knownAgentSurfaces("/tmp/h").map((s) => s.agent));
    expect(agents.has("claude-code")).toBe(true);
    expect(agents.has("codex")).toBe(true);
  });
});
