# 9. The SOURCE column is update-aware: click-through origin + manual outdated-check + per-row stale/diverged badges

Date: 2026-06-15

## Status

Accepted — extends [ADR-0008](0008-ui-design-alignment.md) §7 (the `ls --json`
`source`/`origin` additions) with a `channel` field, and is governed by
[ADR-0004](0004-owned-vs-linked-entries.md) (never update LINKED/local) and
[ADR-0007](0007-fact-vs-inference-and-ui-scope.md) (`outdated`/`update` are deterministic
L2 FACTs, surfaced as authoritative, never as AI suggestion). Scope: the Library + Matrix
SOURCE column in the desktop app (`app/`). Does not change the CLI engine contracts it reads
(`skl ls`, `skl outdated`, `skl update`); the one engine-side addition is the `channel` field
on `ls --json` so the UI can gate click-through.

## Context

The SOURCE column was hardcoded to the string `"dbskill"`. It is now wired to the real
upstream `origin` (`owner/repo`) emitted by `skl ls --json` (ADR-0008 §7.1, `originLabel`).
This ADR crystallises the next two decisions taken on that column: make it **click-through**
to the upstream, and make it **update-aware** — surfacing provenance, staleness, and the
update action inline, without the UI ever inventing network truth or clobbering a dev repo.

### The litmus (ADR-0007): this is entirely an L2-fact surface

"Can two runs / two models disagree?" No. `outdated` is a hash/ref compare (`installedRef`
vs `latestRef` via `git ls-remote`); `update` is a 3-way body compare. Both are deterministic
engine verbs — **FACTs**, not inference. The whole SOURCE-column feature sits in the L2-fact
lane: the UI is L1 presentation-only, a pure function of `skl ls`/`skl outdated`/`skl update`
JSON. No L3 (`suggest`/Explanation) is involved, so badges render solid and authoritative, not
as deferred AI hints.

### Why staleness is *visible per row*, not folded into the cell

A live `skl outdated --json` run over the real library returns ~20 of 23 rows `stale`. If a
badge *replaced* the origin text, almost every row would lose its repo identity. So the badge
sits **beside** the name and never replaces it: the origin (`owner/repo`) stays legible while
the staleness signal rides alongside.

### Why the check is MANUAL, not on-mount

Each `outdated` row does a `git ls-remote` against its upstream. Auto-checking ~20 github
sources on every mount would hammer GitHub's rate limit for a signal the user rarely needs at
that instant. v1 is therefore a single explicit **"Check updates"** button; the result is
cached for the session. This is also the honest choice (ADR-0007): we never paint a stale/
current verdict the engine has not actually computed this session.

### Prior art: cc-switch — and where skillshelf already leads it

cc-switch (the comparable provenance-tracking tool) re-zips each installed package to detect
upstream change. skillshelf already **owns provenance** more cheaply:

- Provenance lives in the library-root lockfile `shelf.lock.json` (`src/core/provenance.ts`,
  `LOCKFILE_NAME`), recording `source` / `channel` / `ref` / `installedHash` per entry.
- Staleness is a **commit-SHA compare** via `git ls-remote` (`src/core/fetch.ts`), not a
  re-download — cheaper than cc-switch re-zipping the package to diff it.
- Local edits are caught by **`installedHash` divergence** (`src/types.ts`: local ==
  `installedHash` ⇒ user did not edit, safe to re-pull; local != `installedHash` ⇒ `diverged`,
  do not clobber). This is the same 3-way safety ADR-0004 calls for.

The single capability gap vs cc-switch is **no retro-attribution of externally-installed
skills**: a skill that arrived outside `skl add`/`skl import` has no lockfile entry, so it
shows as `local` with no origin and no update path until it is brought under provenance. That
gap is acknowledged, not closed here.

## Decision

### 1. Origin display (kept from ADR-0008 §7.1)

- **Vendored** rows show `skill.origin` (`owner/repo`), ellipsis-truncated, with the full
  `owner/repo` in the title tooltip. The diamond glyph `◆` marks vendored.
- **linked / local** rows show `local`, no origin, no link, no badge. (A row is local/linked
  when `skill.source !== "vendored"`.)

### 2. Click-through to the upstream repo ROOT (simple version)

- The origin text is clickable; clicking opens `https://github.com/<origin>` (the repo **root**)
  in the external browser via `openExternal()` (Tauri opener plugin; no-op when `!IS_TAURI`).
- **Deep-linking is deferred.** No `@<ref>` and no `skills/<subpath>` in the URL for v1 — even
  though provenance carries both. Repo root only.
- Clickable **iff** `channel === "github" && skill.origin`. Non-github vendored rows (e.g.
  `vercel-registry`) render the origin as plain text, not a link.
- This requires one engine addition — `channel` on `skl ls --json` (`src/commands/ls.ts`
  `toJson`: `channel: s.source ? s.source.channel : null`) — so the UI can gate the link on
  the provenance transport without re-deriving it.

### 3. Manual "Check updates" + per-row badges

- A **"Check updates"** button in the Library toolbar triggers `skl outdated --json`
  (manual / `enabled:false` + `refetch()`; never auto-run on mount — rate-limit rationale
  above). It shows a `checking…` state, then per-row badges appear; the result is cached for
  the session.
- `OutdatedSchema` must accept the full status enum — `"stale" | "current" | "unknown" |
  "linked" | "diverged"` — even though a given run may only surface a subset.
- Badge **beside** the origin (never replacing it):

  | status | badge | meaning | action |
  |---|---|---|---|
  | `stale` | `↑` blue, clickable | installed ref is behind latest | update this skill |
  | `diverged` | `⚠` amber, clickable | local body hand-edited away from `installedHash` | update, but **confirm first** (can clobber local edits) |
  | `current` / `linked` / `unknown` / no-data | (none) | — | — |

### 4. The update action + ADR-0004 linked-safety

- `commands.update(name)` runs `["update", name]` via `runAction`. `skl update` takes a
  **single** positional name (no `--all`, no `--ref` flag), so the UI drives it per-name. On
  success it invalidates the library query + the outdated query and shows a toast
  `Updated <name>` with **no Undo** (`skl update` is not cleanly invertible). On failure it
  surfaces `res.stderr` via `setError`.
- Exit-code note: `skl update` returns `0` clean, `2` when some rows diverged (success-ish but
  non-zero), `1` on hard error. For a single non-diverged stale name, success is exit `0`; the
  UI's `runAction` must not treat the `diverged`-`2` case as a hard failure.
- **Domain tags are preserved** by the engine: tags live in library-root `taxonomy.json`
  (ADR-0002), never inside the skill dir, and `update` only re-pulls SKILL.md + ref files
  (note `"upstream body re-pulled; domain tags preserved"`). The UI inherits this for free.
- **LINKED/local safety (ADR-0004): never offer update on linked/local rows.** Only `stale`/
  `diverged` github-tracked rows get a badge and an update action. The CLI itself also skips
  linked entries (`outcome:"skipped"`), but the UI-side gate is still required so we never fire
  a useless call against a dev-repo-canonical entry.

### 5. "Update all stale (N)"

- A toolbar / bulk affordance updates every **non-diverged** stale skill. Because `skl update`
  takes one name, the UI **iterates per stale name** (`["update", name]` per row) rather than a
  bare `skl update` (which would also touch non-stale rows and attempt diverged ones).
- **Diverged rows are excluded** from "Update all" — they stay manual and confirm-first (reuse
  the existing `askConfirm` / Remove-modal confirm pattern), because applying upstream over a
  hand-edited body can clobber local edits.

### 6. Browser (non-Tauri) fallback stays HONEST

`loadOutdated()` is `invokeJson(["outdated","--json"])` under Tauri; in the browser it derives
from the lock fixtures, marking rows `current` and (at most) synthesising one or two clearly
comment-labelled demo `stale` rows. The fallback never fabricates network truth.

## Consequences

**Positive**

- The SOURCE column becomes a single, legible provenance + freshness surface: origin stays
  visible, click-through reaches the upstream, and staleness rides alongside without hiding the
  repo identity.
- Entirely deterministic (ADR-0007): every badge is a `skl outdated` fact, every action a
  `skl update` fact; no AI-as-fact creeps into the column.
- Cheap relative to prior art: SHA compare via `git ls-remote` beats cc-switch's re-zip, and
  reuses the lockfile + `installedHash` machinery skillshelf already owns.
- ADR-0004 is honored end-to-end: linked/local entries are never updated, gated in both the UI
  and the engine.

**Negative / cost**

- One engine touch (`channel` on `ls --json`) plus new UI loaders/queries/schemas. The
  `OutdatedSchema` must carry the full five-value enum even though a run shows a subset, or
  validation rejects otherwise-valid payloads.
- Manual check is a deliberate UX cost: the user must press "Check updates" to see staleness;
  the column is identity-only until then. Accepted as the rate-limit-honest tradeoff for v1
  (auto-poll deferred).
- **No retro-attribution** (the one gap vs cc-switch): externally-installed skills with no
  lockfile entry show as `local` with no origin and no update path until brought under
  provenance. Deferred.
- Deep links (ref/subpath) are deferred; click-through reaches only the repo root for v1.
