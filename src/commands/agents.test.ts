// `skl agents --json` end-to-end with ADR-0010 config: a persisted-but-empty
// project must surface as a scope (no phantom deployments), a custom agent must
// appear in the matrix, and a real deploy into a config-project must be inventoried.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run as agentsRun } from "./agents.ts";
import { run as useRun } from "./use.ts";
import { loadLibrary } from "../core/library.ts";
import type { AgentsReport } from "../core/agents.ts";
import type { Config, Ctx } from "../types.ts";

async function writeSkill(library: string, name: string) {
  const dir = join(library, name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${name}\ndomains: [bio]\n---\n\nbody\n`);
}

describe("skl agents --json — config projects + agents (ADR-0010)", () => {
  let tmp: string;
  let library: string;

  function makeCtx(config: Partial<Config>): { ctx: Ctx; json: unknown[] } {
    const json: unknown[] = [];
    const full: Config = {
      libraryPath: library,
      globalCoreTarget: join(tmp, ".no-global-core"),
      roots: [],
      agents: [],
      projects: [],
      configFile: null,
      configFilePath: join(tmp, "config.json"),
      source: "default",
      ...config,
    };
    const ctx = {
      config: full,
      libraryPath: library,
      roots: full.roots,
      loadLibrary: () => loadLibrary(library),
      log: () => {},
      error: () => {},
      json: (v: unknown) => json.push(v),
    } as unknown as Ctx;
    return { ctx, json };
  }

  beforeEach(async () => {
    tmp = await realpath(await mkdtemp(join(tmpdir(), "skl-agents-cmd-")));
    library = join(tmp, "library");
    await writeSkill(library, "alpha");
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("an empty config-project appears as a scope with no phantom deployments", async () => {
    const empty = join(tmp, "scratch");
    await mkdir(empty, { recursive: true });
    const { ctx, json } = makeCtx({ projects: [empty] });
    const code = await agentsRun(["--json"], ctx);
    expect(code).toBe(0);
    const report = json[0] as AgentsReport;
    expect(report.scopes).toContain("scratch");
    // empty project = NO fabricated cell. (The matrix may contain real machine
    // global deployments; the invariant is that nothing is keyed to `scratch`.)
    for (const byAgent of Object.values(report.deployments)) {
      for (const dep of Object.values(byAgent)) {
        expect(dep.p?.scratch).toBeUndefined();
      }
    }
  });

  test("a custom config-agent appears in the agents list", async () => {
    const { ctx, json } = makeCtx({ agents: [{ id: "pi", name: "PI Agent", short: "PI" }] });
    await agentsRun(["--json"], ctx);
    const report = json[0] as AgentsReport;
    expect(report.agents.map((a) => a.id)).toContain("pi");
  });

  test("a real deploy into a config-project is inventoried in the matrix", async () => {
    const proj = join(tmp, "webapp");
    await mkdir(proj, { recursive: true });
    // deploy alpha into the config project for claude
    const { ctx: useCtx } = makeCtx({ projects: [proj] });
    await useRun(["alpha", "--agent", "claude", "--project", proj, "--json"], useCtx);

    const { ctx, json } = makeCtx({ projects: [proj] });
    await agentsRun(["--json"], ctx);
    const report = json[0] as AgentsReport;
    expect(report.scopes).toContain("webapp");
    expect(report.deployments.alpha!.claude!.p!.webapp).toBe("clean");
  });
});
