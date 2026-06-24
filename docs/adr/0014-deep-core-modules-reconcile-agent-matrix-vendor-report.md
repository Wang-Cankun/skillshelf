# 14. Four deep core modules: `reconcile`, `agent-matrix`, `vendor`, `report`

Date: 2026-06-24

## Status

Accepted. A behaviour-preserving refactor that extracts four deep modules into `src/core/`, pulling
duplicated logic out of the `src/commands/` and `app/` layers. It changes **no public surface** — every
`--json` field, error-message substring, and exit code is byte-identical — so it **supersedes no prior
ADR**; it gives the decisions in [ADR-0013](0013-update-reconciles-per-repo-reports-structural-drift.md)
(reconcile), [ADR-0011](0011-adopt-provenance-track-verb.md) (adopted), [ADR-0004](0004-owned-vs-linked-entries.md)
(never-clobber / curator boundary), and [ADR-0008](0008-ui-design-alignment.md)/[ADR-0010](0010-library-first-management-skill-agent-scope.md)
(the agent matrix) a single home in code instead of re-implementing them per call site.

## Context

The engine (`src/core/`) was a kit of small, granular helpers — shallow by design — but four genuinely
**deep** operations had been written *inline and duplicated* across the command and app layers:

1. **The reconcile verdict.** The 3-way body comparison that classifies a tracked skill against its
   upstream lived in three commands with three enums: `update.ts` (`updateOne`, `Outcome`),
   `outdated.ts` (`checkEntry`/`checkEntryLocal`, `Status`), and `add.ts` (`driftVerdict`, `Verdict`).
   Two of them applied **different rules** for "diverged" — and that divergence was load-bearing, not a
   bug (see below), but nothing in the code said so.
2. **The agent matrix fold.** The surface→agent→scope fold (`computeAgentsReport`) was re-implemented in
   the app's browser fallback (`deriveAgentsReport`), kept in sync only by cross-referenced comments;
   the two `stateForSite` mappings had already drifted (the app silently dropped `copy`+drift).
3. **The vendoring write.** `installOne` (≈147 lines) and `trackOne` lived in command files; `migrate`
   imported `trackOne` *from a sibling command*, and the retired-tombstone / safe-name / symlink-escape
   guards were copy-pasted across `add`, `import`, and `link`.
4. **The json/human fork.** Every command hand-rolled `if (json) … else …`, with domain-coupled
   verdict→mark ladders inline and untested.

A `/improve-codebase-architecture` review surfaced these as deepening opportunities (shallow modules
whose interface nearly matched their implementation; logic that failed the deletion test by *concentrating*
when removed). This ADR records the result.

## Decision

Extract four deep modules — small interface, real implementation moved in, tested through the interface.

### 1. `src/core/reconcile.ts` — the verdict classifier (pure)

One node-/IO-/network-free module. Inputs are literals (a `LockEntry`'s flags plus pre-computed body
hashes the commands already produce); hashing/clone/fs stays in the commands. Exports a **total**
`classify(input): Verdict` plus two standalone, separately-testable facts.

**The load-bearing sub-decision — the `update`/`outdated` divergence is correct, not a bug.** The two
commands ask different questions against different baselines:

- `editedSinceInstall` (offline) — `localHash !== installedHash`, falling back to the `localEdits` flag
  when `installedHash == null`. "Have I hand-edited since *my* install baseline?"
- `differsFromUpstream` (online, nullable) — `localHash !== upstreamHash`, `null` when upstream is not in
  view. "Do I differ from the world *right now*?"

`update`'s never-clobber gate is the **AND** of both; the convergent-edit case (the user hand-edits to
exactly what upstream independently moved to) is why both facts are load-bearing — there, `editedSinceInstall`
is true but `differsFromUpstream` is false, so `update` safely re-pulls while offline `outdated` still
(correctly, for its epistemic budget) reports an edit. The classifier exposes **both facts as named
predicates** and a `Verdict` union whose `upstreamHash` is **optional**, so `outdated --check-local`
derives a verdict offline and `update` derives the full online verdict. The union renames the offline
edit-check to `edited` so it stops colliding with the online `diverged`. Each command **projects the
union down onto its own unchanged public enum** — the unification is internal; `update.Outcome`,
`outdated.Status`, and `add.Verdict` are untouched.

### 2. `src/core/agent-matrix.ts` — the surface→agent→scope fold (node-free, shared)

One pure fold, `foldAgentMatrix(sites, { home, agentIds, extraScopes })`, imported by **both** the engine
(`src/core/agents.ts`) and the app browser fallback (`app/src/lib/agents.ts`, via a `@core` Vite alias +
`tsconfig` path). The module imports **no node builtin** (it would break the browser bundle) and does
path math on `/` separators. Two adapters justify the seam: the engine supplies `homedir()` + an
`existsSync`-driven `installed` + its 6-agent seed list; the browser supplies the `inferHome` heuristic +
seed-default `installed` + its 4-agent seed list. **The seed-list divergence stays — as data each side
passes in, not duplicated logic.** `stateForSite` is unified to the strict superset (honour `site.drift`
on **both** `linked` and `copy` kinds), which is behaviour-preserving for the engine and fixes a latent
app bug where a drifted `copy` rendered as clean.

### 3. `src/core/vendor.ts` — the library write boundary

The deep operations `installSkill` / `track` / `adopt` and the guard suite
(retired-tombstone, safe-name via `core/library.ts`, symlink-escape) live here, once. Commands shrink to
parse + print: `add` calls `installSkill`; `track` and `migrate` both import `track`/`adopt` from here, so
**no command imports another command**; `import` and `link` share the retired/symlink guards. `installSkill`
**calls `reconcile.classify`** for its drift verdict rather than reimplementing it. The **curator boundary**
(ADR-0003/0004 — `add` writes only the library) is now a property of this one module.

### 4. `src/core/report.ts` — the render seam

A command produces a `CommandResult { json, human }`; `render(ctx, jsonMode, result)` emits one or the
other. The verdict→mark ladders (from `update`/`outdated`/`add`) become **pure, unit-tested functions**.
`render` is **display-only**: JSON payloads are moved **verbatim** (no field renamed), and exit-code logic
stays in each command's `run()`. Adopted **incrementally** — `update`, `outdated`, `add`, and `ls` are the
proof slice; the remaining ≈26 commands keep their inline fork until later passes convert them.

## Consequences

**Positive**

- **Locality.** The never-clobber rule, the matrix fold, the vendoring guards, and the verdict→mark
  ladders each live in exactly one place; a fix lands once. The `update`/`outdated` divergence can no
  longer silently drift — both facts are named and tested.
- **The interface is the test surface.** `reconcile.classify` is exhaustively covered with literal-hash
  permutations (no network, no clone, no fs) that were previously reachable only through expensive
  git-upstream integration tests. Suite grew **373 → 456 tests**, all green; `add.ts` alone shed ≈340 net
  lines; tracked files net **−565**.
- **The browser bundle stays pure.** `reconcile.ts` and `agent-matrix.ts` import zero node builtins.

**Negative / cost**

- **The reporter is only partially migrated.** Two patterns (the `report.ts` seam and the inline
  `if (json)` fork) coexist across the command surface until the tail is converted; a reader must not
  assume uniformity mid-migration.
- **A cross-package build coupling.** The app reaches into `../src/core/agent-matrix.ts` through a `@core`
  Vite alias + `tsconfig` path; the shared module must stay node-free or the browser build breaks (guard:
  grep for `node:` imports). The fold also fixes path math on `/`, so a future Windows engine run would
  need revisiting.
- **The verdict union is internal-only.** Each command still maps the unified `Verdict` down onto its own
  public enum — deliberate (to avoid any surface change), but it means the rich union is not itself a
  public type.
