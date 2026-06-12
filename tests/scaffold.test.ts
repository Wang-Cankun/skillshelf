// skl new scaffolding, config resolution, frontmatter round-trip, and the
// deterministic source-parsing used by add/update/outdated.

import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { existsSync } from "node:fs";
import * as newCmd from "../src/commands/new.ts";
import { resolveConfig } from "../src/config.ts";
import { parseFrontmatter, serializeFrontmatter } from "../src/lib/frontmatter.ts";
import { parseSource, parseStoredSource } from "../src/core/fetch.ts";
import { runCmd, tempLibrary } from "./helpers.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

describe("skl new", () => {
  test("scaffolds a domain skill the library can then load", async () => {
    const t = await tempLibrary();
    cleanups.push(t.cleanup);

    const r = await runCmd(
      newCmd,
      ["fresh-skill", "--domain", "coding", "--desc", "A brand new skill", "--json"],
      { library: t.path },
    );
    expect(r.code).toBe(0);
    const j = r.json[0] as any;
    expect(j.created).toBe(true);
    // flat layout (ADR-0001): --domain is a tag, never a folder
    const bodyPath = join(t.path, "fresh-skill", "SKILL.md");
    expect(existsSync(bodyPath)).toBe(true);

    const raw = await Bun.file(bodyPath).text();
    const { data } = parseFrontmatter(raw);
    expect(data.name).toBe("fresh-skill");
    expect(data.domains).toEqual(["coding"]);

    const { loadLibrary, findByName } = await import("../src/core/library.ts");
    const lib = await loadLibrary(t.path);
    const s = findByName(lib, "fresh-skill")!;
    expect(s.primaryDomain).toBe("coding");
    expect(s.description).toBe("A brand new skill");
  });

  test("refuses to clobber existing SKILL.md without --force", async () => {
    const t = await tempLibrary();
    cleanups.push(t.cleanup);
    // repo-search already exists (flat layout) at library/repo-search/
    const r = await runCmd(newCmd, ["repo-search", "--domain", "coding"], {
      library: t.path,
    });
    expect(r.code).toBe(1);
    expect(r.err).toContain("already exists");
  });

  test("rejects invalid slug", async () => {
    const t = await tempLibrary();
    cleanups.push(t.cleanup);
    const r = await runCmd(newCmd, ["Not A Slug"], { library: t.path });
    expect(r.code).toBe(1);
  });
});

describe("config resolution order", () => {
  test("env SKILLSHELF_LIBRARY wins", async () => {
    const cfg = await resolveConfig({
      env: { SKILLSHELF_LIBRARY: "/tmp/from-env" } as any,
      configFilePath: "/nonexistent/config.json",
    });
    expect(cfg.libraryPath).toBe("/tmp/from-env");
    expect(cfg.source).toBe("env");
  });

  test("config file used when no env", async () => {
    const t = await tempLibrary();
    cleanups.push(t.cleanup);
    const cfgFile = join(t.path, "config.json");
    await Bun.write(cfgFile, JSON.stringify({ library: "/tmp/from-config" }));
    const cfg = await resolveConfig({ env: {} as any, configFilePath: cfgFile });
    expect(cfg.libraryPath).toBe("/tmp/from-config");
    expect(cfg.source).toBe("config");
  });

  test("default when neither env nor config", async () => {
    const cfg = await resolveConfig({
      env: {} as any,
      configFilePath: "/nonexistent/config.json",
    });
    expect(cfg.source).toBe("default");
    expect(cfg.libraryPath).toContain(".skillshelf");
  });
});

describe("frontmatter round-trip via serialize", () => {
  test("serialize -> parse preserves scalars + lists + body", () => {
    const out = serializeFrontmatter(
      { name: "x", description: "has: colon, and # hash", domains: ["a", "b-c"] },
      "# Title\n\nbody line\n",
    );
    const { data, body } = parseFrontmatter(out);
    expect(data.name).toBe("x");
    expect(data.description).toBe("has: colon, and # hash");
    expect(data.domains).toEqual(["a", "b-c"]);
    expect(body).toContain("# Title");
  });

  test("inline list keeps quoted items containing commas intact", () => {
    // Regression: naive comma-split corrupted quoted tags. A description-like
    // tag with an internal comma must survive as one item.
    const { data } = parseFrontmatter('---\ndomains: ["a, b", c, \'d, e\']\n---\nbody\n');
    expect(data.domains).toEqual(["a, b", "c", "d, e"]);
  });
});

describe("source parsing (add/update/outdated core)", () => {
  test("github: shorthand with subpath", () => {
    const p = parseSource("github:dontbesilent2025/dbskill/skills/xhs-title");
    expect(p.channel).toBe("github");
    expect(p.source).toBe("github:dontbesilent2025/dbskill");
    expect(p.subpath).toBe("skills/xhs-title");
  });

  test("https github url normalizes", () => {
    const p = parseSource("https://github.com/mattpocock/skills/tree/main/foo");
    expect(p.channel).toBe("github");
    expect(p.source).toBe("github:mattpocock/skills");
    expect(p.subpath).toBe("foo");
  });

  test("bare name falls back to registry channel", () => {
    const p = parseSource("some-registry-skill");
    expect(p.channel).toBe("vercel-registry");
    expect(p.registryName).toBe("some-registry-skill");
  });

  test("parseStoredSource round-trips an @subpath lock source", () => {
    const p = parseStoredSource("github:dontbesilent2025/dbskill@skills/xhs-title");
    expect(p.channel).toBe("github");
    expect(p.source).toBe("github:dontbesilent2025/dbskill");
    expect(p.subpath).toBe("skills/xhs-title");
  });
});
