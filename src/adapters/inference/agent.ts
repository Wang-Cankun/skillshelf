// Agent-driven inference adapter (LLM-FREE core).
//
// `skl infer` is dual-mode but its deterministic core never calls an LLM:
//   - emit : assemble an InferenceCorpus + JSON schema + instruction and print it
//            to stdout so the HOST agent (Claude Code) can reason over it and
//            produce a proposal file.
//   - apply: read the agent's proposal JSON and write proposed domains/tags into
//            each skill's `<name>.shelf.json` overlay (never upstream SKILL.md).
//
// The api.ts adapter reuses buildCorpus() + applyProposal() to close the loop
// automatically against any OpenAI-compatible LLM endpoint.

import type { InferenceCorpus, Overlay, Skill } from "../../types.ts";
import { listDomains } from "../../core/library.ts";
import { readOverlay, writeOverlay } from "../../core/overlay.ts";
import { parseFrontmatter } from "../../lib/frontmatter.ts";

/** Max characters of SKILL.md body included per skill in the corpus preview. */
const BODY_PREVIEW_CHARS = 1200;

/**
 * The proposal shape the host agent (or the gateway) must return: a map of
 * skill name -> proposed domains, plus optional primary + notes. Authors apply
 * `domains` into each overlay (unioned with existing, never destructive).
 */
export interface InferenceProposalEntry {
  name: string;
  domains: string[];
  primaryDomain?: string | null;
  notes?: string;
}

export interface InferenceProposal {
  /** vocabulary the model settled on (may surface new domains) */
  domains?: string[];
  /** per-skill assignments */
  assignments: InferenceProposalEntry[];
}

/** JSON Schema describing the InferenceProposal the agent must produce. */
export const PROPOSAL_SCHEMA = {
  type: "object",
  required: ["assignments"],
  properties: {
    domains: {
      type: "array",
      items: { type: "string" },
      description: "The domain vocabulary you settled on. Surface new domains freely.",
    },
    assignments: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "domains"],
        properties: {
          name: { type: "string", description: "Exact skill name from the corpus." },
          domains: {
            type: "array",
            items: { type: "string" },
            description: "Domain tags for this skill, primary first. Lowercase, hyphenated.",
          },
          primaryDomain: {
            type: ["string", "null"],
            description: "The single primary domain (usually domains[0]).",
          },
          notes: { type: "string", description: "Optional one-line rationale." },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
} as const;

/** Instruction text handed to the host agent alongside the corpus + schema. */
export const INFER_INSTRUCTION = [
  "You are the taxonomy inference pass for a personal skill library.",
  "Read the `corpus` below: each entry is a skill with its name, description,",
  "current domain tags, and a body preview. Cluster the skills into a small,",
  "coherent set of domains. You MAY invent domains the author did not think of",
  "(e.g. `coding`) when the evidence supports it. Assign each skill a primary",
  "domain plus any honest secondary tags (a dual-use skill belongs to multiple).",
  "Keep domain tokens lowercase and hyphenated.",
  "Return ONE JSON object that validates against `schema` (no prose, no markdown",
  "fences). Then run `skl infer --apply <file.json>` to write it into the overlays.",
].join(" ");

/** Build the deterministic InferenceCorpus snapshot from loaded skills. */
export async function buildCorpus(
  skills: Skill[],
  opts: { generatedAt?: string; includeRetired?: boolean } = {},
): Promise<InferenceCorpus> {
  const pool = opts.includeRetired ? skills : skills.filter((s) => !s.retired);
  // Prefer canonical copies: skip .agents bridge mirrors so each name appears once.
  const seen = new Set<string>();
  const corpusSkills: InferenceCorpus["skills"] = [];
  for (const s of pool) {
    if (s.mirrorOf) continue;
    if (seen.has(s.name)) continue;
    seen.add(s.name);
    corpusSkills.push({
      name: s.name,
      description: s.description,
      currentDomains: s.domains,
      bodyPreview: await readBodyPreview(s),
    });
  }
  corpusSkills.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return {
    skills: corpusSkills,
    observedDomains: listDomains(pool),
    generatedAt: opts.generatedAt ?? new Date().toISOString(),
  };
}

/** Read + trim the SKILL.md body (frontmatter stripped) for a corpus preview. */
async function readBodyPreview(skill: Skill): Promise<string> {
  let raw = "";
  try {
    raw = await Bun.file(skill.bodyPath).text();
  } catch {
    return "";
  }
  const { body } = parseFrontmatter(raw);
  const flat = body.replace(/\s+/g, " ").trim();
  if (flat.length <= BODY_PREVIEW_CHARS) return flat;
  return flat.slice(0, BODY_PREVIEW_CHARS - 1).trimEnd() + "…";
}

/** The full emit payload: instruction + schema + corpus. */
export interface InferEmitPayload {
  instruction: string;
  schema: typeof PROPOSAL_SCHEMA;
  corpus: InferenceCorpus;
}

/** Assemble the emit payload a host agent reasons over. */
export async function buildEmitPayload(
  skills: Skill[],
  opts: { generatedAt?: string; includeRetired?: boolean } = {},
): Promise<InferEmitPayload> {
  return {
    instruction: INFER_INSTRUCTION,
    schema: PROPOSAL_SCHEMA,
    corpus: await buildCorpus(skills, opts),
  };
}

/** Coerce arbitrary parsed JSON into a normalized InferenceProposal. */
export function normalizeProposal(raw: unknown): InferenceProposal {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  // Accept either {assignments:[...]} or a bare {name:domains} map.
  let assignmentsRaw: unknown = obj.assignments;
  if (!Array.isArray(assignmentsRaw)) {
    // try a plain map form: { "skill-a": ["x","y"], ... }
    const map = obj as Record<string, unknown>;
    const fromMap: InferenceProposalEntry[] = [];
    for (const [k, v] of Object.entries(map)) {
      if (k === "domains" || k === "assignments") continue;
      if (Array.isArray(v)) {
        fromMap.push({ name: k, domains: v.map((x) => String(x).trim()).filter(Boolean) });
      }
    }
    assignmentsRaw = fromMap;
  }
  const assignments: InferenceProposalEntry[] = [];
  for (const a of assignmentsRaw as unknown[]) {
    if (!a || typeof a !== "object") continue;
    const e = a as Record<string, unknown>;
    const name = typeof e.name === "string" ? e.name.trim() : "";
    if (name === "") continue;
    const domains = Array.isArray(e.domains)
      ? e.domains.map((x) => String(x).trim()).filter(Boolean)
      : [];
    const entry: InferenceProposalEntry = { name, domains };
    if (typeof e.primaryDomain === "string") entry.primaryDomain = e.primaryDomain.trim();
    else if (e.primaryDomain === null) entry.primaryDomain = null;
    if (typeof e.notes === "string" && e.notes.trim() !== "") entry.notes = e.notes.trim();
    assignments.push(entry);
  }
  const domains = Array.isArray(obj.domains)
    ? obj.domains.map((x) => String(x).trim()).filter(Boolean)
    : undefined;
  return domains ? { domains, assignments } : { assignments };
}

export interface ApplyResult {
  /** skill name -> domains written into its overlay */
  applied: Array<{ name: string; domains: string[]; added: string[] }>;
  /** assignment names with no matching skill in the library */
  unmatched: string[];
  /** assignment names skipped because they proposed no domains */
  skipped: string[];
}

/**
 * Apply a proposal into each skill's overlay. Domains are UNIONED with the
 * skill's existing effective domains (never destructive), written to
 * `<name>.shelf.json` only — upstream SKILL.md is never touched.
 */
export async function applyProposal(
  skills: Skill[],
  proposal: InferenceProposal,
): Promise<ApplyResult> {
  const byName = new Map<string, Skill>();
  for (const s of skills) {
    // prefer canonical (non-mirror) copy when a name appears twice
    const existing = byName.get(s.name);
    if (!existing || (existing.mirrorOf && !s.mirrorOf)) byName.set(s.name, s);
  }

  const applied: ApplyResult["applied"] = [];
  const unmatched: string[] = [];
  const skipped: string[] = [];

  for (const a of proposal.assignments) {
    const skill = byName.get(a.name);
    if (!skill) {
      unmatched.push(a.name);
      continue;
    }
    // Order: primaryDomain first (if given), then proposed domains, de-duped.
    const ordered: string[] = [];
    const push = (d: string | null | undefined) => {
      const s = (d ?? "").trim();
      if (s !== "" && !ordered.includes(s)) ordered.push(s);
    };
    push(a.primaryDomain);
    for (const d of a.domains) push(d);
    if (ordered.length === 0) {
      skipped.push(a.name);
      continue;
    }

    const prev = await readOverlay(skill);
    const existingDomains = Array.isArray(prev?.domains) ? prev!.domains : [];
    const merged: string[] = [...existingDomains];
    const added: string[] = [];
    for (const d of ordered) {
      if (!merged.includes(d)) {
        merged.push(d);
        added.push(d);
      }
    }

    const next: Overlay = { ...(prev ?? {}), domains: merged };
    if (a.notes) next.notes = a.notes;
    await writeOverlay(skill, next);
    applied.push({ name: a.name, domains: merged, added });
  }

  return { applied, unmatched, skipped };
}
