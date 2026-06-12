// Deterministic core against the real fixture library: load + overlay merge,
// bundle tag-query resolution, dedupe drift classification, index generation,
// search, and provenance attach.

import { describe, expect, test } from "bun:test";
import {
  loadLibrary,
  activeSkills,
  findByName,
  searchSkills,
  listDomains,
} from "../src/core/library.ts";
import { resolveBundle, listBundles } from "../src/core/bundle.ts";
import { applyOverlay } from "../src/core/overlay.ts";
import {
  findDuplicates,
  driftedGroups,
  exactDuplicateGroups,
} from "../src/core/dedupe.ts";
import { generateIndex } from "../src/core/indexgen.ts";
import { FIXTURE_LIBRARY } from "./helpers.ts";

describe("library load + overlay + provenance", () => {
  test("loads all 12 skills incl. mirror, retired, drift copies", async () => {
    const lib = await loadLibrary(FIXTURE_LIBRARY);
    expect(lib.length).toBe(12);
    // exactly one bridge mirror, and it points at a canonical
    const mirrors = lib.filter((s) => s.mirrorOf);
    expect(mirrors.length).toBe(1);
    expect(mirrors[0]!.name).toBe("commit-push");
    expect(mirrors[0]!.mirrorOf).not.toBeNull();
  });

  test("retired skill is tagged and excluded from active set", async () => {
    const lib = await loadLibrary(FIXTURE_LIBRARY);
    const retired = lib.filter((s) => s.retired).map((s) => s.name);
    expect(retired).toEqual(["old-deseq-helper"]);
    expect(activeSkills(lib).some((s) => s.retired)).toBe(false);
    expect(activeSkills(lib).length).toBe(11);
  });

  test("overlay merge unions domains onto upstream (xhs-title gains green-card)", async () => {
    const lib = await loadLibrary(FIXTURE_LIBRARY);
    const xhs = findByName(lib, "xhs-title")!;
    // upstream frontmatter domains: writing, marketing — overlay adds green-card
    expect(xhs.domains).toContain("writing");
    expect(xhs.domains).toContain("marketing");
    expect(xhs.domains).toContain("green-card");
    // primary stays the upstream primary (writing), not the overlay tag
    expect(xhs.primaryDomain).toBe("writing");
  });

  test("provenance attached from lockfile for xhs-title; hand-written skills have none", async () => {
    const lib = await loadLibrary(FIXTURE_LIBRARY);
    const xhs = findByName(lib, "xhs-title")!;
    expect(xhs.source?.source).toBe("github:dontbesilent2025/dbskill@skills/xhs-title");
    expect(xhs.source?.channel).toBe("github");
    expect(findByName(lib, "rnaseq-qc")!.source).toBeNull();
  });

  test("rnaseq-qc carries its bundled reference file path (not contents)", async () => {
    const lib = await loadLibrary(FIXTURE_LIBRARY);
    const qc = findByName(lib, "rnaseq-qc")!;
    expect(qc.refFiles.length).toBe(1);
    // the path is a directory (reference/) under the skill dir
    expect(qc.refFiles[0]!.endsWith("/reference")).toBe(true);
  });

  test("primary-domain derives from physical folder, not just frontmatter", async () => {
    const lib = await loadLibrary(FIXTURE_LIBRARY);
    // coding/scrna-cluster physically lives in coding/, so primaryDomain=coding
    const codingCopy = lib.find(
      (s) => s.name === "scrna-cluster" && s.path.includes("/coding/"),
    )!;
    expect(codingCopy.primaryDomain).toBe("coding");
    const bioCopy = lib.find(
      (s) => s.name === "scrna-cluster" && s.path.includes("/bioinfo/"),
    )!;
    expect(bioCopy.primaryDomain).toBe("bioinfo");
  });

  test("applyOverlay is non-destructive and de-dupes", () => {
    const base = {
      name: "x",
      description: "",
      primaryDomain: "a",
      domains: ["a", "b"],
      path: "/x",
      bodyPath: "/x/SKILL.md",
      refFiles: [],
      source: null,
      retired: false,
      mirrorOf: null,
      contentHash: "h",
    };
    const merged = applyOverlay(base, { domains: ["b", "c"] });
    expect(merged.domains).toEqual(["a", "b", "c"]);
    expect(base.domains).toEqual(["a", "b"]); // input untouched
  });
});

describe("bundles = tag queries", () => {
  test("bioinfo bundle resolves across folders, excludes retired", async () => {
    const lib = await loadLibrary(FIXTURE_LIBRARY);
    const bio = await resolveBundle(lib, "bioinfo");
    const names = bio.skills.map((s) => s.name);
    expect(names).toContain("rnaseq-qc");
    expect(names).toContain("nature-figure"); // tagged bioinfo though it lives in writing/
    expect(names).not.toContain("old-deseq-helper"); // retired excluded
    expect(bio.skills.every((s) => !s.retired)).toBe(true);
  });

  test("green-card bundle pulls xhs-title in via overlay-unioned domain", async () => {
    const lib = await loadLibrary(FIXTURE_LIBRARY);
    const gc = await resolveBundle(lib, "green-card");
    const names = gc.skills.map((s) => s.name);
    expect(names).toContain("eb1a-evidence");
    expect(names).toContain("xhs-title");
  });

  test("explicit overlay bundle membership (personal-brand) resolves", async () => {
    const lib = await loadLibrary(FIXTURE_LIBRARY);
    const pb = await resolveBundle(lib, "personal-brand");
    // personal-brand is NOT a domain tag — only xhs-title's overlay.bundles lists it
    expect(pb.skills.map((s) => s.name)).toEqual(["xhs-title"]);
  });

  test("includeRetired surfaces retired-tagged skills", async () => {
    const lib = await loadLibrary(FIXTURE_LIBRARY);
    const without = await resolveBundle(lib, "bioinfo");
    const withRetired = await resolveBundle(lib, "bioinfo", { includeRetired: true });
    expect(withRetired.skills.length).toBeGreaterThan(without.skills.length);
    expect(withRetired.skills.some((s) => s.name === "old-deseq-helper")).toBe(true);
  });

  test("listBundles includes every domain tag and overlay bundle", async () => {
    const lib = await loadLibrary(FIXTURE_LIBRARY);
    const names = (await listBundles(lib)).map((b) => b.name);
    expect(names).toContain("bioinfo");
    expect(names).toContain("green-card");
    expect(names).toContain("personal-brand");
  });
});

describe("dedupe drift classification", () => {
  test("scrna-cluster is drifted (two different bodies), commit-push is identical", async () => {
    const lib = await loadLibrary(FIXTURE_LIBRARY);
    const groups = findDuplicates(lib);

    const scrna = groups.find((g) => g.name === "scrna-cluster")!;
    expect(scrna.identical).toBe(false);
    expect(scrna.divergent.length).toBe(1);
    expect(driftedGroups(groups).map((g) => g.name)).toContain("scrna-cluster");

    const commit = groups.find((g) => g.name === "commit-push")!;
    expect(commit.identical).toBe(true);
    expect(commit.duplicates.length).toBe(1);
    expect(commit.divergent.length).toBe(0);
    expect(exactDuplicateGroups(groups).map((g) => g.name)).toContain("commit-push");
  });

  test("canonical copy is non-mirror and non-retired", async () => {
    const lib = await loadLibrary(FIXTURE_LIBRARY);
    for (const g of findDuplicates(lib)) {
      expect(g.canonical.mirrorOf).toBeNull();
      expect(g.canonical.retired).toBe(false);
    }
  });

  test("single-copy skills are not reported as duplicates", async () => {
    const lib = await loadLibrary(FIXTURE_LIBRARY);
    const names = findDuplicates(lib).map((g) => g.name);
    expect(names).not.toContain("rnaseq-qc");
    expect(names).not.toContain("eb1a-evidence");
  });
});

describe("search + index", () => {
  test("search ranks exact name match first", async () => {
    const lib = await loadLibrary(FIXTURE_LIBRARY);
    expect(searchSkills(lib, "commit")[0]?.name).toBe("commit-push");
    expect(searchSkills(lib, "manuscript")[0]?.name).toBe("manuscript-polish");
  });

  test("search matches on description + domain tokens", async () => {
    const lib = await loadLibrary(FIXTURE_LIBRARY);
    const r = searchSkills(lib, "uscis");
    expect(r.map((s) => s.name)).toContain("eb1a-evidence");
    const byDomain = searchSkills(lib, "philosophy");
    expect(byDomain.map((s) => s.name)).toContain("wittgenstein-deconstruct");
  });

  test("listDomains is sorted + unique", async () => {
    const lib = await loadLibrary(FIXTURE_LIBRARY);
    const ds = listDomains(lib);
    expect(ds).toEqual([...new Set(ds)].sort());
    expect(ds).toContain("bioinfo");
    expect(ds).toContain("green-card");
  });

  test("generateIndex groups by domain, lists retired section, deterministic with fixed ts", async () => {
    const lib = await loadLibrary(FIXTURE_LIBRARY);
    const md = generateIndex(lib, { generatedAt: "FIXED-TS" });
    expect(md).toContain("## bioinfo");
    expect(md).toContain("## writing");
    expect(md).toContain("## _retired");
    expect(md).toContain("old-deseq-helper");
    expect(md).toContain("FIXED-TS");
    // third-party provenance annotated
    expect(md).toContain("[github:dontbesilent2025/dbskill@skills/xhs-title]");
    // stable across two runs with same ts
    expect(generateIndex(lib, { generatedAt: "FIXED-TS" })).toBe(md);
  });
});
