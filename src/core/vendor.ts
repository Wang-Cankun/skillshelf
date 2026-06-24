// skl vendor — the curator's WRITE side of the library. `add` is a LIBRARIAN: it (and
// only it) vendors third-party bytes INTO `<library>/`. This module owns that deep
// operation so the "writes the library" boundary is a property of ONE place, not spread
// across the command layer:
//
//   - installSkill(...) — copy a discovered skill into the library, record provenance,
//     and report the drift verdict (new/identical/differs). The body-equality rule is
//     NOT reimplemented here: it routes through core/reconcile.ts classify(), the single
//     verdict classifier `update`/`outdated` also use.
//   - track(...) / adopt(...) — attach a provenance lock entry to a skill ALREADY on disk
//     WITHOUT re-downloading (ADR-0011); the shared logic behind `skl track` + `skl migrate`.
//   - the shared GUARD SUITE every write path funnels through: the retired-tombstone
//     collision guard, the symlink-escape guard (destEscapesLibrary + nearestExisting),
//     plus assertSafeName/entryStatus re-used from core/library.ts.
//
// PURE OF THE COMMAND LAYER: no `Ctx`, no argv parsing, no human/--json rendering. The
// commands parse + render; vendor mutates the library. A `warn` callback is threaded in
// where a write step wants to surface a non-fatal note (the inference seam) so vendor
// stays decoupled from the command's output sink.

import { join, basename, dirname, sep } from "node:path";
import { existsSync } from "node:fs";
import type { LockEntry, Skill } from "../types.ts";
import {
  copySkillDir,
  readSkillBody,
  latestRef,
  parseStoredSource,
  hasBinary,
  type DiscoveredSkill,
  type ParsedSource,
} from "./fetch.ts";
import { parseFrontmatter } from "../lib/frontmatter.ts";
import { hashContent } from "./crawl.ts";
import { classify } from "./reconcile.ts";
import { readLockfile, recordEntry } from "./provenance.ts";
import { setDomainsForName } from "./taxonomy.ts";
import { SLUG_RE } from "./lifecycle.ts";
import {
  assertSafeName,
  entryStatus,
  entryMode,
  findByName,
} from "./library.ts";
import { ensureDir, isSymlink, realpathOrSelf } from "../lib/fs.ts";

// assertSafeName + entryStatus already live in core/library.ts (beside the single
// existence-resolution primitive). Re-export them here so the curator boundary's whole
// guard suite is reachable from ONE module — callers reach for the retired/symlink/safe-
// name guards together without importing three modules.
export { assertSafeName, entryStatus };

/** Body text after frontmatter — the unit drift/install hashes operate on. */
export function bodyOf(text: string): string {
  return parseFrontmatter(text).body;
}

// ---------------------------------------------------------------------------
// GUARD SUITE — the checks every library-write path funnels through, ONCE.
// ---------------------------------------------------------------------------

/** The library destination dir for a slug (under its domain folder, if any). */
export function destDirFor(libraryPath: string, domainFolder: string | null, name: string): string {
  return domainFolder ? join(libraryPath, domainFolder, name) : join(libraryPath, name);
}

/** The nearest ancestor of `p` (incl. `p`) that exists on disk; falls back to `p`. */
export function nearestExisting(p: string): string {
  let cur = p;
  while (!existsSync(cur) && !isSymlink(cur)) {
    const parent = dirname(cur);
    if (parent === cur) return cur;
    cur = parent;
  }
  return cur;
}

/**
 * True if writing to `destDir` would resolve OUTSIDE the library — i.e. the nearest
 * existing component on the way to destDir is (or is reached through) a symlink whose
 * realpath escapes the library. Catches a symlinked DOMAIN folder (`library/<d> ->
 * /external`) that the leaf-only `isSymlink(destDir)` check misses, so `--force` can't
 * clobber an external tree through a symlinked parent (ADR-0004). Both sides anchor to
 * their nearest existing ancestor, so a fresh (not-yet-created) library is not a false
 * positive — its anchor is the shared parent, which contains itself.
 */
export function destEscapesLibrary(libraryPath: string, destDir: string): boolean {
  const libReal = realpathOrSelf(nearestExisting(libraryPath));
  const destReal = realpathOrSelf(nearestExisting(destDir));
  return !(destReal === libReal || destReal.startsWith(libReal + sep));
}

/**
 * The symlink-escape guard: would writing `destDir` go THROUGH a symlink into something
 * the library doesn't own — a LINKED leaf entry, OR a destination reached through a
 * symlinked ANCESTOR (e.g. a symlinked --domain folder) whose realpath escapes the
 * library? Writing through either clobbers an external dev repo, even with --force
 * (ADR-0004). The two add/dry-run sites that combined `isSymlink(destDir) ||
 * destEscapesLibrary(...)` inline now share this one predicate.
 */
export function writesThroughSymlink(libraryPath: string, destDir: string): boolean {
  return isSymlink(destDir) || destEscapesLibrary(libraryPath, destDir);
}

/**
 * The retired-tombstone collision guard: TRUE iff `name` exists ONLY as a retired
 * tombstone (<library>/_retired/<name>) and has no active slot. A fresh active copy
 * beside a tombstone would strand a duplicate and break `skl unretire`, so add/import/
 * link all refuse it regardless of --force (force overwrites an ACTIVE copy, not a
 * retired one). Each command keeps its own bespoke error wording + exit handling; this
 * is the shared PREDICATE they all branch on. Checked against the flat library root
 * (retirement is never under a domain folder); name-validated via entryStatus.
 */
export function isRetiredOnly(libraryPath: string, name: string): boolean {
  const status = entryStatus(libraryPath, name);
  return status.retired && !status.active;
}

// ---------------------------------------------------------------------------
// installSkill — vendor a discovered skill INTO the library (copy + provenance).
// ---------------------------------------------------------------------------

/** The drift relationship of a candidate install vs. the library destination. */
export type Verdict = "new" | "identical" | "differs";

/**
 * Drift preflight for one skill against the library destination it would install to:
 *   - new       — nothing at the destination → would install
 *   - identical — destination body hash matches upstream → lossless overwrite
 *   - differs   — destination body differs → would clobber local content (needs --force)
 * Compares the frontmatter-stripped BODY (matches installedHash / `skl update`).
 */
export async function driftVerdict(skill: DiscoveredSkill, destDir: string): Promise<Verdict> {
  const localPath = join(destDir, "SKILL.md");
  const upstream = hashContent(bodyOf(await readSkillBody(skill.dir)));
  let localHash: string | null = null;
  if (existsSync(localPath)) {
    let localText = "";
    try {
      localText = await Bun.file(localPath).text();
    } catch {
      localText = "";
    }
    localHash = hashContent(bodyOf(localText));
  }
  // Route the body-equality rule through the shared classifier so it can't drift from
  // `update`'s. add has no installed baseline (installedHash:null, localEdits:false) and
  // no upstream ref, so a differing body yields 'stalePending' (editedSinceInstall is
  // false). Fold BOTH differ-verdicts ('diverged' and 'stalePending') -> 'differs', so a
  // future real-baseline add still gates a differing body. Local Verdict type unchanged.
  const verdict = classify({
    adopted: false,
    mode: "owned",
    installedHash: null,
    localEdits: false,
    localHash,
    upstreamHash: upstream,
    installedRef: "",
    latestRef: null,
    structural: null,
  });
  if (verdict === "new") return "new";
  if (verdict === "identical") return "identical";
  return "differs"; // 'diverged' | 'stalePending'
}

/**
 * Optional AI inference tagging pass over a freshly-installed skill. No inference hook
 * ships today, so this always leaves the skill untagged (returns null); installs land
 * with whatever `--domain` gave them. Kept as a seam so `--infer`/`--no-infer` and the
 * `tagged` summary field stay meaningful when a hook is wired in.
 */
async function maybeInferTags(
  _skill: Skill,
  _warn?: (msg: string) => void,
): Promise<string[] | null> {
  return null;
}

export interface InstallOptions {
  libraryPath: string;
  domainFolder: string | null;
  /** single-skill --name override; ignored in multi mode */
  nameOverride: string | null;
  /** per-skill lockfile `source` string (already carries the @subpath / #subpath) */
  sourceStr: string;
  ref: string;
  channel: string;
  infer: boolean;
  force: boolean;
  /** multi mode applies skip-differs-without-force + the never-write-through-symlink
   *  guard; single mode preserves the legacy "exists without --force → error" rule. */
  multi: boolean;
}

export interface InstallOutcome {
  name: string;
  subpath: string;
  verdict: Verdict | "duplicate" | "retired";
  status: "installed" | "skipped" | "error";
  reason: string;
  path: string;
  source: string;
  ref: string;
  channel: string;
  installedAt: string;
  tagged: boolean;
  domains: string[];
}

/**
 * Install (copy + record provenance + tag) a single discovered skill. The deep WRITE
 * `add` delegates to: runs the safe-name + retired + symlink-escape guards, computes the
 * drift verdict via reconcile.classify (NOT a reimplemented drift rule), copies into the
 * library, records the lock entry, and (best-effort) tags. `warn` surfaces a non-fatal
 * inference note back to the caller's output sink (the only command coupling, threaded as
 * a callback so vendor stays Ctx-free). Returns a structured outcome; the caller renders.
 */
export async function installSkill(
  skill: DiscoveredSkill,
  opts: InstallOptions,
  warn?: (msg: string) => void,
): Promise<InstallOutcome> {
  const rawName =
    opts.nameOverride && opts.nameOverride.trim() !== "" ? opts.nameOverride.trim() : skill.name;
  const base: InstallOutcome = {
    name: rawName,
    subpath: skill.subpath,
    verdict: "new",
    status: "error",
    reason: "",
    path: "",
    source: opts.sourceStr,
    ref: opts.ref,
    channel: opts.channel,
    installedAt: "",
    tagged: false,
    domains: [],
  };

  // SECURITY: `name` derives from untrusted upstream frontmatter (or --name) and is
  // joined into a library path. Reject anything that isn't a clean slug, then a
  // belt-and-suspenders single-segment check, so a crafted name (e.g. "../../etc")
  // can't escape the library before it reaches join()/copy.
  if (!SLUG_RE.test(rawName)) {
    return {
      ...base,
      reason: `invalid skill name "${rawName}" — use lowercase letters, digits, and hyphens${opts.multi ? "" : " (override with --name <slug>)"}`,
    };
  }
  try {
    assertSafeName(rawName);
  } catch (err) {
    return { ...base, reason: err instanceof Error ? err.message : String(err) };
  }

  // Retired-aware collision guard: if this name exists ONLY as a retired tombstone
  // (<library>/_retired/<name>), do NOT install a fresh active copy beside it — that
  // strands a duplicate and breaks `skl unretire`. The user must unretire first. This
  // fires regardless of --force (force overwrites an ACTIVE copy, not a retired one).
  // Checked against the flat library root (retirement is never under a domain folder).
  if (isRetiredOnly(opts.libraryPath, rawName)) {
    return {
      ...base,
      verdict: "retired",
      status: "skipped",
      reason: `a retired '${rawName}' exists — run \`skl unretire ${rawName}\` first`,
    };
  }

  const destDir = destDirFor(opts.libraryPath, opts.domainFolder, rawName);
  const verdict = await driftVerdict(skill, destDir);
  base.verdict = verdict;

  // Never copy THROUGH a symlink into something the library doesn't own: a LINKED leaf
  // entry, OR a destination reached through a symlinked ANCESTOR (e.g. a symlinked
  // --domain folder) whose realpath escapes the library. Writing through either would
  // clobber an external dev repo, even with --force (ADR-0004).
  const throughSymlink = writesThroughSymlink(opts.libraryPath, destDir);

  if (opts.multi) {
    if (throughSymlink) {
      return {
        ...base,
        status: "skipped",
        reason: "linked entry / resolves outside the library — not overwriting via symlink",
      };
    }
    // new + identical install; differs needs --force.
    if (verdict === "differs" && !opts.force) {
      return { ...base, status: "skipped", reason: "local body differs from upstream — not overwriting (use --force)" };
    }
  } else {
    // SINGLE path: refuse to write through a symlink even with --force (never clobber a
    // dev repo), then preserve today's exact rule — refuse any existing dest w/o --force.
    if (throughSymlink) {
      return {
        ...base,
        reason: `${rawName} resolves through a symlink outside the library (${destDir}) — refusing to write (manage a linked entry with \`skl link\`/\`skl rm\`)`,
      };
    }
    if (existsSync(destDir) && !opts.force) {
      return {
        ...base,
        reason: `${rawName} already exists at ${destDir} (use --force to overwrite, or skl update ${rawName} to re-pull)`,
      };
    }
  }

  // ---- write into the library ----
  await ensureDir(opts.domainFolder ? join(opts.libraryPath, opts.domainFolder) : opts.libraryPath);
  await copySkillDir(skill.dir, destDir);

  const installedBody = bodyOf(await readSkillBody(skill.dir));
  const installedAt = new Date().toISOString();
  const entry: LockEntry = {
    name: rawName,
    source: opts.sourceStr,
    ref: opts.ref,
    channel: opts.channel,
    installedAt,
    localEdits: false,
    installedHash: hashContent(installedBody),
  };
  await recordEntry(opts.libraryPath, entry);

  const installed: Skill = {
    name: rawName,
    description: skill.description,
    primaryDomain: opts.domainFolder,
    domains: opts.domainFolder ? [opts.domainFolder] : [],
    path: destDir,
    bodyPath: join(destDir, "SKILL.md"),
    refFiles: [],
    source: { source: opts.sourceStr, ref: opts.ref, channel: opts.channel, installedAt, localEdits: false },
    retired: false,
    mirrorOf: null,
    contentHash: "",
  };
  if (opts.domainFolder) await setDomainsForName(opts.libraryPath, rawName, [opts.domainFolder]);

  let inferred: string[] | null = null;
  if (opts.infer) {
    inferred = await maybeInferTags(installed, warn);
    if (inferred && inferred.length > 0) await setDomainsForName(opts.libraryPath, rawName, inferred);
  }
  const domains = inferred && inferred.length > 0 ? inferred : opts.domainFolder ? [opts.domainFolder] : [];

  return {
    ...base,
    status: "installed",
    reason:
      verdict === "identical"
        ? "re-installed (identical body)"
        : verdict === "differs"
          ? "overwrote differing body (--force)"
          : "installed",
    path: destDir,
    installedAt,
    tagged: Boolean(inferred && inferred.length > 0),
    domains,
  };
}

// ---------------------------------------------------------------------------
// track / adopt — attach provenance to a skill ALREADY in the library (no download).
// ---------------------------------------------------------------------------

/** Channel string stored in the lockfile, derived from a parsed source. */
function channelOf(parsed: ParsedSource): string {
  if (parsed.channel === "github") return "github";
  if (parsed.channel === "git") return "git";
  return "vercel-registry";
}

/**
 * The canonical lockfile `source` string for a parsed source — the SAME encoding
 * `installSkill` writes, so `outdated`/`update` re-parse it identically:
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

/** Outcome of the shared adopt/track logic — reused by `skl track` and `skl migrate`. */
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

/**
 * Core `adopt` logic, reused by both `skl track` and `skl migrate`. Attaches a
 * provenance lock entry to an OWNED library skill the user already has on disk, recording
 * the LOCAL body hash as the assumed baseline (adopted=true) — no network/download unless
 * `resolve` is set. Returns a discriminated result; the caller renders/aggregates it.
 *
 * `library` is the already-loaded library (so a bulk caller loads it once).
 */
export async function adopt(
  libraryPath: string,
  library: Skill[],
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
  // Resolve linked-ness by the ON-DISK SLUG (the symlink's basename), NOT the
  // frontmatter `name` — they differ for an aliased link, and entryMode keys off
  // the on-disk dir (library/<slug>). Using `name` let an aliased linked skill slip
  // this guard and get an entry that `update` would then clobber the dev repo through.
  const slug = basename(skill.path);
  if (entryMode(libraryPath, slug) === "linked") {
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

/**
 * Alias of `adopt` under the user-facing verb. `skl track` and the `trackOne` call sites
 * in `migrate` import this name; it IS `adopt` (one implementation, two names) so the
 * curator's adopt-provenance operation reads naturally from either command.
 */
export const track = adopt;
