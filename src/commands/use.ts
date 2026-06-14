// `skl use <bundle>` — symlink every skill in a bundle into ./.claude/skills/
// so Claude Code can natively hot-load them. Idempotent: re-running re-points
// links without error. Reports what was linked (and is JSON-parseable on --json).

import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import type { Ctx, Skill } from "../types.ts";
import { resolveBundle } from "../core/bundle.ts";
import { activeSkills, findByName } from "../core/library.ts";
import { parseDeployTarget } from "../core/agents.ts";
import { safeSymlink, isSymlink, realpathOrSelf, realpathOrSelfAsync } from "../lib/fs.ts";

export const meta = {
  name: "use",
  summary: "Symlink a bundle (or skill) into an agent's skills dir (default: ./.claude/skills/)",
  usage: "skl use <bundle|skill> [--agent <id>] [--global | --project <name>] [--json]",
} as const;

interface LinkResult {
  name: string;
  target: string;
  link: string;
  status: "linked" | "already" | "conflict";
}

export async function run(argv: string[], ctx: Ctx): Promise<number> {
  try {
    const json = argv.includes("--json");
    const parsed = parseDeployTarget(argv);
    if ("error" in parsed) {
      ctx.error(`skl use: ${parsed.error}`);
      ctx.error("usage: " + meta.usage);
      return 1;
    }
    const { positionals, target } = parsed;
    const bundleName = positionals[0];

    if (!bundleName) {
      ctx.error("usage: " + meta.usage);
      return 1;
    }

    const skills = await ctx.loadLibrary();
    const active = activeSkills(skills);

    // Resolve the arg as a SINGLE SKILL first (exact name), then fall back to a
    // bundle (a domain tag query). This makes `skl use <skill>` a first-class
    // single-skill deploy instead of erroring 'empty-bundle' and forcing a hand
    // `ln -s` — the exact manual symlink skillshelf exists to eliminate.
    let resolved: { name: string; kind: "skill" | "bundle"; skills: Skill[] };
    const single = findByName(active, bundleName);
    if (single) {
      resolved = { name: single.name, kind: "skill", skills: [single] };
    } else {
      const bundle = await resolveBundle(active, bundleName);
      resolved = { name: bundle.name, kind: "bundle", skills: bundle.skills };
    }

    if (resolved.skills.length === 0) {
      if (json) {
        ctx.json({ bundle: bundleName, kind: "bundle", linked: [], skillsDir: target.dir, error: "empty-bundle" });
      } else {
        ctx.error(`No active skill or bundle matches '${bundleName}'.`);
      }
      return 1;
    }

    const bundle = { name: resolved.name, skills: resolved.skills };
    const skillsDir = target.dir;
    // The target agent's skills dir may not exist yet (e.g. a fresh ~/.codex/skills).
    await mkdir(skillsDir, { recursive: true });
    const results: LinkResult[] = [];

    for (const s of bundle.skills) {
      const link = join(skillsDir, s.name);
      const skillPath = s.path;
      let status: LinkResult["status"] = "linked";

      // Determine prior state for accurate reporting before we touch it.
      if (isSymlink(link)) {
        const cur = realpathOrSelf(link);
        const want = await realpathOrSelfAsync(skillPath);
        if (cur === want) status = "already";
      } else if (await pathTakenNonLink(link)) {
        // A real (non-symlink) file/dir occupies the slot — don't clobber it.
        results.push({ name: s.name, target: skillPath, link, status: "conflict" });
        continue;
      }

      await safeSymlink(skillPath, link);
      results.push({ name: s.name, target: skillPath, link, status });
    }

    const conflicts = results.filter((r) => r.status === "conflict");

    if (json) {
      ctx.json({ bundle: bundle.name, kind: resolved.kind, skillsDir, agent: target.agentId, scope: target.scope, linked: results });
    } else {
      const label = resolved.kind === "skill" ? `Skill '${bundle.name}'` : `Bundle '${bundle.name}'`;
      ctx.log(`${label} -> ${skillsDir}`);
      for (const r of results) {
        const tag =
          r.status === "linked" ? "linked" : r.status === "already" ? "ok" : "SKIP (real file present)";
        ctx.log(`  ${r.name}  [${tag}]`);
      }
      ctx.log("");
      if (target.scope !== "Global") {
        ctx.log(`Reminder: add '${target.agentId === "claude" ? ".claude" : "." + target.agentId}/skills/' to this project's .gitignore so these symlinks aren't committed.`);
      }
    }

    return conflicts.length > 0 ? 1 : 0;
  } catch (err) {
    ctx.error(`skl use failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

/** True if linkPath exists as a real (non-symlink) entry. */
async function pathTakenNonLink(linkPath: string): Promise<boolean> {
  const { existsSync } = await import("node:fs");
  return existsSync(linkPath) && !isSymlink(linkPath);
}
