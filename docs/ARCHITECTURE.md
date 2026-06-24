# skillshelf — Architecture

> Agent-agnostic skill registry + manager — Claude Code, Codex, Cursor, and compatible agents
> ([ADR-0003](adr/0003-agent-agnostic-surfaces.md)). The library is a neutral source; each agent
> is just a deployment surface (`~/<agent>/skills`). CLI package: `skillshelf` · bin: `skl` ·
> run via `bunx skillshelf`.

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

### Entry modes — owned vs linked (the bookshelf)
The library is a *shelf*, and an entry comes in two modes ([ADR-0004](adr/0004-owned-vs-linked-entries.md)):
- **OWNED** — the library holds the real bytes; the library is canonical. The default for
  third-party downloads (`skl add`) and your own skills adopted with `skl import`, plus skills
  you've stabilized. `skl update` tracks an OWNED skill's upstream.
- **LINKED** — `library/<name>` is a *symlink to an external dev repo* that stays canonical. The
  right mode for skills you actively develop in their own git (e.g. `claim-log`, skillshelf itself):
  editing the repo is editing the deployed skill, with zero drift and no copy to keep in sync.
  Register one with `skl link --from <dev-repo>`.
- **Mode is derived from reality, never stored.** `entryMode(library, name)` resolves the realpath
  of `library/<name>`: a symlink landing outside the library is LINKED, anything else is OWNED. It
  can't go stale because nothing persists it. This drives two behaviours: `skl where` reports a
  LINKED entry's dev repo as a clean `✓ source` (not a redundant copy), and `skl update`/`outdated`
  **skip** LINKED entries — following the symlink to re-pull a github body would clobber the dev
  repo. The lifecycle is *develop as LINKED → `skl import --copy` to freeze to OWNED when stable*.

### Taxonomy — domain is tags, not folders
- Domain membership lives **entirely in tags** (e.g. `domains: [coding, data]`), not in the
  on-disk layout. See [ADR-0001](../adr/0001-domain-is-tags-not-folders.md) for the decision
  and its rationale. Cross-domain membership is expressed honestly rather than forced into a
  single folder.
- **`primaryDomain` is derived, not folder-derived.** It is defined as `domains[0]` (the first
  effective domain after taxonomy merge), or `null` if a skill has no domains — a view over the
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

### Tag/body separation (the critical piece) — uniform for all skills
- `SKILL.md` body = pristine, replaceable (the upstream layer).
- Domain tags, bundle membership, and notes live in the **central `<library>/taxonomy.json`**
  ([ADR-0002](../adr/0002-central-taxonomy-not-sidecars.md)) — never inside the skill dir.
- **Effective skill = body + central taxonomy**, merged at `show` / `use` / load time.
- This lets `skl update` swap the upstream body cleanly while your tags survive — they were never
  in the file being replaced. (Replaces the earlier per-skill `<skill>.shelf.json` overlay sidecars.)

### Three-way update (no clobbering)

LINKED entries (§2) are skipped outright — their own git owns versioning, and following the
symlink to re-pull a github body would clobber the dev repo. For OWNED skills, `skl update`
decides what to do by comparing three states, not two:

1. the **current local body** (hashed),
2. the **recorded `installedHash`** (the upstream body as it was at install/update time),
3. the **new upstream body** (hashed).

- `localHash == installedHash` → the user never hand-edited the body, so a normal
  upstream-moved-forward update is applied cleanly and your taxonomy tags are preserved.
- `localHash != installedHash` **and** local differs from upstream → genuine local edits are
  detected; skillshelf does **not** clobber them. It emits a unified diff for review and
  requires `--force` to overwrite.
- Legacy entries without `installedHash` fall back to the `localEdits` flag.

After a successful update, the lockfile records the new `ref` and a fresh `installedHash`,
and clears `localEdits` (the on-disk body equals upstream again).

The verdict itself lives in one pure classifier — **`src/core/reconcile.ts`**
([ADR-0014](../adr/0014-deep-core-modules-reconcile-agent-matrix-vendor-report.md)) — shared by
`update`, `outdated`, and `add` so the rule can never drift between them. It exposes two **separately
named facts**: `editedSinceInstall` (offline — local vs the install baseline) and `differsFromUpstream`
(online, nullable — local vs current upstream). `update`'s never-clobber gate is the **AND** of both;
`outdated --check-local` uses only the first (it has no upstream in view). This is why `update` and
offline `outdated` can legitimately disagree on the *same* on-disk skill — the convergent-edit case (you
hand-edit a body to exactly what upstream independently moved to) is `editedSinceInstall && !differsFromUpstream`,
which `update` re-pulls safely but offline `outdated` still reports as edited. Each command projects the
shared verdict onto its own unchanged public enum.

### Repo-wide install — one repo, one clone ([ADR-0006](../adr/0006-repo-wide-add.md))

A single GitHub repo often ships *many* skills (e.g. `skills/<name>/SKILL.md` ×21). `skl add`
installs a whole repo, or a chosen subset, in **one clone**:

- `skl add <repo> --list` — discover every skill (convention walk: flat `skills/<name>`, catalog
  `skills/<cat>/<name>`, recursive fallback) and print them; no writes. Replaces a hand-rolled
  `gh api .../git/trees` + parse.
- `skl add <repo> --all` / `--skill <a,b>` — install all / a named subset. `fetchRepo` clones the
  repo **once**; `discoverSkills` finds every valid `SKILL.md` dir; the selected subset is copied
  out of the single staging checkout → **N installs, one network fetch** (never clone-per-skill).
  Each skill is its own lockfile entry — same `source`+`ref`, its own `@subpath` + `installedHash`
  (no schema change).
- **Published set + count gate** ([ADR-0012](../adr/0012-published-set-and-all-count-gate.md), which
  **amends ADR-0006 §6**: a manifest now *bounds* `--all`, no longer just opportunistic-for-discovery).
  `--all` installs the **published set**, not every `SKILL.md` on disk: when a `.claude-plugin/plugin.json`
  (or `marketplace.json`, union over plugins) is present, its `skills` array is an **allowlist** —
  discovery still finds all dirs, but `--all` keeps only the listed ones; with no manifest, the published
  set is every discovered skill (prior behaviour). In both cases a skill with frontmatter
  `metadata.internal: true` is excluded. A discovered-but-unpublished skill (unlisted, or `internal`)
  installs **only** via explicit `--skill <name>`. A **count gate** bounds blast radius: if the resolved
  `--all` set exceeds **15**, `add` refuses and prints what it would install, pointing at
  `--skill`/`--list`/`--yes`; the new **`--yes`** flag bypasses it (distinct from `--force`, which is the
  drift-overwrite axis). `--skill`, `--list`, and `--dry-run` are never gated (they name explicitly or
  don't write). `--list` marks each skill `published`/`unpublished` so excluded skills stay visible.
- `skl add <repo> --dry-run` — the **drift preflight**: per skill, classify the library destination
  as `new` / `identical` / `differs` (frontmatter-stripped body hash). A `differs` skill in `--all`
  is **skipped without `--force`** (never clobbered), and `add` never writes *through* a LINKED
  (symlink) entry into its dev repo. Replaces a hand-rolled `gh api … | base64 -d | diff`.

Single-skill `skl add <repo>/<path>` is unchanged. `add` stays a **librarian**: it writes only into
the library — no agent-dir writes / symlink fan-out (that is `skl use` / a future `skl deploy`,
[ADR-0003](../adr/0003-agent-agnostic-surfaces.md)) — and uses skillshelf's own `git clone`, never
`npx skills add` (kept only as the narrow registry-name fallback).

### Don't reinvent fetching
The download step is a commodity: `skl add` shells out to existing tooling / git. skillshelf's
value-add is **provenance + central taxonomy + AI inference + bundles** layered on top.

---

## 4. CLI surface (agent-first)

The CLI is designed to be called by an agent from inside Claude Code, with parseable output
(`--json` on every command). The surface splits into **forward** verbs (acquire/create/
deploy), a **read/diagnosis** layer, and the **inverse + fine-grained-edit** family
([ADR-0005](adr/0005-inverse-and-edit-verbs.md)) — the last added because an agent forced to
hand-`rm`/`mv`/`ln -s` to undo or tweak is the signal of a missing primitive.

**Forward — acquire / create:**

| Command | Purpose |
|---|---|
| `skl scan [roots…]` | Read-only discovery of skill candidates across roots (counts, duplicates, drift). `--add-root`/`--remove-root` mutate the registry; `skl roots` lists it. |
| `skl import <name> --from <path>` | Adopt one of your own skills into the library as an OWNED copy (move + symlink-back, or `--copy`). |
| `skl link [<name>] --from <dev-repo>` | Shelve a dev-repo skill as a LINKED entry (library symlinks to it). `--at <path>` instead collapses a stray copy into the library ([ADR-0004](adr/0004-owned-vs-linked-entries.md)). |
| `skl add <src>` | Install third-party skill(s) into the library, record provenance, AI-tag. Repo-wide via `--all`/`--skill`/`--list`/`--yes`/`--dry-run` — one repo, one clone ([ADR-0006](adr/0006-repo-wide-add.md)); `--all` installs the **published set** behind a count gate ([ADR-0012](adr/0012-published-set-and-all-count-gate.md)). |
| `skl new` | Scaffold a new skill into the library. |
| `skl init` | Initialize a library / global core. |

**Read / diagnosis:**

| Command | Purpose |
|---|---|
| `skl search <kw>` | Fuzzy search over name + description across the whole library. |
| `skl ls [bundle]` | List all skills, or one bundle (`--json` carries `mode`/`linkTarget`). |
| `skl show <name>` | Print the SKILL.md instruction layer; list reference-file paths. |
| `skl status` | Which bundles/skills are linked into the current project; flags unmanaged real copies. |
| `skl where [name]` | Deployment map across all agent surfaces; classifies copies/drift/2nd-sources/dead links. |
| `skl outdated` | Check upstream ref per tracked skill → mark stale; `--check-local` diffs locally, offline. |
| `skl index` | Regenerate `INDEX.md` (catalog grouped by domain). |
| `skl infer` | Re-run the AI taxonomy pass; propose domains/tags for approval. |

**Deploy + inverse / edit ([ADR-0005](adr/0005-inverse-and-edit-verbs.md)):**

| Command | Purpose |
|---|---|
| `skl use <bundle\|skill>` / `drop` | Symlink (or unlink) a bundle **or a single skill** into `./.claude/skills/`. |
| `skl refresh` | Re-sync this project's links to library reality (repoint stale, prune vanished). |
| `skl update [name]` | Re-pull the upstream body (OWNED only), preserve domain tags, diff if diverged. |
| `skl tag` / `untag` / `retag` | Deterministic single-item taxonomy edits (and a library-wide domain rename). |
| `skl rename <old> <new>` | Atomic slug rename (dir + frontmatter + taxonomy + lock). Alias `skl mv`. |
| `skl retire` / `unretire` / `rm` | Reversible removal lifecycle: soft-delete → restore → hard purge (guarded). |
| `skl where --prune` / `--fix` | Apply where's own remediation: prune dead links, dedupe identical copies (deterministic only). |

The inverse/edit verbs are transactional across the skill dir + `taxonomy.json` +
`shelf.lock.json` + `INDEX.md` (`core/lifecycle.ts`), reversible by default, and never
auto-resolve a decision that needs human judgment (a drifted copy stays `manual`).

Discovery surfaces: `skl search`, the generated **`INDEX.md`**, `skl ls`, `skl status`, and
`skl where`.

---

## 5. AI taxonomy — dual-mode, LLM-free core

`skl infer` re-runs the domain taxonomy over the library. Its deterministic core **never
calls an LLM**; the design separates corpus assembly and proposal application (pure,
testable) from the reasoning step (pluggable). It has three modes:

- **`--emit`** — assemble an inference corpus (skill names, descriptions, body previews) plus
  a JSON schema and an instruction, and print it to stdout so the **host agent** (Claude Code)
  can reason over it and produce a proposal file. No LLM call happens inside skillshelf.
- **`--apply <file.json>`** — read the agent's proposal JSON and write the proposed
  domains/tags into the central `<library>/taxonomy.json` (never the upstream `SKILL.md`).
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

**Deterministic error behaviour** (no network call):

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
     (that is `add`'s job). Domain tags are applied later via the central `taxonomy.json`
     ([ADR-0002](../adr/0002-central-taxonomy-not-sidecars.md)), never inside the skill dir, so
     tagging never clobbers the upstream `SKILL.md`.

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
| `/Volumes/External/Project/manuscripts/skills/` | `name/SKILL.md` | external drive, writing skills |
| `~/Documents/GitHub/writing-skills/skills/` | `skills/name/SKILL.md` | nature-* writing/figure set |
| `~/Documents/GitHub/everything-claude-code/skills/` | `skills/name/SKILL.md` | coding skills |
| `~/Documents/GitHub/infra-repo/.claude/skills/` | `+ .agents` mirror | cloud-cost |
| `~/Documents/GitHub/analysis-repo/.claude/skills/` | has `_retired/` | bioinfo, plus `_retired` subdir |
| `~/Documents/GitHub/claim-log/skill/` | `skill/name/SKILL.md` | claim log |

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
- **Deep core seams** ([ADR-0014](../adr/0014-deep-core-modules-reconcile-agent-matrix-vendor-report.md)):
  four modules hold the logic the commands used to duplicate inline. **`reconcile.ts`** — the pure verdict
  classifier (above). **`vendor.ts`** — the library *write* boundary (`installSkill`/`track`/`adopt` + the
  retired/safe-name/symlink guard suite, once); commands parse + print and never import one another, and
  `installSkill` calls `reconcile` for its drift verdict. **`agent-matrix.ts`** — the node-free
  surface→agent→scope fold shared by the engine and the app's browser fallback (the app imports it via a
  `@core` Vite alias; it must stay free of `node:` imports or the bundle breaks). **`report.ts`** — the
  display-only render seam (`CommandResult` → `render`), with the verdict→mark ladders as pure functions;
  JSON payloads move through it verbatim and exit codes stay in each command's `run()`. Adopted on
  `update`/`outdated`/`add`/`ls`; the rest keep the inline `--json` fork until later passes.
- **Output:** every command supports `--json` for agent consumption.
- **Library location:** resolved from `SKILLSHELF_LIBRARY` (used by the test fixtures and by
  any non-default install).
- **Taxonomy is authoritative for tags:** inference and bundle membership only ever write to
  the central `<library>/taxonomy.json` (see [ADR-0002](../adr/0002-central-taxonomy-not-sidecars.md)),
  never to the upstream `SKILL.md` body — which is what makes the three-way update safe. (This
  replaces the earlier per-skill `<skill>.shelf.json` overlay sidecars.)
