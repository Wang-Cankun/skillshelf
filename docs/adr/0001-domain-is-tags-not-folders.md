# 1. Domain is tags, not folders

Date: 2026-06-12

## Status

Accepted. Reverses the initial design where each skill lived in a "primary-domain folder."

## Context

skillshelf's first design said: each skill has one canonical home in a **primary-domain
folder** on disk, plus multi-domain **tags**; bundles are tag queries over those tags.

Two forces exposed the folder as dead weight:

1. **Bundles are already tag queries.** Resolution ignores folders entirely — a skill tagged
   `[coding, bioinfo]` appears in both bundles from one copy regardless of where it sits. The
   folder never participated in the feature it supposedly organized.

2. **Migration hit a chicken-and-egg.** A *candidate* (a skill in an external root, not yet in
   the library) cannot be tagged by `infer --apply`, which writes overlays *inside* the
   library. A primary-domain folder would force the domain to be decided **at import time**,
   before any inference — turning import into a judgment step and guaranteeing a later reorg
   (and symlink rewrites) whenever a tag changed.

The code had already drifted toward this conclusion: `add.ts` treats `--domain` as optional,
and a skill with no domain folder simply lands flat at `library/<name>`.

## Decision

Domain membership lives **entirely in tags** (the overlay's `domains`). The physical layout is
**flat and non-semantic**: `library/<name>/`. `primaryDomain` is defined as `domains[0]`, a
derived view over tags — not a folder constraint.

Consequently:

- `skl import` is purely mechanical (move + symlink-back); it needs no domain decision.
- Tagging happens **after** import, via the existing `skl infer --emit` / `--apply`, in one
  pass over the populated library.
- Migration flow: `scan` → `import` (untagged) → `infer`. No ordering paradox, no reorg.

## Consequences

**Positive**

- One inference surface (`infer`), one ordering, no reorg churn on taxonomy changes.
- `import` stays a thin deterministic primitive — consistent with the deterministic-core /
  agent-reasoning seam.
- Matches how bundles and the existing code already behave.

**Negative / cost**

- Browsing the raw git repo by folder no longer groups skills by domain. Mitigated by
  `INDEX.md` (regenerated, grouped by domain), `skl ls [bundle]`, and `skl search`.
- `library.ts` must derive `primaryDomain` from `domains[0]` rather than the parent folder.
- `docs/ARCHITECTURE.md §2` wording ("primary-domain folder") must be corrected.
