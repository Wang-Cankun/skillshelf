// The render seam (ADR-0014 / candidate #4): commands compute a typed result, this
// module renders it as machine JSON (passthrough) OR human text (a pure verdict-aware
// closure). The json-vs-human FORK and the domain-coupled display ladders live here;
// the assembly of the structured payload (results/rows/counts) stays in each command's
// run(). Adopted INCREMENTALLY — update/outdated/add/ls are on the seam; the remaining
// ~26 ctx.json sites still use the inline if(json){…}else{…} pattern, so a reader must
// NOT assume uniformity mid-migration.
//
// Hard invariants a caller must know:
//   - render() NEVER changes the JSON shape vs. today's ctx.json({…}) payload — the
//     result.json object is byte-for-byte what the command used to pass, so existing
//     --json consumers (app/src/lib, tests grepping --json) keep passing. Load-bearing.
//   - render() does NOT decide the exit code. run() still computes and returns the
//     number; the reporter is DISPLAY-ONLY. Coupling exit logic in here would regress
//     CI/agent branching.
//   - the mark functions are TOTAL over their union; an unhandled member falls to the
//     same safe default the old nested ternaries used ('skipped  ' / 'unknown ').
//   - error paths (ctx.error + return 1 in the catch blocks) stay in run(); the reporter
//     only handles the success result, mirroring today where the catch never calls json.

import type { Ctx } from "../types.ts";
import type { OutdatedRow } from "../commands/outdated.ts";

/** A left-gutter status token, e.g. "updated  ", "STALE   " (fixed-width). */
export type Mark = string;

// ---- pure verdict->mark ladders (lifted out of the commands, unit-testable) ----

/** update.ts outcome -> left-gutter tag. Default 'skipped  ' (the old ternary tail). */
export function updateOutcomeMark(
  outcome: "updated" | "uptodate" | "diverged" | "orphaned" | "error" | "skipped",
): Mark {
  return outcome === "updated"
    ? "updated  "
    : outcome === "uptodate"
      ? "current  "
      : outcome === "diverged"
        ? "DIVERGED "
        : outcome === "orphaned"
          ? "orphaned "
          : outcome === "error"
            ? "ERROR    "
            : "skipped  ";
}

/** outdated.ts status -> left-gutter mark. Default 'unknown ' (the old ternary tail). */
export function outdatedStatusMark(
  status: "stale" | "current" | "unknown" | "linked" | "diverged" | "adopted",
): Mark {
  return status === "stale"
    ? "STALE   "
    : status === "diverged"
      ? "DIVERGED"
      : status === "current"
        ? "current "
        : status === "linked"
          ? "linked  "
          : status === "adopted"
            ? "adopted "
            : "unknown ";
}

function shortRef(ref: string): string {
  return /^[0-9a-f]{7,40}$/i.test(ref) ? ref.slice(0, 10) : ref;
}

/**
 * outdated.ts refInfo+extra column for one row. `checkLocal` adds the " (offline)"
 * suffix to a `current` row. Verbatim from the old outdated.ts mark/refInfo ladder.
 */
export function outdatedRefInfo(row: OutdatedRow, checkLocal: boolean): string {
  const refInfo =
    row.status === "linked"
      ? row.note
      : row.status === "adopted"
        ? row.note
        : row.status === "stale"
          ? `${shortRef(row.installedRef)} -> ${shortRef(row.latestRef ?? "")}`
          : row.status === "diverged"
            ? row.note
            : row.status === "current"
              ? shortRef(row.installedRef) + (checkLocal ? " (offline)" : "")
              : `${shortRef(row.installedRef)} (${row.note})`;
  const extra =
    row.note && !["unknown", "linked", "diverged", "adopted"].includes(row.status)
      ? `  [${row.note}]`
      : "";
  return `${refInfo}${extra}`;
}

/** add.ts --dry-run verdict -> left-gutter tag. Default 'INVALID  ' (the old tail). */
export function addDryRunVerdictMark(
  verdict: "new" | "identical" | "differs" | "linked" | "invalid",
): Mark {
  return verdict === "new"
    ? "new      "
    : verdict === "identical"
      ? "identical"
      : verdict === "differs"
        ? "DIFFERS  "
        : verdict === "linked"
          ? "linked   "
          : "INVALID  ";
}

// ---- the render dispatch ----

/**
 * A command result: a machine payload + a human renderer. `human` is handed an
 * `emit` line-printer (ctx.log) so the closure stays free of the Ctx itself and is
 * trivially fakeable; calling `emit()` with no arg prints a blank line (ctx.log()).
 */
export interface CommandResult {
  json: unknown;
  human: (emit: (line?: string) => void) => void;
}

/**
 * Pick the branch and drive ctx.json / ctx.log. jsonMode -> ctx.json(result.json)
 * (the human closure is never called); else result.human(ctx.log). Display-only:
 * it formats already-computed data and never touches exit codes or the payload.
 */
export function render(ctx: Ctx, jsonMode: boolean, result: CommandResult): void {
  if (jsonMode) {
    ctx.json(result.json);
    return;
  }
  result.human((line?: string) => ctx.log(line ?? ""));
}
