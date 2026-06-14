// `skl status` — which library skills are currently symlinked into the
// project you're in (./.claude/skills/). Groups the linked skills by the
// bundles (domain tags) they belong to, so you can see what `skl use` pinned.

import { join } from "node:path";
import type { Ctx, Skill } from "../types.ts";
import {
  pathExists,
  isSymlink,
  realpathOrSelf,
  listDirNames,
} from "../lib/fs.ts";

export const meta = {
  name: "status",
  summary: "Which library skills are linked into ./.claude/skills",
  usage: "skl status [--json]",
} as const;

interface LinkedEntry {
  link: string; // entry name under .claude/skills
  linkPath: string; // abs path of the symlink
  target: string; // realpath the symlink resolves to
  skill: Skill | null; // matching library skill, if the target is one of ours
}

export async function run(argv: string[], ctx: Ctx): Promise<number> {
  try {
    const json = argv.includes("--json");
    const cwd = process.cwd();
    const skillsDir = join(cwd, ".claude", "skills");

    const skills = await ctx.loadLibrary();
    // index library skills by their realpath for matching
    const byReal = new Map<string, Skill>();
    for (const s of skills) byReal.set(realpathOrSelf(s.path), s);

    // index library skills by NAME too, to flag a real project copy that shadows a
    // library skill (a drift-prone unmanaged copy — a symlink can't drift, a copy can).
    const byName = new Map<string, Skill>(skills.map((s) => [s.name, s]));

    const linked: LinkedEntry[] = [];
    const unmanaged: Array<{ name: string; inLibrary: boolean }> = [];
    if (pathExists(skillsDir)) {
      const names = await listDirNames(skillsDir);
      for (const name of names) {
        const linkPath = join(skillsDir, name);
        if (!isSymlink(linkPath)) {
          // a real (non-symlink) skill dir sitting in the project — unmanaged; if it
          // shadows a library skill it is a drift-prone copy, not a clean deployment.
          unmanaged.push({ name, inLibrary: byName.has(name) });
          continue;
        }
        const target = realpathOrSelf(linkPath);
        linked.push({
          link: name,
          linkPath,
          target,
          skill: byReal.get(target) ?? null,
        });
      }
    }
    linked.sort((a, b) => (a.link < b.link ? -1 : a.link > b.link ? 1 : 0));
    unmanaged.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    // group resolved skills by bundle (domain tag) for the human summary
    const bundles = new Map<string, string[]>();
    for (const e of linked) {
      if (!e.skill) continue;
      for (const d of e.skill.domains) {
        const arr = bundles.get(d);
        if (arr) arr.push(e.skill.name);
        else bundles.set(d, [e.skill.name]);
      }
    }

    if (json) {
      ctx.json({
        projectRoot: cwd,
        skillsDir,
        skillsDirExists: pathExists(skillsDir),
        linkedCount: linked.length,
        unmanaged,
        bundles: [...bundles.keys()].sort().map((name) => ({
          name,
          skills: bundles.get(name)!.slice().sort(),
        })),
        linked: linked.map((e) => ({
          link: e.link,
          target: e.target,
          skill: e.skill ? e.skill.name : null,
          inLibrary: e.skill != null,
          domains: e.skill ? e.skill.domains : [],
        })),
      });
      return 0;
    }

    if (linked.length === 0 && unmanaged.length === 0) {
      ctx.log(`No skills linked into ${skillsDir}`);
      return 0;
    }

    ctx.log(`Linked into ${skillsDir} (${linked.length}):`);
    for (const e of linked) {
      if (e.skill) {
        const dom = e.skill.domains.length
          ? ` [${e.skill.domains.join(", ")}]`
          : "";
        ctx.log(`  ${e.link}${dom} -> ${e.skill.name}`);
      } else {
        ctx.log(`  ${e.link} -> ${e.target} (not a library skill)`);
      }
    }

    if (bundles.size) {
      ctx.log("");
      ctx.log("Bundles present:");
      for (const name of [...bundles.keys()].sort()) {
        const members = bundles.get(name)!.slice().sort();
        ctx.log(`  ${name} (${members.length}): ${members.join(", ")}`);
      }
    }

    if (unmanaged.length) {
      ctx.log("");
      ctx.log(`⚠ Unmanaged real copies (${unmanaged.length}) — not symlinks, can drift:`);
      for (const u of unmanaged) {
        ctx.log(`  ${u.name}${u.inLibrary ? " (shadows a library skill — `skl where --fix` to dedupe)" : ""}`);
      }
    }
    return 0;
  } catch (err) {
    ctx.error(`status failed: ${(err as Error).message}`);
    return 1;
  }
}
