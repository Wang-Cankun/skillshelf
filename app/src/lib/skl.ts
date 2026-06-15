// The bridge between the React UI and the deterministic `skl` CLI.
//
// In Tauri (desktop) we invoke the Rust `run_skl` command, which shells out to
// the real `skl` binary and returns a structured { ok, stdout, stderr }. In a
// plain browser (Vite dev, no Tauri) we fall back to the REAL data captured in
// fixtures.ts (plus derive.ts reconstructions of the §7 feeds) so the UI renders
// meaningfully without Rust. Mutating actions become dry-run echoes in the
// browser (ADR-0007: the UI is a graphical front for deterministic verbs).
//
// Every Tauri payload is validated through a Zod schema (schemas.ts) at the
// boundary — a malformed/structurally-changed payload throws here, not later.

import type {
  Skill,
  DeploymentReport,
  ScanReport,
  StatusReport,
  AgentsReport,
  ShowReport,
  OutdatedReport,
} from "./types";
import {
  LibrarySchema,
  DeploymentReportSchema,
  ScanReportSchema,
  StatusReportSchema,
  AgentsReportSchema,
  RawShowSchema,
  OutdatedSchema,
} from "./schemas";
import { realLibrary, realWhere, realScan, realStatus } from "./fixtures";
import { augmentLibrary, deriveShow, normalizeShow, deriveOutdated } from "./derive";
import { deriveAgentsReport } from "./agents";
import { visibleAgents } from "./prefs";
import type { ZodType } from "zod";

export const IS_TAURI =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * Structured result of running a `skl` action. Mirrors the Rust `SklResult`
 * struct returned by `run_skl` (CONTRACT-A): `ok` reflects a zero exit code.
 */
export interface SklResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

/** Echo a command the way it would be run, for command-echo UI affordances. */
export function cmdEcho(args: string[]): string {
  return "skl " + args.join(" ");
}

/**
 * Invoke the Tauri `run_skl` command, validate its JSON stdout through `schema`,
 * and return the parsed `T`. Dynamically imports @tauri-apps/api so the browser
 * bundle never needs it. Throws if `run_skl` reports a non-zero exit, if stdout
 * is not valid JSON, or if the payload fails schema validation.
 */
async function invokeJson<T>(args: string[], schema: ZodType<T>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  const result = await invoke<SklResult>("run_skl", { args });
  if (!result.ok) {
    throw new Error(result.stderr.trim() || `${cmdEcho(args)} exited non-zero`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(result.stdout);
  } catch (err) {
    throw new Error(`failed to parse JSON from ${cmdEcho(args)}: ${String(err)}`);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `unexpected shape from ${cmdEcho(args)}: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

export async function loadLibrary(): Promise<Skill[]> {
  if (IS_TAURI) return invokeJson(["ls", "--json"], LibrarySchema);
  // browser: augment captured rows with §7.1 fields from where + lockfile.
  return augmentLibrary(realLibrary, realWhere);
}

export async function loadWhere(): Promise<DeploymentReport> {
  if (IS_TAURI) return invokeJson(["where", "--json"], DeploymentReportSchema);
  return realWhere;
}

export async function loadScan(): Promise<ScanReport> {
  if (IS_TAURI) return invokeJson(["scan", "--json"], ScanReportSchema);
  return realScan;
}

export async function loadStatus(): Promise<StatusReport> {
  if (IS_TAURI) return invokeJson(["status", "--json"], StatusReportSchema);
  return realStatus;
}

export async function loadOutdated(): Promise<OutdatedReport> {
  if (IS_TAURI) {
    // `skl outdated --json` EXITS 2 when stale/diverged skills exist — a CI
    // signal, NOT a failure (the JSON payload is still on stdout). invokeJson
    // throws on any non-zero exit, so it can't be used here: with ~20 stale
    // skills the check would always "fail". Parse stdout directly and only
    // treat a genuinely empty/unparseable stdout (exit 1) as an error.
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke<SklResult>("run_skl", {
      args: ["outdated", "--json"],
    });
    let raw: unknown;
    try {
      raw = JSON.parse(result.stdout);
    } catch {
      throw new Error(
        result.stderr.trim() || "skl outdated --json produced no JSON",
      );
    }
    const parsed = OutdatedSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `unexpected shape from skl outdated --json: ${parsed.error.message}`,
      );
    }
    return parsed.data;
  }
  // browser: HONEST fixture-derived fallback (no GitHub access here).
  return deriveOutdated(augmentLibrary(realLibrary, realWhere));
}

export async function loadAgents(): Promise<AgentsReport> {
  const report = IS_TAURI
    ? await invokeJson(["agents", "--json"], AgentsReportSchema)
    : // browser: reconstruct the agents report from the real `where` feed.
      deriveAgentsReport(realWhere);
  // UI display filter (prefs.ts) — hide agents this install doesn't use.
  return { ...report, agents: visibleAgents(report.agents) };
}

export async function loadShow(
  name: string,
  file?: string,
): Promise<ShowReport> {
  if (IS_TAURI) {
    const args = file
      ? ["show", name, "--file", file, "--json"]
      : ["show", name, "--json"];
    // The live `skl show --json` payload is richer/differently-shaped than the
    // drawer's ShowReport (absolute-string refFiles, no frontmatter object), so
    // validate loosely then normalize into the drawer shape.
    const raw = await invokeJson(args, RawShowSchema);
    return normalizeShow(raw, name);
  }
  return deriveShow(name, file, augmentLibrary(realLibrary, realWhere));
}

/**
 * Run a mutating (or any) `skl` action.
 * - In Tauri: invokes `run_skl`, returning the structured `SklResult`. If the
 *   IPC call itself rejects (binary not found, etc.) that error is captured into
 *   `{ ok: false, stderr }` so callers always get a `SklResult`.
 * - In the browser: returns a dry-run stub so nothing is mutated.
 */
export async function runAction(args: string[]): Promise<SklResult> {
  if (IS_TAURI) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<SklResult>("run_skl", { args });
    } catch (err) {
      return { ok: false, stdout: "", stderr: String(err) };
    }
  }
  return {
    ok: true,
    stdout: "(dry-run: " + cmdEcho(args) + ")",
    stderr: "",
  };
}
