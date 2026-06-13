import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { loadLibrary, searchSkills, findByName } from "./library.ts";
import { findDuplicates, driftedGroups, genuineConflictGroups } from "./dedupe.ts";
import { resolveBundle } from "./bundle.ts";
import { generateIndex } from "./indexgen.ts";

const FIXTURES = join(import.meta.dir, "..", "..", "fixtures", "library");

describe("core against fixtures", () => {
  test("loads all skills with overlays + provenance + mirrors + retired", async () => {
    const lib = await loadLibrary(FIXTURES);
    expect(lib.length).toBe(12);

    const retired = lib.filter((s) => s.retired).map((s) => s.name);
    expect(retired).toContain("old-deseq-helper");

    const mirror = lib.find((s) => s.mirrorOf);
    expect(mirror?.name).toBe("commit-push");
    expect(mirror?.primaryDomain).toBe("coding");

    const thirdParty = findByName(lib, "xhs-title");
    expect(thirdParty?.source?.source).toBe(
      "github:dontbesilent2025/dbskill@skills/xhs-title",
    );
    // overlay added green-card domain
    expect(thirdParty?.domains).toContain("green-card");

    const qc = findByName(lib, "rnaseq-qc");
    expect(qc?.refFiles.length).toBe(1);
  });

  test("detects drifted duplicate scrna-cluster + identical commit-push mirror", async () => {
    const lib = await loadLibrary(FIXTURES);
    const groups = findDuplicates(lib);
    const drifted = driftedGroups(groups).map((g) => g.name);
    expect(drifted).toContain("scrna-cluster");

    const commit = groups.find((g) => g.name === "commit-push");
    expect(commit?.identical).toBe(true);
  });

  test("genuineConflictGroups drops faithful mirrors but keeps real drift", async () => {
    const lib = await loadLibrary(FIXTURES);
    const groups = findDuplicates(lib);
    // findDuplicates still surfaces the faithful commit-push mirror...
    expect(groups.some((g) => g.name === "commit-push")).toBe(true);

    // ...but the user-facing conflict view suppresses it (intended bridge mirror)
    // while keeping the genuinely drifted scrna-cluster.
    const genuine = genuineConflictGroups(groups).map((g) => g.name);
    expect(genuine).toContain("scrna-cluster");
    expect(genuine).not.toContain("commit-push");
  });

  test("bundle resolves by domain + overlay membership", async () => {
    const lib = await loadLibrary(FIXTURES);
    const bio = await resolveBundle(lib, "bioinfo");
    expect(bio.skills.map((s) => s.name)).toContain("rnaseq-qc");
    expect(bio.skills.some((s) => s.retired)).toBe(false);

    const gc = await resolveBundle(lib, "green-card");
    const names = gc.skills.map((s) => s.name);
    expect(names).toContain("eb1a-evidence");
    expect(names).toContain("xhs-title"); // via overlay union
  });

  test("search ranks name match high", async () => {
    const lib = await loadLibrary(FIXTURES);
    const res = searchSkills(lib, "commit");
    expect(res[0]?.name).toBe("commit-push");
  });

  test("generateIndex groups by domain and lists retired", async () => {
    const lib = await loadLibrary(FIXTURES);
    const md = generateIndex(lib, { generatedAt: "FIXED" });
    expect(md).toContain("## bioinfo");
    expect(md).toContain("## _retired");
    expect(md).toContain("old-deseq-helper");
  });
});
