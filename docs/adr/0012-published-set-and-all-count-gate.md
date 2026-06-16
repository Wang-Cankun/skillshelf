# 12. `skl add --all` installs the *published set*: manifest allowlist + a count gate

Date: 2026-06-16

## Status

Accepted. **Amends [ADR-0006](0006-repo-wide-add.md) §6**, which deferred
`.claude-plugin` manifest handling ("Honor it opportunistically for discovery if trivial; never
gate on it"). This ADR reverses that for the *meaning of `--all`*: a manifest, when present, now
**bounds** the set `--all` installs.

## Context

Dogfooding `skl add` against [`github.com/mattpocock/skills`](https://github.com/mattpocock/skills)
exposed two frictions in the repo-wide install path:

1. **`--all` installs more than the repo publishes.** The repo lays skills out as
   `skills/<category>/<name>/SKILL.md` across six folders — `engineering` (10), `productivity` (5),
   `deprecated` (4), `in-progress` (4), `misc` (4), `personal` (2) = **29**. The catalog depth-2 walk
   (ADR-0006 §3) sweeps **all 29**, including `deprecated/` ("skills I no longer use") and
   `in-progress/`. But the repo's `.claude-plugin/plugin.json` declares a `skills` array of exactly
   **15** (the `engineering` + `productivity` folders) — the author's own statement of what the
   plugin *publishes*. skl ignored that file, so "all" meant "every `SKILL.md` on disk," not "every
   skill the author published."

2. **A large repo has unbounded blast radius.** `--all` against an `awesome-skills`-scale repo writes
   hundreds of library entries (+ lockfile entries) from one command, with no confirmation.

### Source study: vercel-labs/skills does NOT solve (1) the way we assumed

We examined `vercel-labs/skills` (`src/plugin-manifest.ts`, `src/skills.ts`) expecting it to filter
discovery by the manifest. It does not:

- **The manifest only *adds* and *labels*, never *subtracts*.** `getPluginSkillPaths` unions
  manifest-declared dirs with the always-scanned `skills/` family; `getPluginGroupings` attaches a
  `pluginName` purely so the **interactive picker** can render "Mattpocock Skills" vs "Other"
  headings. Both groups are discovered and selectable. `npx skills add mattpocock/skills --all` would
  install **all 29** — deprecated included.
- **The ecosystem's actual machine-signal for "hide from `--all`" is per-skill frontmatter
  `metadata.internal: true`** (`parseSkillMd` drops it unless `INSTALL_INTERNAL_SKILLS=1` or the
  skill is named explicitly). mattpocock's deprecated/in-progress skills **do not set it** — their
  frontmatter is bare `name` + `description`. The `deprecated/` folder is a private human convention,
  absent from his `CONTEXT.md` and unreadable by any tool except as "a folder name, and not in
  `plugin.json`."

So in this repo the **only** machine-readable signal separating the 15 from the 29 is *listed in the
plugin manifest vs not*. Honoring it as an **allowlist** is therefore a deliberate, *stricter*
divergence from vercel (grouping-only), not a port of it.

We also rejected a **folder-name blocklist** (`deprecated`, `wip`, `draft`, …) as the no-manifest
fallback: it is a fragile heuristic (misses `old/`, `attic/`, `v1/`; false-positives a real folder
named `draft/`) and does nothing for friction (2) — a repo of 200 *legit* skills. A **count gate** is
honest about what it does (bounds blast radius) and needs no taxonomy of folder names.

## Decision

Define the **published set** and make `--all` install exactly it, behind a uniform count gate.

1. **Published set** = the set `--all` installs, computed at discovery time:
   - If a `.claude-plugin/plugin.json` (single-plugin) or `marketplace.json` (multi-plugin; union of
     all plugins' `skills`) is present → the published set is *the discovered skills whose dir is
     listed in the manifest*. Manifest entries are an **allowlist**, not a source of existence:
     a listed path that has no valid `SKILL.md` contributes nothing; discovery remains the source of
     truth for what exists. Manifest paths are containment-checked (must stay inside the checkout),
     reusing the discovery containment guards (ADR-0006 security hardening).
   - If **no** manifest is present → the published set is **every** discovered skill (today's set).
   - In **both** cases, any skill with frontmatter `metadata.internal: true` is **excluded** from the
     published set (ecosystem-aligned; always on). It remains installable when named explicitly.

2. **`--all` installs the published set.** A skill that is discovered but *not* published
   (unlisted-by-manifest, or `internal`) installs **only** via explicit `--skill <name>`. There is no
   bulk "install the unpublished too" path — naming is the intent gate (we deliberately drop the
   `--include-unpublished` escape hatch as unneeded surface).

3. **Count gate (uniform).** If the resolved `--all` published set has **> 15** skills, `add` refuses
   and prints what it would have installed, pointing at `--skill`/`--list`/`--yes`. The threshold is
   on the *final* selected count regardless of how it was derived (manifest or full discovery), since
   the gate is about blast radius, not provenance. **Bypasses:** a new **`--yes`** flag
   (`--all --yes` = "install them all, I know the count"); explicit **`--skill a,b,…`** is *never*
   gated (you named them). `--list` and `--dry-run` are never gated (they don't write).

4. **`--list` shows the full discovered set, marked `published` / `unpublished`** (and `internal`),
   so excluded skills stay *visible* even though `--all` skips them. `--dry-run` is unchanged (drift
   preflight over the set it would install).

`--yes` is distinct from the existing `--force` (which means "overwrite a body that differs from
upstream", ADR-0006 §5) — different axis; an `--all` over a large repo with local edits could need
both.

## Consequences

**Positive**
- `skl add <repo> --all` installs what the author *publishes* (mattpocock → 15, not 29); deprecated
  and work-in-progress no longer leak into a one-shot install.
- The count gate bounds the awesome-skills case honestly, without guessing folder semantics, and
  stays non-interactive / agent-friendly (refuse + `--yes`, no TUI).
- `--list`'s `published`/`unpublished` marker keeps the full repo discoverable; nothing is hidden,
  only un-defaulted.

**Negative / cost**
- A manifest that *under-lists* (omits a skill the author actually ships) makes that skill reachable
  only by name. Mitigated by `--list` (it still shows, marked `unpublished`).
- Allowlist semantics **diverge from vercel** (grouping-only): a user who expects `npx skills`
  parity will get a smaller `--all`. Documented as intentional.
- One more flag (`--yes`) and a discovery-time manifest read + per-skill `internal` check to test
  (published vs unpublished, manifest present/absent, marketplace union, count gate at the 15
  boundary, `--skill` bypass, `--list` markers).

**Deferred**
- Interactive multi-select (vercel's TUI). Considered and set aside: it papers over friction (1)
  (you'd hand-uncheck what the manifest already declares unpublished) and pulls skl off its
  non-interactive spine. The flag path (`--list` → `--skill`/`--all`) stays the human and agent
  workflow.
- Honoring `metadata.internal`'s `INSTALL_INTERNAL_SKILLS=1` env override — skl uses explicit
  `--skill <name>` for the same intent; no env knob for now.
- `marketplace.json` plugin `source` / `pluginRoot` resolution. We honor each plugin's `skills`
  array relative to the checkout root only; a plugin that relocates its skills via `source` (another
  repo/subdir) won't have those entries match a discovered dir, so they stay unpublished. Ignoring
  `source` is the safe direction (it can't point discovery outside the checkout); resolving it would
  need its own containment guard.

## Implementation checklist (for the build session)

- `src/core/fetch.ts`: read `.claude-plugin/plugin.json` / `marketplace.json` during/after
  `discoverSkills` (containment-checked); tag each `DiscoveredSkill` with `published: boolean`
  (listed-by-manifest-or-no-manifest **and** not `internal`) and surface `internal`. Keep discovery
  itself unchanged (still finds all 29).
- `src/commands/add.ts`: `--all` filters to `published`; add `--yes`; enforce the `> 15` gate on the
  resolved `--all` set (skip when `--skill`, `--list`, `--dry-run`); `reportList` prints the
  `published`/`unpublished` marker. `--skill <name>` resolves against the full discovered set
  (can name an unpublished/internal skill) and bypasses the gate.
- Tests: a fixture repo with a `.claude-plugin/plugin.json` allowlisting a subset + a `deprecated/`
  folder + one `metadata.internal` skill; assert `--all` = published set, `--skill` reaches an
  unpublished one, the count gate trips > 15 and `--yes` bypasses, `--list` markers, no-manifest repo
  installs all (today's behavior) under the gate.
- Docs: README `add` row (`--yes`, published-set semantics), ARCHITECTURE §4, CHANGELOG
  `[Unreleased]`, and the `CONTEXT.md` **Published set** term.
