// Pure derivations that turn the preserved real feeds (ls / where / lockfile /
// taxonomy) into the ADR-0008 §7 additive shapes, for the dev/browser fallback
// path. In Tauri these come straight from the real `skl --json`; here we
// reconstruct them from captured real data so nothing is fabricated.

import type {
  Skill,
  DeploymentReport,
  ShowReport,
  RefFile,
  Frontmatter,
  SkillSource,
  OutdatedReport,
  OutdatedRow,
  OutdatedStatus,
} from "./types";
import lockJson from "./data/shelf.lock.json";

// sample SKILL bodies (the two skills with on-disk files) — ?raw imports.
import sampleChatroomRaw from "./data/skills/sample-chatroom/SKILL.md?raw";
import sampleGuideRaw from "./data/skills/sample-guide/SKILL.md?raw";
import sampleGuideReadmeRaw from "./data/skills/sample-guide/README.md?raw";
import sampleGuideApiRaw from "./data/skills/sample-guide/references/api.md?raw";
import sampleGuideDesignRaw from "./data/skills/sample-guide/references/design-theory.md?raw";

interface LockEntry {
  name: string;
  source: string;
  ref: string;
  channel: string;
  installedAt: string;
  localEdits: boolean;
  installedHash: string;
}
const LOCK = lockJson as {
  version: number;
  entries: Record<string, LockEntry>;
};

const lockEntry = (name: string): LockEntry | undefined => LOCK.entries[name];

/**
 * Short, human upstream origin from a lockfile `source` string, e.g.
 * "jimliu/baoyu-skills" from "github:jimliu/baoyu-skills@skills/baoyu-translate".
 * Mirrors `originLabel` in the CLI's ls.ts so browser + Tauri agree.
 */
export function originLabel(source: string): string {
  const stripped = source.replace(/@.*$/, ""); // drop @subpath
  const colon = stripped.indexOf(":");
  const repo = colon >= 0 ? stripped.slice(colon + 1) : stripped; // drop channel:
  return repo || "vendored";
}

const shortHash = (h: string) =>
  h ? `${h.slice(0, 8)}…${h.slice(-4)}` : "";
const shortRef = (r: string, installedAt: string) =>
  `${(r || "").slice(0, 7)} · ${(installedAt || "").slice(0, 10)}`;

/** Count of clean (linked, no-drift) deployment sites for a skill. */
export function deployCount(where: DeploymentReport, name: string): number {
  return where.sites.filter(
    (s) => s.name === name && s.kind === "linked" && !s.drift,
  ).length;
}

/**
 * Augment `ls --json` rows with the ADR-0008 §7.1 fields (source / modifiedAt /
 * deployCount). `source` = vendored iff the skill has a lockfile entry; a
 * vendored skill's modifiedAt falls back to its lock installedAt (best signal
 * available without a real `stat`); local rows leave modifiedAt null → "—".
 */
export function augmentLibrary(
  skills: Skill[],
  where: DeploymentReport,
): Skill[] {
  return skills.map((s) => {
    const le = lockEntry(s.name);
    const source: SkillSource = le ? "vendored" : "local";
    return {
      ...s,
      source: s.source ?? source,
      origin: s.origin ?? (le ? originLabel(le.source) : null),
      channel: s.channel ?? (le ? le.channel : null),
      modifiedAt: s.modifiedAt ?? (le ? le.installedAt : null),
      deployCount: s.deployCount ?? deployCount(where, s.name),
    };
  });
}

// ── outdated --json (browser/dev fallback) ─────────────────────────────────
// We CANNOT hit GitHub from the browser, so every upstream-tracked row is
// honestly reported "current" — except two clearly-labelled DEMO/FIXTURE rows
// below, which exist only so the badge UI is exercisable in dev. These are NOT
// real network truth; the Tauri path runs the real `skl outdated --json`.
const DEMO_STALE = new Set(["dbs-hook"]); // demo: pretend upstream moved ahead
const DEMO_DIVERGED = new Set(["dbs-action"]); // demo: pretend local edits diverged
export function deriveOutdated(skills: Skill[]): OutdatedReport {
  const rows: OutdatedRow[] = [];
  for (const s of skills) {
    const le = lockEntry(s.name);
    if (!le) continue; // local/linked → no upstream-tracked row
    let status: OutdatedStatus = "current";
    if (DEMO_STALE.has(s.name)) status = "stale";
    else if (DEMO_DIVERGED.has(s.name)) status = "diverged";
    rows.push({
      name: s.name,
      channel: le.channel,
      source: le.source,
      installedRef: le.ref,
      latestRef: le.ref,
      status,
      note: "(demo fixture)",
    });
  }
  rows.sort((a, b) => (a.name < b.name ? -1 : 1));
  const stale = rows.filter((r) => r.status === "stale").length;
  const diverged = rows.filter((r) => r.status === "diverged").length;
  return { ok: true, checked: rows.length, stale, diverged, rows };
}

// ── show --json (browser fallback) ─────────────────────────────────────────

interface ShowSample {
  files: RefFile[];
  raw: Record<string, string>;
}

const SHOW_SAMPLES: Record<string, ShowSample> = {
  "sample-chatroom": {
    files: [{ path: "SKILL.md", kind: "md", depth: 0 }],
    raw: { "SKILL.md": sampleChatroomRaw },
  },
  "sample-guide": {
    files: [
      { path: "SKILL.md", kind: "md", depth: 0 },
      { path: "README.md", kind: "md", depth: 0 },
      { path: "references/", kind: "dir", depth: 0 },
      { path: "references/api.md", kind: "md", depth: 1 },
      { path: "references/design-theory.md", kind: "md", depth: 1 },
    ],
    raw: {
      "SKILL.md": sampleGuideRaw,
      "README.md": sampleGuideReadmeRaw,
      "references/api.md": sampleGuideApiRaw,
      "references/design-theory.md": sampleGuideDesignRaw,
    },
  },
};

/** Strip a leading YAML frontmatter block from a markdown body. */
export function stripFrontmatter(text: string): string {
  if (text.slice(0, 3) === "---") {
    const end = text.indexOf("\n---", 3);
    if (end >= 0) {
      const nl = text.indexOf("\n", end + 1);
      return nl >= 0 ? text.slice(nl + 1) : "";
    }
  }
  return text;
}

/** Minimal frontmatter parser: name / description / triggers / license. */
export function parseFrontmatter(text: string, fallback: Frontmatter): Frontmatter {
  if (text.slice(0, 3) !== "---") return fallback;
  const end = text.indexOf("\n---", 3);
  if (end < 0) return fallback;
  const block = text.slice(3, end);
  const lines = block.split("\n");
  const fm: Frontmatter = { ...fallback };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const m = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (!m) {
      i++;
      continue;
    }
    const key = m[1];
    let val = m[2];
    // block scalar (| or >): gather indented following lines.
    if (val === "|" || val === ">" || val === "|-" || val === ">-") {
      const buf: string[] = [];
      i++;
      while (i < lines.length && /^\s+/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s{1,2}/, ""));
        i++;
      }
      val = buf.join(" ").trim();
    } else {
      i++;
    }
    if (key === "name") fm.name = val || fm.name;
    else if (key === "description") fm.description = val || fm.description;
    else if (key === "license") fm.license = val || fm.license;
    else if (key === "triggers") {
      const arr = val
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map((x) => x.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
      if (arr.length) fm.triggers = arr;
    }
  }
  // triggers often live as slash-commands inside the description text.
  if (!fm.triggers.length) {
    const slash = (fm.description.match(/\/[\w一-龥-]+/g) || []).slice(
      0,
      4,
    );
    if (slash.length) fm.triggers = [...new Set(slash)];
  }
  return fm;
}

/**
 * Browser fallback for `skl show <name> [--file <path>] --json`. Uses the real
 * embedded sample bodies where present, else synthesizes an honest placeholder
 * body from the library row (labelled as loading-on-demand, never faked).
 */
export function deriveShow(
  name: string,
  file: string | undefined,
  skills: Skill[],
): ShowReport {
  const skill = skills.find((s) => s.name === name);
  const target = file ?? "SKILL.md";
  const sample = SHOW_SAMPLES[name];
  const refFiles: RefFile[] = sample?.files ?? [
    { path: "SKILL.md", kind: "md", depth: 0 },
  ];

  let body: string;
  if (sample && sample.raw[target] !== undefined) {
    body = sample.raw[target];
  } else if (target === "SKILL.md") {
    body =
      `# ${name}\n\n${skill?.description ?? name}\n\n` +
      `_Full body loads on demand via_ \`skl show ${name}\`.`;
  } else {
    body =
      `# ${target}\n\n_Loaded on demand_ — ` +
      `\`skl show ${name} --file ${target}\``;
  }

  const fallbackFm: Frontmatter = {
    name,
    description: skill?.description ?? name,
    triggers: [],
    license: "—",
  };
  const frontmatter =
    target === "SKILL.md" && sample
      ? parseFrontmatter(body, fallbackFm)
      : fallbackFm;

  const le = lockEntry(name);
  const prov = le
    ? {
        source: le.source.replace(/@.*$/, ""),
        ref: shortRef(le.ref, le.installedAt),
        hash: shortHash(le.installedHash),
        localEdits: le.localEdits,
      }
    : null;

  return { name, body, frontmatter, refFiles, prov };
}

// ── Normalize the LIVE `skl show --json` payload (Tauri) ───────────────────
// The real CLI emits { name, description, path, body, refFiles, source, … }
// where refFiles are ABSOLUTE path strings and there is no `frontmatter`
// object. Reshape it into the ShowReport the drawer binds to: parse the
// frontmatter out of the body, and turn each absolute path into a
// {path, kind, depth} relative entry. Nothing is fabricated — every field is
// taken from the CLI payload or parsed from the real body.

function kindForPath(p: string): RefFile["kind"] {
  if (p.endsWith("/")) return "dir";
  const base = p.split("/").pop() ?? p;
  if (!base.includes(".")) return "dir"; // extensionless → directory (assets/evals)
  if (base.endsWith(".md")) return "md";
  if (base.endsWith(".json")) return "json";
  return "other";
}

function normalizeRefFiles(rf: unknown, skillPath: string): RefFile[] {
  if (!Array.isArray(rf)) return [];
  const out: RefFile[] = [];
  for (const item of rf) {
    if (item && typeof item === "object" && "path" in item) {
      const o = item as Record<string, unknown>;
      const kind = String(o.kind);
      out.push({
        path: String(o.path),
        kind: (["md", "json", "dir", "other"].includes(kind)
          ? kind
          : "other") as RefFile["kind"],
        depth: typeof o.depth === "number" ? o.depth : 0,
      });
      continue;
    }
    if (typeof item === "string") {
      let rel = item;
      if (skillPath && item.startsWith(skillPath))
        rel = item.slice(skillPath.length).replace(/^\/+/, "");
      else rel = item.split("/").pop() ?? item;
      if (!rel) continue;
      const depth = rel.includes("/") ? rel.split("/").length - 1 : 0;
      out.push({ path: rel, kind: kindForPath(rel), depth });
    }
  }
  return out;
}

export function normalizeShow(raw: unknown, name: string): ShowReport {
  const r = (raw ?? {}) as Record<string, unknown>;
  const body = typeof r.body === "string" ? r.body : "";
  const description =
    typeof r.description === "string" ? r.description : name;
  const skillPath = typeof r.path === "string" ? r.path : "";

  const fallbackFm: Frontmatter = {
    name,
    description,
    triggers: [],
    license: "—",
  };
  let frontmatter: Frontmatter;
  const rawFm = r.frontmatter;
  if (rawFm && typeof rawFm === "object") {
    const f = rawFm as Record<string, unknown>;
    frontmatter = {
      name: typeof f.name === "string" ? f.name : name,
      description:
        typeof f.description === "string" ? f.description : description,
      triggers: Array.isArray(f.triggers)
        ? (f.triggers.filter((x) => typeof x === "string") as string[])
        : [],
      license: typeof f.license === "string" ? f.license : "—",
    };
  } else {
    frontmatter = parseFrontmatter(body, fallbackFm);
  }

  // `skl show --json` lists reference files but omits SKILL.md itself (it IS the
  // body). The navigator needs it as the explicit entry point, pinned first.
  const refFiles = normalizeRefFiles(r.refFiles, skillPath);
  const withSkillMd = refFiles.some((f) => f.path === "SKILL.md")
    ? refFiles
    : [{ path: "SKILL.md", kind: "md" as const, depth: 0 }, ...refFiles];
  const prov =
    r.prov && typeof r.prov === "object"
      ? (r.prov as ShowReport["prov"])
      : null;

  return {
    name,
    body,
    frontmatter,
    refFiles: withSkillMd,
    prov,
  };
}

export const STUB_DEFAULTS = [
  "replace with description of the skill",
  "replace with a description",
];

/** Is this skill's description still the scaffold default? */
export function isStub(s: Skill): boolean {
  const d = s.description.trim().toLowerCase();
  return STUB_DEFAULTS.some((def) => d.startsWith(def));
}

/**
 * Count of LIVE (non-retired) stub skills — the SAME predicate AND population as the
 * stub subset of needsAttentionNames (which also filters to !retired, line ~392). The
 * footer "N stub" count must use this so it can never disagree with the inbox triage
 * (a retired stub would otherwise inflate the footer but not the "Needs attention" set).
 */
export function stubCount(skills: Skill[]): number {
  return skills.filter((s) => !s.retired && isStub(s)).length;
}

/**
 * THE single source of truth for "Needs attention" (ADR-0010 §6, the folded
 * Inbox): the set of REAL library skill names that need a per-skill action —
 * untagged, deployment anomalies (drift / dead / copy / aliased), or a stub
 * description. Used by BOTH the sidebar count and the list `{kind:"needs"}`
 * filter so the badge always equals the rows shown (Bug 3).
 *
 * Note: informational aggregate rows (family / thin-tag / tracked) are NOT
 * included — they describe prefix-families/aggregates, not a single skill row,
 * so they have no row to render under the filter and were the source of the
 * count/list mismatch. The actionable per-skill triage is exactly this set.
 */
export function needsAttentionNames(
  skills: Skill[],
  where: DeploymentReport,
): Set<string> {
  const live = skills.filter((s) => !s.retired);
  const liveNames = new Set(live.map((s) => s.name));
  const names = new Set<string>();

  for (const s of live) {
    if (s.domains.length === 0 || isStub(s)) names.add(s.name);
  }

  // Deployment anomalies from the real `where` feed: drift / dead / copy /
  // aliased sites whose skill is in the live library (so it has a row to show).
  for (const p of where.problems) {
    if (!liveNames.has(p.name)) continue;
    if (
      p.drift ||
      p.kind === "dead" ||
      p.kind === "copy" ||
      p.kind === "foreign-link" ||
      p.kind === "aliased"
    ) {
      names.add(p.name);
    }
  }

  return names;
}
