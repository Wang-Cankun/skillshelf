// Command-level coverage via captured Ctx: show, search, ls, status, index,
// use/drop symlink lifecycle, and infer --emit / --apply.

import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync, symlinkSync, writeFileSync, mkdtempSync } from "node:fs";
import { lstat, readlink } from "node:fs/promises";
import * as show from "../src/commands/show.ts";
import * as search from "../src/commands/search.ts";
import * as ls from "../src/commands/ls.ts";
import * as status from "../src/commands/status.ts";
import * as indexCmd from "../src/commands/index.ts";
import * as use from "../src/commands/use.ts";
import * as drop from "../src/commands/drop.ts";
import * as infer from "../src/commands/infer.ts";
import {
  runCmd,
  tempLibrary,
  tempProject,
  FIXTURE_LIBRARY,
} from "./helpers.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

describe("skl show", () => {
  test("prints body + ref-file PATHS only, never ref contents", async () => {
    const r = await runCmd(show, ["rnaseq-qc"]);
    expect(r.code).toBe(0);
    // body present
    expect(r.out).toContain("# RNA-seq QC");
    // ref-file path listed
    expect(r.out).toContain("Reference files");
    expect(r.out).toContain("/reference");
    // CONTENTS of the reference file are NOT printed (string lives only in thresholds.md)
    expect(r.out).not.toContain("rRNA contamination");
  });

  test("--json carries body + refFiles + provenance", async () => {
    const r = await runCmd(show, ["xhs-title", "--json"]);
    expect(r.code).toBe(0);
    const j = r.json[0] as any;
    expect(j.name).toBe("xhs-title");
    expect(typeof j.body).toBe("string");
    expect(j.body).toContain("RED title");
    expect(j.domains).toContain("green-card"); // taxonomy merged
    expect(j.source.source).toContain("dbskill");
  });

  test("unknown skill exits non-zero with a hint", async () => {
    const r = await runCmd(show, ["does-not-exist"]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("skl search");
  });

  test("--file opens a bundled reference file's CONTENTS", async () => {
    const r = await runCmd(show, ["rnaseq-qc", "--file", "reference/thresholds.md"]);
    expect(r.code).toBe(0);
    // the contents that the plain `show` deliberately withholds
    expect(r.out).toContain("rRNA contamination");
  });

  test("--json refFiles enumerates nested files (recursive tree)", async () => {
    const r = await runCmd(show, ["rnaseq-qc", "--json"]);
    expect(r.code).toBe(0);
    const j = r.json[0] as any;
    expect(j.file).toBe("SKILL.md");
    const refs: string[] = j.refFiles;
    expect(refs.some((p) => p.endsWith("/reference"))).toBe(true); // dir node
    expect(refs.some((p) => p.endsWith("/reference/thresholds.md"))).toBe(true);
  });

  test("--file refuses to escape the skill directory", async () => {
    const r = await runCmd(show, ["rnaseq-qc", "--file", "../../../etc/passwd"]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("No readable file");
  });

  test("--file refuses a symlink that escapes the skill dir", async () => {
    const tmp = await tempLibrary();
    cleanups.push(tmp.cleanup);
    // a secret outside the library, and a symlink to it inside a skill dir
    const outside = join(mkdtempSync(join(tmpdir(), "skl-outside-")), "secret.md");
    writeFileSync(outside, "TOP SECRET");
    symlinkSync(outside, join(tmp.path, "rnaseq-qc", "leak.md"));
    const r = await runCmd(show, ["rnaseq-qc", "--file", "leak.md"], {
      library: tmp.path,
    });
    expect(r.code).toBe(1);
    expect(r.err).toContain("No readable file");
    expect(r.out).not.toContain("TOP SECRET"); // contents never dumped
  });
});

describe("skl search", () => {
  test("name match ranks first (human + json)", async () => {
    const human = await runCmd(search, ["commit"]);
    expect(human.code).toBe(0);
    expect(human.out.split("\n")[0]).toContain("commit-push");

    const j = await runCmd(search, ["commit", "--json"]);
    expect((j.json[0] as any[])[0].name).toBe("commit-push");
  });

  test("empty query is a usage error", async () => {
    const r = await runCmd(search, []);
    expect(r.code).toBe(1);
  });
});

describe("skl ls", () => {
  test("excludes retired by default, --all includes it", async () => {
    const def = await runCmd(ls, ["--json"]);
    const names = (def.json[0] as any[]).map((s) => s.name);
    expect(names).not.toContain("old-deseq-helper");

    const all = await runCmd(ls, ["--all", "--json"]);
    expect((all.json[0] as any[]).map((s) => s.name)).toContain("old-deseq-helper");
  });

  test("ls <bundle> resolves the tag query", async () => {
    const r = await runCmd(ls, ["bioinfo", "--json"]);
    const j = r.json[0] as any;
    expect(j.bundle).toBe("bioinfo");
    expect(j.skills.map((s: any) => s.name)).toContain("nature-figure");
  });

  test("--json emits origin + channel (the UI click-through gate contract)", async () => {
    const r = await runCmd(ls, ["--json"]);
    const rows = r.json[0] as any[];
    // vendored github skill → real owner/repo origin + channel "github"
    const vendored = rows.find((s) => s.name === "xhs-title");
    expect(vendored.source).toBe("vendored");
    expect(vendored.channel).toBe("github");
    expect(vendored.origin).toMatch(/^[^/]+\/[^/]+$/); // owner/repo, no channel prefix, no @subpath
    expect(vendored.origin).not.toContain("@");
    // local (hand-written) skill → no upstream → null origin/channel (no link)
    const local = rows.find((s) => s.name === "rnaseq-qc");
    expect(local.source).toBe("local");
    expect(local.origin).toBeNull();
    expect(local.channel).toBeNull();
  });
});

describe("skl index", () => {
  test("writes INDEX.md into the (temp) library", async () => {
    const t = await tempLibrary();
    cleanups.push(t.cleanup);
    const r = await runCmd(indexCmd, ["--json"], { library: t.path });
    expect(r.code).toBe(0);
    const j = r.json[0] as any;
    expect(existsSync(j.path)).toBe(true);
    const md = await Bun.file(j.path).text();
    expect(md).toContain("# Skill Index");
    expect(md).toContain("## bioinfo");
    expect(j.active).toBe(11);
    expect(j.retired).toBe(1);
  });
});

describe("skl status", () => {
  test("reports nothing linked in a fresh project", async () => {
    const p = await tempProject();
    cleanups.push(p.cleanup);
    const r = await runCmd(status, ["--json"], { cwd: p.path });
    expect(r.code).toBe(0);
    const j = r.json[0] as any;
    expect(j.linkedCount).toBe(0);
    expect(j.skillsDirExists).toBe(false);
  });
});

describe("skl use / drop symlink lifecycle", () => {
  test("use links a bundle's skills into ./.claude/skills, status sees them, drop removes them", async () => {
    const p = await tempProject();
    cleanups.push(p.cleanup);

    // USE bioinfo -> symlinks created
    const used = await runCmd(use, ["bioinfo", "--json"], { cwd: p.path });
    expect(used.code).toBe(0);
    const uj = used.json[0] as any;
    const linkedNames = uj.linked.map((l: any) => l.name).sort();
    expect(linkedNames).toContain("rnaseq-qc");
    expect(linkedNames).toContain("nature-figure");
    // retired skill never linked
    expect(linkedNames).not.toContain("old-deseq-helper");
    // distinct symlinks landed on disk: the two same-named scrna-cluster copies
    // collapse to one link slot, so distinct names < total bundle entries.
    const distinctLinked = new Set(uj.linked.map((l: any) => l.name)).size;

    // links are real symlinks pointing at the library skill dirs
    const link = join(p.path, ".claude", "skills", "rnaseq-qc");
    expect((await lstat(link)).isSymbolicLink()).toBe(true);
    const target = await readlink(link);
    expect(target).toBe(join(FIXTURE_LIBRARY, "rnaseq-qc"));

    // STATUS sees the bundle
    const st = await runCmd(status, ["--json"], { cwd: p.path });
    const sj = st.json[0] as any;
    expect(sj.linkedCount).toBe(distinctLinked);
    expect(sj.bundles.map((b: any) => b.name)).toContain("bioinfo");

    // USE again is idempotent: statuses become "already"
    const again = await runCmd(use, ["bioinfo", "--json"], { cwd: p.path });
    const aj = again.json[0] as any;
    expect(aj.linked.every((l: any) => l.status === "already" || l.status === "linked")).toBe(true);
    expect(aj.linked.some((l: any) => l.status === "already")).toBe(true);

    // DROP removes exactly this bundle's links
    const dropped = await runCmd(drop, ["bioinfo", "--json"], { cwd: p.path });
    expect(dropped.code).toBe(0);
    const dj = dropped.json[0] as any;
    expect(dj.removed).toBeGreaterThan(0);
    expect(existsSync(link)).toBe(false);

    // STATUS now empty again
    const st2 = await runCmd(status, ["--json"], { cwd: p.path });
    expect((st2.json[0] as any).linkedCount).toBe(0);
  });

  test("use on an empty bundle exits non-zero", async () => {
    const p = await tempProject();
    cleanups.push(p.cleanup);
    const r = await runCmd(use, ["no-such-bundle", "--json"], { cwd: p.path });
    expect(r.code).toBe(1);
    expect((r.json[0] as any).error).toBe("empty-bundle");
  });
});

describe("skl infer (LLM-free)", () => {
  test("--emit produces instruction + schema + corpus shape", async () => {
    const r = await runCmd(infer, ["--emit", "--json"]);
    expect(r.code).toBe(0);
    const p = r.json[0] as any;
    expect(typeof p.instruction).toBe("string");
    expect(p.schema.type).toBe("object");
    expect(Array.isArray(p.corpus.skills)).toBe(true);
    // mirrors collapsed: each name once, retired excluded by default
    const names = p.corpus.skills.map((s: any) => s.name);
    expect(names.filter((n: string) => n === "commit-push").length).toBe(1);
    expect(names).not.toContain("old-deseq-helper");
    // corpus entries carry description + currentDomains + bodyPreview
    const one = p.corpus.skills[0];
    expect(one).toHaveProperty("description");
    expect(one).toHaveProperty("currentDomains");
    expect(one).toHaveProperty("bodyPreview");
    expect(p.corpus.observedDomains).toContain("bioinfo");
  });

  test("--apply writes proposed domains into the central taxonomy (never upstream SKILL.md)", async () => {
    const t = await tempLibrary();
    cleanups.push(t.cleanup);

    const proposalPath = join(t.path, "proposal.json");
    await Bun.write(
      proposalPath,
      JSON.stringify({
        assignments: [
          { name: "repo-search", domains: ["coding", "search-tools"], primaryDomain: "coding", notes: "code nav" },
        ],
      }),
    );

    // snapshot the upstream SKILL.md before applying
    const skillMd = join(t.path, "repo-search", "SKILL.md");
    const before = await Bun.file(skillMd).text();

    const r = await runCmd(infer, ["--apply", proposalPath, "--json"], { library: t.path });
    expect(r.code).toBe(0);
    const res = r.json[0] as any;
    expect(res.ok).toBe(true);
    expect(res.counts.applied).toBe(1);

    // Central taxonomy (NOT a per-skill sidecar) carries the merged domains for
    // repo-search incl. the new tag. ADR-0002 drops the `notes` field — only the
    // domain string[] is persisted, so we no longer assert on notes.
    const { readTaxonomy } = await import("../src/core/taxonomy.ts");
    const tax = await readTaxonomy(t.path);
    expect(tax.skills["repo-search"]).toContain("search-tools");
    // No sidecar is ever written.
    expect(existsSync(join(t.path, "repo-search", "repo-search.shelf.json"))).toBe(false);

    // upstream SKILL.md untouched
    expect(await Bun.file(skillMd).text()).toBe(before);

    // re-loading the library reflects the new taxonomy domain
    const { loadLibrary, findByName } = await import("../src/core/library.ts");
    const lib = await loadLibrary(t.path);
    expect(findByName(lib, "repo-search")!.domains).toContain("search-tools");
  });

  test("--apply with an empty proposal exits non-zero", async () => {
    const t = await tempLibrary();
    cleanups.push(t.cleanup);
    const pf = join(t.path, "empty.json");
    await Bun.write(pf, JSON.stringify({ assignments: [] }));
    const r = await runCmd(infer, ["--apply", pf, "--json"], { library: t.path });
    expect(r.code).toBe(1);
  });

  test("conflicting modes are rejected", async () => {
    const r = await runCmd(infer, ["--emit", "--provider", "openai"]);
    expect(r.code).toBe(1);
  });
});
