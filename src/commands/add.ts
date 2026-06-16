// skl add <src> — install third-party skill(s) into the library.
//
// Two shapes, ONE clone:
//   skl add github:owner/repo/path/to/skill   → install that one skill (unchanged)
//   skl add github:owner/repo                  → if exactly one skill, install it;
//                                                if several, error and point at the
//                                                flags below (never silently pick one)
//   skl add github:owner/repo --list           → discover + print, no writes
//   skl add github:owner/repo --all            → install every discovered skill
//   skl add github:owner/repo --skill a,b      → install only those (by frontmatter name)
//   skl add github:owner/repo --all --dry-run  → drift preflight (new/identical/differs)
//
// `add` is a LIBRARIAN, not an installer: it writes ONLY into ~/.skillshelf/library
// (provenance + central taxonomy). It never touches agent dirs / symlink fan-out —
// that stays with `skl use` (project) / a future `skl deploy` (ADR-0003). A repo-wide
// add clones the repo ONCE (fetchRepo), discovers all skills, and copies the selected
// subset out of the single staging checkout — N installs, one network fetch.
//
// Read-only commands take --json; add is a write, but still emits a --json summary.

import { join, basename, dirname, sep } from "node:path";
import { existsSync } from "node:fs";
import type { Ctx, Skill, LockEntry } from "../types.ts";
import {
  parseSource,
  fetchSource,
  fetchRepo,
  discoverSkills,
  discoverSingleLenient,
  copySkillDir,
  cleanupStaging,
  readSkillBody,
  type DiscoveredSkill,
  type ParsedSource,
} from "../core/fetch.ts";
import { parseFrontmatter } from "../lib/frontmatter.ts";
import { hashContent } from "../core/crawl.ts";
import { recordEntry } from "../core/provenance.ts";
import { setDomainsForName } from "../core/taxonomy.ts";
import { assertSafeName } from "../core/lifecycle.ts";
import { loadLibrary, findByName, entryStatus } from "../core/library.ts";
import { ensureDir, isSymlink, realpathOrSelf } from "../lib/fs.ts";

export const meta = {
  name: "add",
  summary: "Install third-party skill(s) (github:/git:/registry); repo-wide via --all/--skill",
  usage:
    "skl add <src> [--all|--skill <a,b,…>] [--list] [--dry-run] [--domain <d>] [--name <slug>] [--no-infer] [--force] [--json]",
} as const;

interface Flags {
  json: boolean;
  domain: string | null;
  name: string | null;
  infer: boolean;
  force: boolean;
  all: boolean;
  list: boolean;
  dryRun: boolean;
  /** null = flag not given; otherwise the (possibly empty) list of requested names */
  skill: string[] | null;
  src: string | null;
}

// A skill slug is lowercase letters/digits/hyphens. This is also a SECURITY guard:
// `name` may be derived from an untrusted third-party SKILL.md frontmatter and
// `domain` from a flag, and both are joined into a library path. Rejecting anything
// outside this charset stops `..`/`/` path traversal out of the library.
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

function addSkillFilter(cur: string[] | null, raw: string): string[] {
  const names = raw.split(",").map((s) => s.trim()).filter((s) => s !== "");
  return [...(cur ?? []), ...names];
}

function parseFlags(argv: string[]): Flags {
  const f: Flags = {
    json: false,
    domain: null,
    name: null,
    infer: true,
    force: false,
    all: false,
    list: false,
    dryRun: false,
    skill: null,
    src: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--json") f.json = true;
    else if (a === "--no-infer") f.infer = false;
    else if (a === "--force") f.force = true;
    else if (a === "--all") f.all = true;
    else if (a === "--list") f.list = true;
    else if (a === "--dry-run") f.dryRun = true;
    else if (a === "--domain") f.domain = argv[++i] ?? null;
    else if (a === "--name") f.name = argv[++i] ?? null;
    else if (a === "--skill") f.skill = addSkillFilter(f.skill, argv[++i] ?? "");
    else if (a.startsWith("--domain=")) f.domain = a.slice("--domain=".length);
    else if (a.startsWith("--name=")) f.name = a.slice("--name=".length);
    else if (a.startsWith("--skill=")) f.skill = addSkillFilter(f.skill, a.slice("--skill=".length));
    else if (!a.startsWith("-") && f.src === null) f.src = a;
  }
  return f;
}

/** Body text after frontmatter — the unit drift/install hashes operate on. */
function bodyOf(text: string): string {
  return parseFrontmatter(text).body;
}

/** The library destination dir for a slug (under its domain folder, if any). */
function destDirFor(libraryPath: string, domainFolder: string | null, name: string): string {
  return domainFolder ? join(libraryPath, domainFolder, name) : join(libraryPath, name);
}

/** The nearest ancestor of `p` (incl. `p`) that exists on disk; falls back to `p`. */
function nearestExisting(p: string): string {
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
function destEscapesLibrary(libraryPath: string, destDir: string): boolean {
  const libReal = realpathOrSelf(nearestExisting(libraryPath));
  const destReal = realpathOrSelf(nearestExisting(destDir));
  return !(destReal === libReal || destReal.startsWith(libReal + sep));
}

type Verdict = "new" | "identical" | "differs";

/**
 * Drift preflight for one skill against the library destination it would install to:
 *   - new       — nothing at the destination → would install
 *   - identical — destination body hash matches upstream → lossless overwrite
 *   - differs   — destination body differs → would clobber local content (needs --force)
 * Compares the frontmatter-stripped BODY (matches installedHash / `skl update`).
 */
async function driftVerdict(skill: DiscoveredSkill, destDir: string): Promise<Verdict> {
  const localPath = join(destDir, "SKILL.md");
  if (!existsSync(localPath)) return "new";
  const upstream = hashContent(bodyOf(await readSkillBody(skill.dir)));
  let localText = "";
  try {
    localText = await Bun.file(localPath).text();
  } catch {
    localText = "";
  }
  const local = hashContent(bodyOf(localText));
  return upstream === local ? "identical" : "differs";
}

/**
 * Optionally run an AI inference tagging pass over a freshly-installed skill.
 *
 * A MISSING hook module is expected and stays silent (untagged is valid). But a hook
 * that IS present and THROWS is a real failure — we surface it via `warn` rather than
 * swallowing it. Either way the skill stays untagged. Returns the domains written.
 */
async function maybeInferTags(
  skill: Skill,
  warn?: (msg: string) => void,
): Promise<string[] | null> {
  const candidates = ["../core/infer.ts", "../adapters/inference/tag.ts"];
  for (const rel of candidates) {
    const spec: string = rel;
    const mod: unknown = await import(spec).catch(() => null);
    if (!mod || typeof mod !== "object") continue;
    const hook = (mod as Record<string, unknown>).tagSkill;
    if (typeof hook !== "function") continue;
    try {
      const result = await (hook as (s: Skill) => Promise<string[] | null>)(skill);
      if (Array.isArray(result)) {
        return result.filter((d) => typeof d === "string" && d.trim() !== "");
      }
      return null;
    } catch (err) {
      warn?.(
        `add: inference hook ${rel} failed (skill left untagged): ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }
  return null;
}

interface InstallOptions {
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

interface InstallOutcome {
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

/** Install (copy + record provenance + tag) a single discovered skill. */
async function installOne(
  ctx: Ctx,
  skill: DiscoveredSkill,
  opts: InstallOptions,
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
  const status = entryStatus(opts.libraryPath, rawName);
  if (status.retired && !status.active) {
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
  const throughSymlink = isSymlink(destDir) || destEscapesLibrary(opts.libraryPath, destDir);

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
    inferred = await maybeInferTags(installed, (m) => ctx.error(m));
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

/** `--list`: discover + print, no writes. */
function reportList(
  ctx: Ctx,
  flags: Flags,
  parsed: ParsedSource,
  ref: string,
  discovered: DiscoveredSkill[],
  library: Skill[],
): number {
  const rows = discovered.map((d) => ({
    name: d.name,
    description: d.description,
    subpath: d.subpath,
    inLibrary: Boolean(findByName(library, d.name)),
  }));
  if (flags.json) {
    ctx.json({ ok: true, action: "list", source: parsed.source, ref, count: rows.length, skills: rows });
    return 0;
  }
  ctx.log(`${rows.length} skill(s) in ${parsed.source}${ref ? ` @ ${ref.slice(0, 10)}` : ""}:`);
  ctx.log("");
  for (const r of rows) {
    const mark = r.inLibrary ? "✓" : " ";
    ctx.log(`  ${mark} ${r.name.padEnd(28)} ${r.subpath || "(root)"}`);
    if (r.description) ctx.log(`      ${r.description.length > 100 ? r.description.slice(0, 99) + "…" : r.description}`);
  }
  ctx.log("");
  ctx.log(`✓ = already in your library. Install with: skl add ${flags.src} --all   (or --skill <name,…>)`);
  return 0;
}

/** `--dry-run`: drift preflight over the full discovered set, no writes. */
async function reportDryRun(
  ctx: Ctx,
  flags: Flags,
  parsed: ParsedSource,
  ref: string,
  discovered: DiscoveredSkill[],
  domainFolder: string | null,
): Promise<number> {
  interface Row {
    name: string;
    subpath: string;
    verdict: Verdict | "invalid" | "linked";
    willInstall: boolean;
    needsForce: boolean;
  }
  const rows: Row[] = [];
  for (const d of discovered) {
    if (!SLUG_RE.test(d.name)) {
      rows.push({ name: d.name, subpath: d.subpath, verdict: "invalid", willInstall: false, needsForce: false });
      continue;
    }
    const destDir = destDirFor(ctx.config.libraryPath, domainFolder, d.name);
    if (isSymlink(destDir) || destEscapesLibrary(ctx.config.libraryPath, destDir)) {
      rows.push({ name: d.name, subpath: d.subpath, verdict: "linked", willInstall: false, needsForce: false });
      continue;
    }
    const verdict = await driftVerdict(d, destDir);
    const needsForce = verdict === "differs";
    const willInstall = verdict === "new" || verdict === "identical" || (verdict === "differs" && flags.force);
    rows.push({ name: d.name, subpath: d.subpath, verdict, willInstall, needsForce });
  }
  const counts = {
    new: rows.filter((r) => r.verdict === "new").length,
    identical: rows.filter((r) => r.verdict === "identical").length,
    differs: rows.filter((r) => r.verdict === "differs").length,
    linked: rows.filter((r) => r.verdict === "linked").length,
    invalid: rows.filter((r) => r.verdict === "invalid").length,
  };
  const willInstall = rows.filter((r) => r.willInstall).length;
  if (flags.json) {
    ctx.json({ ok: true, action: "dry-run", source: parsed.source, ref, counts, willInstall, force: flags.force, skills: rows });
    return 0;
  }
  ctx.log(`dry-run for ${parsed.source}${ref ? ` @ ${ref.slice(0, 10)}` : ""} (${rows.length} skill(s)):`);
  ctx.log("");
  for (const r of rows) {
    const tag =
      r.verdict === "new"
        ? "new      "
        : r.verdict === "identical"
          ? "identical"
          : r.verdict === "differs"
            ? "DIFFERS  "
            : r.verdict === "linked"
              ? "linked   "
              : "INVALID  ";
    const note = r.verdict === "differs" && !flags.force ? "  (needs --force)" : "";
    ctx.log(`  ${tag}  ${r.name.padEnd(28)} ${r.subpath || "(root)"}${note}`);
  }
  ctx.log("");
  ctx.log(
    `${counts.new} new, ${counts.identical} identical, ${counts.differs} differ${counts.linked ? `, ${counts.linked} linked` : ""}${counts.invalid ? `, ${counts.invalid} invalid` : ""} → ${willInstall} would install${flags.force ? " (--force)" : ""}.`,
  );
  if (counts.differs > 0 && !flags.force) ctx.log("re-run with --force to overwrite differing skills.");
  return 0;
}

export async function run(argv: string[], ctx: Ctx): Promise<number> {
  const flags = parseFlags(argv);
  if (!flags.src) {
    ctx.error("usage:", meta.usage);
    return 1;
  }
  if (flags.all && flags.skill !== null) {
    ctx.error("add: --all and --skill are mutually exclusive");
    return 1;
  }

  // --domain validated once up front (applies to every install path).
  const domainFolder = flags.domain && flags.domain.trim() !== "" ? flags.domain.trim() : null;
  if (domainFolder !== null && !SLUG_RE.test(domainFolder)) {
    ctx.error(`add: invalid --domain "${domainFolder}" — use lowercase letters, digits, and hyphens`);
    return 1;
  }

  const parsed = parseSource(flags.src);
  const repoChannel = parsed.channel === "github" || parsed.channel === "git";
  const wantsMulti = flags.all || flags.skill !== null;

  if (flags.name && wantsMulti) {
    ctx.error("add: --name applies only to a single-skill add (omit --all/--skill)");
    return 1;
  }
  if (!repoChannel && (wantsMulti || flags.list || flags.dryRun)) {
    ctx.error("add: --all/--skill/--list/--dry-run apply to github:/git: repo sources, not registry names");
    return 1;
  }

  // Per-skill lockfile `source`: each skill carries its OWN subpath (github uses the
  // `owner/repo@subpath` convention; git encodes it after `#`; registry is the name).
  const sourceOf = (skill: DiscoveredSkill): string => {
    if (parsed.channel === "github") return `${parsed.source}${skill.subpath ? `@${skill.subpath}` : ""}`;
    if (parsed.channel === "git") return `git:${parsed.localPath}${skill.subpath ? `#${skill.subpath}` : ""}`;
    return parsed.source; // registry: the bare name
  };

  // ---- 1+2. FETCH (clone once for repos; the `skills` CLI for a registry name) ----
  let staging: string | undefined;
  let ref: string;
  let channel: string;
  let discovered: DiscoveredSkill[];

  if (repoChannel) {
    const repo = await fetchRepo(parsed);
    if (!repo.ok) {
      await cleanupStaging(repo.staging);
      ctx.error("add: download failed:", repo.error);
      return 1;
    }
    staging = repo.staging;
    ref = repo.ref;
    channel = repo.channel;
    discovered = await discoverSkills(repo.checkout, parsed.subpath);
    // Implicit single-skill add: if the convention gate found nothing, fall back to
    // lenient single resolution so a one-skill repo whose SKILL.md omits a description
    // still installs (pre-ADR-0006 behavior). NOT for --all/--skill/--list/--dry-run,
    // where the name+description gate is the intended filter.
    if (discovered.length === 0 && !flags.all && flags.skill === null && !flags.list && !flags.dryRun) {
      const one = await discoverSingleLenient(repo.checkout, parsed.subpath);
      if (one) discovered = [one];
    }
  } else {
    const fetched = await fetchSource(parsed);
    if (!fetched.ok) {
      await cleanupStaging(fetched.staging);
      ctx.error("add: download failed:", fetched.error);
      return 1;
    }
    staging = fetched.staging;
    ref = fetched.ref;
    channel = fetched.channel;
    const body = await readSkillBody(fetched.skillDir);
    const { data } = parseFrontmatter(body);
    const nm = typeof data.name === "string" && data.name.trim() !== "" ? data.name.trim() : basename(fetched.skillDir);
    const desc = typeof data.description === "string" ? data.description.trim() : "";
    discovered = [{ name: nm, dir: fetched.skillDir, subpath: "", description: desc }];
  }

  try {
    if (discovered.length === 0) {
      ctx.error(
        "add:",
        parsed.subpath
          ? `no SKILL.md found at ${parsed.subpath} in ${parsed.source}`
          : `no skills found in ${parsed.source}`,
      );
      return 1;
    }

    // ---- --list (report full set, no writes) ----
    if (flags.list) {
      const library = await loadLibrary(ctx.config.libraryPath);
      return reportList(ctx, flags, parsed, ref, discovered, library);
    }

    // ---- --dry-run (drift preflight over the full set, no writes) ----
    if (flags.dryRun) {
      return await reportDryRun(ctx, flags, parsed, ref, discovered, domainFolder);
    }

    // ---- selection ----
    let selected: DiscoveredSkill[];
    let multi: boolean;
    if (flags.skill !== null) {
      const want = new Set(flags.skill);
      selected = discovered.filter((d) => want.has(d.name));
      const missing = [...want].filter((n) => !discovered.some((d) => d.name === n));
      if (missing.length > 0) {
        ctx.error(`add: requested skill(s) not found in ${parsed.source}: ${missing.join(", ")}`);
        ctx.error(`     available: ${discovered.map((d) => d.name).join(", ") || "(none)"}`);
        return 1;
      }
      multi = true;
    } else if (flags.all) {
      selected = discovered;
      multi = true;
    } else if (discovered.length > 1) {
      ctx.error(
        `add: ${discovered.length} skills found in ${parsed.source} — choose with --all, --skill <name,…>, or inspect with --list:`,
      );
      for (const d of discovered) ctx.error(`     ${d.name}${d.subpath ? `  (${d.subpath})` : ""}`);
      return 1;
    } else {
      selected = discovered;
      multi = false;
    }

    // ---- install ----
    if (!multi) {
      const o = await installOne(ctx, selected[0]!, {
        libraryPath: ctx.config.libraryPath,
        domainFolder,
        nameOverride: flags.name,
        sourceStr: sourceOf(selected[0]!),
        ref,
        channel,
        infer: flags.infer,
        force: flags.force,
        multi: false,
      });
      if (o.status === "error") {
        ctx.error("add:", o.reason);
        return 1;
      }
      // A retired-name collision is a refusal in single mode (no duplicate written):
      // surface it as an error + non-zero exit, pointing the user at `skl unretire`.
      if (o.status === "skipped") {
        ctx.error("add:", o.reason);
        return 1;
      }
      // Legacy single-skill summary shape (unchanged for existing consumers).
      const summary = {
        ok: true,
        name: o.name,
        path: o.path,
        source: o.source,
        ref: o.ref,
        channel: o.channel,
        installedAt: o.installedAt,
        tagged: o.tagged,
        domains: o.domains,
      };
      if (flags.json) {
        ctx.json(summary);
      } else {
        ctx.log(`added ${o.name}`);
        ctx.log(`  path:    ${o.path}`);
        ctx.log(`  source:  ${o.source}`);
        ctx.log(`  ref:     ${o.ref || "(unknown)"}`);
        ctx.log(`  channel: ${o.channel}`);
        if (o.tagged) ctx.log(`  domains: ${o.domains.join(", ")}`);
        else ctx.log(`  domains: (untagged — run \`skl infer\` to assign)`);
      }
      return 0;
    }

    // multi: install each selected skill out of the single staging checkout. Two
    // upstream skills sharing a frontmatter `name` would target the SAME library slug
    // (last-write-wins clobber + a single lockfile entry); install the first, skip the
    // rest with a duplicate-slug reason so nothing is silently lost or miscounted.
    const outcomes: InstallOutcome[] = [];
    const seenSlugs = new Set<string>();
    for (const s of selected) {
      if (seenSlugs.has(s.name)) {
        outcomes.push({
          name: s.name,
          subpath: s.subpath,
          verdict: "duplicate",
          status: "skipped",
          reason: `duplicate slug "${s.name}" — another skill in this repo already installs to it; skipped to avoid clobbering`,
          path: "",
          source: sourceOf(s),
          ref,
          channel,
          installedAt: "",
          tagged: false,
          domains: [],
        });
        continue;
      }
      seenSlugs.add(s.name);
      outcomes.push(
        await installOne(ctx, s, {
          libraryPath: ctx.config.libraryPath,
          domainFolder,
          nameOverride: null,
          sourceStr: sourceOf(s),
          ref,
          channel,
          infer: flags.infer,
          force: flags.force,
          multi: true,
        }),
      );
    }
    const installed = outcomes.filter((o) => o.status === "installed");
    const skipped = outcomes.filter((o) => o.status === "skipped");
    const errored = outcomes.filter((o) => o.status === "error");

    if (flags.json) {
      ctx.json({
        ok: errored.length === 0,
        action: "add",
        source: parsed.source,
        ref,
        counts: { selected: selected.length, installed: installed.length, skipped: skipped.length, errors: errored.length },
        results: outcomes.map((o) => ({
          name: o.name,
          subpath: o.subpath,
          status: o.status,
          verdict: o.verdict,
          reason: o.reason,
          source: o.source,
          ref: o.ref,
          path: o.path,
          tagged: o.tagged,
          domains: o.domains,
        })),
      });
    } else {
      for (const o of outcomes) {
        const tag = o.status === "installed" ? "added   " : o.status === "skipped" ? "skipped " : "ERROR   ";
        ctx.log(`${tag}  ${o.name.padEnd(28)} ${o.reason}`);
      }
      ctx.log("");
      ctx.log(
        `${selected.length} selected, ${installed.length} installed, ${skipped.length} skipped${errored.length ? `, ${errored.length} error(s)` : ""} from ${parsed.source}`,
      );
      if (skipped.some((o) => o.verdict === "differs")) ctx.log("re-run with --force to overwrite differing skills.");
    }
    return errored.length > 0 ? 1 : 0;
  } catch (err) {
    ctx.error("add: failed:", err instanceof Error ? err.message : String(err));
    return 1;
  } finally {
    await cleanupStaging(staging);
  }
}
