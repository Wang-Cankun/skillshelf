# 13. `update` reconciles per source repo: auto-follows renames, surfaces orphans/additions, never installs or deletes

Date: 2026-06-17

## Status

Accepted. Extends `skl update` from a per-skill body-refresh into a per-repo *reconcile* that
copes with upstream releases which rename / add / remove skills (e.g. a `mattpocock/skills`
release), and extends the desktop app (`app/`) to drive it. Governed by
[ADR-0004](0004-owned-vs-linked-entries.md) (never clobber LINKED dev repos; never irreversibly
delete) and the **curator boundary** in `CONTEXT.md` (`add` writes the library, `update` only
refreshes). Keeps [ADR-0009](0009-update-aware-source-column.md)'s cheap `outdated` intact but
**supersedes its §5** ("Update all stale"): there is no library-wide update at all — the app updates
**per vendor** or per skill (decision 9). The `skl update` CLI gains a `--repo <source>` filter and
new JSON `outcome` values; the `skl update <name>` shape is otherwise unchanged.

## Context

`skl update` was **body-only and per-entry**: each lock entry records its own
`source = github:owner/repo@<subpath>`, and `updateOne()` re-fetched *that one subpath*, 3-way
compared the body against `installedHash`, and applied or reported `diverged`. Against an upstream
that restructures, this breaks:

| upstream change | old behavior |
|---|---|
| body changed | ✅ handled |
| skill **renamed** (subpath moved) | ❌ subpath 404 → generic `error`, entry orphaned |
| skill **removed** | ❌ subpath 404 → generic `error` (indistinguishable from a network failure) |
| skill **added** | 🚫 invisible — `update` only iterates entries you already track |

Two facts made the fix cheap and shaped the design:

- **`cloneToStaging` already clones the whole repo** once, then points `skillDir` at the subpath.
  So when a subpath is gone, the *entire upstream checkout is already on disk* — `discoverSkills`
  over it (rename/orphan/additions detection) costs nothing extra.
- The reliable identity across a rename is the frontmatter **`name`** (the install slug the lock
  entry is keyed by), not the body hash — a rename usually coincides with an edit, so body-hash
  matching is fragile, whereas a *directory* rename keeps the declared `name` stable.

## Decision

1. **Reconcile per source repo, not per entry.** `update` groups lock entries by their parsed
   source repo, clones each repo **once**, and reconciles the whole group against that single
   checkout. (Kills the old N-clones-per-repo waste and is what makes additions-reporting
   possible — a per-entry loop never holds all of a repo's tracked names at once.) The
   `skl update <name>` path is just "the group has one member." A **`--repo <source>`** flag scopes
   a run to one vendor — it pre-filters the group set to entries whose parsed repo key matches
   (`parseStoredSource(source).source`, e.g. `github:owner/repo`). The per-vendor UI action
   (decision 9) drives it; with no `--repo` the positional `<name>` (or nothing → all) still applies.

2. **Auto-follow renames (`Relocated`).** If a tracked entry's subpath is gone but a checkout skill
   has the **same `name`** at a different subpath, re-point the entry's `source` subpath
   automatically and report `followed rename: <old> → <new>`, then run the normal body 3-way. The
   re-point is pure provenance correction (no clobber risk), so it is **not** gated behind
   `--force`; body-clobber safety is unchanged. A *frontmatter-name* rename has no `name` match and
   is treated as `Orphaned`.

3. **Surface removals, never delete (`Orphaned`).** Subpath gone + no `name` match anywhere in the
   checkout → new non-destructive `orphaned` outcome. The library copy is **kept**; the user
   decides whether to `skl remove` it. Distinguished from a genuine clone failure (transient /
   repo-deleted), which stays `error`. Auto-deletion is forbidden — it is exactly the irreversible
   clobber ADR-0004 guards against, and the library copy may be the only copy left.

4. **Report additions, never install.** Using the checkout it already fetched, `update` reports
   per repo `N new published skills not tracked → skl add <repo> --all`. It **never vendors** —
   installing is `add`'s job (the curator boundary). A re-run of `skl add <repo> --all` is
   idempotent (identical bodies re-install losslessly, differing ones skip without `--force`, new
   ones install), so it is the complete additions story; `update` only points at it.

5. **`outdated` stays cheap.** `orphaned` / `relocated` / new-available are knowable **only from a
   checkout**, which only `update` does; `git ls-remote` lists refs, not tree contents. So these
   are `update`-time discoveries surfaced via `update --json`, **not** pre-flight `outdated`
   badges. `outdated` remains the SHA-compare of ADR-0009, preserving its rate-limit honesty. The
   app's SOURCE column keeps `stale ↑` / `diverged ⚠` from `outdated`; structural states render
   post-update.

6. **Floating-HEAD; tag/release pinning deferred.** `update` tracks the default-branch HEAD by SHA.
   An "official release" is, to the engine, just "upstream moved" — and the rename/orphan/additions
   logic is identical whether the trigger is a tag or a bare commit. Pinning to `@v2.0.0` (and a
   tag→SHA resolution axis) is deferred until a repo actually needs it.

### Desktop app (`app/`)

The app (ADR-0009 SOURCE column) already drives `update` per-row but **discards `update`'s output**,
reading only success/fail. Because `outdated` (the cheap badge source) structurally cannot see
structural drift, the app must consume `update --json` to surface it. The flow's entry point is the
*existing* `stale ↑` badge: a rename/remove upstream moves the repo HEAD, so the affected skill
already shows stale; clicking ↑ runs `update`, which is where relocated/orphaned/new-available are
revealed.

7. **The app consumes `update --json`.** Add an `UpdateReport` schema; `commands.update` stops
   discarding the result. The app already writes the library via `import`/`link` (its allowlist),
   so gaining an `add` action crosses no boundary it hasn't already crossed.

8. **Hybrid surfacing, matched to each signal's lifespan.**
   - **Results panel** (per run, `UpdateResultsBanner`): narrates an **outcome-aware** count summary
     + relocated lines. A `diverged` row shows an **"overwrite (discard my edits)"** button → an
     explicit destructive `window.confirm` → `update <name> --force`, which overwrites the diverged
     local body with upstream. This is a deliberate, *gated* exception to "the UI never clobbers":
     the engine still never force-overwrites without `--force`, and the UI only passes it behind that
     confirm. The per-repo **"Add N new from X"** button — the only place `new-available` can live
     (those skills aren't library rows yet) — runs `skl add X --skill <the new names>`, **not**
     `--all`: the `--all` >15 gate counts the repo's *full* published set (e.g. 17), which would
     wrongly block "Add 6 new", whereas `--skill` installs exactly the untracked names and is never
     gated (ADR-0012 §3). The button's >15 `window.confirm` is a courtesy on the new-count. It stays
     a *separate deliberate click* from update, so the curator boundary holds.
   - **Honest toast** (per single-name update): reflects the actual outcome — a `diverged` /
     `orphaned` / `uptodate` result never reports "Updated" (only a real `updated`/relocate does).
   - **Persistent row badge** (`SourceCell`): a new `orphaned ⊘` badge replaces `stale ↑` once an
     update reveals the skill is gone upstream; clickable → Remove confirm. Relocated/refreshed rows
     fall back to no badge (current). Session-scoped like the `outdated` cache — never shows
     structural state the engine didn't compute this session (ADR-0009 honesty).

9. **Action model: per-row ↑ + per-vendor "Update N" — no library-wide sweep.** Per-row ↑ updates
   one skill (`update <name>`). The Library's **"By vendor"** grouping gives each vendor (owner/repo)
   bucket an **"Update N"** action → `skl update --repo <source> --json`: one clone, results scoped
   to that vendor. A library-wide **"Update all" was tried and removed** — a single bare `skl update`
   synchronously clones *every* tracked vendor (froze the UI ~a minute) and dumped a library-wide
   wall of results. **This supersedes ADR-0009 §5** (no library-wide update remains); the per-repo
   `--repo` scope is the unit of action.

10. **`run_skl` is async (no UI freeze).** The Tauri `run_skl` command runs the blocking CLI spawn
    off the main thread (`tauri::async_runtime::spawn_blocking`), so a multi-second `update` clone
    never freezes the webview. (A synchronous command body had blocked the main thread for the whole
    CLI duration — the freeze that motivated both this and the per-vendor scoping in decision 9.)

## Consequences

**Positive**

- One restructure pays for four behaviors (rename-follow, orphan surfacing, additions reporting,
  de-duplicated clones) because they all reduce to "one checkout + all tracked names for the repo."
- Never destructive, never boundary-crossing: `update` refreshes and *reports*; it never deletes a
  library copy and never vendors a new skill.
- Provenance survives upstream renames (tags/lock continuity follow the relocated skill) instead of
  breaking into an orphaned `error`.

**Negative / cost**

- The `update --json` `outcome` enum grows (`orphaned`, and a `relocated` signal on `updated`
  rows); consumers (the app) must accept the wider enum, mirroring ADR-0009's `OutdatedSchema`
  five-value lesson.
- Additions are visible only *after* an `update` run (no cheap pre-flight), an accepted consequence
  of keeping `outdated` checkout-free.
- A frontmatter-`name` rename still reads as remove+add (`orphaned` + manual re-add); we
  deliberately do not guess across it.
- The app grows an `add` action (the "Add N new" button, scoped via `--skill`) and a results panel;
  structural drift is visible in the UI only *after* an update run (no cheap pre-flight), and the
  `orphaned ⊘` badge is session-scoped — both accepted consequences of keeping `outdated`
  checkout-free.
- The UI **can** now overwrite a diverged local body (`update <name> --force`), but only behind an
  explicit destructive `window.confirm` on that one row — a deliberate, gated exception to the
  never-clobber default. For one's *own* actively-developed skills, converting them to LINKED
  (ADR-0004) remains the better fix than repeatedly force-overwriting.
- A relocated entry whose body fetch then errors does not persist the subpath re-point (only
  `uptodate`/`diverged` outcomes persist it without a body write); low risk, the next run retries.
