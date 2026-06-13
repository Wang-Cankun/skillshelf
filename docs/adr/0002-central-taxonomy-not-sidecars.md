# 2. Domain tags live in a central taxonomy, not per-skill sidecars

Date: 2026-06-13

## Status

Accepted. Reverses the per-skill **sidecar overlay** mechanism introduced alongside
[ADR-0001](0001-domain-is-tags-not-folders.md). ADR-0001 moved domain membership out of
folders and into tags; it left those tags scattered across one overlay file per skill. This
ADR centralizes them.

## Context

ADR-0001 settled that domains are tags. The tags themselves were stored in a per-skill
**sidecar**: `library/<name>/<name>.shelf.json`, parsed as the `Overlay` interface
(`{ domains, bundles?, notes? }`).

In practice the sidecar collapsed to almost nothing:

1. **111 sidecars, one shape.** Every single one contains only `{"domains":[...]}`. The
   `Overlay.bundles` and `Overlay.notes` fields are read by **zero** files — they were
   speculative surface area that never paid off.

2. **The library is single-writer.** Only the `skl` CLI (and the agents driving it) ever write
   the library; nothing in it is hand-edited prose. Even `DISCOVERED_ROOTS.local.md` — the one
   file that looked like human notes — was a one-shot agent scratchpad, not maintained by a
   person. So the usual argument *for* sidecars ("keep human-friendly notes next to the thing")
   does not apply here.

The real axis for deciding where a piece of metadata lives is **not topic** ("domains belong
with the skill"). It is two orthogonal questions:

- **Does a `skl` command read it back?** (taxonomy: yes — it feeds `Skill.domains`.)
- **Does it travel with the library?** (taxonomy: yes — tags must survive a library copy.)

The sidecar's *only* real justification was "survive an upstream `skl update` that re-pulls
`SKILL.md`." But that guarantee is satisfied by **any** file kept separate from the skill
body — a single central file delivers it just as well as 111 fragments, while keeping the
logical `skill -> domains` table in one place instead of shattered across the tree.

## Decision

Replace all per-skill sidecars with **one** central file under the library:

```json
// library/taxonomy.json
{ "version": 1, "skills": { "<name>": ["domain1", "domain2"], ... } }
```

It lives **under the library** (so it travels on copy), **not** in `config.json` (which is
machine-local — it holds absolute paths).

Consequently:

- **Drop `bundles` and `notes`** entirely (YAGNI — provably unused). A taxonomy value is a
  plain `string[]` of domains.
- **State stays JSON-only, no YAML.** Every state file is machine-rewritten, so any comments a
  YAML format might invite would be wiped on the next write — they would mislead, not document.
- **`config.json` roots are upgraded** from `string[]` to
  `Array<string | { path, layout?, notes? }>`. On **read**, entries normalize to absolute path
  strings for crawling (`layout`/`notes` are informational only — crawl auto-detects layout and
  nothing consumes them programmatically), so `config.roots` remains a resolved `string[]` and
  crawl is unchanged. On **write** (`addRoot`), existing entry annotations are preserved and a
  new path is appended only if absent.
- **`DISCOVERED_ROOTS.local.md` is deleted** in the real-library migration; its "Crawl rules"
  content moves into `docs/ARCHITECTURE.md`, where derived/documented knowledge belongs.
- **`INDEX.md` is reaffirmed as a generated/derived view**, regenerated from the taxonomy — not
  a source of truth.

Invariants preserved across the move:

- Effective `Skill.domains` = union(frontmatter domains, taxonomy domains for that name),
  primary (`domains[0]`) first, de-duped. `Skill.primaryDomain` = effective `domains[0]` or
  `null`. Library skills carry no frontmatter domains today, so taxonomy is the sole source and
  must keep working.
- "Survives upstream update": `taxonomy.json` is separate from skill bodies, so `skl update`
  re-pulling `SKILL.md` never touches domain tags — the same guarantee the sidecar gave, now
  centralized.
- Bundle resolution stays a tag query over `Skill.domains[]` — unchanged.
- `applyProposal` (infer) stays **non-destructive**: proposed domains are unioned with the
  skill's existing taxonomy domains, never replacing them.

## Consequences

**Positive**

- One diff-able taxonomy surface: the whole `skill -> domains` table is one reviewable file.
- One file read instead of 111 — no fan-out over the tree to assemble the mapping.
- No scattered per-skill metadata files, and no empty/near-empty files created by `add` /
  `import`.
- Aligns with the project's existing central artifacts (`shelf.lock.json`, `INDEX.md`) rather
  than fighting them.

**Negative / cost**

- Loses folder-local locality — copying a single skill directory no longer carries its tag
  along. Mitigated: the library is managed **exclusively** via `skl import` / `skl infer`, never
  by hand-moving directories, so the locality was never exercised in practice.
- A deleted skill leaves a **stale taxonomy entry** until the next `skl infer` / index GC prunes
  orphaned names. This is a known, bounded drift, cleaned on the next inference/index pass.
