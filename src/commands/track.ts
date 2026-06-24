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
//
// The core adopt-provenance logic lives in core/vendor.ts (`track`/`adopt`, one impl,
// shared with `skl migrate`) — the curator boundary. This command is just parse + render.

import type { Ctx } from "../types.ts";
import { loadLibrary } from "../core/library.ts";
import { track } from "../core/vendor.ts";

export const meta = {
  name: "track",
  summary: "Adopt provenance for a library skill you already have (offline; no re-download)",
  usage: "skl track <name> --source <src> [--ref <r>] [--resolve] [--force] [--json]",
} as const;

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
    const result = await track(libraryPath, library, {
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
