# 11. Adopt provenance for skills already in the library (`track`/`untrack`/`migrate`)

Date: 2026-06-15

## Status

Accepted. Extends the provenance layer (ADR-0009's update-aware source column, the
`shelf.lock.json` baseline-hash model) and the inverse/edit verb family (ADR-0005) to the
one lifecycle they did not cover: a skill that is ALREADY on disk but carries no lockfile
entry — installed by hand, by another tool, or before tracking existed.

## Context

`skl add` is the only way to get a `shelf.lock.json` entry, and it always DOWNLOADS:
clone, copy, record. But a large class of skills are already in the library with no
provenance — vendored by another CLI (e.g. `~/.agents/.skill-lock.json`), copied in by
hand, or imported as the user's own before they had an upstream. For these, `add` is the
wrong tool twice over: it would re-fetch content the user already has (wasteful, and it
can overwrite local edits), and there was simply no verb to say "this skill I already own
came from *there*" without moving bytes.

This collides with two of skillshelf's load-bearing ethics:

- **Never lie about state.** If we attach a source + ref by *guessing* the upstream
  baseline, `outdated` would render a confident "current"/"stale" verdict off a baseline
  we never verified — a fabricated fact.
- **Never destroy user content.** A naive "adopt then update" could silently clobber a
  locally-edited body against an upstream we hadn't actually compared it to.

A vendor lock makes the trap concrete. Its `skillFolderHash` is a GitHub *tree* SHA, not
skl's body `sha256`; its `ref` is a *branch* name, not a commit. Reusing either would
write a plausible-looking but **wrong** baseline into `shelf.lock.json`.

## Decision

1. **`skl track <name> --source <src>`** attaches a lockfile entry to an OWNED library
   skill the user already has, computing the baseline `installedHash` from the LOCAL
   SKILL.md body — **no network, no download**. The entry is marked **`adopted: true`**
   (new optional `LockEntry` field): provenance is known, but the upstream baseline was
   never verified. Guards refuse-by-default (the ADR-0005 pattern): not in the library →
   point at `import`/`add`; LINKED entry → refuse (ADR-0004: the dev repo owns
   versioning); existing entry → refuse without `--force`; a source that does not
   round-trip through `parseStoredSource` → refuse. `--ref <r>` lets the user ASSERT the
   exact commit (sets `adopted: false` — they are vouching). `--resolve` best-effort pins
   the real ref via the existing `latestRef`, and fetches JUST the upstream `SKILL.md`
   (single file, never a clone) to compare: identical → graduate (`adopted: false`);
   differ → keep adopted but set `localEdits` so `update` won't clobber; not cheaply
   fetchable → degrade to ref-only, stay adopted.

2. **`skl untrack <name>`** removes the entry — idempotent (absent → no-op, like `drop`).
   Completes the inverse pair (ADR-0005).

3. **`skl migrate [--from <path>]`** is a thin bulk adapter over `track`: read a VENDOR
   lock (default `~/.agents/.skill-lock.json`, detected by signature), map each entry to
   an skl source (`github`/`git` only; `local`/`well-known` are not trackable), and call
   the same `trackOne` logic for skills ALREADY in the library. Skills NOT in the library
   are **reported only** (with the `skl add <src>` line) — migrate NEVER installs. The
   vendor `skillFolderHash`/`ref` are deliberately NOT propagated.

4. **`adopted` flows conservatively through the read/write layer:**
   - `outdated`: an adopted entry reports a new **`adopted`** status
     ("provenance adopted; baseline unverified — run `skl update` to reconcile"); it is
     never network-probed off its empty ref, so it can't be mislabeled stale/current.
   - `update`: an adopted entry takes a conservative path — always fetch upstream and
     show the diff; an identical body graduates losslessly, a differing body requires
     `--force`. A successful reconcile clears `adopted`, pins the real ref, records a
     freshly-verified `installedHash`, and clears `localEdits` — the entry "graduates" to
     a normal tracked entry.

## Consequences

**Positive**

- The "I already have it, just record where it's from" lifecycle completes through `skl`
  alone — no hand-edited `shelf.lock.json`, no wasteful re-download, no clobbered edits.
- `adopted` makes the unverified state *honest and visible* rather than a silent guess;
  the first `update` is the single, explicit moment a baseline becomes real.
- `migrate` adopts a whole vendor library in one pass while refusing to fabricate skl
  hashes from foreign ones.

**Negative / cost**

- A third provenance state (`adopted`) for `outdated`/`update` to special-case, plus three
  new verbs to keep consistent and tested.
- `--resolve`'s single-file body compare is github-only (raw `gh api` contents); `git`
  and registry sources degrade to ref-only (a portable remote single-file fetch is not
  cheap), so they stay `adopted` until the first `update`.
- `adopted` is an optional field: pre-existing lockfiles read back as non-adopted
  (verified) — correct, since they were written by `add`/`update`, which DO verify.

## Deferred

- A portable single-file fetch for `git:`/registry `--resolve` (e.g. `git archive`
  against remotes that support it) to verify those baselines without a clone.
- Detecting additional vendor lock formats beyond the `{version:3, skills:{…}}` +
  `skillFolderHash` signature.
