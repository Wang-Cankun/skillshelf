// skl update [name] — re-pull the upstream SKILL.md body for tracked skills.
//
// Invariants (the whole point of this command):
//   - Domain tags are NEVER touched: they live in the central <library>/taxonomy.json
//     (ADR-0002), which is separate from skill bodies, so re-pulling SKILL.md leaves
//     every skill's domains intact. (There is no longer a per-skill overlay file.)
//   - Only the upstream body (SKILL.md + bundled reference files) is replaced.
//   - If the LOCAL body diverged from the previously-installed upstream (the user
//     hand-edited it), DO NOT clobber. Show a diff and skip, unless --force.
//   - Bundled reference files are refreshed alongside SKILL.md.
//
// Read-ish/destructive command. Supports --json for a structured report; --dry-run
// to preview without writing; --force to overwrite diverged local edits.

import { join, basename } from "node:path";
import { existsSync, type Dirent } from "node:fs";
import { cp, rm, readdir } from "node:fs/promises";
import type { Ctx, LockEntry } from "../types.ts";
import { readLockfile, recordEntry } from "../core/provenance.ts";
import {
  parseStoredSource,
  fetchRepo,
  discoverSkills,
  cleanupStaging,
  readSkillBody,
  unifiedDiff,
} from "../core/fetch.ts";
import { hashContent } from "../core/crawl.ts";
import { parseFrontmatter } from "../lib/frontmatter.ts";
import { loadLibrary, findByName, entryMode } from "../core/library.ts";
import { classify } from "../core/reconcile.ts";
import { render, updateOutcomeMark, type CommandResult } from "../core/report.ts";

export const meta = {
  name: "update",
  summary: "Re-pull upstream body, preserve domain tags, diff if local body diverged",
  usage: "skl update [name] [--repo <source>] [--force] [--dry-run] [--json]",
} as const;

type Outcome = "updated" | "uptodate" | "diverged" | "skipped" | "error" | "orphaned";

interface Result {
  name: string;
  source: string;
  channel: string;
  fromRef: string;
  toRef: string | null;
  outcome: Outcome;
  note: string;
  diff?: string;
  /** Set ONLY when a rename was auto-followed; value = the OLD (pre-repoint) source. */
  relocatedFrom?: string;
}

/** NEW (ADR-0013): per source repo, published-but-untracked skills discovered this run. */
interface RepoAdditions {
  repo: string;
  names: string[];
}

/** Body text after frontmatter, for content comparison/hash. */
function bodyOf(text: string): string {
  return parseFrontmatter(text).body;
}

/**
 * Replace SKILL.md + bundled reference files from upstream within a single skill
 * dir. Domain tags and provenance are NOT stored inside the skill dir — the central
 * taxonomy.json and shelf.lock.json both live at the LIBRARY ROOT (ADR-0002), never
 * inside `destDir` — so the only thing to protect here is the skill's own `.git`.
 * We still keep `shelf.lock.json`/`taxonomy.json` in the preserve set defensively,
 * so a stray copy inside a skill dir is never deleted by this cleanup.
 */
async function applyUpstream(destDir: string, upstreamDir: string): Promise<void> {
  const PRESERVE = new Set(["shelf.lock.json", "taxonomy.json"]);
  // Remove existing upstream-managed files (everything except lock/taxonomy/.git).
  let entries: Dirent[] = [];
  try {
    entries = await readdir(destDir, { withFileTypes: true });
  } catch {
    /* dest may not exist yet */
  }
  for (const e of entries) {
    if (PRESERVE.has(e.name) || e.name === ".git") continue;
    await rm(join(destDir, e.name), { recursive: true, force: true });
  }
  // Copy fresh upstream content (minus its .git).
  await cp(upstreamDir, destDir, {
    recursive: true,
    force: true,
    filter: (s: string) => basename(s) !== ".git",
  });
}

async function updateOne(
  ctx: Ctx,
  entry: LockEntry,
  destDir: string,
  upstream: { skillDir: string; ref: string },
  opts: { force: boolean; dryRun: boolean },
): Promise<Result> {
  // ponytail: cloning + cleanup moved to run() (one clone per repo, ADR-0013 decision 1).
  // updateOne now receives the located skill dir + repo HEAD ref; the 3-way / adopted /
  // diverged / never-clobber body logic below is verbatim from before, only the
  // `fetched.skillDir`/`fetched.ref` references are renamed to `upstream.*`.
  const fetched = upstream;
  try {
    const upstreamText = await readSkillBody(fetched.skillDir);
    const localPath = join(destDir, "SKILL.md");
    const localText = existsSync(localPath) ? await Bun.file(localPath).text() : "";

    const upstreamBody = bodyOf(upstreamText);
    const localBody = bodyOf(localText);

    const upstreamHash = hashContent(upstreamBody);
    const localHash = hashContent(localBody);

    // ONE classifier call replaces the old adopted / uptodate / 3-way branch ladder
    // (ADR-0013). `update` always has the upstream body in view (online), so the rich
    // Verdict union collapses to: 'identical' (matches upstream), 'diverged' (user
    // hand-edited AND differs — never-clobber-without-force; adopted always lands here
    // when bodies differ), or 'stalePending' (upstream moved, user did NOT edit —
    // safe-apply). mode is always 'owned' here (run() pre-filters linked; structural
    // relocate/orphan are handled in run() too).
    const adopted = entry.adopted === true;
    const verdict = classify({
      adopted,
      mode: "owned",
      installedHash: entry.installedHash ?? null,
      localEdits: entry.localEdits,
      localHash,
      upstreamHash,
      installedRef: entry.ref,
      latestRef: fetched.ref,
      structural: null,
    });

    const base = {
      name: entry.name,
      source: entry.source,
      channel: entry.channel,
      fromRef: entry.ref,
      toRef: fetched.ref,
    } as const;

    // 'diverged' is the ONLY verdict gated by --force (never clobber a hand-edited or
    // unverified body). Without --force: show the diff and skip. With --force: fall
    // through to applyUpstream (graduating an adopted entry as it lands).
    if (verdict === "diverged" && !opts.force) {
      const diff = await unifiedDiff(
        localText,
        upstreamText,
        `${entry.name} (local${adopted ? ", adopted" : ""})`,
        `${entry.name} (upstream ${fetched.ref.slice(0, 10)})`,
      );
      return {
        ...base,
        outcome: "diverged",
        note: adopted
          ? "adopted baseline unverified and differs from upstream; not clobbering (use --force to reconcile)"
          : "local body diverged from upstream; not clobbering (use --force to overwrite)",
        diff,
      };
    }

    // 'identical' + non-adopted + ref unchanged: nothing to do.
    if (verdict === "identical" && !adopted && fetched.ref === entry.ref) {
      return { ...base, outcome: "uptodate", note: "already at latest upstream body" };
    }

    // Everything else applies upstream. Build the right note per verdict/adopted/force
    // BEFORE writing, so dry-run reports exactly what a real run would do.
    const willGraduate = adopted; // an adopted entry graduates the moment it reconciles
    const note =
      verdict === "identical" && adopted
        ? "adopted baseline verified against upstream (identical); graduated to tracked"
        : verdict === "diverged" && adopted
          ? "overwrote adopted body with upstream (--force); graduated to tracked"
          : verdict === "diverged"
            ? "overwrote diverged local body"
            : "upstream body re-pulled; domain tags preserved";
    const dryNote =
      verdict === "identical" && adopted
        ? "would reconcile adopted baseline (identical to upstream) (dry-run)"
        : verdict === "diverged" && adopted
          ? "would overwrite adopted body with upstream and graduate (--force, dry-run)"
          : verdict === "diverged"
            ? "would overwrite diverged local body (dry-run)"
            : "would update (dry-run)";

    if (opts.dryRun) {
      return { ...base, outcome: "updated", note: dryNote };
    }

    // Apply: replace body + ref files; domain tags + lock live at the library root
    // (taxonomy.json / shelf.lock.json), untouched by this skill-dir cleanup.
    await applyUpstream(destDir, fetched.skillDir);

    // Record the new ref + installed body hash + clear localEdits (on-disk body now
    // equals upstream, so we are pristine). Clear `adopted` for a graduating entry.
    const updatedEntry: LockEntry = {
      ...entry,
      ref: fetched.ref,
      installedAt: new Date().toISOString(),
      localEdits: false,
      installedHash: upstreamHash,
      ...(willGraduate ? { adopted: false } : {}),
    };
    await recordEntry(ctx.config.libraryPath, updatedEntry);

    return { ...base, outcome: "updated", note };
  } catch (err) {
    return {
      name: entry.name,
      source: entry.source,
      channel: entry.channel,
      fromRef: entry.ref,
      toRef: fetched.ref,
      outcome: "error",
      note: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function run(argv: string[], ctx: Ctx): Promise<number> {
  const json = argv.includes("--json");
  const force = argv.includes("--force");
  const dryRun = argv.includes("--dry-run");
  // --repo <source> scopes the run to ONE vendor (the parsed repo key, e.g.
  // "github:owner/repo"). The group-by-repo machinery is unchanged — this just
  // pre-filters the entry set so the UI can update a single vendor (one clone,
  // scoped results) instead of sweeping the whole library.
  const repoIdx = argv.indexOf("--repo");
  const repoArg = repoIdx >= 0 ? (argv[repoIdx + 1] ?? null) : null;
  // The token after --repo is its value, not a positional name. Guard on
  // repoIdx>=0 — otherwise (no --repo) repoIdx+1===0 would wrongly skip argv[0],
  // the skill name, making `update <name>` silently sweep the whole library.
  const nameArg =
    argv.find(
      (a, i) => !a.startsWith("-") && !(repoIdx >= 0 && i === repoIdx + 1),
    ) ?? null;

  try {
    const lock = await readLockfile(ctx.config.libraryPath);
    let entries = Object.values(lock.entries);
    if (nameArg) entries = entries.filter((e) => e.name === nameArg);
    if (repoArg)
      entries = entries.filter(
        (e) => parseStoredSource(e.source).source === repoArg,
      );
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    // Resolve on-disk dirs via the library so renames/domain folders are honored;
    // also lets us surface LINKED skills that have NO lock entry (the normal `skl
    // link --from` case) as positive 'skipped (linked)' evidence rather than silence.
    const library = await loadLibrary(ctx.config.libraryPath);
    const lockNames = new Set(entries.map((e) => e.name));
    const linkedNoLock = repoArg
      ? [] // a --repo (vendor) run targets vendored github entries only
      : library.filter(
          (s) =>
            !lockNames.has(s.name) &&
            (!nameArg || s.name === nameArg) &&
            entryMode(ctx.config.libraryPath, s.name) === "linked",
        );

    if (entries.length === 0 && linkedNoLock.length === 0) {
      // Error fork stays in run(): a named-but-missing skill is a non-json error
      // with exit 1 (ctx.error, never rendered). Otherwise the empty-state goes
      // through render — JSON emits the zeroed report verbatim; the human branch
      // prints the same lockfile-empty line as before.
      if (nameArg && !json) {
        ctx.error(`no tracked skill named "${nameArg}"`);
        return 1;
      }
      const emptyResult: CommandResult = {
        json: {
          ok: true,
          updated: 0,
          diverged: 0,
          errors: 0,
          orphaned: 0,
          results: [],
          newAvailable: [],
        },
        human: (emit) => {
          emit("no tracked third-party skills (lockfile is empty)");
        },
      };
      render(ctx, json, emptyResult);
      return 0;
    }

    const results: Result[] = [];
    const newAvailable: RepoAdditions[] = [];
    // Every name tracked in the WHOLE lockfile (not just this run's filter) — the
    // additions report (decision 4) lists only published skills NOT in this set.
    const trackedNames = new Set(Object.values(lock.entries).map((e) => e.name));

    // Group OWNED github/git entries by their parsed source repo ("github:owner/repo"
    // or "git:/abs/path", no subpath) so each repo is cloned ONCE (decision 1). LINKED
    // entries skip grouping entirely (ADR-0004 never-clobber), reported as skipped first.
    const byRepo = new Map<string, LockEntry[]>();
    for (const entry of entries) {
      if (entryMode(ctx.config.libraryPath, entry.name) === "linked") {
        results.push({
          name: entry.name,
          source: entry.source,
          channel: entry.channel,
          fromRef: entry.ref,
          toRef: null,
          outcome: "skipped",
          note: "LINKED to a dev repo — its own git owns versioning; not pulling upstream",
        });
        continue;
      }
      const parsed = parseStoredSource(entry.source);
      // Repo key with NO subpath: github → parsed.source; git → `git:<localPath>`.
      const repoKey =
        parsed.channel === "git" ? `git:${parsed.localPath}` : parsed.source;
      (byRepo.get(repoKey) ?? byRepo.set(repoKey, []).get(repoKey)!).push(entry);
    }

    for (const group of byRepo.values()) {
      const parsed = parseStoredSource(group[0]!.source);
      const repo = await fetchRepo(parsed);
      if (!repo.ok) {
        // A genuine clone/fetch failure → one "error" per member; no newAvailable.
        for (const entry of group) {
          results.push({
            name: entry.name,
            source: entry.source,
            channel: entry.channel,
            fromRef: entry.ref,
            toRef: null,
            outcome: "error",
            note: repo.error,
          });
        }
        continue;
      }

      try {
        // Whole-checkout enumeration (reused, not reinvented). Index by subpath + by
        // frontmatter name so a member's subpath lookup / rename-follow is O(1).
        const discovered = await discoverSkills(repo.checkout);
        const bySubpath = new Map(discovered.map((d) => [d.subpath, d]));
        const byName = new Map(discovered.map((d) => [d.name, d]));

        for (const entry of group) {
          const subpath = parseStoredSource(entry.source).subpath;
          const skill = findByName(library, entry.name);
          const destDir = skill?.path ?? join(ctx.config.libraryPath, entry.name);

          const hit = bySubpath.get(subpath);
          if (hit) {
            // (a) NORMAL: subpath still present → existing body 3-way verbatim.
            results.push(
              await updateOne(
                ctx,
                entry,
                destDir,
                { skillDir: hit.dir, ref: repo.ref },
                { force, dryRun },
              ),
            );
            continue;
          }

          const moved = byName.get(entry.name);
          if (moved) {
            // (b) RELOCATE: subpath gone but same frontmatter name at a new subpath.
            // Re-point the source subpath (NOT gated by --force) then run the normal
            // body 3-way against the new dir.
            const newSource =
              parsed.channel === "git"
                ? `git:${parsed.localPath}${moved.subpath ? `#${moved.subpath}` : ""}`
                : `${parsed.source}${moved.subpath ? `/${moved.subpath}` : ""}`;
            const relocatedEntry: LockEntry = { ...entry, source: newSource };
            const result = await updateOne(
              ctx,
              relocatedEntry,
              destDir,
              { skillDir: moved.dir, ref: repo.ref },
              { force, dryRun },
            );
            result.relocatedFrom = entry.source;
            result.note = `followed rename: ${subpath} → ${moved.subpath}; ${result.note}`;
            // updateOne persists the re-point only when its body path calls recordEntry
            // (the "updated"/graduated paths). For "uptodate"/"diverged" it does NOT
            // write, so persist the source re-point explicitly (unless dry-run).
            // ponytail: only the no-write outcomes need a manual recordEntry.
            if (
              !dryRun &&
              (result.outcome === "uptodate" || result.outcome === "diverged")
            ) {
              await recordEntry(ctx.config.libraryPath, relocatedEntry);
            }
            results.push(result);
            continue;
          }

          // (c) ORPHANED: subpath gone, no name match → non-destructive surfacing.
          // The library copy is KEPT; never delete, never recordEntry-remove.
          results.push({
            name: entry.name,
            source: entry.source,
            channel: entry.channel,
            fromRef: entry.ref,
            toRef: repo.ref,
            outcome: "orphaned",
            note: "no longer published upstream; library copy kept (skl remove to delete)",
          });
        }

        // Additions (decision 4): published skills in the checkout NOT tracked anywhere.
        const additions = discovered
          .filter((d) => d.published && !trackedNames.has(d.name))
          .map((d) => d.name)
          .sort();
        if (additions.length) newAvailable.push({ repo: parsed.source, names: additions });
      } finally {
        await cleanupStaging(repo.staging); // ONE cleanup per repo
      }
    }

    // LINKED skills with no lock entry: report them as explicitly skipped so the
    // never-clobber-a-dev-repo guarantee is visible, not silent.
    for (const s of linkedNoLock) {
      results.push({
        name: s.name,
        source: "(dev repo)",
        channel: "local",
        fromRef: "-",
        toRef: null,
        outcome: "skipped",
        note: "LINKED to a dev repo — its own git owns versioning; not pulling upstream",
      });
    }
    results.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    const updated = results.filter((r) => r.outcome === "updated").length;
    const diverged = results.filter((r) => r.outcome === "diverged").length;
    const errored = results.filter((r) => r.outcome === "error").length;
    const orphaned = results.filter((r) => r.outcome === "orphaned").length;

    // The structured payload (verbatim) + the human renderer. The outcome->tag ternary
    // now lives in report.ts as updateOutcomeMark(); the diverged-diff block, the summary
    // line, and the newAvailable hints are reproduced here EXACTLY (none are in the JSON).
    const result: CommandResult = {
      json: {
        ok: errored === 0,
        updated,
        diverged,
        errors: errored,
        orphaned,
        results,
        newAvailable,
      },
      human: (emit) => {
        for (const r of results) {
          emit(`${updateOutcomeMark(r.outcome)}  ${r.name.padEnd(28)} ${r.note}`);
          if (r.outcome === "diverged" && r.diff) {
            emit();
            emit(r.diff.trimEnd());
            emit();
          }
        }
        emit();
        emit(
          `${results.length} tracked, ${updated} updated, ${diverged} diverged${orphaned ? `, ${orphaned} orphaned` : ""}${errored ? `, ${errored} error(s)` : ""}.`,
        );
        if (diverged > 0) emit("re-run with --force to overwrite diverged local bodies.");
        // Additions never install (curator boundary, decision 4); just point at `skl add`.
        for (const a of newAvailable) {
          emit(
            `${a.names.length} new published skill(s) in ${a.repo} not tracked → skl add ${a.repo} --all`,
          );
        }
      },
    };
    render(ctx, json, result);

    // Non-zero if any error or any unresolved divergence (blocks CI/agents).
    if (errored > 0) return 1;
    return diverged > 0 ? 2 : 0;
  } catch (err) {
    ctx.error("update: failed:", err instanceof Error ? err.message : String(err));
    return 1;
  }
}
