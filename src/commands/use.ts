// `skl use <bundle...>` — symlink every skill in the named bundle(s)/skill(s) into
// ./.claude/skills/ so Claude Code can natively hot-load them. Idempotent: re-running
// re-points links without error. Reports what was linked (and is JSON-parseable on
// --json). Accepts MULTIPLE positionals so a bulk deploy runs in ONE process (one
// library crawl, one symlink pass); the single-name shape is byte-identical to before.

import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import type { Ctx, Skill } from "../types.ts";
import { resolveBundle } from "../core/bundle.ts";
import { activeSkills, findByName } from "../core/library.ts";
import { parseDeployTarget } from "../core/agents.ts";
import { safeSymlink, isSymlink, realpathOrSelf, realpathOrSelfAsync } from "../lib/fs.ts";

export const meta = {
  name: "use",
  summary: "Symlink bundle(s)/skill(s) into an agent's skills dir (default: ./.claude/skills/)",
  usage: "skl use <bundle|skill>... [--agent <id>] [--global | --project <name>] [--json]",
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
    const multi = positionals.length > 1;

    // Resolve EACH positional as a SINGLE SKILL first (exact name), then fall back to
    // a bundle (a domain tag query). This makes `skl use <skill>` a first-class
    // single-skill deploy instead of erroring 'empty-bundle' and forcing a hand
    // `ln -s` — the exact manual symlink skillshelf exists to eliminate. Multiple
    // positionals union their resolved skills (deduped by name) so a bulk deploy is
    // one crawl + one symlink pass.
    const union: Skill[] = [];
    const seen = new Set<string>();
    const unresolved: string[] = [];
    let lastKind: "skill" | "bundle" = "bundle";
    let lastName = bundleName;
    for (const name of positionals) {
      const single = findByName(active, name);
      // Use the RESOLVED name (single.name / bundle.name — both trimmed) for the
      // single-name `bundle` echo so its JSON stays byte-identical to the original.
      const resolved = single ? { name: single.name, skills: [single] } : await resolveBundle(active, name);
      const resolvedSkills = resolved.skills;
      lastKind = single ? "skill" : "bundle";
      lastName = resolved.name;
      if (resolvedSkills.length === 0) {
        unresolved.push(name);
        continue;
      }
      for (const s of resolvedSkills) {
        if (seen.has(s.name)) continue;
        seen.add(s.name);
        union.push(s);
      }
    }

    // Single-name BACKWARD COMPAT: when exactly one positional was given and it
    // resolved to nothing, emit the byte-identical 'empty-bundle' shape/behaviour.
    if (!multi && union.length === 0) {
      if (json) {
        ctx.json({ bundle: bundleName, kind: "bundle", linked: [], skillsDir: target.dir, error: "empty-bundle" });
      } else {
        ctx.error(`No active skill or bundle matches '${bundleName}'.`);
      }
      return 1;
    }

    // For one resolved positional keep the original kind/name; for many, label it as
    // a multi-name deploy (the JSON additionally carries every name in `linked`).
    const resolved: { name: string; kind: "skill" | "bundle"; skills: Skill[] } = multi
      ? { name: positionals.join(", "), kind: "bundle", skills: union }
      : { name: lastName, kind: lastKind, skills: union };

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
      const payload: Record<string, unknown> = { bundle: bundle.name, kind: resolved.kind, skillsDir, agent: target.agentId, scope: target.scope, linked: results };
      // Only the MULTI-name shape is extended; single-name JSON stays byte-identical.
      if (multi) payload.unresolved = unresolved;
      ctx.json(payload);
    } else {
      const label = resolved.kind === "skill" ? `Skill '${bundle.name}'` : `Bundle '${bundle.name}'`;
      ctx.log(`${label} -> ${skillsDir}`);
      for (const r of results) {
        const tag =
          r.status === "linked" ? "linked" : r.status === "already" ? "ok" : "SKIP (real file present)";
        ctx.log(`  ${r.name}  [${tag}]`);
      }
      for (const u of unresolved) {
        ctx.log(`  ${u}  [UNRESOLVED (no active skill or bundle)]`);
      }
      ctx.log("");
      if (target.scope !== "Global") {
        ctx.log(`Reminder: add '${target.agentId === "claude" ? ".claude" : "." + target.agentId}/skills/' to this project's .gitignore so these symlinks aren't committed.`);
      }
    }

    // Exit non-zero if any positional was unresolved OR any slot was a real-file
    // conflict — successful links are still applied (partial success is real on disk).
    return conflicts.length > 0 || unresolved.length > 0 ? 1 : 0;
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
