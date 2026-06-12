// Configuration resolution + Ctx construction.
// Library path resolution order:
//   1. env SKILLSHELF_LIBRARY
//   2. ~/.skillshelf/config.json  { "library": "...", "globalCore": "..." }
//   3. default ~/.skillshelf/library
// Global-core symlink target defaults to ~/.claude/skills.

import { homedir } from "node:os";
import { join, resolve, isAbsolute } from "node:path";
import { existsSync } from "node:fs";
import type { Config, ConfigFile, Ctx, Skill } from "./types.ts";

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
  const configFilePath = opts.configFilePath ?? DEFAULT_CONFIG_FILE;

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

/** Expand ~, absolutize, and de-duplicate a list of root paths (order-preserving). */
function normalizeRoots(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of input) {
    if (typeof r !== "string" || r.trim() === "") continue;
    const a = abs(r.trim());
    if (seen.has(a)) continue;
    seen.add(a);
    out.push(a);
  }
  return out;
}

/**
 * Persist a new scan root into the config file (`configFilePath`), expanding ~,
 * absolutizing, and de-duplicating against existing roots. Preserves the rest of
 * the config file (library / globalCore). Returns the full updated roots list.
 */
export async function addRoot(
  configFilePath: string,
  existingRoots: string[],
  path: string,
): Promise<string[]> {
  const a = abs(path.trim());
  const roots = [...existingRoots];
  if (!roots.includes(a)) roots.push(a);

  const current = (await readConfigFile(configFilePath)) ?? {};
  const next: ConfigFile = { ...current, roots };
  await Bun.write(configFilePath, JSON.stringify(next, null, 2) + "\n");
  return roots;
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
