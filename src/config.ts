// Configuration resolution + Ctx construction.
// Library path resolution order:
//   1. env SKILLSHELF_LIBRARY
//   2. ~/.skillshelf/config.json  { "library": "...", "globalCore": "..." }
//   3. default ~/.skillshelf/library
// Global-core symlink target defaults to ~/.claude/skills.

import { homedir } from "node:os";
import { join, resolve, isAbsolute } from "node:path";
import { existsSync } from "node:fs";
import type { Config, ConfigFile, Ctx, RootEntry, Skill } from "./types.ts";

export const DEFAULT_CONFIG_FILE = join(homedir(), ".skillshelf", "config.json");
export const DEFAULT_LIBRARY = join(homedir(), ".skillshelf", "library");
export const DEFAULT_GLOBAL_CORE = join(homedir(), ".claude", "skills");

function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

function abs(p: string): string {
  const e = expandHome(p);
  return isAbsolute(e) ? e : resolve(e);
}

async function readConfigFile(file: string): Promise<ConfigFile | null> {
  if (!existsSync(file)) return null;
  try {
    const text = await Bun.file(file).text();
    const parsed = JSON.parse(text) as ConfigFile;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the full Config (library path + global-core target + provenance).
 * `configFilePath` override is mainly for tests.
 */
export async function resolveConfig(opts: {
  env?: NodeJS.ProcessEnv;
  configFilePath?: string;
} = {}): Promise<Config> {
  const env = opts.env ?? process.env;
  // Config-file resolution: explicit opt override (tests) → SKILLSHELF_CONFIG env →
  // default ~/.skillshelf/config.json. The env override lets an experiment redirect
  // ALL persisted state (roots especially) into a sandbox without touching the real
  // config — `skl scan --add-root` otherwise writes the real file regardless of
  // SKILLSHELF_LIBRARY (the isolation gap this closes).
  const envCfg = env.SKILLSHELF_CONFIG;
  const configFilePath =
    opts.configFilePath ??
    (envCfg && envCfg.trim() !== "" ? abs(envCfg.trim()) : DEFAULT_CONFIG_FILE);

  const fileCfg = await readConfigFile(configFilePath);
  const usedConfigFile = fileCfg ? configFilePath : null;

  let libraryPath: string;
  let source: Config["source"];

  const envLib = env.SKILLSHELF_LIBRARY;
  if (envLib && envLib.trim() !== "") {
    libraryPath = abs(envLib.trim());
    source = "env";
  } else if (fileCfg?.library && fileCfg.library.trim() !== "") {
    libraryPath = abs(fileCfg.library.trim());
    source = "config";
  } else {
    libraryPath = DEFAULT_LIBRARY;
    source = "default";
  }

  const globalCoreTarget =
    env.SKILLSHELF_GLOBAL_CORE && env.SKILLSHELF_GLOBAL_CORE.trim() !== ""
      ? abs(env.SKILLSHELF_GLOBAL_CORE.trim())
      : fileCfg?.globalCore && fileCfg.globalCore.trim() !== ""
        ? abs(fileCfg.globalCore.trim())
        : DEFAULT_GLOBAL_CORE;

  const roots = normalizeRoots(fileCfg?.roots);

  return {
    libraryPath,
    globalCoreTarget,
    roots,
    configFile: usedConfigFile,
    configFilePath,
    source,
  };
}

/**
 * Expand ~, absolutize, and de-duplicate a list of scan roots (order-preserving).
 * Each entry may be a bare path string OR an annotated {path, layout?, notes?}
 * object (see RootEntry); both normalize to an absolute path string here.
 * layout/notes are informational only and dropped — crawl auto-detects layout and
 * nothing consumes them programmatically.
 */
function normalizeRoots(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of input) {
    let raw: string | null = null;
    if (typeof r === "string") raw = r;
    else if (r && typeof r === "object" && typeof (r as { path?: unknown }).path === "string") {
      raw = (r as { path: string }).path;
    }
    if (raw === null || raw.trim() === "") continue;
    const a = abs(raw.trim());
    if (seen.has(a)) continue;
    seen.add(a);
    out.push(a);
  }
  return out;
}

/**
 * Persist a new scan root into the config file (`configFilePath`), expanding ~,
 * absolutizing, and de-duplicating against existing roots. Preserves the rest of
 * the config file (library / globalCore) AND any annotations on existing root
 * entries ({path, layout?, notes?}): we only APPEND a new bare-path entry when the
 * resolved path is absent. Returns the full updated roots list as resolved
 * absolute path strings (the in-memory Config.roots form).
 */
export async function addRoot(
  configFilePath: string,
  existingRoots: string[],
  path: string,
): Promise<string[]> {
  const a = abs(path.trim());

  // Preserve the on-disk roots verbatim (including RootEntry annotations); only
  // append the new path if it is not already present (compared after resolution).
  const current = (await readConfigFile(configFilePath)) ?? {};
  const persisted: Array<string | RootEntry> = Array.isArray(current.roots)
    ? [...current.roots]
    : [];
  const resolvedOf = (entry: string | RootEntry): string | null => {
    const raw = typeof entry === "string" ? entry : entry?.path;
    return typeof raw === "string" && raw.trim() !== "" ? abs(raw.trim()) : null;
  };
  if (!persisted.some((e) => resolvedOf(e) === a)) persisted.push(a);

  const next: ConfigFile = { ...current, roots: persisted };
  await Bun.write(configFilePath, JSON.stringify(next, null, 2) + "\n");

  // Return the resolved, de-duped absolute path list (Config.roots stays string[]).
  return normalizeRoots(persisted);
}

/**
 * Remove a scan root from the config file (`configFilePath`) — the inverse of
 * addRoot. Matches by resolved absolute path, so the caller may pass a bare/`~`/
 * relative form of an already-persisted root. Preserves the rest of the config and
 * any annotations on the surviving root entries. Returns the updated roots list as
 * resolved absolute path strings, plus whether anything was actually removed.
 */
export async function removeRoot(
  configFilePath: string,
  path: string,
): Promise<{ roots: string[]; removed: boolean }> {
  const target = abs(path.trim());
  const current = (await readConfigFile(configFilePath)) ?? {};
  const persisted: Array<string | RootEntry> = Array.isArray(current.roots)
    ? [...current.roots]
    : [];
  const resolvedOf = (entry: string | RootEntry): string | null => {
    const raw = typeof entry === "string" ? entry : entry?.path;
    return typeof raw === "string" && raw.trim() !== "" ? abs(raw.trim()) : null;
  };
  const kept = persisted.filter((e) => resolvedOf(e) !== target);
  const removed = kept.length !== persisted.length;
  if (removed) {
    const next: ConfigFile = { ...current, roots: kept };
    await Bun.write(configFilePath, JSON.stringify(next, null, 2) + "\n");
  }
  return { roots: normalizeRoots(kept), removed };
}

/**
 * Build the execution Ctx handed to every command's run().
 * `loadLibrary` is lazily wired to avoid a circular import at module load.
 */
export async function loadContext(opts: {
  env?: NodeJS.ProcessEnv;
  configFilePath?: string;
} = {}): Promise<Ctx> {
  const config = await resolveConfig(opts);

  let roots = config.roots;

  const ctx: Ctx = {
    config,
    libraryPath: config.libraryPath,
    loadLibrary: async (): Promise<Skill[]> => {
      const { loadLibrary } = await import("./core/library.ts");
      return loadLibrary(config.libraryPath);
    },
    roots,
    addRoot: async (path: string): Promise<string[]> => {
      roots = await addRoot(config.configFilePath, roots, path);
      // keep the live ctx/config views in sync after a persist
      ctx.roots = roots;
      config.roots = roots;
      return roots;
    },
    removeRoot: async (path: string): Promise<{ roots: string[]; removed: boolean }> => {
      const res = await removeRoot(config.configFilePath, path);
      roots = res.roots;
      ctx.roots = roots;
      config.roots = roots;
      return res;
    },
    log: (...args: unknown[]) => {
      console.log(...args);
    },
    json: (value: unknown) => {
      console.log(JSON.stringify(value));
    },
    error: (...args: unknown[]) => {
      console.error(...args);
    },
  };

  return ctx;
}
