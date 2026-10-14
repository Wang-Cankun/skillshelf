import { expect, test } from "bun:test";
import { copySiteFor, aliasedSiteFor, deriveAgentsReport } from "./agents";
import type { DeploymentReport, DeploymentSite } from "./types";

test("a project-only inventory uses explicit HOME for copy and alias resolution", () => {
  const site: DeploymentSite = { name: "demo", surface: "/work/project/.codex/skills",
    path: "/work/project/.codex/skills/demo", kind: "copy", target: null, inLibrary: true, drift: false };
  const report = { home: "/home/example", surfaces: [site.surface], sites: [site], problems: [site] } as DeploymentReport;
  expect(copySiteFor(report, "demo", "codex", "project")).toEqual(site);
  expect(copySiteFor(report, "demo", "codex", "Global")).toBeNull();
  expect(deriveAgentsReport(report).deployments.demo.codex.p?.project).toBe("copy");
  site.kind = "aliased";
  expect(aliasedSiteFor(report, "demo", "codex", "project")).toEqual(site);
});

test("custom paths drive both the matrix and raw copy/alias resolution", () => {
  const agent = { id: "example", name: "Example", short: "Example", global: "~/shared-skills",
    projConvention: ".tools/example-skills", installed: true, inheritsGlobal: true };
  const global: DeploymentSite = { name: "demo", surface: "/home/example/shared-skills",
    path: "/home/example/shared-skills/demo", kind: "copy", target: null, inLibrary: true, drift: false };
  const project: DeploymentSite = { ...global, surface: "/work/project/.tools/example-skills",
    path: "/work/project/.tools/example-skills/demo", kind: "aliased" };
  const report: DeploymentReport = { home: "/home/example", surfaces: [global.surface, project.surface],
    sites: [global, project], problems: [global, project] };
  expect(deriveAgentsReport(report, { agents: [agent] }).deployments.demo.example)
    .toEqual({ g: "copy", p: { project: "drift" } });
  expect(copySiteFor(report, "demo", "example", "Global", [agent])).toEqual(global);
  expect(copySiteFor(report, "demo", "example", "project", [agent])).toBeNull();
  expect(aliasedSiteFor(report, "demo", "example", "project", [agent])).toEqual(project);
});
