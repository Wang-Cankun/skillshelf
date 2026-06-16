// `skl drop <bundle>` — remove the symlinks that `skl use <bundle>` created in
// ./.claude/skills/. Only removes symlinks that actually point at this bundle's
// skills; never touches real files or links to unrelated skills. Idempotent.

import { join } from "node:path";
import type { Ctx, Skill } from "../types.ts";
import { resolveBundle } from "../core/bundle.ts";
import { findByName } from "../core/library.ts";
import { parseDeployTarget } from "../core/agents.ts";
import { isSymlink, realpathOrSelf, realpathOrSelfAsync, removeSymlink } from "../lib/fs.ts";

export const meta = {
  name: "drop",
  summary: "Remove bundle(s)/skill(s) symlinks from an agent's skills dir (default: ./.claude/skills/)",
  usage: "skl drop <bundle|skill>... [--agent <id>] [--global | --project <name>] [--json]",
} as const;

interface DropResult {
  name: string;
  link: string;
  status: "removed" | "absent" | "skipped";
}

export async function run(argv: string[], ctx: Ctx): Promise<number> {
  try {
    const json = argv.includes("--json");
    const parsed = parseDeployTarget(argv);
    if ("error" in parsed) {
      ctx.error(`skl drop: ${parsed.error}`);
      ctx.error("usage: " + meta.usage);
      return 1;
    }
    const { positionals, target } = parsed;
    const bundleName = positionals[0];

    if (!bundleName) {
      ctx.error("usage: " + meta.usage);
      return 1;
    }

    // Include retired so a bundle that was `use`d (which excludes retired) and a
    // later drop stay symmetric on the active set — we match on the same active set.
    const skills = await ctx.loadLibrary();
    const active = skills.filter((s) => !s.retired);
    const multi = positionals.length > 1;
    // Mirror `use`: resolve EACH positional as a single skill name first, else a
    // bundle, so `skl drop <name...>` undoes `skl use <name...>` symmetrically.
    const resolveOne = async (name: string): Promise<{ name: string; skills: Skill[] }> => {
      const single = findByName(active, name);
      return single ? { name: single.name, skills: [single] } : await resolveBundle(active, name);
    };

    let bundle: { name: string; skills: Skill[] };
    if (!multi) {
      // Single-name: byte-identical resolution to before.
      bundle = await resolveOne(bundleName as string);
    } else {
      // Many positionals union their skills (deduped by name) for one unlink pass.
      const union: Skill[] = [];
      const seen = new Set<string>();
      for (const name of positionals) {
        for (const s of (await resolveOne(name)).skills) {
          if (seen.has(s.name)) continue;
          seen.add(s.name);
          union.push(s);
        }
      }
      bundle = { name: positionals.join(", "), skills: union };
    }

    const skillsDir = target.dir;
    const results: DropResult[] = [];

    for (const s of bundle.skills) {
      const link = join(skillsDir, s.name);

      if (!isSymlink(link)) {
        results.push({ name: s.name, link, status: "absent" });
        continue;
      }

      // Only remove if the symlink resolves to THIS skill's path. A divergent
      // link (pointing elsewhere) is left alone.
      const cur = realpathOrSelf(link);
      const want = await realpathOrSelfAsync(s.path);
      if (cur !== want) {
        results.push({ name: s.name, link, status: "skipped" });
        continue;
      }

      const removed = await removeSymlink(link);
      results.push({ name: s.name, link, status: removed ? "removed" : "absent" });
    }

    const removedCount = results.filter((r) => r.status === "removed").length;

    if (json) {
      ctx.json({ bundle: bundle.name, skillsDir, agent: target.agentId, scope: target.scope, results, removed: removedCount });
    } else {
      if (bundle.skills.length === 0) {
        ctx.log(`Bundle '${bundleName}' has no skills; nothing to drop.`);
      } else {
        ctx.log(`Dropping bundle '${bundle.name}' from ${skillsDir}`);
        for (const r of results) {
          ctx.log(`  ${r.name}  [${r.status}]`);
        }
        ctx.log(`Removed ${removedCount} symlink(s).`);
      }
    }

    return 0;
  } catch (err) {
    ctx.error(`skl drop failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
