// Unit tests for the single source of truth for "stub" (ADR W5). isStub is the
// one predicate shared by needsAttentionNames (inbox triage) and HealthStrip's
// footer "N stub" count, so both must agree on exactly the scaffold defaults.
// Pure function over a synthetic Skill — no DOM, runs under `bun test`.

import { test, expect, describe } from "bun:test";
import type { Skill } from "./types.ts";
import { isStub, STUB_DEFAULTS, stubCount } from "./derive.ts";

function skill(p: Partial<Skill> & { name: string }): Skill {
  return {
    name: p.name,
    description: p.description ?? `desc for ${p.name}`,
    primaryDomain: p.primaryDomain ?? (p.domains?.[0] ?? null),
    domains: p.domains ?? [],
    path: p.path ?? `/lib/${p.name}`,
    retired: p.retired ?? false,
    mode: p.mode ?? "owned",
    linkTarget: p.linkTarget ?? null,
    source: p.source ?? "local",
    deployCount: p.deployCount ?? 0,
  };
}

describe("isStub — scaffold-default detection", () => {
  test("true for the long default prefix", () => {
    expect(
      isStub(skill({ name: "a", description: "Replace with description of the skill" })),
    ).toBe(true);
  });

  test("true for the short default prefix", () => {
    expect(
      isStub(skill({ name: "b", description: "Replace with a description" })),
    ).toBe(true);
  });

  test("true when a default prefix is only the START of the description (startsWith)", () => {
    expect(
      isStub(
        skill({
          name: "c",
          description: "replace with a description — TODO fill this in later",
        }),
      ),
    ).toBe(true);
  });

  test("false for a real description", () => {
    expect(
      isStub(
        skill({
          name: "d",
          description: "Deploy and audit agent skills from a canonical library.",
        }),
      ),
    ).toBe(false);
  });
});

describe("STUB_DEFAULTS — the shared prefix list", () => {
  test("exports both scaffold prefixes, all lowercase", () => {
    expect(STUB_DEFAULTS).toEqual([
      "replace with description of the skill",
      "replace with a description",
    ]);
  });
});

describe("stubCount — live-only population (matches needsAttentionNames)", () => {
  test("counts live stubs and EXCLUDES retired stubs", () => {
    const skills = [
      skill({ name: "live-stub", description: "Replace with a description" }),
      skill({ name: "retired-stub", description: "Replace with a description", retired: true }),
      skill({ name: "real", description: "A genuine, filled-in description." }),
    ];
    // Only the live stub counts. The retired stub is excluded — needsAttentionNames
    // also filters to !retired, so the footer count must too (the W5 fix). A retired
    // stub inflating the footer but not the inbox is exactly the disagreement W5 kills.
    expect(stubCount(skills)).toBe(1);
  });

  test("0 when there are no live stubs", () => {
    expect(stubCount([skill({ name: "x", description: "a real description" })])).toBe(0);
  });
});
