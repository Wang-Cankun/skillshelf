// skl outdated — per locked skill, check the upstream latest commit/ref and
// mark which installed skills are stale (upstream moved past the installed ref).
//
// github channel: `gh api` / `git ls-remote` (via core/fetch).
// vercel-registry channel: `skills info` (degrades gracefully if absent).
//
// Read command: supports --json.

import type { Ctx, LockEntry } from "../types.ts";
import { readLockfile } from "../core/provenance.ts";
import { entryMode } from "../core/library.ts";
import { parseStoredSource, latestRef } from "../core/fetch.ts";

export const meta = {
  name: "outdated",
  summary: "Check upstream ref per tracked skill and mark stale ones",
  usage: "skl outdated [name] [--json]",
} as const;

type Status = "stale" | "current" | "unknown" | "linked";

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

export async function run(argv: string[], ctx: Ctx): Promise<number> {
  const json = argv.includes("--json");
  const nameArg = argv.find((a) => !a.startsWith("-")) ?? null;

  try {
    const lock = await readLockfile(ctx.config.libraryPath);
    let entries = Object.values(lock.entries);
    if (nameArg) entries = entries.filter((e) => e.name === nameArg);
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    if (entries.length === 0) {
      if (json) ctx.json({ ok: true, checked: 0, stale: 0, rows: [] });
      else if (nameArg) ctx.log(`no tracked skill named "${nameArg}"`);
      else ctx.log("no tracked third-party skills (lockfile is empty)");
      return 0;
    }

    const rows = await Promise.all(
      entries.map((e) =>
        entryMode(ctx.config.libraryPath, e.name) === "linked"
          ? Promise.resolve(linkedRow(e))
          : checkEntry(e),
      ),
    );
    const stale = rows.filter((r) => r.status === "stale");

    if (json) {
      ctx.json({
        ok: true,
        checked: rows.length,
        stale: stale.length,
        rows,
      });
    } else {
      for (const r of rows) {
        const mark =
          r.status === "stale" ? "STALE  "
            : r.status === "current" ? "current"
              : r.status === "linked" ? "linked "
                : "unknown";
        const refInfo =
          r.status === "linked"
            ? r.note
            : r.status === "stale"
              ? `${shortRef(r.installedRef)} -> ${shortRef(r.latestRef ?? "")}`
              : r.status === "current"
                ? shortRef(r.installedRef)
                : `${shortRef(r.installedRef)} (${r.note})`;
        const extra = r.note && r.status !== "unknown" && r.status !== "linked" ? `  [${r.note}]` : "";
        ctx.log(`${mark}  ${r.name.padEnd(28)} ${r.channel.padEnd(15)} ${refInfo}${extra}`);
      }
      ctx.log("");
      ctx.log(`${rows.length} tracked, ${stale.length} stale.`);
      if (stale.length > 0) {
        ctx.log(`run \`skl update [name]\` to re-pull (domain tags are preserved).`);
      }
    }
    // Non-zero exit when stale skills exist, so agents/CI can branch on it.
    return stale.length > 0 ? 2 : 0;
  } catch (err) {
    ctx.error("outdated: failed:", err instanceof Error ? err.message : String(err));
    return 1;
  }
}
