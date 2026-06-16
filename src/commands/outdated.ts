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

export const meta = {
  name: "outdated",
  summary: "Check upstream ref per tracked skill and mark stale ones",
  usage: "skl outdated [name] [--check-local] [--json]",
} as const;

type Status = "stale" | "current" | "unknown" | "linked" | "diverged" | "adopted";

interface Row {
  name: string;
  channel: string;
  source: string;
  installedRef: string;
  latestRef: string | null;
  status: Status;
  note: string;
}

function shortRef(ref: string): string {
  return /^[0-9a-f]{7,40}$/i.test(ref) ? ref.slice(0, 10) : ref;
}

async function checkEntry(entry: LockEntry): Promise<Row> {
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
  const same = latest === entry.ref;
  return {
    name: entry.name,
    channel: entry.channel,
    source: entry.source,
    installedRef: entry.ref,
    latestRef: latest,
    status: same ? "current" : "stale",
    note: entry.localEdits ? "has local edits" : "",
  };
}

/**
 * A LINKED entry (library/<name> symlinks to an external dev repo) has no tracked
 * upstream — its own git owns versioning. Report it as such instead of probing a
 * (possibly stale) github ref (ADR-0004).
 */
function linkedRow(entry: LockEntry): Row {
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
function adoptedRow(entry: LockEntry): Row {
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

function linkedRowFromName(name: string, linkTarget: string | null): Row {
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
function checkEntryLocal(entry: LockEntry, library: Skill[], libraryPath: string): Row {
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
  if (entry.installedHash == null) {
    return { ...base, status: "unknown", note: "no recorded baseline (installed before hash tracking) — re-run `skl update` to record one" };
  }
  if (localHash == null) {
    return { ...base, status: "unknown", note: "local SKILL.md unreadable" };
  }
  return localHash === entry.installedHash
    ? { ...base, status: "current", note: "matches installed baseline (offline)" }
    : { ...base, status: "diverged", note: "local body diverged from installed baseline (offline)" };
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

    const rows = await Promise.all(
      entries.map((e) =>
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
              : checkEntry(e),
      ),
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

    if (rows.length === 0) {
      if (json) ctx.json({ ok: true, checked: 0, stale: 0, rows: [] });
      else if (nameArg) ctx.log(`no tracked skill named "${nameArg}"`);
      else ctx.log("no tracked third-party skills (lockfile is empty)");
      return 0;
    }

    const stale = rows.filter((r) => r.status === "stale");
    const diverged = rows.filter((r) => r.status === "diverged");

    if (json) {
      ctx.json({
        ok: true,
        checked: rows.length,
        stale: stale.length,
        diverged: diverged.length,
        rows,
      });
    } else {
      for (const r of rows) {
        const mark =
          r.status === "stale" ? "STALE   "
            : r.status === "diverged" ? "DIVERGED"
              : r.status === "current" ? "current "
                : r.status === "linked" ? "linked  "
                  : r.status === "adopted" ? "adopted "
                    : "unknown ";
        const refInfo =
          r.status === "linked"
            ? r.note
            : r.status === "adopted"
              ? r.note
              : r.status === "stale"
                ? `${shortRef(r.installedRef)} -> ${shortRef(r.latestRef ?? "")}`
                : r.status === "diverged"
                  ? r.note
                  : r.status === "current"
                    ? shortRef(r.installedRef) + (checkLocal ? " (offline)" : "")
                    : `${shortRef(r.installedRef)} (${r.note})`;
        const extra =
          r.note && !["unknown", "linked", "diverged", "adopted"].includes(r.status) ? `  [${r.note}]` : "";
        ctx.log(`${mark}  ${r.name.padEnd(28)} ${r.channel.padEnd(15)} ${refInfo}${extra}`);
      }
      ctx.log("");
      if (checkLocal) {
        ctx.log(`${rows.length} tracked, ${diverged.length} locally diverged (offline check — no upstream probed).`);
        if (diverged.length > 0) ctx.log("re-run \`skl update [name]\` to see the upstream diff, or \`--force\` to overwrite.");
      } else {
        ctx.log(`${rows.length} tracked, ${stale.length} stale.`);
        if (stale.length > 0) ctx.log(`run \`skl update [name]\` to re-pull (domain tags are preserved).`);
      }
    }
    // Non-zero exit when stale (or, offline, locally-diverged) skills exist, so
    // agents/CI can branch on it.
    const flagged = checkLocal ? diverged.length : stale.length;
    return flagged > 0 ? 2 : 0;
  } catch (err) {
    ctx.error("outdated: failed:", err instanceof Error ? err.message : String(err));
    return 1;
  }
}
