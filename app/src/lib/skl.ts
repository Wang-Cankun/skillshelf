// The bridge between the Svelte UI and the deterministic `skl` CLI.
//
// In Tauri (desktop) we invoke the Rust `run_skl` command, which shells out to
// the real `skl` binary and returns a structured { ok, stdout, stderr }. In a
// plain browser (Vite dev, no Tauri) we fall back to the REAL data captured in
// fixtures.ts so the UI renders meaningfully without Rust. Mutating actions
// become dry-run echoes in the browser (ADR-0007: the UI is a graphical front
// for deterministic verbs).

import type { Skill, DeploymentReport, ScanReport, StatusReport } from "./types";
import { realLibrary, realWhere, realScan, realStatus } from "./fixtures";

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
 * Invoke the Tauri `run_skl` command and parse its JSON stdout into `T`.
 * Dynamically imports @tauri-apps/api so the browser bundle never needs it.
 * Throws if `run_skl` reports a non-zero exit, or if stdout is not valid JSON.
 */
async function invokeJson<T>(args: string[]): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  const result = await invoke<SklResult>("run_skl", { args });
  if (!result.ok) {
    throw new Error(
      result.stderr.trim() || `${cmdEcho(args)} exited non-zero`,
    );
  }
  try {
    return JSON.parse(result.stdout) as T;
  } catch (err) {
    throw new Error(
      `failed to parse JSON from ${cmdEcho(args)}: ${String(err)}`,
    );
  }
}

export async function loadLibrary(): Promise<Skill[]> {
  if (IS_TAURI) return invokeJson<Skill[]>(["ls", "--json"]);
  return realLibrary;
}

export async function loadWhere(): Promise<DeploymentReport> {
  if (IS_TAURI) return invokeJson<DeploymentReport>(["where", "--json"]);
  return realWhere;
}

export async function loadScan(): Promise<ScanReport> {
  if (IS_TAURI) return invokeJson<ScanReport>(["scan", "--json"]);
  return realScan;
}

export async function loadStatus(): Promise<StatusReport> {
  if (IS_TAURI) return invokeJson<StatusReport>(["status", "--json"]);
  return realStatus;
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
