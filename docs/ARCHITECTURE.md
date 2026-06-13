# skillshelf — Architecture

> Agent-first skill registry + manager for Claude Code and compatible agents.
> CLI package: `skillshelf` · bin: `skl` · run via `bunx skillshelf`.

This document describes the design of skillshelf: a single, git-backed library that holds
all of an agent's skills, plus a CLI for organizing, loading, and installing them — without
paying the token cost of loading everything at once.

---

## 1. Motivation

Agent skills tend to scatter across many isolated directories: a primary
`~/.claude/skills`, notes/vault directories, and per-project `.claude` dirs across unrelated
fields. They are kept isolated to avoid token cost, but isolation causes four recurring
problems:

1. **Can't find / forgot it exists** — a skill is rewritten because nobody knew an
   equivalent already lived somewhere else.
2. **Duplicate & drift** — the same skill exists in N places with no canonical version.
3. **Wrong project, missing skill** — a skill needed here lives in another project's
   `.claude` dir.
4. **No overview** — there is no single inventory of everything owned.

The naive fix — dumping everything into `~/.claude/skills` — fails for two reasons:

- **All-at-once token weight** — loading hundreds of skill descriptions every session.
- **Browsing clutter** — a flat list of hundreds of unrelated skills is unusable.

Explicitly **out of scope:** smart trigger gating. The host agent's own skill selection is
trusted; the design only needs **domain partitioning + selective loading**, not a smarter
matcher.

---

## 2. Core design

### Canonical library
- A **dedicated git repo** is the single source of truth — a *passive shelf*.
- It is **not** `~/.claude/skills`; nothing in the library auto-loads. That is precisely what
  keeps the token cost down.
- **One copy per skill on disk**, in a **flat, non-semantic layout** (`library/<name>/`). The
  directory name carries no meaning — domain is never inferred from a parent folder. Symlinks
  are used for delivery, never to duplicate the underlying file.

### Taxonomy — domain is tags, not folders
- Domain membership lives **entirely in tags** (e.g. `domains: [coding, data]`), not in the
  on-disk layout. See [ADR-0001](../adr/0001-domain-is-tags-not-folders.md) for the decision
  and its rationale. Cross-domain membership is expressed honestly rather than forced into a
  single folder.
- **`primaryDomain` is derived, not folder-derived.** It is defined as `domains[0]` (the first
  effective domain after overlay merge), or `null` if a skill has no domains — a view over the
  tags, not a physical constraint.
- **Bundles are tag queries, not folders.** `skl use data` resolves every skill tagged
  `data`, regardless of where it sits on disk. A dual-use skill appears in both bundles from a
  single copy on disk.
- The taxonomy is **AI-inferred and re-runnable** (`skl infer`): cluster skills, propose the
  domain vocabulary (surfacing domains not previously thought of), assign primary + secondary
  tags, and flag ambiguous skills for human approval. It is never hand-maintained.

### Two-tier / hybrid delivery
- **Thin global core** — a small handful of universal skills (e.g. commit, memory, search)
  symlinked permanently into `~/.claude/skills`. These natively auto-trigger. The token cost
  is small and acceptable: *some* loaded is fine; *all-at-once* is the problem.
- **Domain bundles** — everything else, on-demand, with zero auto-load cost until invoked.

### Trigger bridge — a router meta-skill
- One tiny, always-loaded skill (on the order of a dozen lines) whose description lists the
  **domain menu** and instructs the agent: *"run `skl search <kw>` (or `skl use <bundle>`)
  to load specialized skills."*
- A few lines of always-on context buy discoverable access to the entire library.

### On-demand mechanics — two coexisting paths
- **`skl show <name>`** — prints only the **SKILL.md instruction layer** (the body), not the
  bundled reference files. Reference files stay on disk and their paths are listed for the
  agent to `Read` on demand. This is manual progressive disclosure: cheap by default, deep on
  demand. It works mid-task, with no reload and no persisted state.
- **`skl use <bundle>`** — symlinks a bundle into the current project's `./.claude/skills/`
  for native triggering. Use this to pin a bundle a project leans on repeatedly; reverse it
  with `skl drop`.

---

## 3. Package-manager layer (install + track third-party skills)

Skills are shared publicly (GitHub repos, registries). Naive "add" tooling only *vendors a
copy* and forgets where it came from. skillshelf adds real install/update tracking. The hard
part is **updates that don't clobber local changes** — because every installed skill becomes
a soft fork the moment local tags/bundles are added to it.

### Provenance lockfile (per skill)

A lockfile (`shelf.lock.json` at the library root) records, per installed skill:

```
name          — skill name
source        — e.g. github:owner/repo@path
ref           — installed commit SHA or version tag
channel       — github | registry | …
installedAt   — ISO-8601 timestamp
localEdits    — whether the upstream body diverged locally
installedHash — hash of the upstream SKILL.md body as recorded at install/update time
```

### Sidecar overlay (the critical piece) — uniform for all skills
- `upstream` body (`SKILL.md`) = pristine, replaceable.
- `<skill>.shelf.json` = *your* additions: domain tags, bundle membership, notes.
- **Effective skill = upstream + overlay**, merged at `show`/`use` time.
- This lets `skl update` swap the upstream body cleanly while the taxonomy survives.

### Three-way update (no clobbering)

`skl update` decides what to do by comparing three states, not two:

1. the **current local body** (hashed),
2. the **recorded `installedHash`** (the upstream body as it was at install/update time),
3. the **new upstream body** (hashed).

- `localHash == installedHash` → the user never hand-edited the body, so a normal
  upstream-moved-forward update is applied cleanly and the overlay is preserved.
- `localHash != installedHash` **and** local differs from upstream → genuine local edits are
  detected; skillshelf does **not** clobber them. It emits a unified diff for review and
  requires `--force` to overwrite.
- Legacy entries without `installedHash` fall back to the `localEdits` flag.

After a successful update, the lockfile records the new `ref` and a fresh `installedHash`,
and clears `localEdits` (the on-disk body equals upstream again).

### Don't reinvent fetching
The download step is a commodity: `skl add` shells out to existing tooling / git. skillshelf's
value-add is **provenance + overlay + AI taxonomy + bundles** layered on top.

---

## 4. CLI surface (agent-first)

The CLI is designed to be called by an agent from inside Claude Code, with parseable output
(`--json` on every command). Fifteen commands:

| Command | Purpose |
|---|---|
| `skl scan [roots…]` | Read-only discovery of skill candidates across roots (counts, duplicates, drift). |
| `skl import <name> --from <path>` | Adopt one of your own skills into the library (move + symlink-back, or `--copy`). |
| `skl search <kw>` | Fuzzy search over name + description across the whole library. |
| `skl ls [bundle]` | List all skills, or one bundle, with one-line descriptions. |
| `skl status` | Which bundles/skills are currently linked into the current project. |
| `skl show <name>` | Print the SKILL.md instruction layer; list reference-file paths. |
| `skl use <bundle>` | Symlink a bundle into `./.claude/skills/`. |
| `skl drop <bundle>` | Remove a bundle's symlinks. |
| `skl add <src>` | Install a third-party skill, record provenance, AI-tag it. |
| `skl outdated` | Check upstream commit/version per tracked skill → mark stale. |
| `skl update [name]` | Re-pull the upstream body, preserve the overlay, diff if diverged. |
| `skl init` | Initialize a library / global core. |
| `skl new` | Scaffold a new skill into the library. |
| `skl index` | Regenerate `INDEX.md` (catalog grouped by domain). |
| `skl infer` | Re-run the AI taxonomy pass; propose domains/tags for approval. |

Discovery surfaces: `skl search`, the generated **`INDEX.md`**, `skl ls`, and `skl status`.

---

## 5. AI taxonomy — dual-mode, LLM-free core

`skl infer` re-runs the domain taxonomy over the library. Its deterministic core **never
calls an LLM**; the design separates corpus assembly and proposal application (pure,
testable) from the reasoning step (pluggable). It has three modes:

- **`--emit`** — assemble an inference corpus (skill names, descriptions, body previews) plus
  a JSON schema and an instruction, and print it to stdout so the **host agent** (Claude Code)
  can reason over it and produce a proposal file. No LLM call happens inside skillshelf.
- **`--apply <file.json>`** — read the agent's proposal JSON and write the proposed
  domains/tags into each skill's `<name>.shelf.json` overlay (never the upstream `SKILL.md`).
  Assignments are unioned with existing tags, never destructive.
- **`--provider <name>` / API mode** — reuse the same corpus-build and proposal-apply
  functions to close the loop automatically against any OpenAI-compatible endpoint.

When no explicit mode is given, `infer` auto-detects: inside a Claude Code agent
(`$CLAUDECODE`) it defaults to `--emit` guidance; otherwise it errors clearly.

### LLM contract (API mode)

API mode is **provider-agnostic** and speaks the OpenAI chat-completions schema.

**Resolution order** (highest precedence first), independently for base URL, API key, and
model:

1. **CLI flags** — `--base-url`, `--model`, `--provider`.
2. **Environment variables** — `SKILLSHELF_LLM_*` primary, then `OPENAI_*` fallback.
3. **Optional dotenv file** at `$SKILLSHELF_ENV_FILE` (default `./.env` if it exists).

API mode is entered when either `--provider` or `--base-url` is given. (`--emit` and
`--apply` remain the other two mutually-exclusive modes.)

**CLI flags on `skl infer`:**

- `--provider <name>` — sugar that **only** sets a default base URL (the key still comes from
  the environment). Values: `openai | openrouter | groq | ollama | custom`.
- `--base-url <url>` — an explicit OpenAI-compatible base URL (overrides the provider preset);
  triggers API mode on its own.
- `--model <id>` — chat model id.

Full usage:

```
skl infer [--emit | --apply <file.json> | --provider <name>] \
          [--base-url <url>] [--model <id>] [--include-retired] [--json]
```

**Environment variables:**

| Variable | Meaning |
|---|---|
| `SKILLSHELF_LLM_BASE_URL` | base URL including `/v1` |
| `SKILLSHELF_LLM_API_KEY`  | bearer API key |
| `SKILLSHELF_LLM_MODEL`    | chat model id |
| `SKILLSHELF_ENV_FILE`     | path to a dotenv file (optional; default `./.env` if present) |
| `OPENAI_BASE_URL` / `OPENAI_API_KEY` / `OPENAI_MODEL` | conventional fallbacks |

**Defaults:** base URL `https://api.openai.com/v1`; model `gpt-4o-mini` (a placeholder,
documented as overridable via `--model` / `*_MODEL`).

**Provider presets** (base URL only; the API key always comes from env/dotenv):

| Provider | Base URL |
|---|---|
| `openai` | `https://api.openai.com/v1` |
| `openrouter` | `https://openrouter.ai/api/v1` |
| `groq` | `https://api.groq.com/openai/v1` |
| `ollama` | `http://localhost:11434/v1` |
| `custom` | resolved entirely from `--base-url` / `SKILLSHELF_LLM_BASE_URL` / `OPENAI_BASE_URL` |

**Endpoint:** `POST {base}/chat/completions`, OpenAI schema, `temperature: 0`,
`response_format: {type: "json_object"}` (strict JSON requested; falls back to
brace-extraction if the model wraps JSON in prose or fences).

**Deterministic error behavior** (no network call):

- No resolvable key →
  `missing API key. Set SKILLSHELF_LLM_API_KEY (or OPENAI_API_KEY) in the environment or a
  dotenv file ($SKILLSHELF_ENV_FILE, default ./.env).`
- Unknown `--provider` →
  `unknown provider "X". known: openai, openrouter, groq, ollama, custom`

**Dotenv parsing:** supports `KEY=value` and `export KEY=value`, strips surrounding single or
double quotes, ignores blank and `#`-comment lines, and never throws.

---

## 6. Migration

Consolidating scattered skills is **agent-orchestrated over deterministic primitives** — not
a single god-command. skillshelf ships small, predictable verbs (`scan`, `import`, `infer`);
the host agent supplies the judgment (which copy wins a drift, whether a candidate should move
or be copied, what to tag it). Each primitive does exactly one mechanical thing and reports
parseable output; nothing irreversible happens implicitly.

### The flow

1. **`skl scan [roots…]`** — *read-only discovery.* Crawls the configured roots (or the ones
   passed positionally), and reports every **candidate** (a discovered skill not yet in the
   library) with its location, plus duplicate and **drift** groups. It moves nothing and emits
   no inference payload. Roots are persisted in `config.json` and grown with
   `skl scan --add-root <path>`.

2. **Agent decides scope + drift winners.** From the scan report the agent (or human) makes
   the judgment calls the tool deliberately refuses to make: which candidates to adopt, and —
   when two same-named copies have diverged — which body is canonical. This reasoning step is
   intentionally outside the primitives.

3. **`skl import <name> --from <path>`** — *adopt one candidate.* Mechanical and deterministic:
   it **moves** the candidate dir to `library/<name>/` (flat layout, ADR-0001) and leaves a
   **symlink back** at the original path, so existing projects and tools keep resolving it. Run
   it once per chosen candidate. No domain is decided here — import is a thin move+symlink-back
   primitive, not a tagging step.
   - `--copy` copies instead of moving and leaves the original untouched — the right choice for
     skills that live inside a **project repo** you don't want to perforate with a symlink.
   - `--as <slug>` imports under a different library name; `--force` overwrites an existing
     same-named library skill (e.g. when the agent has picked the drift winner).
   - These are the user's **own** skills: `source` is `null` and no lockfile entry is written
     (that is `add`'s job). An empty overlay (`<name>.shelf.json`) is created so taxonomy can be
     applied later without clobbering the upstream `SKILL.md`.

4. **`skl infer`** — *tag the now-populated library* in one pass (see §5). Because the layout is
   flat and domain is tags-only, inference runs **after** import with no ordering paradox and no
   later reorg when a tag changes (ADR-0001).

So the end-to-end shape is **`scan` → (agent reasons) → `import` per candidate → `infer`** —
deterministic verbs on the outside, judgment in the middle.

### Crawl rules

The crawl behind `skl scan`:
- Dedupe by realpath (some roots are aliased mounts of the same directory — e.g.
  `~/Dropbox/...` and `~/Library/CloudStorage/Dropbox/...` resolve to one vault).
- Treat `.agents/skills` as bridge mirrors of `.claude/skills`; do not double-count.
- Skip `_retired/` (tag as retired; do not activate).
- Ignore any path containing `node_modules`.
- Support both `name/SKILL.md` and `skills/name/SKILL.md` layouts.

These rules were previously duplicated in a `DISCOVERED_ROOTS.local.md` scratchpad at the
skillshelf home root. That file was an orphan — no code read or wrote it — so the ADR-0002
migration deletes it and folds its content here (the single source of truth). For reference,
the live roots it documented and their layouts:

| Root | Layout | Notes |
|---|---|---|
| `~/.claude/skills/` | `name/SKILL.md` | main collection |
| `~/Dropbox/Obsidian/.agents/skills/` | `name/SKILL.md` | `.agents` bridge fmt; CloudStorage/Dropbox is an alias of the same vault (realpath-dedupe) |
| `/Volumes/Extreme/Project/BioGuider-writing/skills/` | `name/SKILL.md` | external drive, writing skills |
| `~/Documents/GitHub/nature-skills/skills/` | `skills/name/SKILL.md` | nature-* writing/figure set |
| `~/Documents/GitHub/everything-claude-code/skills/` | `skills/name/SKILL.md` | coding skills |
| `~/Documents/GitHub/BMI_infra/.claude/skills/` | `+ .agents` mirror | cloud-cost |
| `~/Documents/GitHub/sskind/.claude/skills/` | has `_retired/` | bioinfo, plus `_retired` subdir |
| `~/Documents/GitHub/cairn/skill/` | `skill/name/SKILL.md` | analysis claims |

Persisted scan roots live in `config.json` (machine-local, absolute paths). Each entry may be
a bare path string or an annotated `{path, layout?, notes?}` object; `layout`/`notes` are
informational only (crawl auto-detects layout — nothing consumes them programmatically).

---

## 7. Scope & decisions

- **Host scope:** Claude Code (and OpenAI-compatible inference for `infer`). Other agent
  hosts can be bridged later.
- **Build vs buy:** a thin, zero-runtime-dependency CLI; existing tooling / git is wrapped
  only for the commodity download step.
- **Symlink hygiene:** bundles symlinked into a project's `.claude/skills/` should be
  gitignored in that project so symlinks are never committed.

---

## 8. Implementation notes

- **Runtime:** Bun + TypeScript, **zero runtime dependencies** in the core.
- **Output:** every command supports `--json` for agent consumption.
- **Library location:** resolved from `SKILLSHELF_LIBRARY` (used by the test fixtures and by
  any non-default install).
- **Taxonomy is authoritative for tags:** inference and bundle membership only ever write to
  the central `<library>/taxonomy.json` (see [ADR-0002](../adr/0002-central-taxonomy-not-sidecars.md)),
  never to the upstream `SKILL.md` body — which is what makes the three-way update safe. (This
  replaces the earlier per-skill `<skill>.shelf.json` overlay sidecars.)
