// `skl init` — first-run setup:
//   1. ensure ~/.skillshelf/ exists and write a config.json (library + globalCore)
//      unless one already exists (never clobbers without --force).
//   2. ensure the library dir exists.
//   3. symlink the thin global-core skills (bundle "global-core") into the
//      global-core target (~/.claude/skills) so they auto-trigger every session.
// Idempotent. Safe to re-run.

import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import type { Ctx } from "../types.ts";
import { DEFAULT_CONFIG_FILE } from "../config.ts";
import { resolveBundle } from "../core/bundle.ts";
import { activeSkills } from "../core/library.ts";
import {
  ensureDir,
  safeSymlink,
  isSymlink,
  realpathOrSelf,
  realpathOrSelfAsync,
} from "../lib/fs.ts";

export const meta = {
  name: "init",
  summary: "Set up ~/.skillshelf config + library and link the global-core skills",
  usage: "skl init [--force] [--json]",
} as const;

const GLOBAL_CORE_BUNDLE = "global-core";

interface CoreLink {
  name: string;
  target: string;
  link: string;
  status: "linked" | "already" | "conflict";
}

export async function run(argv: string[], ctx: Ctx): Promise<number> {
  try {
    const json = argv.includes("--json");
    const force = argv.includes("--force");

    const configFile = DEFAULT_CONFIG_FILE;
    const libraryPath = ctx.config.libraryPath;
    const globalCoreTarget = ctx.config.globalCoreTarget;

    // 1. config dir + file
    await ensureDir(dirname(configFile));
    let configWritten = false;
    if (!existsSync(configFile) || force) {
      const body = JSON.stringify({ library: libraryPath, globalCore: globalCoreTarget }, null, 2) + "\n";
      await Bun.write(configFile, body);
      configWritten = true;
    }

    // 2. library dir
    await ensureDir(libraryPath);

    // 3. link global-core skills
    let skills: Awaited<ReturnType<Ctx["loadLibrary"]>> = [];
    try {
      skills = await ctx.loadLibrary();
    } catch {
      skills = [];
    }
    const bundle = await resolveBundle(activeSkills(skills), GLOBAL_CORE_BUNDLE);

    const coreLinks: CoreLink[] = [];
    if (bundle.skills.length > 0) {
      await ensureDir(globalCoreTarget);
      for (const s of bundle.skills) {
        const link = join(globalCoreTarget, s.name);
        const target = s.path;
        let status: CoreLink["status"] = "linked";

        if (isSymlink(link)) {
          const cur = realpathOrSelf(link);
          const want = await realpathOrSelfAsync(target);
          if (cur === want) status = "already";
        } else if (existsSync(link)) {
          // Real file already there — leave it alone.
          coreLinks.push({ name: s.name, target, link, status: "conflict" });
          continue;
        }

        await safeSymlink(target, link);
        coreLinks.push({ name: s.name, target, link, status });
      }
    }

    const conflicts = coreLinks.filter((l) => l.status === "conflict");

    if (json) {
      ctx.json({
        configFile,
        configWritten,
        libraryPath,
        globalCoreTarget,
        globalCoreBundle: GLOBAL_CORE_BUNDLE,
        coreLinks,
      });
    } else {
      ctx.log("skillshelf initialized.");
      ctx.log(`  config:      ${configFile}${configWritten ? " (written)" : " (kept existing)"}`);
      ctx.log(`  library:     ${libraryPath}`);
      ctx.log(`  global-core: ${globalCoreTarget}`);
      if (bundle.skills.length === 0) {
        ctx.log(`  (no skills tagged '${GLOBAL_CORE_BUNDLE}' yet — nothing to link)`);
      } else {
        ctx.log(`  linked ${coreLinks.length} global-core skill(s):`);
        for (const l of coreLinks) {
          const tag =
            l.status === "linked" ? "linked" : l.status === "already" ? "ok" : "SKIP (real file present)";
          ctx.log(`    ${l.name}  [${tag}]`);
        }
      }
    }

    return conflicts.length > 0 ? 1 : 0;
  } catch (err) {
    ctx.error(`skl init failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
