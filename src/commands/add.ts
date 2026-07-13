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

import { basename } from "node:path";
import type { Ctx, Skill } from "../types.ts";
import {
  parseSource,
  fetchSource,
  fetchRepo,
  discoverSkills,
  discoverSingleLenient,
  cleanupStaging,
  readSkillBody,
  type DiscoveredSkill,
  type ParsedSource,
} from "../core/fetch.ts";
import { parseFrontmatter } from "../lib/frontmatter.ts";
import { SLUG_RE } from "../core/lifecycle.ts";
import { loadLibrary, findByName } from "../core/library.ts";
import {
  installSkill,
  destDirFor,
  driftVerdict,
  writesThroughSymlink,
  type InstallOutcome,
  type Verdict,
} from "../core/vendor.ts";
import { render, addDryRunVerdictMark, type CommandResult } from "../core/report.ts";

export const meta = {
  name: "add",
  summary: "Install third-party skill(s) (github:/git:/registry); repo-wide via --all/--skill",
  usage:
    "skl add <src> [--all|--skill <a,b,…>] [--list] [--dry-run] [--domain <d>] [--name <slug>] [--no-infer] [--force] [--yes] [--json]",
} as const;

/**
 * The `--all` count gate threshold (ADR-0012): if the resolved published set has MORE
 * than this many skills, `add --all` refuses (bounds blast radius) until the user passes
 * `--yes`, narrows with `--skill`, or inspects with `--list`. `--skill`/`--list`/`--dry-run`
 * are never gated. On the count, not the provenance — manifest or full discovery alike.
 */
export const ALL_COUNT_GATE = 15;

interface Flags {
  json: boolean;
  domain: string | null;
  name: string | null;
  infer: boolean;
  force: boolean;
  /** bypass ONLY the --all count gate (distinct from --force = overwrite differing body) */
  yes: boolean;
  all: boolean;
  list: boolean;
  dryRun: boolean;
  /** null = flag not given; otherwise the (possibly empty) list of requested names */
  skill: string[] | null;
  src: string | null;
}

// SLUG_RE is shared from core/lifecycle.ts. This is also a SECURITY guard here:
// `name` may be derived from an untrusted third-party SKILL.md frontmatter and
// `domain` from a flag, and both are joined into a library path. Rejecting anything
// outside this charset stops `..`/`/` path traversal out of the library.

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
    yes: false,
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
    else if (a === "--yes") f.yes = true;
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

// The vendor WRITE operations (installSkill copy+provenance+verdict, the drift verdict,
// destDirFor, and the symlink-escape guard) live in core/vendor.ts — the curator boundary
// where `add` (and only `add`) writes the library. This command keeps the parse + select
// + render; vendor owns the mutation. driftVerdict is still imported here for the
// read-only --dry-run preflight (no write).

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
    // ADR-0012: keep the FULL set visible, marked by published-set membership, so an
    // unpublished/internal skill is discoverable even though `--all` skips it.
    published: d.published,
    internal: d.internal,
  }));
  // Structured payload (verbatim) + human renderer; the json/human fork goes through
  // render() (the reporter seam). Read-only --list always exits 0.
  const result: CommandResult = {
    json: { ok: true, action: "list", source: parsed.source, ref, count: rows.length, skills: rows },
    human: (emit) => {
      const publishedCount = rows.filter((r) => r.published).length;
      emit(`${rows.length} skill(s) in ${parsed.source}${ref ? ` @ ${ref.slice(0, 10)}` : ""} (${publishedCount} published):`);
      emit();
      for (const r of rows) {
        const mark = r.inLibrary ? "✓" : " ";
        const tag = r.published ? "published  " : r.internal ? "internal   " : "unpublished";
        emit(`  ${mark} ${tag}  ${r.name.padEnd(28)} ${r.subpath || "(root)"}`);
        if (r.description) emit(`      ${r.description.length > 100 ? r.description.slice(0, 99) + "…" : r.description}`);
      }
      emit();
      emit(`✓ = already in your library. published = installed by --all; unpublished/internal = only via --skill <name>.`);
      emit(`Install with: skl add ${flags.src} --all   (or --skill <name,…>)`);
    },
  };
  render(ctx, flags.json, result);
  return 0;
}

/** `--dry-run`: drift preflight over the full discovered set, no writes. */
async function reportDryRun(
  ctx: Ctx,
  flags: Flags,
  parsed: ParsedSource,
  ref: string,
  discovered: DiscoveredSkill[],
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
    const destDir = destDirFor(ctx.config.libraryPath, d.name);
    if (writesThroughSymlink(ctx.config.libraryPath, destDir)) {
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
  // Structured payload (verbatim) + human renderer; the verdict->tag ladder now lives in
  // report.ts as addDryRunVerdictMark(). Read-only --dry-run always exits 0.
  const result: CommandResult = {
    json: { ok: true, action: "dry-run", source: parsed.source, ref, counts, willInstall, force: flags.force, skills: rows },
    human: (emit) => {
      emit(`dry-run for ${parsed.source}${ref ? ` @ ${ref.slice(0, 10)}` : ""} (${rows.length} skill(s)):`);
      emit();
      for (const r of rows) {
        const note = r.verdict === "differs" && !flags.force ? "  (needs --force)" : "";
        emit(`  ${addDryRunVerdictMark(r.verdict)}  ${r.name.padEnd(28)} ${r.subpath || "(root)"}${note}`);
      }
      emit();
      emit(
        `${counts.new} new, ${counts.identical} identical, ${counts.differs} differ${counts.linked ? `, ${counts.linked} linked` : ""}${counts.invalid ? `, ${counts.invalid} invalid` : ""} → ${willInstall} would install${flags.force ? " (--force)" : ""}.`,
      );
      if (counts.differs > 0 && !flags.force) emit("re-run with --force to overwrite differing skills.");
    },
  };
  render(ctx, flags.json, result);
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

  // --domain validated once up front (applies to every install path). It is a taxonomy
  // tag, never a folder — installs always land flat at library/<name> (ADR-0001).
  const domain = flags.domain && flags.domain.trim() !== "" ? flags.domain.trim() : null;
  if (domain !== null && !SLUG_RE.test(domain)) {
    ctx.error(`add: invalid --domain "${domain}" — use lowercase letters, digits, and hyphens`);
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
    const meta = data.metadata;
    const internal =
      typeof meta === "object" && meta !== null && (meta as Record<string, unknown>).internal === true;
    // Single registry/explicit skill: no manifest context → published unless internal.
    discovered = [{ name: nm, dir: fetched.skillDir, subpath: "", description: desc, internal, published: !internal }];
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

    // ---- --dry-run (drift preflight, no writes) ----
    // Over the set it WOULD install: the published set for --all (ADR-0012), the named
    // subset for --skill, else the full discovered set. Never gated (it doesn't write).
    if (flags.dryRun) {
      const preview = flags.all
        ? discovered.filter((d) => d.published)
        : flags.skill !== null
          ? discovered.filter((d) => flags.skill!.includes(d.name))
          : discovered;
      return await reportDryRun(ctx, flags, parsed, ref, preview);
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
      // ADR-0012: --all installs the PUBLISHED set (manifest allowlist when present,
      // else every discovered skill), always minus internal skills.
      selected = discovered.filter((d) => d.published);
      if (selected.length === 0) {
        ctx.error(
          `add: no published skills in ${parsed.source} — every discovered skill is unpublished or internal` +
            ` (e.g. a .claude-plugin manifest that lists none/is unreadable, or skills marked metadata.internal).`,
        );
        ctx.error(`     inspect the full set with --list, or install one by name with --skill <name>.`);
        return 1;
      }
      // COUNT GATE: refuse a large blast radius unless --yes. On the final selected
      // count, regardless of provenance. --skill/--list/--dry-run are never gated.
      if (selected.length > ALL_COUNT_GATE && !flags.yes) {
        ctx.error(
          `add: ${selected.length} published skills in ${parsed.source} exceeds the --all gate of ${ALL_COUNT_GATE}.`,
        );
        ctx.error(`     re-run with --yes to install them all, narrow with --skill <name,…>, or inspect with --list.`);
        return 1;
      }
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
      const o = await installSkill(
        selected[0]!,
        {
          libraryPath: ctx.config.libraryPath,
          domain,
          nameOverride: flags.name,
          sourceStr: sourceOf(selected[0]!),
          ref,
          channel,
          infer: flags.infer,
          force: flags.force,
          multi: false,
        },
        (m) => ctx.error(m),
      );
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
      const result: CommandResult = {
        json: summary,
        human: (emit) => {
          emit(`added ${o.name}`);
          emit(`  path:    ${o.path}`);
          emit(`  source:  ${o.source}`);
          emit(`  ref:     ${o.ref || "(unknown)"}`);
          emit(`  channel: ${o.channel}`);
          if (o.tagged) emit(`  domains: ${o.domains.join(", ")}`);
          else emit(`  domains: (untagged — run \`skl infer\` to assign)`);
        },
      };
      render(ctx, flags.json, result);
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
        await installSkill(
          s,
          {
            libraryPath: ctx.config.libraryPath,
            domain,
            nameOverride: null,
            sourceStr: sourceOf(s),
            ref,
            channel,
            infer: flags.infer,
            force: flags.force,
            multi: true,
          },
          (m) => ctx.error(m),
        ),
      );
    }
    const installed = outcomes.filter((o) => o.status === "installed");
    const skipped = outcomes.filter((o) => o.status === "skipped");
    const errored = outcomes.filter((o) => o.status === "error");

    const result: CommandResult = {
      json: {
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
      },
      human: (emit) => {
        for (const o of outcomes) {
          const tag = o.status === "installed" ? "added   " : o.status === "skipped" ? "skipped " : "ERROR   ";
          emit(`${tag}  ${o.name.padEnd(28)} ${o.reason}`);
        }
        emit("");
        emit(
          `${selected.length} selected, ${installed.length} installed, ${skipped.length} skipped${errored.length ? `, ${errored.length} error(s)` : ""} from ${parsed.source}`,
        );
        if (skipped.some((o) => o.verdict === "differs")) emit("re-run with --force to overwrite differing skills.");
      },
    };
    render(ctx, flags.json, result);
    return errored.length > 0 ? 1 : 0;
  } catch (err) {
    ctx.error("add: failed:", err instanceof Error ? err.message : String(err));
    return 1;
  } finally {
    await cleanupStaging(staging);
  }
}
