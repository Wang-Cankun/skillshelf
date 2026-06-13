# 3. Skills are agent-agnostic; deployment surfaces are a known set

Date: 2026-06-13

## Status

Accepted. Extends the model from "a Claude Code skill manager" to an **agent-agnostic skill
library** serving Claude Code, Codex, Cursor, OpenCode, and other agents. Does not reverse
[ADR-0001](0001-domain-is-tags-not-folders.md) (domain is tags, not folders) or
[ADR-0002](0002-central-taxonomy-not-sidecars.md) (central taxonomy, not per-skill sidecars); it
generalizes *what they organize* from one agent to many.

## Context

### The founding problem, restated

skillshelf exists because skills sprawl: you accumulate many of them, and **different tools each
scatter copies or symlinks into their own directories** that nobody can track or remember. The
library was meant to be the single canonical source that ends that sprawl. But until now the tool
could neither *see* the cross-tool sprawl nor *deploy* anywhere but Claude — so it only half-served
its own reason to exist.

### What was already agent-neutral vs. Claude-locked

Auditing the codebase split cleanly along a **read vs. write** line:

- **Read side (discovery) — already agnostic.** The library plus *arbitrary roots* never cared
  which agent a skill was for. `scan`, `where`, and `import` operate over any directory, which is
  precisely why pointing them at Codex's `~/.codex/skills` "just works" via
  `skl scan --add-root`. The only Claude-ism was cosmetic: `crawl.ts`'s `ALLOW_DOT` let descent
  pass through `.claude` / `.agents` grouping dirs but not `.codex` (this only matters when
  crawling a *parent* like `~`; an explicit root is never filtered).

- **Write side (deployment) — hard Claude lock.** Every deploy path is wired to `.claude/skills`:
  - `config.ts` — global-core target defaults to `~/.claude/skills`.
  - `use.ts` / `drop.ts` / `status.ts` — target `./.claude/skills` (cwd-relative, **no override
    flag**).
  - `init.ts` — links the `global-core` bundle into `~/.claude/skills`.

  There is no way to deploy a skill (or bundle) into a Codex or any non-Claude surface today.

- **Docs** — framed Claude-Code-first (README opening; ARCHITECTURE), although `ARCHITECTURE.md`
  already hedged *"Claude Code and compatible agents"* — the intent was present but unfinished.

### Evidence: the sprawl is real and was invisible

A read-only inventory across the machine's skill directories (Claude global, two Obsidian vaults,
Codex, Cursor) found, against ~116 library skills, **dozens of entries in a non-clean deployed
state that nothing was tracking**, e.g.:

- real **copies in `~/.codex/skills` and `~/.cursor/skills` never imported** into the library
  (`agents-sdk`, `cloudflare`, `wrangler`, `web-perf`, …) — independent copies that can silently
  drift from any canonical version;
- a **dead symlink** (`diagnose`) in `~/.claude/skills`;
- **14 `horizon-niw*` skills symlinked to a *second source*** (`Obsidian/Case/tools/...`) rather
  than the library — two sources of truth for the same skill;
- assorted **stray real copies** (`infocard-skills`, `omc-learned`).

None of this was surfaceable before: `skl status` only inspects the current project's
`./.claude/skills`, and `skl scan` is root-centric (per-root candidate counts). Nothing answered
the actual question — *"where is skill X deployed across everything, and what's a mess?"* The
`skl where` command (added alongside this ADR) is that skill-centric, computed-from-reality view;
making it span agents is what forced this decision.

### Ecosystem context: `vercel-labs/skills`

While scoping this, we examined the emerging standard, **`vercel-labs/skills`** — "the CLI for the
open agent skills ecosystem," Vercel-backed, advertising support for **~70 agents** (Claude Code,
Codex, OpenCode, Cursor, …). Its design is directly informative:

- **Surface convention.** Project scope = `./<agent>/skills`, global scope = `~/<agent>/skills`,
  selected with `--agent <id>` where ids are `claude-code`, `codex`, `opencode`, `cursor`, etc.
  This is exactly the "agent surface = a dir an agent reads skills from" model, with a naming
  convention we can align to instead of inventing our own.
- **Install method.** Default is **symlink to a single canonical copy** ("single source of truth,
  easy updates"); `--copy` for when symlinks aren't supported. This validates skillshelf's
  library-and-symlink core *and* is the same answer to the cloud-synced-dir problem (use a copy
  when a symlink can't travel to another machine).
- **Verb set.** `add` / `use` / `list` / `find` / `remove` / `update` / `init` — close to
  skillshelf's own.

The crucial distinction is **scope of purpose**:

| | `vercel-labs/skills` | `skillshelf` |
|---|---|---|
| Role | **Installer** — pull skills from a repo/registry and deploy them to agent dirs | **Curator** — organize, audit, and consolidate the skills you already have |
| Source of skills | remote repos (GitHub/GitLab/git/local), `npx skills add owner/repo` | a single local canonical **library** you build up |
| Organization | flat install per agent | **domains / taxonomy / bundles** (ADR-0001/0002) |
| Cross-agent visibility | install-time selection | **`skl where`** — a live deployment map with drift / 2nd-source / dead-link detection |
| Consolidation of existing mess | — | `scan` / `dedupe` / `import` / `link` |
| Agent coverage | ~70-agent registry | the few you use, via a small surface seed |

They are **complementary**: the ecosystem CLI is great at *getting* skills onto a machine;
skillshelf is about *making sense of and maintaining* what's there. The strategic call is therefore
to **align to the ecosystem convention and interoperate, not to re-implement the installer or chase
a 70-agent registry.**

## Decision

1. **The library is the single, agent-neutral source of truth.** Nothing about a skill is tied to
   one agent; an agent is only a *destination*.

2. **Discovery is agent-agnostic.** Roots remain arbitrary. Crawl descends through the known agent
   grouping dot-dirs — `.claude`, `.agents`, `.codex`, `.opencode`, `.cursor` (`crawl.ts`
   `ALLOW_DOT`) — so scanning a project *parent* finds every agent's skills, while still skipping
   junk/backup dot-dirs.

3. **Introduce an agent-surface registry seed** (`src/core/surfaces.ts`). It maps the well-known
   **global** agent skill dirs to the ecosystem's `~/<agent>/skills` convention and agent ids
   (`claude-code`, `codex`, `opencode`, `cursor`). `skl where` unions these into the surfaces it
   scans (on top of configured roots + the global-core target), so cross-agent sprawl — Codex and
   Cursor copies, etc. — shows up **without** manual `skl scan --add-root`. Surfaces are
   realpath-de-duplicated and missing dirs are skipped.

4. **Reposition the docs** from "Claude Code skill manager" to "**agent-agnostic**: Claude Code,
   Codex, and compatible agents," explicitly noting that skillshelf is the curation/visibility
   layer *over* (and interoperable with) the standard agent dirs.

5. **Defer the deploy-side generalization** to a later ADR/step (see Alternatives). The hardcoded
   `~/.claude/skills` and `./.claude/skills` write targets remain for now; replacing them with a
   chosen surface (`skl use --agent <id>` / `--global`, with `--copy` for unsyncable targets,
   matching the ecosystem flags) is acknowledged as the direction but is **out of scope here**.

## Alternatives considered

- **Build the full agent-surface registry now** (config-level: every agent → its project & global
  dir patterns, auto-included by scan/where). Rejected for *this* step as too large; the hardcoded
  seed in `surfaces.ts` covers the common global dirs and is explicitly the thing to grow into a
  real registry.

- **Generalize the deploy side now** (`skl use --agent codex`, `skl deploy <surface>`, retire the
  hardcoded `~/.claude` paths, make `global-core` a per-surface deployment). This is the eventual
  goal but is the heaviest change and touches the write path that real workflows depend on; doing
  it without first *seeing* the cross-agent reality (which `skl where` now provides) would be
  premature. Deferred deliberately.

- **Retire `global-core` as a domain tag** in favor of a deployment concept. Related but orthogonal
  to agent-agnosticism; left undecided here to keep this ADR focused.

- **Solve cloud-synced portability** (Obsidian-in-Dropbox symlinks use absolute local targets that
  break on another machine; a copy would be needed but reintroduces drift). This is a property of
  the *deploy* step and is deferred with it; the `vercel-labs/skills` symlink-vs-`--copy` split is
  the likely template.

## Consequences

**Positive**

- `skl where` now maps deployments across **every agent on the machine**, surfacing untracked
  copies, drift, second sources, and dead links that were previously invisible (it immediately
  exposed the Codex/Cursor cloudflare copies and the `horizon-niw` second source).
- The surface convention is **borrowed, not invented**, keeping skillshelf interoperable with
  `vercel-labs/skills` and anything else that reads/writes the same `<agent>/skills` dirs.
- A clear division of labor crystallizes: the ecosystem CLI *installs* from registries; skillshelf
  *curates, organizes, and audits* what is deployed — its durable differentiator.

**Negative / cost**

- The deploy side is **still Claude-only** for now — a known, documented gap, not a hidden one.
  Deploying into a Codex/Cursor surface still means a manual `skl link --at <path>`.
- `surfaces.ts` is a **hardcoded list**, not yet a real per-agent registry with project-scope
  patterns; it covers the common global dirs and is the seed to grow.
- **Cross-machine portability** of cloud-synced symlinks (Obsidian/Dropbox) remains unsolved here;
  the copy-vs-symlink decision rides along with the deferred deploy step.
