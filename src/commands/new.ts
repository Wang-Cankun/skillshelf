// `skl new` — scaffold a new skill directory + SKILL.md into the library.
//
//   skl new <name> [--domain <d>] [--desc "..."] [--force] [--json]
//
// Writes <library>/<name>/SKILL.md with frontmatter (name, description, domains).
// Layout is FLAT (ADR-0001): `--domain` becomes a frontmatter tag, never a folder.
// Refuses to clobber an existing SKILL.md unless --force.

import { join } from "node:path";
import { existsSync } from "node:fs";
import type { Ctx } from "../types.ts";
import { serializeFrontmatter } from "../lib/frontmatter.ts";
import { ensureDir } from "../lib/fs.ts";
import { entryStatus } from "../core/library.ts";

export const meta = {
  name: "new",
  summary: "Scaffold a new skill dir + SKILL.md into the library",
  usage: 'skl new <name> [--domain <d>] [--desc "..."] [--force] [--json]',
} as const;

interface Args {
  name: string | null;
  domain: string | null;
  desc: string | null;
  force: boolean;
  json: boolean;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

function parseArgs(argv: string[]): { args: Args } | { error: string } {
  const args: Args = { name: null, domain: null, desc: null, force: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--domain") {
      const v = argv[++i];
      if (!v) return { error: "--domain requires a value" };
      args.domain = v;
    } else if (a.startsWith("--domain=")) {
      args.domain = a.slice("--domain=".length);
    } else if (a === "--desc" || a === "--description") {
      const v = argv[++i];
      if (v === undefined) return { error: "--desc requires a value" };
      args.desc = v;
    } else if (a.startsWith("--desc=")) {
      args.desc = a.slice("--desc=".length);
    } else if (a.startsWith("--description=")) {
      args.desc = a.slice("--description=".length);
    } else if (a === "--force") {
      args.force = true;
    } else if (a === "--json") {
      args.json = true;
    } else if (a.startsWith("--")) {
      return { error: `unknown argument: ${a}` };
    } else if (args.name === null) {
      args.name = a;
    } else {
      return { error: `unexpected argument: ${a}` };
    }
  }
  return { args };
}

function defaultBody(name: string, desc: string): string {
  const title = name
    .split("-")
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
  return [
    `# ${title}`,
    "",
    desc ? desc : "One-line statement of what this skill does and when to use it.",
    "",
    "## When to use",
    "",
    "- Describe the trigger conditions.",
    "",
    "## Steps",
    "",
    "1. First step.",
    "2. Second step.",
    "",
  ].join("\n");
}

export async function run(argv: string[], ctx: Ctx): Promise<number> {
  const parsed = parseArgs(argv);
  if ("error" in parsed) {
    ctx.error(`skl new: ${parsed.error}`);
    ctx.error(`usage: ${meta.usage}`);
    return 1;
  }
  const args = parsed.args;

  if (!args.name || args.name.trim() === "") {
    ctx.error("skl new: a <name> is required");
    ctx.error(`usage: ${meta.usage}`);
    return 1;
  }
  const name = args.name.trim();
  if (!SLUG_RE.test(name)) {
    ctx.error(
      `skl new: invalid skill name "${name}" — use lowercase letters, digits, and hyphens (e.g. my-skill)`,
    );
    return 1;
  }
  const domain = args.domain?.trim() || null;
  if (domain && !SLUG_RE.test(domain)) {
    ctx.error(
      `skl new: invalid domain "${domain}" — use lowercase letters, digits, and hyphens`,
    );
    return 1;
  }
  const desc = (args.desc ?? "").trim();

  try {
    const libraryPath = ctx.config.libraryPath;
    // Flat, non-semantic layout (ADR-0001): always <library>/<name>/.
    const skillDir = join(libraryPath, name);
    const bodyPath = join(skillDir, "SKILL.md");

    // Retired-aware guard: refuse if the name exists ONLY as a retired tombstone
    // (<library>/_retired/<name>). Scaffolding a fresh active copy beside it would
    // strand a duplicate and break `skl unretire`; this fires regardless of --force.
    const status = entryStatus(libraryPath, name);
    if (status.retired && !status.active) {
      ctx.error(
        `skl new: a retired '${name}' exists — run \`skl unretire ${name}\` first (or choose another name)`,
      );
      return 1;
    }

    if (existsSync(bodyPath) && !args.force) {
      ctx.error(
        `skl new: SKILL.md already exists at ${bodyPath} — pass --force to overwrite`,
      );
      return 1;
    }

    await ensureDir(skillDir);

    const frontmatterData: Record<string, unknown> = {
      name,
      description: desc || `TODO: describe ${name}.`,
    };
    if (domain) {
      // Domain is a tag, not a folder; primaryDomain is derived as domains[0].
      frontmatterData.domains = [domain];
    }

    const content = serializeFrontmatter(frontmatterData, defaultBody(name, desc));
    await Bun.write(bodyPath, content);

    if (args.json) {
      ctx.json({
        ok: true,
        name,
        domain,
        path: skillDir,
        bodyPath,
        created: true,
      });
    } else {
      ctx.log(`Created skill "${name}"`);
      ctx.log(`  dir:  ${skillDir}`);
      ctx.log(`  file: ${bodyPath}`);
      ctx.log("Edit SKILL.md, then run `skl infer` to tag it and `skl index` to list it.");
    }
    return 0;
  } catch (e) {
    ctx.error(`skl new: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}
