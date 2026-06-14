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
