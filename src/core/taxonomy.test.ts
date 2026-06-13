// Focused unit coverage for the central taxonomy module (ADR-0002): the single
// <library>/taxonomy.json file that replaced the per-skill <skill>.shelf.json
// sidecars. Exercises tolerant read, sorted+pretty write round-trip, the pure
// applyTaxonomy merge, and non-destructive setDomainsForName.

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  taxonomyPath,
  readTaxonomy,
  writeTaxonomy,
  domainsForName,
  applyTaxonomy,
  setDomainsForName,
} from "./taxonomy.ts";
import type { Skill, Taxonomy } from "../types.ts";

/** A throwaway library dir (each test removes its own at the end). */
async function scratchLib(): Promise<string> {
  return mkdtemp(join(tmpdir(), "skl-tax-"));
}

/** A minimal base Skill for applyTaxonomy tests. */
function baseSkill(over: Partial<Skill> = {}): Skill {
  return {
    name: "demo",
    description: "",
    primaryDomain: null,
    domains: [],
    path: "/lib/demo",
    bodyPath: "/lib/demo/SKILL.md",
    refFiles: [],
    source: null,
    retired: false,
    mirrorOf: null,
    contentHash: "h",
    ...over,
  };
}

describe("taxonomyPath", () => {
  test("joins taxonomy.json under the library root", () => {
    expect(taxonomyPath("/lib")).toBe(join("/lib", "taxonomy.json"));
  });
});

describe("readTaxonomy", () => {
  test("missing file returns an empty, valid taxonomy", async () => {
    const lib = await scratchLib();
    const tax = await readTaxonomy(lib);
    expect(tax).toEqual({ version: 1, skills: {} });
    await rm(lib, { recursive: true, force: true });
  });

  test("invalid JSON falls back to empty taxonomy (tolerant)", async () => {
    const lib = await scratchLib();
    await writeFile(taxonomyPath(lib), "{ not json");
    const tax = await readTaxonomy(lib);
    expect(tax).toEqual({ version: 1, skills: {} });
    await rm(lib, { recursive: true, force: true });
  });

  test("coerces values to de-duped, trimmed, non-empty string[]", async () => {
    const lib = await scratchLib();
    await writeFile(
      taxonomyPath(lib),
      JSON.stringify({
        version: 1,
        skills: {
          a: ["  coding ", "coding", "", "writing"],
          b: "not-an-array",
        },
      }),
    );
    const tax = await readTaxonomy(lib);
    expect(tax.skills["a"]).toEqual(["coding", "writing"]);
    // non-array entries are skipped entirely
    expect(tax.skills["b"]).toBeUndefined();
    await rm(lib, { recursive: true, force: true });
  });
});

describe("writeTaxonomy + readTaxonomy round-trip", () => {
  test("round-trips and writes skill keys SORTED, pretty + trailing newline", async () => {
    const lib = await scratchLib();
    const tax: Taxonomy = {
      version: 1,
      skills: { zeta: ["x"], alpha: ["coding"], mid: ["writing", "marketing"] },
    };
    await writeTaxonomy(lib, tax);

    const raw = await Bun.file(taxonomyPath(lib)).text();
    // keys are sorted on disk
    expect(Object.keys(JSON.parse(raw).skills)).toEqual(["alpha", "mid", "zeta"]);
    // pretty (2-space) + trailing newline
    expect(raw.endsWith("}\n")).toBe(true);
    expect(raw).toContain('\n  "version": 1');

    const back = await readTaxonomy(lib);
    expect(back).toEqual(tax);
    await rm(lib, { recursive: true, force: true });
  });
});

describe("domainsForName", () => {
  test("returns the recorded domains or [] when absent", () => {
    const tax: Taxonomy = { version: 1, skills: { a: ["coding"] } };
    expect(domainsForName(tax, "a")).toEqual(["coding"]);
    expect(domainsForName(tax, "missing")).toEqual([]);
  });
});

describe("applyTaxonomy (pure merge)", () => {
  test("unions taxonomy domains existing-first and sets primaryDomain", () => {
    const skill = baseSkill({ domains: ["a", "b"], primaryDomain: "a" });
    const tax: Taxonomy = { version: 1, skills: { demo: ["b", "c"] } };
    const merged = applyTaxonomy(skill, tax);
    expect(merged.domains).toEqual(["a", "b", "c"]);
    expect(merged.primaryDomain).toBe("a"); // effective domains[0]
    // input is not mutated
    expect(skill.domains).toEqual(["a", "b"]);
  });

  test("an untagged skill gains primaryDomain = first taxonomy domain", () => {
    const skill = baseSkill({ domains: [], primaryDomain: null });
    const tax: Taxonomy = { version: 1, skills: { demo: ["writing", "green-card"] } };
    const merged = applyTaxonomy(skill, tax);
    expect(merged.domains).toEqual(["writing", "green-card"]);
    expect(merged.primaryDomain).toBe("writing");
  });

  test("no taxonomy entry leaves domains untouched; primaryDomain stays null", () => {
    const skill = baseSkill({ domains: [], primaryDomain: null });
    const merged = applyTaxonomy(skill, { version: 1, skills: {} });
    expect(merged.domains).toEqual([]);
    expect(merged.primaryDomain).toBeNull();
  });
});

describe("setDomainsForName (non-destructive merge)", () => {
  test("creates an entry, then unions new domains without dropping existing ones", async () => {
    const lib = await scratchLib();
    await setDomainsForName(lib, "demo", ["coding"]);
    expect((await readTaxonomy(lib)).skills["demo"]).toEqual(["coding"]);

    // a second call unions — existing first, new appended, de-duped
    await setDomainsForName(lib, "demo", ["coding", "search-tools"]);
    expect((await readTaxonomy(lib)).skills["demo"]).toEqual(["coding", "search-tools"]);

    // a different skill is left untouched
    await setDomainsForName(lib, "other", ["writing"]);
    const tax = await readTaxonomy(lib);
    expect(tax.skills["demo"]).toEqual(["coding", "search-tools"]);
    expect(tax.skills["other"]).toEqual(["writing"]);
    await rm(lib, { recursive: true, force: true });
  });
});
