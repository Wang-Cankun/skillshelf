// Shared test helpers: build a capturing Ctx around the real config loader,
// run a command module in-process, and run the real CLI as a subprocess.

import { join } from "node:path";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { loadContext } from "../src/config.ts";
import type { Ctx, CommandModule } from "../src/types.ts";

export const REPO = join(import.meta.dir, "..");
export const FIXTURE_LIBRARY = join(REPO, "fixtures", "library");
export const CLI = join(REPO, "src", "cli.ts");

export interface Captured {
  code: number;
  /** lines passed to ctx.log (already stringified, newline-joined elsewhere) */
  out: string;
  /** lines passed to ctx.error */
  err: string;
  /** every value passed to ctx.json, parsed back from the single-line JSON */
  json: unknown[];
}

/**
 * Build a Ctx whose log/json/error are captured into buffers instead of stdout.
 * Uses the real loadContext() so config resolution / loadLibrary are exercised.
 */
export async function makeCtx(opts: {
  library?: string;
  env?: NodeJS.ProcessEnv;
} = {}): Promise<{ ctx: Ctx; buf: { out: string[]; err: string[]; json: unknown[] } }> {
  const env: NodeJS.ProcessEnv = {
    ...opts.env,
    SKILLSHELF_LIBRARY: opts.library ?? FIXTURE_LIBRARY,
  };
  const base = await loadContext({ env });
  const buf = { out: [] as string[], err: [] as string[], json: [] as unknown[] };
  const fmt = (args: unknown[]) =>
    args.map((a) => (typeof a === "string" ? a : String(a))).join(" ");
  const ctx: Ctx = {
    ...base,
    log: (...args: unknown[]) => buf.out.push(fmt(args)),
    error: (...args: unknown[]) => buf.err.push(fmt(args)),
    json: (value: unknown) => buf.json.push(value),
  };
  return { ctx, buf };
}

/** Run a command module's run() with captured Ctx. */
export async function runCmd(
  mod: CommandModule,
  argv: string[],
  opts: { library?: string; cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<Captured> {
  const { ctx, buf } = await makeCtx({ library: opts.library, env: opts.env });
  const prevCwd = process.cwd();
  if (opts.cwd) process.chdir(opts.cwd);
  let code: number;
  try {
    code = await mod.run(argv, ctx);
  } finally {
    if (opts.cwd) process.chdir(prevCwd);
  }
  return { code, out: buf.out.join("\n"), err: buf.err.join("\n"), json: buf.json };
}

/** Run the real CLI as a subprocess (smoke path). Returns exit code + stdout/stderr. */
export async function runCli(
  args: string[],
  opts: { library?: string; cwd?: string; env?: Record<string, string> } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    SKILLSHELF_LIBRARY: opts.library ?? FIXTURE_LIBRARY,
    ...opts.env,
  };
  const proc = Bun.spawn(["bun", CLI, ...args], {
    cwd: opts.cwd ?? REPO,
    env,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  return { code, stdout, stderr };
}

/** Make an isolated temp library by copying the fixture library. */
export async function tempLibrary(): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "skl-lib-"));
  const path = join(dir, "library");
  await cp(FIXTURE_LIBRARY, path, { recursive: true });
  return { path, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

/** Make an isolated temp project dir (for use/drop/status symlink lifecycle). */
export async function tempProject(): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "skl-proj-"));
  return { path: dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}
