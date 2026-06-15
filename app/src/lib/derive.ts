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
import { SEV_MAP, type InboxSeverity } from "./tokens";
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

// ── Inbox triage (deterministic, from real signals — ADR-0008 §4) ──────────

export interface InboxRow {
  severity: InboxSeverity;
  type: string;
  skill: string;
  detail: string;
  counts: string;
  countColor: string;
  auto: boolean;
  cmd: string;
  /** valid `skl` arg vectors for the row's action buttons */
  actions: { label: string; primary: boolean; args?: string[] }[];
  openable: boolean;
  /** UNTAGGED rows only: a deterministic prefix-family majority domain to
   *  pre-offer as the safe one-click tag (null = no confident sibling signal). */
  suggestedDomain?: string | null;
}

/**
 * Deterministic tag suggestion for an untagged skill: the most common primary
 * domain among its string-prefix family siblings (ADR-0007 fact layer — a
 * reproducible majority over a string-prefix match, no model). Null when the
 * family gives no signal.
 */
export function suggestDomain(s: Skill, live: Skill[]): string | null {
  const prefix = s.name.split("-")[0];
  const counts = new Map<string, number>();
  for (const o of live) {
    if (o.name === s.name) continue;
    if (o.name.split("-")[0] !== prefix) continue;
    const d = o.primaryDomain ?? o.domains[0];
    if (d) counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [d, n] of counts) {
    if (n > bestN || (n === bestN && best !== null && d < best)) {
      best = d;
      bestN = n;
    }
  }
  return best;
}

const STUB_DEFAULTS = [
  "replace with description of the skill",
  "replace with a description",
];

/**
 * Deterministic triage from the real library + deployment feeds.
 * - UNTAGGED: no domains.
 * - STUB: description is the scaffold default.
 * - THIN TAGS: a prefix-family spans multiple domains (tag drift).
 * - FAMILY: a string-prefix family (informational; the largest bundles).
 * - TRACKED: vendored + clean (lockfile, no local edits).
 * DRIFT/DEAD/UNTRACKED/2ND-SOURCE come from the real `where.problems` feed.
 */
export function deriveInbox(
  skills: Skill[],
  where: DeploymentReport,
): InboxRow[] {
  const live = skills.filter((s) => !s.retired);
  const rows: InboxRow[] = [];

  // UNTAGGED
  for (const s of live) {
    if (s.domains.length === 0) {
      rows.push({
        severity: "untagged",
        type: SEV_MAP.untagged.label,
        skill: s.name,
        detail: "No domains in taxonomy.json — needs a tag",
        counts: "",
        countColor: "",
        auto: true,
        cmd: `skl tag ${s.name} <domain>`,
        actions: [{ label: "Tag ▾", primary: true }],
        openable: true,
        suggestedDomain: suggestDomain(s, live),
      });
    }
  }

  // STUB
  for (const s of live) {
    const d = s.description.trim().toLowerCase();
    if (STUB_DEFAULTS.some((def) => d.startsWith(def))) {
      rows.push({
        severity: "stub",
        type: SEV_MAP.stub.label,
        skill: s.name,
        detail: "Description still the scaffold default",
        counts: "",
        countColor: "",
        auto: false,
        cmd: `skl show ${s.name}`,
        actions: [{ label: "Retire", primary: false, args: ["retire", s.name] }],
        openable: true,
      });
    }
  }

  // families by prefix (first '-' segment)
  const families = new Map<string, Skill[]>();
  for (const s of live) {
    const prefix = s.name.split("-")[0];
    if (!families.has(prefix)) families.set(prefix, []);
    families.get(prefix)!.push(s);
  }

  // THIN TAGS: a family whose members span >1 distinct primary domain.
  for (const [prefix, members] of families) {
    if (members.length < 3) continue;
    const domains = new Set(
      members.map((m) => m.primaryDomain).filter(Boolean) as string[],
    );
    if (domains.size > 1) {
      rows.push({
        severity: "thintag",
        type: SEV_MAP.thintag.label,
        skill: `${prefix}-*`,
        detail: `Spans ${[...domains].join(" · ")} — tag drift worth a pass`,
        counts: String(members.length),
        countColor: SEV_MAP.thintag.color,
        auto: false,
        cmd: `skl ls`,
        actions: [{ label: "Review ▾", primary: false }],
        openable: false,
      });
    }
  }

  // FAMILY: the largest prefix family (a bundle candidate).
  let biggest: { prefix: string; n: number } | null = null;
  for (const [prefix, members] of families) {
    if (members.length >= 4 && (!biggest || members.length > biggest.n))
      biggest = { prefix, n: members.length };
  }
  if (biggest) {
    rows.push({
      severity: "family",
      type: SEV_MAP.family.label,
      skill: `${biggest.prefix}-*`,
      detail: `${biggest.n} skills under one prefix — candidate for a bundle`,
      counts: String(biggest.n),
      countColor: SEV_MAP.family.color,
      auto: false,
      cmd: `skl ls`,
      actions: [{ label: "Review ▾", primary: false }],
      openable: false,
    });
  }

  // TRACKED: vendored + clean.
  const vendored = live.filter((s) => lockEntry(s.name));
  if (vendored.length) {
    rows.push({
      severity: "tracked",
      type: SEV_MAP.tracked.label,
      skill: `${vendored[0].name} · +${vendored.length - 1}`,
      detail: "Vendored + clean (lockfile, no local edits)",
      counts: `${vendored.length} ✓`,
      countColor: SEV_MAP.tracked.color,
      auto: false,
      cmd: `skl status`,
      actions: [{ label: "View lock", primary: false }],
      openable: false,
    });
  }

  // DRIFT / DEAD / UNTRACKED / 2ND-SOURCE from real where.problems.
  for (const p of where.problems) {
    let severity: InboxSeverity | null = null;
    let detail = "";
    if (p.drift) {
      severity = "drift";
      detail = `Deployed copy diverged from library — ${p.surface}`;
    } else if (p.kind === "dead") {
      severity = "dead";
      detail = `Broken symlink — ${p.path}`;
    } else if (p.kind === "copy" && !p.inLibrary) {
      severity = "untracked";
      detail = `Copy not in library — ${p.surface}`;
    } else if (p.kind === "foreign-link") {
      severity = "second-source";
      detail = `Links outside the library — ${p.target ?? p.surface}`;
    } else if (p.kind === "aliased") {
      severity = "aliased";
      detail = `Link name ≠ the library skill it points at — ${p.surface}`;
    }
    if (!severity) continue;
    const m = SEV_MAP[severity];
    rows.push({
      severity,
      type: m.label,
      skill: p.name,
      detail,
      counts: "",
      countColor: "",
      auto: false,
      cmd: `skl where`,
      actions: [{ label: "Review ▾", primary: false }],
      openable: true,
    });
  }

  return rows;
}
