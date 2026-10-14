import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import { mkdtemp, mkdir, symlink, lstat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { runCli } from "./helpers.ts";

let root: string;
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); });
async function setup() {
  root = await mkdtemp(join(tmpdir(), "skl-ui-contract-"));
  const project = join(root, "project");
  await mkdir(project);
  const opts = { cwd: project, library: join(root, "library"), env: {
    HOME: join(root, "home"), SKILLSHELF_CONFIG: join(root, "config.json"),
    SKILLSHELF_GLOBAL_CORE: join(root, "home/.claude/skills"),
  } };
  const run = (args: string[]) => runCli([...args, "--json"], opts);
  expect((await run(["new", "demo", "--desc", "Example"])).code).toBe(0);
  return { project, run };
}

test("where and agents both inventory registered projects without explicit targeting", async () => {
  const { project, run } = await setup();
  await run(["projects", "add", project]);
  await run(["use", "demo", "--agent", "codex"]);
  const where = JSON.parse((await run(["where"])).stdout);
  expect(where.sites.some((s: any) => s.name === "demo" && s.path.endsWith("/.codex/skills/demo"))).toBe(true);
  const agents = JSON.parse((await run(["agents"])).stdout);
  expect(agents.deployments.demo.codex.p.project).toBe("clean");
});

test("dead-only drop removes a retired link in exactly the selected surface", async () => {
  const { project, run } = await setup();
  await run(["use", "demo", "--agent", "codex"]);
  await run(["use", "demo", "--agent", "claude"]);
  await run(["retire", "demo"]);
  const result = await run(["drop", "demo", "--dead", "--agent", "codex"]);
  expect(result.code).toBe(0);
  expect(JSON.parse(result.stdout).removed).toBe(1);
  expect(await lstat(join(project, ".codex/skills/demo")).then(() => true, () => false)).toBe(false);
  expect((await lstat(join(project, ".claude/skills/demo"))).isSymbolicLink()).toBe(true);
});

test("dead-only drop handles unknown dead links but refuses real directories and live links", async () => {
  const { project, run } = await setup();
  const surface = join(project, ".codex/skills");
  await mkdir(surface, { recursive: true });
  await symlink(join(root, "missing"), join(surface, "gone"));
  expect((await run(["drop", "gone", "--dead", "--agent", "codex"])).code).toBe(0);
  await run(["use", "demo", "--agent", "codex"]);
  expect((await run(["drop", "demo", "--dead", "--agent", "codex"])).code).toBe(1);
  expect((await lstat(join(surface, "demo"))).isSymbolicLink()).toBe(true);
  await mkdir(join(surface, "real-copy"));
  expect((await run(["drop", "real-copy", "--dead", "--agent", "codex"])).code).toBe(1);
  expect((await lstat(join(surface, "real-copy"))).isDirectory()).toBe(true);
  expect((await run(["drop", "../../escape", "--dead", "--agent", "codex"])).code).toBe(1);
});

test("ordinary drop reports failure instead of success for a skipped foreign link", async () => {
  const { project, run } = await setup();
  await mkdir(join(project, ".codex/skills"), { recursive: true });
  await symlink(join(root, "missing"), join(project, ".codex/skills/demo"));
  const result = await run(["drop", "demo", "--agent", "codex"]);
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("skipped");
  expect(JSON.parse(result.stdout).removed).toBe(0);
});

test("custom-agent paths round-trip through deploy, inventory, status, diff and drop", async () => {
  const { project, run } = await setup();
  const global = join(root, "home/shared-skills");
  const convention = ".tools/example-skills";
  expect((await run(["agents", "add", "example", "--name", "Example", "--global", global,
    "--proj-convention", convention])).code).toBe(0);
  await run(["projects", "add", project]);
  for (const flags of [["--global"], ["--project", project]]) {
    expect((await run(["use", "demo", "--agent", "example", ...flags])).code).toBe(0);
    expect((await run(["diff", "demo", "--agent", "example", ...flags])).code).toBe(0);
  }
  expect((await lstat(join(global, "demo"))).isSymbolicLink()).toBe(true);
  expect((await lstat(join(project, convention, "demo"))).isSymbolicLink()).toBe(true);
  const where = JSON.parse((await run(["where"])).stdout);
  expect(where.sites.filter((s: any) => s.name === "demo")).toHaveLength(2);
  const agents = JSON.parse((await run(["agents"])).stdout);
  expect(agents.agents.find((a: any) => a.id === "example").installed).toBe(true);
  expect(agents.deployments.demo.example).toEqual({ g: "clean", p: { project: "clean" } });
  const status = await run(["status", "--agent", "example", "--project", project]);
  expect(status.code).toBe(0);
  expect(JSON.parse(status.stdout).skillsDir).toBe(join(project, convention));
  expect((await run(["agents", "--agent", "example", "--project", project])).code).toBe(0);
  const library = JSON.parse((await run(["ls"])).stdout);
  expect(library.find((s: any) => s.name === "demo").deployCount).toBe(2);
  for (const flags of [["--global"], ["--project", project]]) {
    expect((await run(["drop", "demo", "--agent", "example", ...flags])).code).toBe(0);
  }
  expect(JSON.parse((await run(["agents"])).stdout).deployments.demo).toBeUndefined();
  await symlink(join(root, "library/demo"), join(global, "old-demo"));
  expect((await run(["realign", "old-demo", "--agent", "example", "--global"])).code).toBe(0);
  expect((await lstat(join(global, "demo"))).isSymbolicLink()).toBe(true);
});

test("a built-in agent override uses its configured global and project paths", async () => {
  const { project, run } = await setup();
  const global = join(root, "home/alternate-codex");
  await run(["agents", "add", "codex", "--global", global, "--proj-convention", ".tools/codex-skills"]);
  await run(["projects", "add", project]);
  expect((await run(["use", "demo", "--agent", "codex", "--global"])).code).toBe(0);
  expect((await run(["use", "demo", "--agent", "codex", "--project", project])).code).toBe(0);
  const report = JSON.parse((await run(["agents"])).stdout);
  expect(report.deployments.demo.codex).toEqual({ g: "clean", p: { project: "clean" } });
  expect(report.agents.find((a: any) => a.id === "codex").installed).toBe(true);
});

test("custom agents reject project paths that escape the selected directory", async () => {
  const { run } = await setup();
  for (const convention of ["../outside", "/tmp/outside", ".tools/../../outside", "~/.tools/skills"]) {
    expect((await run(["agents", "add", "example", "--global", join(root, "global"),
      "--proj-convention", convention])).code).toBe(1);
  }
  expect((await run(["use", "demo", "--agent", "example"])).code).toBe(1);
  expect((await run(["agents", "add", "../escape", "--global", join(root, "global"),
    "--proj-convention", ".tools/skills"])).code).toBe(1);
});
