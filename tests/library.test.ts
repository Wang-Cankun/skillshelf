// Deterministic core against the real fixture library: load + central-taxonomy
// merge, bundle tag-query resolution, dedupe drift classification, index
// generation, search, and provenance attach.

import { describe, expect, test } from "bun:test";
import {
  loadLibrary,
  activeSkills,
  findByName,
  searchSkills,
  listDomains,
} from "../src/core/library.ts";
import { resolveBundle, listBundles } from "../src/core/bundle.ts";
import { applyTaxonomy } from "../src/core/taxonomy.ts";
import type { Taxonomy } from "../src/types.ts";
import {
  findDuplicates,
  driftedGroups,
  exactDuplicateGroups,
} from "../src/core/dedupe.ts";
import { generateIndex } from "../src/core/indexgen.ts";
import { FIXTURE_LIBRARY } from "./helpers.ts";

describe("library load + taxonomy + provenance", () => {
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

  test("taxonomy merge unions domains onto upstream (headline-picker gains portfolio)", async () => {
    const lib = await loadLibrary(FIXTURE_LIBRARY);
    const xhs = findByName(lib, "headline-picker")!;
    // upstream frontmatter domains: writing, marketing — taxonomy adds portfolio
    expect(xhs.domains).toContain("writing");
    expect(xhs.domains).toContain("marketing");
    expect(xhs.domains).toContain("portfolio");
    // primary stays the upstream primary (writing), not the taxonomy tag
    expect(xhs.primaryDomain).toBe("writing");
  });

  test("provenance attached from lockfile for headline-picker; hand-written skills have none", async () => {
    const lib = await loadLibrary(FIXTURE_LIBRARY);
    const xhs = findByName(lib, "headline-picker")!;
    expect(xhs.source?.source).toBe("github:anthropics/skills@skills/headline-picker");
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

  test("primaryDomain derives from effective domains[0], not the (flat) folder", async () => {
    const lib = await loadLibrary(FIXTURE_LIBRARY);
    // Layout is flat; both copies share name `scrna-cluster` but differ in domains[0].
    // The "coding" copy lives at scrna-cluster-coding/ with domains: [coding, ...].
    const codingCopy = lib.find(
      (s) => s.name === "scrna-cluster" && s.domains[0] === "coding",
    )!;
    expect(codingCopy.primaryDomain).toBe("coding");
    expect(codingCopy.path.includes("/scrna-cluster-coding")).toBe(true);
    // The canonical copy lives at scrna-cluster/ with domains: [bioinfo, ...].
    const bioCopy = lib.find(
      (s) => s.name === "scrna-cluster" && s.domains[0] === "bioinfo",
    )!;
    expect(bioCopy.primaryDomain).toBe("bioinfo");
  });

  test("applyTaxonomy is non-destructive and de-dupes", () => {
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
    const tax: Taxonomy = { version: 1, skills: { x: ["b", "c"] } };
    const merged = applyTaxonomy(base, tax);
    expect(merged.domains).toEqual(["a", "b", "c"]);
    expect(merged.primaryDomain).toBe("a"); // existing primary preserved
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

  test("portfolio bundle pulls headline-picker in via taxonomy-unioned domain", async () => {
    const lib = await loadLibrary(FIXTURE_LIBRARY);
    const gc = await resolveBundle(lib, "portfolio");
    const names = gc.skills.map((s) => s.name);
    expect(names).toContain("evidence-map");
    expect(names).toContain("headline-picker");
  });

  // ADR-0002 drops the separate `bundles` concept entirely (it was a provably
  // unused field on the old sidecar). A bundle is now purely a domain tag query
  // over Skill.domains[] — there is no out-of-band "personal-brand" membership, so
  // resolving a non-domain name yields nothing.
  test("a name that is not a domain tag resolves to an empty bundle", async () => {
    const lib = await loadLibrary(FIXTURE_LIBRARY);
    const pb = await resolveBundle(lib, "personal-brand");
    expect(pb.skills).toEqual([]);
  });

  test("includeRetired surfaces retired-tagged skills", async () => {
    const lib = await loadLibrary(FIXTURE_LIBRARY);
    const without = await resolveBundle(lib, "bioinfo");
    const withRetired = await resolveBundle(lib, "bioinfo", { includeRetired: true });
    expect(withRetired.skills.length).toBeGreaterThan(without.skills.length);
    expect(withRetired.skills.some((s) => s.name === "old-deseq-helper")).toBe(true);
  });

  test("listBundles includes every domain tag (taxonomy-merged)", async () => {
    const lib = await loadLibrary(FIXTURE_LIBRARY);
    const names = (await listBundles(lib)).map((b) => b.name);
    expect(names).toContain("bioinfo");
    expect(names).toContain("portfolio");
    // ADR-0002: bundles are domain tags only; "personal-brand" (an old sidecar
    // bundle, never a domain) no longer exists as a bundle.
    expect(names).not.toContain("personal-brand");
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
    expect(names).not.toContain("evidence-map");
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
    const r = searchSkills(lib, "checklist");
    expect(r.map((s) => s.name)).toContain("evidence-map");
    const byDomain = searchSkills(lib, "philosophy");
    expect(byDomain.map((s) => s.name)).toContain("concept-deconstruct");
  });

  test("listDomains is sorted + unique", async () => {
    const lib = await loadLibrary(FIXTURE_LIBRARY);
    const ds = listDomains(lib);
    expect(ds).toEqual([...new Set(ds)].sort());
    expect(ds).toContain("bioinfo");
    expect(ds).toContain("portfolio");
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
    expect(md).toContain("[github:anthropics/skills@skills/headline-picker]");
    // stable across two runs with same ts
    expect(generateIndex(lib, { generatedAt: "FIXED-TS" })).toBe(md);
  });
});
