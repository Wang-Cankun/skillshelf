# 6. `skl add` installs a whole repo (`--all` / `--skill` / `--list` / `--dry-run`), clone-once-copy-N

Date: 2026-06-13

## Status

Proposed (draft — not yet implemented). Captures the design in full so it can be built in a
later session with no prior context. Implements repo-wide install for `skl add`, informed by a
dogfood test against `github.com/dontbesilent2025/dbskill` and a source study of
[`vercel-labs/skills`](https://github.com/vercel-labs/skills).

## Context

### The trigger: a real multi-skill `add` forced a pile of ad-hoc code

Adopting the **dbs** skill suite (21 skills under `skills/dbs-*/SKILL.md` in one GitHub repo,
`dontbesilent2025/dbskill`) exposed that `skl add` installs **exactly one** skill per call
(`github:owner/repo[/path]`). To track all 21 with provenance (so `skl outdated`/`update` keep
them synced), the agent was forced to hand-write — the same "agent writes ad-hoc code = missing
primitive" signal that drove [ADR-0005](0005-inverse-and-edit-verbs.md):

| Ad-hoc code the agent was forced to write | The missing `skl add` primitive |
|---|---|
| `gh api .../git/trees/HEAD?recursive=1` + parse → list the repo's skills | `skl add <repo> --list` (discover, print, exit) |
| `gh api .../contents/<skill>/SKILL.md \| base64 -d` + `diff` vs the library copy → check it's lossless before `--force` | `skl add ... --dry-run` (preflight: which existing library skills would be overwritten, identical vs differs) |
| `comm` of repo-skill-list vs library-list → "what's here I don't have" | (falls out of `--list`/`--dry-run`) |
| a ~30-line bash loop: `git clone` once, then per-skill `skl add --force --no-infer` | `skl add <repo> --all` / `--skill <a,b,…>` |

Worse, the only non-loop alternative — calling `skl add` 21 times — **re-clones the whole repo
21 times** (each `add` clones into its own staging). The right shape is **clone once, copy N**.

The user's stated baseline is the ecosystem-standard one-liner
`npx -y skills add dontbesilent2025/dbskill -g --all` (vercel-labs/skills) — which does exactly
this. skillshelf has no equivalent.

### Source study: how `vercel-labs/skills` does repo-wide install

(`skills` npm pkg v1.5.11; key files `src/source-parser.ts`, `src/skills.ts`, `src/add.ts`,
`src/git.ts`, `src/blob.ts`, `src/agents.ts`, `src/skill-lock.ts`.)

- **Source parse** (`parseSource`): `owner/repo`, `owner/repo/subpath`, `owner/repo@skill-name`,
  `github:`/`gitlab:` prefixes, full tree URLs (extract `ref`+`subpath`), `git@`/`ssh`/`.git`,
  `#ref@skillFilter`, local paths. A **bare `owner/repo` installs MULTIPLE skills.**
- **`--all`** (`add.ts`): pure sugar — sets `skill=['*']`, `agent=['*']`, `yes=true`. `--skill
  '*'` selects every discovered skill; `--skill a b` filters by frontmatter `name`.
- **Discovery is convention-based, no manifest required** (`discoverSkills`): walk a fixed set of
  container dirs (`skills/`, `skills/.curated|.experimental|.system`, ~60 per-agent dirs), depth-1
  for flat `skills/<name>/SKILL.md`, depth-2 for catalog `skills/<cat>/<name>/SKILL.md`, with a
  depth-5 recursive fallback. A skill = any dir whose `SKILL.md` frontmatter has `name`+`description`.
  `.claude-plugin/*` is honored if present but **never required**.
- **Install = clone-once-copy-N**: allow-listed owners use a blob/Trees-API fast-path; everything
  else does **one** `git clone --depth 1` of the whole repo into a tempdir, then copies out the N
  selected skill dirs.
- **Then it symlink-fans-out into agent dirs** (`installer.ts` + `agents.ts`): writes the skill once
  to a canonical `~/.agents/skills/<name>` and symlinks each selected agent's dir (`~/.claude/skills`,
  `~/.codex/skills`, …) to it. Two lockfiles (`~/.agents/.skill-lock.json`, project `local-lock.json`)
  keyed by a `skillFolderHash`.

### The model line we must NOT cross

vercel's `add` **is an installer into agent dirs** (source → live agent dirs, symlink fan-out).
skillshelf's `add` is a **librarian**: source → a neutral `~/.skillshelf/library/` that nothing
auto-loads; *which* agent dirs get a skill is a separate concern (`skl use` for a project today;
a future `skl deploy` for global, per [ADR-0003](0003-agent-agnostic-surfaces.md)). This split is
skillshelf's founding value: `add` everything to a passive shelf (zero load cost), `use`/`deploy`
only what a project needs (bounded cost), `skl where` audits the fan-out. Collapsing `add` into
vercel's install-into-every-agent-dir would re-create the all-at-once token cost skillshelf exists
to kill.

### Where skillshelf is today (`src/commands/add.ts`, `src/core/fetch.ts`, `src/core/provenance.ts`)

- `add.ts` parses `github:owner/repo[/path]` (also `git:`/`file:`/local, and a `vercel-registry`
  bare-name fallback), calls `fetchSource()`, copies the **single** located skill into
  `<library>/<name>`, and writes **one** `shelf.lock.json` entry via `recordEntry()`
  (`{name, source, ref, channel, installedAt, installedHash, localEdits}`).
- `fetch.ts`: `fetchGithub()` git-clones the repo into staging; `locateSkillDir()` resolves
  **exactly one** skill dir (the subpath, or a single discovered one — ambiguity is an error);
  `fetchRegistry()` already **shells out to `skills add <name>`** as the registry-name fallback,
  then re-locates the skill in staging.
- Provenance/lockfile is the existing machinery; the taxonomy stays separate (`--no-infer` keeps
  existing tags; ADR-0002). LINKED-skip + offline `--check-local` already exist (ADR-0004 / 0005).

## Decision

Extend `skl add` to install **a whole repo or a selected subset in one clone**, on skillshelf's
**own** fetch path (no `npx` dependency), keeping `add` strictly a librarian (no agent-dir writes).

### 1. New CLI surface (additive — single-skill behavior unchanged)

```
skl add <src> [--all] [--skill <name[,name…]>] [--list] [--dry-run]
              [--domain <d>] [--no-infer] [--force] [--json]
```

- **bare repo `github:owner/repo`** → discover every skill in the repo (convention walk). If exactly
  one, install it (today's behavior). If several and neither `--all`/`--skill`/`--list` given →
  **error listing them** and pointing at `--all`/`--skill`/`--list` (never silently pick one).
- **`--list`** → print discovered skills (name · description · repo subpath · already-in-library?)
  and exit 0. No clone-side writes. The first-class replacement for the `gh api trees` + parse hack.
- **`--all`** → install every discovered skill.
- **`--skill a,b`** (repeatable or comma-list) → install only those (matched by frontmatter `name`).
- **`--dry-run`** → run discovery + the per-skill **drift preflight** and report what *would* happen
  (install-new / overwrite-identical / overwrite-DIFFERS-needs-force), then exit without writing.
  The first-class replacement for the `gh api contents | base64 -d | diff` hack.
- **`--domain`/`--no-infer`/`--force`/`--json`** behave as today, applied per skill.
- `--all` and `--skill` are mutually exclusive; `--list`/`--dry-run` ignore them (report the full set).

### 2. Clone-once-copy-N

`fetchGithub()` already clones the whole repo into staging. Add `discoverSkills(stagingRoot,
subpath?)` returning **all** skill dirs (see §3), and have `add.ts` iterate the selected subset out
of the **single** staging clone — N installs, one network fetch. Never clone per skill.

### 3. Discovery convention (borrow vercel's, adapted)

`discoverSkills(root, subpath?)` returns every dir with a valid `SKILL.md`:
- if `subpath` given, scope to it; else walk container dirs: `skills/` (+ `.curated`/`.experimental`/
  `.system`), and the repo root.
- depth-1 flat `skills/<name>/SKILL.md`; depth-2 catalog `skills/<cat>/<name>/SKILL.md`; depth-5
  recursive fallback if none found.
- **valid skill** = `SKILL.md` frontmatter has non-empty `name` **and** `description`.
- skip `.git`, `node_modules`, `dist`, `build`, `__pycache__`, and hidden dirs except the known
  agent-grouping dot-dirs already in `crawl.ts`'s ALLOW_DOT.
- the slug is the frontmatter `name` (fallback dir name); record each skill's repo-relative subpath
  so the lockfile `source` is `github:owner/repo@<subpath>` (per-skill, like today's single case).
This generalizes `locateSkillDir()` (which returns one) into "return all"; keep `locateSkillDir` as
`discoverSkills(...).length === 1` for the single-skill path.

### 4. Lockfile: N entries, one ref, no schema change

`shelf.lock.json` is already keyed by skill `name`. A repo-wide add = N `recordEntry()` calls
sharing the repo `source`+`ref`, each with its own `@subpath`, `installedHash` (body hash), and
`name`. No schema/version bump. `skl outdated`/`update` already iterate entries and re-pull each by
its `source` — they work unchanged for N entries.

### 5. `--dry-run` drift preflight = the hand-done `diff`, made first-class

For each discovered skill, classify against the current library before writing:
- **new** — not in the library → would install.
- **identical** — body hash matches the library copy → would overwrite losslessly (safe to convert
  an existing OWNED copy to tracked).
- **differs** — body differs → would overwrite local content; **requires `--force`** and is reported
  as such (don't clobber silently). This is exactly the `gh api contents | base64 -d | diff` check
  the agent did by hand for all 21 dbs skills.
Report counts + per-skill verdict in human and `--json` form. Without `--force`, a `differs` skill
in an `--all` run is **skipped with a warning**, not overwritten.

### 6. Keep the model boundaries (what we deliberately DON'T build here)

- **No agent-dir writes / symlink fan-out in `add`.** `add` writes only into the library. Targeting
  `~/.claude/skills`/`~/.codex/skills`/… stays with `skl use` (project) / future `skl deploy`
  (global). No `-g`/`--agent` on `add`.
- **No shell-out to `npx skills add`** for the github path. Provenance (clean skill dir + `git
  rev-parse HEAD` → `shelf.lock.json`) is skillshelf's product; vercel's installer writes into its
  own `.agents/skills` + its own lock and wouldn't hand back the dir+SHA cleanly. Keep
  `fetchRegistry`'s existing `skills`-CLI shell-out **only** as the narrow registry-name fallback.
- **No skills.sh blob fast-path / telemetry / private-repo probe.** Host-neutral `git clone --depth 1`
  keeps `add` offline-testable and dependency-light (git + Bun only).
- **No `.claude-plugin` manifest requirement.** Honor it opportunistically for discovery if trivial;
  never gate on it.

## Consequences

**Positive**
- `skl add github:owner/repo --all` replaces the discover+loop+drift-check ad-hoc code with one
  command; `--list`/`--dry-run` replace the `gh api`/`base64`/`diff`/`comm` hacks.
- One clone for N skills (was N clones).
- Reaches parity with the ecosystem one-liner (`npx skills add … --all`) on the import side, while
  keeping skillshelf's librarian/deploy split and provenance intact.

**Negative / cost**
- Discovery convention is a heuristic; an oddly-laid-out repo may need an explicit `--skill`/subpath.
  Mitigated by `--list` (see what was found) + the recursive fallback.
- `--all` over a large repo writes many library entries at once; `--dry-run` is the guardrail and
  should be the documented first step.
- More flags + a discovery pass to test (single-skill, multi-skill, `--all`, `--skill` filter,
  `--list`, `--dry-run` new/identical/differs, `--force` over differs, lockfile N-entries, one-clone).

**Deferred**
- Folder-hash provenance (vercel's `skillFolderHash`) so `outdated` detects changes in a skill's
  `references/` assets, not just `SKILL.md` body. Today `installedHash` = body hash only.
- A `skl deploy`/global agent-surface targeting layer (the part of vercel's model skillshelf
  intentionally hasn't built; ADR-0003).
- `skl remove`-from-repo / bulk un-track (the inverse of `--all`); for now `skl rm <name>` per skill.

## Implementation checklist (for the build session)

- `src/core/fetch.ts`: add `discoverSkills(root, subpath?) → {name, dir, subpath, description}[]`;
  refactor `locateSkillDir` to use it (single = length 1). Keep `fetchGithub` cloning once.
- `src/commands/add.ts`: parse `--all`/`--skill`/`--list`/`--dry-run`; branch single vs multi;
  iterate the selected set out of one staging clone; per-skill copy + `recordEntry` + optional infer;
  implement the drift preflight (`new`/`identical`/`differs`) for `--dry-run` and the
  skip-differs-without-`--force` rule; human + `--json` reporting.
- `src/core/provenance.ts`: unchanged (N `recordEntry` calls).
- Tests: a local `file:`/fixture repo with several `skills/<name>/SKILL.md` (no network) covering
  discovery (flat + catalog + recursive), `--list`, `--all`, `--skill` filter, `--dry-run`
  new/identical/differs, skip-differs-without-force, one-clone-N-entries, single-skill unchanged.
  Use the existing `git:`/`file:` channel + `mkdtemp` HOME-isolation pattern from the test suite.
- Docs: README command table (`add` row gains `--all`/`--skill`/`--list`/`--dry-run`), ARCHITECTURE
  §4, CHANGELOG `[Unreleased]`, and flip this ADR's status to Accepted.
