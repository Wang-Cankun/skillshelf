# 4. Library entries are OWNED (copy) or LINKED (symlink); LINKED is canonical for active dev skills

Date: 2026-06-13

## Status

Accepted. Defines the two modes a skill entry can take in the library and when to use each,
grounding the "one canonical source" principle across actively-developed skills and third-party
imports. Implements the substance of [ADR-0003](0003-agent-agnostic-surfaces.md) line 2
("registry / where-smarter") deferred work.

## Context

### The problem: dev skills drift when copied

A skill lives in one place *really* (the developer's repo: `~/Documents/GitHub/claim-log`,
`~/Documents/GitHub/skl`, etc.), and the library *also* wants a copy of it. Before this ADR,
the only path was to import a copy into the library and keep it in sync manually — or leave it
in the dev repo and symlink the library entry back to it, creating two competing mental models
("is the library canonical, or is the dev repo?").

When you import-as-copy and then edit the skill in the dev repo, the library copy silently
drifts. Deployments run against the stale library copy. There is no way to tell the drift
happened short of reading hashes.

When you import-as-copy and try to update it later, the library tool has no upstream to track
(the copy lost the dev repo connection), so `skl update` has nowhere to pull from.

### Evidence: the bookshelf model

The verb is "shelf a skill," not "own a skill." For skills you actively develop (claim-log, skl
itself, new tools you're building), the library should *reference* the real copy, not own it.
For third-party skills, downloads, and stabilized/archived skills, the library should *own* a
copy so it is self-contained and can be audited / updated / frozen independently.

This mirrors real library metaphors:

- **OWNED books** (library purchases a copy): the library is the keeper; you can lend it out
  (create symlinks at deployment surfaces) or keep it shelved.
- **LINKED books** (library shelves a reference to your copy): your version is canonical; the
  library points to it so you see it on "what books am I reading across my devices?"

### Real codebase alignment

The codebase already has the machinery:

- `import.ts` (line 14): `--copy` flag chooses between move (default, OWNED) and copy (LINKED
  back to dev repo — not yet exposed as a first-class flag, but the infrastructure exists).
- `deployments.ts` (lines 74-97): classifies each surface entry via realpath — a symlink into the
  library is `linked`; a real directory that is the realpath target of a same-named library symlink
  is `source` (the canonical dev-repo source a LINKED entry points to); any other real copy is `copy`.
- `link.ts`: collapses redundant copies into symlinks (moving a copy into the LINKED mode).
- `types.ts`: `DeploymentKind` names the states (`linked`, `source`, `foreign-link`, `copy`, `dead`);
  `source` was added by this ADR's implementation to mark a clean linked-bookshelf source.

The library *already* supports symlinks to external sources; the gap is exposing the mental
model and the lifecycle.

### The lifecycle insight

The natural flow is:

1. **DEVELOP as LINKED** (`skl import <name> --from ~/Documents/GitHub/myskill --copy`):
   The library symlinks to your active dev repo. You edit in the repo; deployments always get
   the latest. This is the working mode for skills you are actively building.

2. **STABILIZE to OWNED** (`skl import <name> --from ~/Documents/GitHub/myskill --force`):
   When the skill is stable and you want to freeze it, re-import without `--copy`. The library
   takes its own copy. From that point, updates are explicit (you decide when to `skl update`),
   and the library is self-contained (no dependency on the dev repo being present on every
   machine).

3. **ARCHIVE as OWNED**: Retired skills live in `library/_retired/<name>/` as owned copies, no
   longer deployed but kept for provenance.

The decision rule is: **source is remote (github) or skill is stabilized → OWNED; source is
local dev repo actively developed by you → LINKED.**

## Decision

1. **Recognize two modes for library entries:**

   - **OWNED** — the library holds the real bytes; the library is the canonical source. For:
     - Skills fetched from GitHub or registries (`skl add`).
     - Stabilized / archived skills you want to freeze.
     - Skills you want the library to be self-contained without.
     - Implemented as a real directory under the library.

   - **LINKED** — the library entry is a symlink to an external directory (a dev repo's canonical
     source). The dev repo is canonical; the library shelves a reference for discoverability,
     bundling, and cross-agent deployment mapping. For:
     - Your own actively-developed skills (claim-log, skl, new tools you are building).
     - Any skill you clone freshly on each machine (the real copy lives in a git repo).
     - Implemented as a symlink whose realpath is *outside* the library.

2. **The decision rule:**

   ```
   GitHub remote or skill stabilized?  → OWNED (copy)
   Local dev repo, actively developed? → LINKED (symlink to dev repo)
   ```

3. **Why not alternatives for dev projects:**

   - **Copy + manual-update drifts:** You edit the skill in the dev repo; the library copy
     silently falls behind. Deployments run stale code. No warning. This is the pain point that
     prompted the ADR.
   - **Copy + `import --force` on edit:** Requires you to remember to re-import after every
     significant edit. Impossible to enforce. Drift is probabilistic, not prevented.
   - **Move dev repo + symlink back (aka `import --from <dev-repo>` default):** This is import's
     current behaviour — move the dev repo's skill into the library, then symlink the dev repo
     location back to the library copy. This guts the dev repo's git history (the repo's actual
     files become a symlink, so git tracks the symlink, not the files). A publishable dev repo
     cannot have its skills as symlinks; you would need to "un-symlink" before pushing, breaking
     the library link. So this does not work for public dev repos.
   - **LINKED (library-symlink-to-source) ✓:** The library symlinks to the real skill in the dev
     repo. The dev repo is untouched (all its files are real, all its git is intact). You develop
     normally. Deployments always get the latest. The library does not need the dev repo to
     decode its own entries (symlinks are readable), and `skl where` surfacing a library-symlink
     as a clean deployed entry (not a second source) is straightforward: check if its realpath is
     *outside* the library. Simple, composable, preserves the dev repo.

4. **The lifecycle:**

   - Develop as LINKED: `skl import <name> --from ~/Documents/GitHub/myskill --copy`
     (or a new flag, `--link`, once exposed).
   - Stabilize to OWNED: `skl import <name> --from ~/Documents/GitHub/myskill --force` (re-import
     as a copy; library takes ownership).
   - Archive as OWNED: Move to `library/_retired/<name>/` — no deployments, library keeps the
     provenance.

5. **Implications for `skl where` (deployment visibility):**

   - A library entry that is a symlink to an external source is a **clean, valid deployment**.
     When `skl where` scans that external dev-repo dir, it must recognize it as the canonical
     source the library points to (not a second source, not a redundant copy, not a problem).
     Implemented in `deployments.ts` (lines 82-97): a real dir whose realpath equals the realpath
     of the same-named library entry is classified `source` and excluded from the problems filter.
   - A *deployed* entry (in `~/.claude/skills`, `.agents/skills`, etc.) that is a symlink into
     the library is also clean (status: `linked`). A *deployed* entry that is a symlink outside
     the library is a second source (status: `foreign-link`). A real copy is a `copy` (drift-prone).

6. **Deferred, Phase 2 / Phase 3:**

   - **First-class CLI flag:** `skl import --link` (or `--symlink`) to expose LINKED mode without
     `--copy` flag gymnastics.
   - **Provenance `mode` field:** Add `"mode": "owned" | "linked"` to the taxonomy entry or a
     companion metadata file, so `skl outdated` / `skl update` can skip LINKED entries (they have
     no upstream to track, and the dev repo is responsible for versioning).
   - **`skl link --from <dev-repo>`:** A direct command to register a dev repo skill into the
     library as LINKED (rather than the `import --from <path> --copy` workaround).

## Alternatives considered

- **Always OWNED, always copy.** Drifts are inevitable; requires manual discipline to keep in
  sync. The ADR is motivated by this failing.
- **Always LINKED, no OWNED.** Works for dev skills but breaks for third-party imports — you
  lose portability if the GitHub repo is deleted or if you want the library self-contained on a
  machine without the dev repo (e.g., CI, a shared library on a clean machine, or a teammate's
  clone).
- **Retire the library concept; use `vercel-labs/skills` instead.** Out of scope; skillshelf's
  role is curation and visibility, not installation. The two are complementary (as stated in
  ADR-0003).

## Consequences

**Positive**

- **Dev skills no longer drift.** You develop in the repo; deployments always pull from the
  latest. The library is a clean reference, not a stale copy.
- **Dev repos stay publishable.** Importing with `--link` (via symlink-to-source, not
  import-and-symlink-back) leaves the dev repo's git and file structure intact for public
  release or local development.
- **Clear ownership semantics.** A reader of the codebase knows: OWNED = library decides when to
  update; LINKED = dev repo decides. `skl where` surfaces this distinction (line 5 above).
- **Self-contained deployments.** OWNED entries are frozen snapshots. LINKED entries are
  pointers. Operators can distinguish and make deployment choices (e.g., "pin this OWNED skill
  and let LINKED ones float").

**Negative / cost**

- **LINKED entries require the dev repo.** If you remove `~/Documents/GitHub/claim-log`, the library
  symlink becomes dead. Mitigated: dev repos are cloned where you work (they are not ephemeral
  like a cloud-synced file). If you need a skill on a machine without the repo, `skl import
  <name> --force` promotes LINKED → OWNED.
- **`skl outdated` / `skl update` need awareness.** They currently assume all library entries are
  OWNED and have provenance. LINKED entries (mode: "linked") must be skipped. This is a known
  gap, deferred to Phase 2 (added to follow-up list).
- **No backwards-compatibility migration.** Existing OWNED copies in the library stay OWNED; no
  automatic detection of "this is a dev repo" to convert. Users opt in by re-importing with
  `--link` or by replacing the library entry with a symlink manually (`rm -rf library/<name> &&
  ln -s ~/Documents/GitHub/<name> library/<name>`). The tool does not make this choice for them.

## Appendix: realpath-based classification

The codebase detects entry mode via realpath, not metadata (see `deployments.ts`):

```typescript
const libReal = realpathOrSelf(libraryPath);
const libPrefix = libReal.endsWith(sep) ? libReal : libReal + sep;
const real = realpathOrSelf(full);  // the entry's realpath
// symlink entry:
kind = real === libReal || real.startsWith(libPrefix) ? "linked" : "foreign-link";
// real directory with a SKILL.md — is it the source a library symlink points at?
const libEntryReal = realpathOrSelf(join(libraryPath, e.name));
kind = libNames.has(e.name) && real === libEntryReal ? "source" : "copy";
```

A symlink whose realpath is inside the library is "linked" (a clean deploy). A symlink resolving
outside the library is "foreign-link" (a second source). A real directory whose realpath equals
its same-named library entry's realpath is "source" (the canonical dev-repo source a LINKED entry
points to — clean); any other real directory is "copy" (drift-prone). This is computed from
reality on every `skl where` run, requiring no stored metadata.

For a LINKED library entry, the library side is a symlink to e.g. `~/Documents/GitHub/claim-log`. When
`skl where` scans that dev-repo dir, its realpath matches `realpath(library/claim-log)`, so the
classifier returns "source" — a clean entry, excluded from problems — rather than mistaking the
canonical source for a stray redundant copy.

A future `mode` field in the taxonomy would be informational (for skipping in update logic) and
would *echo* the realpath-based distinction, not replace it.
