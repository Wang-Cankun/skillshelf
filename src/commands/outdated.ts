// skl outdated — per locked skill, check the upstream latest commit/ref and
// mark which installed skills are stale (upstream moved past the installed ref).
//
// github channel: `gh api` / `git ls-remote` (via core/fetch).
// vercel-registry channel: `skills info` (degrades gracefully if absent).
//
// Read command: supports --json.

import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import type { Ctx, LockEntry, Skill } from "../types.ts";
import { readLockfile } from "../core/provenance.ts";
import { entryMode, entryModeInfo, loadLibrary, findByName } from "../core/library.ts";
import { hashContent } from "../core/crawl.ts";
import { parseFrontmatter } from "../lib/frontmatter.ts";
import { parseStoredSource, latestRef } from "../core/fetch.ts";
import { classify } from "../core/reconcile.ts";
import { render, outdatedStatusMark, outdatedRefInfo, type CommandResult } from "../core/report.ts";

export const meta = {
  name: "outdated",
  summary: "Check upstream ref per tracked skill and mark stale ones",
  usage: "skl outdated [name] [--check-local] [--json]",
} as const;

type Status = "stale" | "current" | "unknown" | "linked" | "diverged" | "adopted";

/** One outdated-check row. Exported (renamed from the local `Row`) so report.ts can type outdatedRefInfo(). */
export interface OutdatedRow {
  name: string;
  channel: string;
  source: string;
  installedRef: string;
  latestRef: string | null;
  status: Status;
  note: string;
}

/**
 * Hash the on-disk SKILL.md body (frontmatter-stripped) of a tracked skill, or null when
 * the file is missing/unreadable. The online check MUST feed this into classify: with
 * localHash==null the classifier short-circuits to "unknown" (reconcile.ts step 4) and
 * NEVER reaches the ref-compare (step 7), so `outdated` could never surface a stale skill
 * — the ref-compare was dead code and the UI ↑ badge (keys off status==="stale") never lit.
 */
function localBodyHash(name: string, library: Skill[], libraryPath: string): string | null {
  const skill = findByName(library, name);
  const bodyPath = skill?.bodyPath ?? join(libraryPath, name, "SKILL.md");
  try {
    if (existsSync(bodyPath)) {
      return hashContent(parseFrontmatter(readFileSync(bodyPath, "utf8")).body);
    }
  } catch {
    /* leave null */
  }
  return null;
}

async function checkEntry(entry: LockEntry, library: Skill[], libraryPath: string): Promise<OutdatedRow> {
  const parsed = parseStoredSource(entry.source);
  const res = await latestRef(parsed);
  if (!res.ok) {
    return {
      name: entry.name,
      channel: entry.channel,
      source: entry.source,
      installedRef: entry.ref,
      latestRef: null,
      status: "unknown",
      note: res.error,
    };
  }
  const latest = res.ref;
  // Ref-only online view (no upstream body fetched): classify maps to stale/current off
  // the ref compare (step 7) — but only if a real localHash is supplied (else the step-4
  // localHash==null guard returns "unknown" before the ref compare is ever reached).
  const localHash = localBodyHash(entry.name, library, libraryPath);
  const verdict = classify({
    adopted: false,
    mode: "owned",
    installedHash: entry.installedHash ?? null,
    localEdits: entry.localEdits,
    localHash,
    upstreamHash: null,
    installedRef: entry.ref,
    latestRef: latest,
    structural: null,
  });
  return {
    name: entry.name,
    channel: entry.channel,
    source: entry.source,
    installedRef: entry.ref,
    latestRef: latest,
    // Map the verdict explicitly: an unreadable local body yields "unknown" (localHash
    // null → classify step 4), NOT a falsely-reassuring "current". Only a real ref-compare
    // (readable body) produces stale/current.
    status: verdict === "stale" ? "stale" : verdict === "unknown" ? "unknown" : "current",
    note:
      verdict === "unknown"
        ? "local SKILL.md missing/unreadable — cannot compare against upstream"
        : entry.localEdits
          ? "has local edits"
          : "",
  };
}

/**
 * A LINKED entry (library/<name> symlinks to an external dev repo) has no tracked
 * upstream — its own git owns versioning. Report it as such instead of probing a
 * (possibly stale) github ref (ADR-0004).
 */
function linkedRow(entry: LockEntry): OutdatedRow {
  return {
    name: entry.name,
    channel: "local",
    source: entry.source,
    installedRef: entry.ref,
    latestRef: null,
    status: "linked",
    note: "dev repo owns versioning",
  };
}

/**
 * A LINKED library skill with NO lockfile entry (the normal case for `skl link
 * --from` — it drops any lock entry). Without this, a freshly-linked dev skill is
 * INVISIBLE to outdated, giving an agent zero positive evidence its dev repo is the
 * canonical source. Surface it as a `linked` row regardless.
 */
/**
 * An ADOPTED entry (`skl track`/`skl migrate`): provenance is known but the upstream
 * baseline was NEVER verified against real upstream (the recorded ref may be empty and
 * the installedHash describes the LOCAL copy only). Reporting it as stale/current off the
 * empty ref would be a lie, so surface it as `adopted` and do NOT network-probe (ADR-0011).
 */
function adoptedRow(entry: LockEntry): OutdatedRow {
  return {
    name: entry.name,
    channel: entry.channel,
    source: entry.source,
    installedRef: entry.ref || "-",
    latestRef: null,
    status: "adopted",
    note: "provenance adopted; baseline unverified — run `skl update` to reconcile",
  };
}

function linkedRowFromName(name: string, linkTarget: string | null): OutdatedRow {
  return {
    name,
    channel: "local",
    source: linkTarget ?? "(dev repo)",
    installedRef: "-",
    latestRef: null,
    status: "linked",
    note: "dev repo owns versioning",
  };
}

/**
 * Offline (no network) divergence check for an OWNED tracked skill: compare the local
 * SKILL.md body hash to the baseline recorded at install/update time
 * (lockfile.installedHash). Answers "have I locally edited this?" without probing
 * upstream — usable on a plane / in CI with no creds.
 */
function checkEntryLocal(entry: LockEntry, library: Skill[], libraryPath: string): OutdatedRow {
  const skill = findByName(library, entry.name);
  const bodyPath = skill?.bodyPath ?? join(libraryPath, entry.name, "SKILL.md");
  let localHash: string | null = null;
  try {
    if (existsSync(bodyPath)) {
      const raw = readFileSync(bodyPath, "utf8");
      localHash = hashContent(parseFrontmatter(raw).body);
    }
  } catch {
    /* leave null */
  }
  const base = {
    name: entry.name,
    channel: entry.channel,
    source: entry.source,
    installedRef: entry.ref,
    latestRef: null,
  };
  // Distinct 'unknown' Rows keep their distinct guidance notes (the disambiguation the
  // classifier collapses to a single 'unknown' verdict — surface text preserved).
  if (entry.installedHash == null) {
    return { ...base, status: "unknown", note: "no recorded baseline (installed before hash tracking) — re-run `skl update` to record one" };
  }
  if (localHash == null) {
    return { ...base, status: "unknown", note: "local SKILL.md unreadable" };
  }
  // Pure offline (no upstream body, no ref): classify maps to 'edited' vs 'current' off
  // the install-baseline compare. The 'edited' verdict surfaces as the UNCHANGED public
  // Status word 'diverged' (ADR-0013 keeps the UI word for backward compat).
  const verdict = classify({
    adopted: false,
    mode: "owned",
    installedHash: entry.installedHash ?? null,
    localEdits: entry.localEdits,
    localHash,
    upstreamHash: null,
    installedRef: entry.ref,
    latestRef: null,
    structural: null,
  });
  return verdict === "edited"
    ? { ...base, status: "diverged", note: "local body diverged from installed baseline (offline)" }
    : { ...base, status: "current", note: "matches installed baseline (offline)" };
}

/**
 * Resolve an array through an async fn with BOUNDED concurrency, preserving input order.
 * `outdated` probes an upstream ref per tracked skill; firing one `git ls-remote` for the
 * WHOLE lockfile at once (unbounded Promise.all) opens dozens of simultaneous TLS handshakes
 * that a flaky network / connection cap turns into a storm of transient "unable to access"
 * failures — every one collapsing to status "unknown". A small pool caps in-flight probes so
 * they succeed instead of overwhelming the transport (a failed probe degrades to "unknown",
 * not a retry — a status check must not hang on a flaky host).
 *
 * `fn` MUST resolve (never reject): a rejection would tear down the pool via Promise.all
 * while sibling workers keep running (risking an unhandled rejection). Every current caller
 * branch is throw-free by contract; a future throwing `fn` must catch internally.
 */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    for (let i = next++; i < items.length; i = next++) {
      out[i] = await fn(items[i]!, i);
    }
  }
  // Clamp to >=1 worker: a limit of 0 (or negative) would spawn none, leaving `out` full
  // of undefined holes. min() with items.length avoids spawning idle workers.
  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return out;
}

export async function run(argv: string[], ctx: Ctx): Promise<number> {
  const json = argv.includes("--json");
  const checkLocal = argv.includes("--check-local");
  const nameArg = argv.find((a) => !a.startsWith("-")) ?? null;
  const libraryPath = ctx.config.libraryPath;

  try {
    const lock = await readLockfile(libraryPath);
    let entries = Object.values(lock.entries);
    if (nameArg) entries = entries.filter((e) => e.name === nameArg);
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    // Load the library so we can (a) hash local bodies for --check-local and
    // (b) surface LINKED skills that have NO lock entry — the normal `skl link
    // --from` case — which would otherwise be invisible here.
    const library = await loadLibrary(libraryPath);

    // Bounded concurrency (not an unbounded Promise.all): the online checkEntry path
    // makes a network probe per skill, and firing all of them at once storms the transport
    // into transient failures (→ status "unknown"). Offline branches (linked/adopted/
    // --check-local) resolve instantly and cost nothing extra under the pool.
    const PROBE_CONCURRENCY = 6;
    const rows = await mapLimit(entries, PROBE_CONCURRENCY, (e) =>
      entryMode(libraryPath, e.name) === "linked"
        ? Promise.resolve(linkedRow(e))
        : e.adopted === true
          ? // An adopted entry has an unverified (often empty) baseline — never probe
            // upstream off it; report it as `adopted` so `update` reconciles (ADR-0011).
            // --check-local still does the offline body-vs-baseline compare below.
            checkLocal
            ? Promise.resolve(checkEntryLocal(e, library, libraryPath))
            : Promise.resolve(adoptedRow(e))
          : checkLocal
            ? Promise.resolve(checkEntryLocal(e, library, libraryPath))
            : checkEntry(e, library, libraryPath),
    );

    // Augment: LINKED library skills not already represented by a lock entry get a
    // `linked` row, so a freshly-shelved dev skill shows positive evidence.
    const known = new Set(rows.map((r) => r.name));
    for (const s of library) {
      if (known.has(s.name)) continue;
      if (nameArg && s.name !== nameArg) continue;
      const info = entryModeInfo(libraryPath, s.name);
      if (info.mode === "linked") rows.push(linkedRowFromName(s.name, info.linkTarget));
    }
    rows.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    // Empty result: a DISTINCT JSON shape (no `diverged` field) + nameArg-vs-empty
    // human messages. Folded into a CommandResult so render() owns the json/human fork;
    // exit stays 0 below (no flagged rows).
    if (rows.length === 0) {
      const empty: CommandResult = {
        json: { ok: true, checked: 0, stale: 0, rows: [] },
        human: (emit) =>
          emit(nameArg ? `no tracked skill named "${nameArg}"` : "no tracked third-party skills (lockfile is empty)"),
      };
      render(ctx, json, empty);
      return 0;
    }

    const stale = rows.filter((r) => r.status === "stale");
    const diverged = rows.filter((r) => r.status === "diverged");

    // The structured payload (verbatim) + the human renderer (the mark/refInfo ladders
    // now live in report.ts as outdatedStatusMark/outdatedRefInfo; summary text verbatim).
    const result: CommandResult = {
      json: {
        ok: true,
        checked: rows.length,
        stale: stale.length,
        diverged: diverged.length,
        rows,
      },
      human: (emit) => {
        for (const r of rows) {
          emit(
            `${outdatedStatusMark(r.status)}  ${r.name.padEnd(28)} ${r.channel.padEnd(15)} ${outdatedRefInfo(r, checkLocal)}`,
          );
        }
        emit();
        if (checkLocal) {
          emit(`${rows.length} tracked, ${diverged.length} locally diverged (offline check — no upstream probed).`);
          if (diverged.length > 0) emit("re-run \`skl update [name]\` to see the upstream diff, or \`--force\` to overwrite.");
        } else {
          emit(`${rows.length} tracked, ${stale.length} stale.`);
          if (stale.length > 0) emit(`run \`skl update [name]\` to re-pull (domain tags are preserved).`);
        }
      },
    };
    render(ctx, json, result);

    // Non-zero exit when stale (or, offline, locally-diverged) skills exist, so
    // agents/CI can branch on it.
    const flagged = checkLocal ? diverged.length : stale.length;
    return flagged > 0 ? 2 : 0;
  } catch (err) {
    ctx.error("outdated: failed:", err instanceof Error ? err.message : String(err));
    return 1;
  }
}
