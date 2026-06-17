// Zod schemas — runtime-validate every `--json` payload at the boundary
// (ADR-0008 §0). Loaders parse skl stdout through these so a malformed/extended
// payload fails loudly at the edge instead of corrupting the UI mid-render.
//
// These are intentionally permissive on additive fields (`.passthrough()` /
// optional) so a NEWER skl that emits extra keys never breaks an OLDER UI —
// only structural breakage (missing/renamed required fields, wrong types) throws.

import { z } from "zod";

export const SkillSchema = z
  .object({
    name: z.string(),
    description: z.string(),
    primaryDomain: z.string().nullable(),
    domains: z.array(z.string()),
    path: z.string(),
    retired: z.boolean(),
    mode: z.enum(["owned", "linked"]),
    linkTarget: z.string().nullable(),
    source: z.enum(["vendored", "local"]).optional(),
    origin: z.string().nullable().optional(),
    channel: z.string().nullable().optional(),
    modifiedAt: z.string().nullable().optional(),
    createdAt: z.string().nullable().optional(),
    deployCount: z.number().optional(),
  })
  .passthrough();

export const LibrarySchema = z.array(SkillSchema);

export const DeploymentSiteSchema = z
  .object({
    name: z.string(),
    surface: z.string(),
    path: z.string(),
    kind: z.enum(["linked", "foreign-link", "source", "copy", "dead", "aliased"]),
    target: z.string().nullable(),
    inLibrary: z.boolean(),
    drift: z.boolean(),
  })
  .passthrough();

export const DeploymentReportSchema = z
  .object({
    surfaces: z.array(z.string()),
    sites: z.array(DeploymentSiteSchema),
    problems: z.array(DeploymentSiteSchema),
  })
  .passthrough();

export const ScanReportSchema = z
  .object({
    roots: z.array(z.string()),
    totals: z
      .object({
        roots: z.number(),
        candidates: z.number(),
        new: z.number(),
        duplicateGroups: z.number(),
        driftGroups: z.number(),
        exactDuplicateGroups: z.number(),
      })
      .passthrough(),
    perRoot: z.array(z.unknown()),
    duplicateGroups: z.array(z.unknown()),
  })
  .passthrough();

export const StatusReportSchema = z
  .object({
    projectRoot: z.string(),
    skillsDir: z.string(),
    skillsDirExists: z.boolean(),
    linkedCount: z.number(),
    unmanaged: z.array(z.unknown()),
    bundles: z.array(z.unknown()),
    linked: z.array(z.unknown()),
  })
  .passthrough();

// `outdated --json` (ADR-0009). `diverged` is only emitted on the non-empty
// branch, so it's optional; status must accept the full five-value enum even
// though a given run may only exhibit a subset.
export const OutdatedRowSchema = z
  .object({
    name: z.string(),
    channel: z.string().nullable().optional(),
    source: z.string().optional(),
    installedRef: z.string(),
    latestRef: z.string().nullable(),
    status: z.enum(["stale", "current", "unknown", "linked", "diverged"]),
    note: z.string(),
  })
  .passthrough();

export const OutdatedSchema = z
  .object({
    ok: z.boolean(),
    checked: z.number(),
    stale: z.number(),
    diverged: z.number().optional(),
    rows: z.array(OutdatedRowSchema),
  })
  .passthrough();

// `update [name] --json` (ADR-0013, FROZEN CONTRACT). One Result per tracked
// skill (existing rows + orphaned), plus `newAvailable` (per source repo,
// published-but-untracked skills). errors/orphaned/newAvailable are optional so
// an OLDER engine that omits them still validates (mirrors OutdatedSchema). The
// outcome enum is WIDENED with "orphaned" (subpath gone, library copy kept);
// `relocatedFrom` is an orthogonal flag on a normal body outcome (rename was
// auto-followed) — never an outcome value.
export const UpdateResultSchema = z
  .object({
    name: z.string(),
    source: z.string(),
    channel: z.string(),
    fromRef: z.string(),
    toRef: z.string().nullable(),
    outcome: z.enum([
      "updated",
      "uptodate",
      "diverged",
      "skipped",
      "error",
      "orphaned",
    ]),
    note: z.string(),
    diff: z.string().optional(),
    relocatedFrom: z.string().optional(),
  })
  .passthrough();

export const RepoAdditionsSchema = z
  .object({
    repo: z.string(),
    names: z.array(z.string()),
  })
  .passthrough();

export const UpdateReportSchema = z
  .object({
    ok: z.boolean(),
    updated: z.number(),
    diverged: z.number(),
    errors: z.number().optional(),
    orphaned: z.number().optional(),
    results: z.array(UpdateResultSchema),
    newAvailable: z.array(RepoAdditionsSchema).optional(),
  })
  .passthrough();

const DeployStateNameSchema = z.enum([
  "clean",
  "source",
  "drift",
  "copy",
  "dead",
  "absent",
]);

export const AgentInfoSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    short: z.string(),
    global: z.string(),
    projConvention: z.string(),
    installed: z.boolean(),
    // ADR-0010 inheritance — whether the agent auto-loads ~/.<id>/skills per
    // project. Optional at the boundary so an OLDER skl that omits it never makes
    // the payload fail validation (default-safe). It is normalized to a required
    // boolean (missing => true, the ~/.x/skills convention) right after parse in
    // skl.ts so the rest of the app sees a guaranteed AgentInfo.inheritsGlobal.
    // (Kept .optional() rather than .default()/.catch() because input/output
    // divergence under .passthrough() breaks ZodType<T> inference downstream.)
    inheritsGlobal: z.boolean().optional(),
    // ADR-0010 §9 / delta 4 — optional custom-agent presentation fields.
    icon: z.string().optional(),
    color: z.string().optional(),
    custom: z.boolean().optional(),
  })
  .passthrough();

// `skl projects --json` -> `{ projects: string[] }`. There is no dedicated
// `config --json` verb that emits custom agents; the engine folds them straight
// into `agents --json` (tagged `custom:true`), and `loadConfig` recovers them by
// filtering that report — so this schema only validates the `{ projects }` shape.
// Kept permissive (.passthrough()) so a richer future payload never breaks it.
export const ConfigSchema = z
  .object({
    projects: z.array(z.string()),
  })
  .passthrough();

export const AgentDeploymentSchema = z
  .object({
    g: DeployStateNameSchema.optional(),
    p: z.record(z.string(), DeployStateNameSchema).optional(),
  })
  .passthrough();

export const AgentsReportSchema = z
  .object({
    agents: z.array(AgentInfoSchema),
    scopes: z.array(z.string()),
    deployments: z.record(
      z.string(),
      z.record(z.string(), AgentDeploymentSchema),
    ),
  })
  .passthrough();

export const RefFileSchema = z
  .object({
    path: z.string(),
    kind: z.enum(["md", "json", "dir", "other"]),
    depth: z.number(),
  })
  .passthrough();

// Loose schema for the LIVE `skl show --json` payload, whose shape differs from
// the drawer's ShowReport (no `frontmatter`; refFiles are absolute strings).
// We only require a string `body` at the boundary; derive.ts `normalizeShow`
// reshapes the rest — honest validation (right command's output) without
// rejecting the real, richer payload.
export const RawShowSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    path: z.string().optional(),
    body: z.string(),
    refFiles: z.array(z.unknown()).optional(),
    frontmatter: z.unknown().optional(),
    prov: z.unknown().optional(),
  })
  .passthrough();

export const ShowReportSchema = z
  .object({
    name: z.string(),
    body: z.string(),
    frontmatter: z
      .object({
        name: z.string(),
        description: z.string(),
        triggers: z.array(z.string()),
        license: z.string(),
      })
      .passthrough(),
    refFiles: z.array(RefFileSchema),
    prov: z
      .object({
        source: z.string(),
        ref: z.string(),
        hash: z.string(),
        localEdits: z.boolean(),
      })
      .nullable()
      .optional(),
  })
  .passthrough();
