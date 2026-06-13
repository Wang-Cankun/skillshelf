// Deployment inventory coverage (`skl where` core): classify every entry in a
// surface as linked / foreign-link / copy(+drift) / dead, against a real library.
// Deterministic, on-disk fixtures, no network.

import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { loadLibrary } from "../src/core/library.ts";
import {
  inventoryDeployments,
  suggestionFor,
} from "../src/core/deployments.ts";
import type { DeploymentSite } from "../src/types.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function scratch(prefix: string): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), prefix));
  cleanups.push(() => rm(d, { recursive: true, force: true }));
  return d;
}

/** Write <root>/<name>/SKILL.md with the given body; return the skill dir. */
async function writeSkill(root: string, name: string, body: string): Promise<string> {
  const dir = join(root, name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${name} desc\n---\n${body}\n`);
  return dir;
}

function byName(sites: DeploymentSite[]): Record<string, DeploymentSite> {
  return Object.fromEntries(sites.map((s) => [s.name, s]));
}

describe("inventoryDeployments", () => {
  test("classifies linked / drifted-copy / untracked-copy / foreign-link / dead", async () => {
    const libDir = await scratch("skl-dep-lib-");
    const library = join(libDir, "library");
    const surfaceDir = await scratch("skl-dep-surface-");
    const foreignDir = await scratch("skl-dep-foreign-");

    // Library has alpha + beta.
    await writeSkill(library, "alpha", "ALPHA body v1");
    await writeSkill(library, "beta", "BETA body v1");

    // Surface deployments:
    await symlink(join(library, "alpha"), join(surfaceDir, "alpha")); // linked
    await writeSkill(surfaceDir, "beta", "BETA body v2 — DIVERGED"); // copy of a library skill, drifted
    await writeSkill(surfaceDir, "gamma", "GAMMA body"); // copy, not in library (untracked)
    await writeSkill(foreignDir, "delta", "DELTA body");
    await symlink(join(foreignDir, "delta"), join(surfaceDir, "delta")); // foreign-link (outside library)
    await symlink(join(foreignDir, "ghost"), join(surfaceDir, "ghost")); // dead (target absent)

    const lib = await loadLibrary(library);
    const report = await inventoryDeployments([surfaceDir], library, lib);

    const m = byName(report.sites);
    expect(m["alpha"]).toMatchObject({ kind: "linked", inLibrary: true });
    expect(m["beta"]).toMatchObject({ kind: "copy", inLibrary: true, drift: true });
    expect(m["gamma"]).toMatchObject({ kind: "copy", inLibrary: false, drift: false });
    expect(m["delta"]).toMatchObject({ kind: "foreign-link" });
    expect(m["ghost"]).toMatchObject({ kind: "dead" });

    // problems = everything that is not a clean linked deployment.
    const probNames = report.problems.map((p) => p.name).sort();
    expect(probNames).toEqual(["beta", "delta", "gamma", "ghost"]);
    expect(report.problems.some((p) => p.name === "alpha")).toBe(false);

    // every problem has an actionable suggestion; the clean one has none.
    for (const p of report.problems) expect(suggestionFor(p).length).toBeGreaterThan(0);
    expect(suggestionFor(m["alpha"]!)).toBe("");
  });

  test("an identical (non-drifted) copy of a library skill is flagged copy without drift", async () => {
    const libDir = await scratch("skl-dep2-lib-");
    const library = join(libDir, "library");
    const surfaceDir = await scratch("skl-dep2-surface-");

    await writeSkill(library, "echo", "ECHO identical body");
    await writeSkill(surfaceDir, "echo", "ECHO identical body"); // same body → no drift

    const lib = await loadLibrary(library);
    const report = await inventoryDeployments([surfaceDir], library, lib);
    const echo = byName(report.sites)["echo"]!;
    expect(echo).toMatchObject({ kind: "copy", inLibrary: true, drift: false });
    expect(suggestionFor(echo)).toMatch(/dedupe to a symlink/);
  });

  test("the library itself is never scanned as a surface (realpath-skipped)", async () => {
    const libDir = await scratch("skl-dep3-lib-");
    const library = join(libDir, "library");
    await writeSkill(library, "solo", "SOLO body");

    const lib = await loadLibrary(library);
    // Pass the library as a surface too — it must be skipped, not self-reported.
    const report = await inventoryDeployments([library], library, lib);
    expect(report.surfaces).not.toContain(library);
    expect(report.sites.length).toBe(0);
  });
});
