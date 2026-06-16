// `skl track <name> --source <src>` / `skl untrack <name>` — adopt provenance for a
// skill ALREADY in the library, WITHOUT re-downloading its content (ADR-0011).
//
//   skl track <name> --source <src> [--ref <r>] [--resolve] [--force] [--json]
//   skl untrack <name> [--json]
//
// `track` attaches a lockfile entry to an OWNED library skill the user already has on
// disk. It records the LOCAL body hash as the assumed baseline and marks the entry
// `adopted: true` — provenance is known, but the upstream baseline was NEVER verified.
// `outdated` then reports it as "adopted" and `update` stays conservative (always diff,
// require --force) until the entry graduates by reconciling against real upstream.
//
// `track` does NO network by default and NEVER downloads/clones content. With --resolve
// it best-effort fetches JUST the upstream SKILL.md (single file) to pin the real ref and
// check whether the local copy already matches upstream — it still never full-clones.
//
// `untrack` removes the lockfile entry (idempotent, like `drop`) — the inverse of track
// (ADR-0005).

import type { Ctx, LockEntry } from "../types.ts";
import { parseFrontmatter } from "../lib/frontmatter.ts";
import { hashContent } from "../core/crawl.ts";
import { readLockfile, recordEntry, removeEntry } from "../core/provenance.ts";
import {
  parseStoredSource,
  latestRef,
  readSkillBody,
  hasBinary,
  type ParsedSource,
} from "../core/fetch.ts";
import { entryMode, loadLibrary, findByName } from "../core/library.ts";

export const meta = {
  name: "track",
  summary: "Adopt provenance for a library skill you already have (offline; no re-download)",
  usage: "skl track <name> --source <src> [--ref <r>] [--resolve] [--force] [--json]",
} as const;

/** Body text after frontmatter — the unit install/drift hashes operate on. */
function bodyOf(text: string): string {
  return parseFrontmatter(text).body;
}

/** Channel string stored in the lockfile, derived from a parsed source. */
function channelOf(parsed: ParsedSource): string {
  if (parsed.channel === "github") return "github";
  if (parsed.channel === "git") return "git";
  return "vercel-registry";
}

/**
 * The canonical lockfile `source` string for a parsed source — the SAME encoding
 * `add.ts` writes, so `outdated`/`update` re-parse it identically:
 *   github   → `github:owner/repo[@subpath]`
 *   git      → `git:<localPath>[#subpath]`
 *   registry → the bare name
 */
function canonicalStoredSource(parsed: ParsedSource): string {
  if (parsed.channel === "github") {
    return `${parsed.source}${parsed.subpath ? `@${parsed.subpath}` : ""}`;
  }
  if (parsed.channel === "git") {
    return `git:${parsed.localPath}${parsed.subpath ? `#${parsed.subpath}` : ""}`;
  }
  return parsed.source;
}

/** Outcome of the shared track logic — reused by `migrate`. */
export type TrackResult =
  | {
      ok: true;
      name: string;
      source: string;
      channel: string;
      ref: string;
      adopted: boolean;
      localEdits: boolean;
      installedHash: string;
      note: string;
    }
  | { ok: false; name: string; reason: string; hint?: string };

/**
 * Core `track` logic, reused by both `skl track` and `skl migrate`. Attaches a
 * provenance lock entry to an OWNED library skill the user already has on disk, recording
 * the LOCAL body hash as the assumed baseline (adopted=true) — no network/download unless
 * `resolve` is set. Returns a discriminated result; the caller renders/aggregates it.
 *
 * `library` is the already-loaded library (so a bulk caller loads it once).
 */
export async function trackOne(
  libraryPath: string,
  library: import("../types.ts").Skill[],
  opts: { name: string; source: string; ref?: string | null; resolve?: boolean; force?: boolean },
): Promise<TrackResult> {
  const name = opts.name.trim();

  // GUARD (a): the skill must already be in the library.
  const skill = findByName(library, name);
  if (!skill) {
    return {
      ok: false,
      name,
      reason: "not in the library",
      hint: "`skl import <name> --from <path>` (your own) or `skl add <src>` (third-party)",
    };
  }

  // GUARD (b): a LINKED entry's versioning belongs to its dev repo (ADR-0004).
  if (entryMode(libraryPath, name) === "linked") {
    return { ok: false, name, reason: "LINKED to a dev repo — its own git owns versioning (ADR-0004)" };
  }

  // GUARD (c): refuse to clobber an existing lock entry without force.
  const lock = await readLockfile(libraryPath);
  if (lock.entries[name] && !opts.force) {
    return { ok: false, name, reason: `already tracked (source ${lock.entries[name]!.source}) — use --force to re-adopt` };
  }

  // GUARD (d): the source must round-trip through parseStoredSource — i.e. parse to a
  // re-encodable stored form that `outdated`/`update` can re-parse. We parse via
  // parseStoredSource (it understands the `owner/repo@subpath` + git `#subpath`
  // conventions add.ts stores), reconstruct the canonical STORED string the same way
  // add.ts does, then verify it re-parses to the identical channel + source.
  const parsedSource = parseStoredSource(opts.source.trim());
  const storedSource = canonicalStoredSource(parsedSource);
  const reparsed = parseStoredSource(storedSource);
  if (reparsed.channel !== parsedSource.channel || reparsed.source !== parsedSource.source || reparsed.subpath !== parsedSource.subpath) {
    return { ok: false, name, reason: `source "${opts.source}" does not round-trip cleanly` };
  }

  // Compute the LOCAL body hash — the assumed baseline. NO network, NO download.
  const localText = await readSkillBody(skill.path);
  if (localText === "") {
    return { ok: false, name, reason: `no readable SKILL.md at ${skill.path}` };
  }
  const localHash = hashContent(bodyOf(localText));

  const installedAt = new Date().toISOString();
  const channel = channelOf(parsedSource);

  let ref = "";
  let adopted = true;
  let localEdits = false;
  let note = "";

  // --ref: the user is ASSERTING the exact installed commit — trust it (adopted=false).
  if (opts.ref && opts.ref.trim() !== "") {
    ref = opts.ref.trim();
    adopted = false;
  }

  // --resolve: pin the real ref + best-effort single-file body compare (never a clone).
  if (opts.resolve) {
    const refRes = await latestRef(parsedSource);
    if (refRes.ok) {
      ref = refRes.ref;
      const upstreamText = await fetchUpstreamSkillMd(parsedSource);
      if (upstreamText !== null) {
        const upstreamHash = hashContent(bodyOf(upstreamText));
        if (upstreamHash === localHash) {
          adopted = false;
          localEdits = false;
          note = "local body matches upstream (verified)";
        } else {
          adopted = true;
          localEdits = true;
          note = "local body differs from upstream (kept adopted; localEdits set)";
        }
      } else {
        note = "resolved ref only (upstream SKILL.md not cheaply fetchable; kept adopted)";
      }
    } else {
      note = `could not resolve upstream ref (${refRes.error}); kept adopted`;
    }
  }

  const entry: LockEntry = {
    name,
    source: storedSource,
    ref,
    channel,
    installedAt,
    localEdits,
    installedHash: localHash,
    adopted,
  };
  await recordEntry(libraryPath, entry);

  return { ok: true, name, source: storedSource, channel, ref, adopted, localEdits, installedHash: localHash, note };
}

interface TrackFlags {
  name: string | null;
  source: string | null;
  ref: string | null;
  resolve: boolean;
  force: boolean;
  json: boolean;
}

function parseTrackFlags(argv: string[]): { flags: TrackFlags } | { error: string } {
  const flags: TrackFlags = {
    name: null,
    source: null,
    ref: null,
    resolve: false,
    force: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--source") {
      const v = argv[++i];
      if (v === undefined) return { error: "--source requires a <src>" };
      flags.source = v;
    } else if (a.startsWith("--source=")) {
      flags.source = a.slice("--source=".length);
    } else if (a === "--ref") {
      const v = argv[++i];
      if (v === undefined) return { error: "--ref requires a value" };
      flags.ref = v;
    } else if (a.startsWith("--ref=")) {
      flags.ref = a.slice("--ref=".length);
    } else if (a === "--resolve") {
      flags.resolve = true;
    } else if (a === "--force") {
      flags.force = true;
    } else if (a === "--json") {
      flags.json = true;
    } else if (a.startsWith("--")) {
      return { error: `unknown argument: ${a}` };
    } else if (flags.name === null) {
      flags.name = a;
    } else {
      return { error: `unexpected argument: ${a}` };
    }
  }
  return { flags };
}

/** Run a command capturing output. Never throws (missing binary -> ok:false). */
async function runCmd(cmd: string[]): Promise<{ ok: boolean; stdout: string }> {
  try {
    const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
    const stdout = await new Response(proc.stdout).text();
    const code = await proc.exited;
    return { ok: code === 0, stdout };
  } catch {
    return { ok: false, stdout: "" };
  }
}

/**
 * Best-effort fetch of JUST the upstream SKILL.md body for a parsed source — a single
 * file, NEVER a full clone (the whole point of `track`). Returns the upstream SKILL.md
 * TEXT, or null when it can't be fetched cheaply (caller degrades gracefully).
 *
 *   - github: `gh api .../contents/<path>/SKILL.md` raw (token auth, subpath-aware).
 *   - git: `git archive` against the remote is not portable, so a single-file fetch is
 *     not cheaply possible — return null and let the caller degrade (ref only).
 *   - registry: no single-file fetch — null.
 */
async function fetchUpstreamSkillMd(parsed: ParsedSource): Promise<string | null> {
  if (parsed.channel === "github" && parsed.owner && parsed.repo) {
    const path = `${parsed.subpath ? parsed.subpath.replace(/\/+$/, "") + "/" : ""}SKILL.md`;
    if (await hasBinary("gh")) {
      const endpoint = `repos/${parsed.owner}/${parsed.repo}/contents/${path}`;
      const r = await runCmd(["gh", "api", endpoint, "-H", "Accept: application/vnd.github.raw"]);
      if (r.ok && r.stdout.trim() !== "") return r.stdout;
    }
    return null;
  }
  // git / registry: no cheap single-file fetch — degrade gracefully.
  return null;
}

export async function run(argv: string[], ctx: Ctx): Promise<number> {
  const parsed = parseTrackFlags(argv);
  if ("error" in parsed) {
    ctx.error(`skl track: ${parsed.error}`);
    ctx.error(`usage: ${meta.usage}`);
    return 1;
  }
  const flags = parsed.flags;

  if (!flags.name || flags.name.trim() === "") {
    ctx.error("skl track: a <name> is required");
    ctx.error(`usage: ${meta.usage}`);
    return 1;
  }
  if (!flags.source || flags.source.trim() === "") {
    ctx.error("skl track: --source <src> is required");
    ctx.error(`usage: ${meta.usage}`);
    return 1;
  }

  const name = flags.name.trim();
  const libraryPath = ctx.config.libraryPath;

  try {
    const library = await loadLibrary(libraryPath);
    const result = await trackOne(libraryPath, library, {
      name,
      source: flags.source.trim(),
      ref: flags.ref,
      resolve: flags.resolve,
      force: flags.force,
    });

    if (!result.ok) {
      ctx.error(`skl track: '${result.name}': ${result.reason}`);
      if (result.hint) ctx.error(`     bring it in first with: ${result.hint}`);
      return 1;
    }

    if (flags.json) {
      ctx.json({ action: "track" as const, ...result });
    } else {
      ctx.log(`tracked ${result.name}`);
      ctx.log(`  source:  ${result.source}`);
      ctx.log(`  channel: ${result.channel}`);
      ctx.log(`  ref:     ${result.ref || "(unverified — adopted)"}`);
      ctx.log(
        `  adopted: ${result.adopted}${result.adopted ? " (baseline unverified — run `skl update` to reconcile)" : ""}`,
      );
      if (result.note) ctx.log(`  resolve: ${result.note}`);
    }
    return 0;
  } catch (err) {
    ctx.error(`skl track: failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
