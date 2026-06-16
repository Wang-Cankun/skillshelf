# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **`skl add --all` installs the *published set*, behind a count gate** ([ADR-0012](./docs/adr/0012-published-set-and-all-count-gate.md)).
  Dogfooding against a repo that lays out 29 `SKILL.md` dirs (including `deprecated/` and `in-progress/`)
  but publishes only 15 in its `.claude-plugin/plugin.json` showed `--all` meaning "every file on disk,"
  not "every skill the author publishes." `--all` now installs the **published set**:
  - **Manifest as allowlist** — when a `.claude-plugin/plugin.json` (or `marketplace.json`, union over
    plugins) is present, its `skills` array *bounds* `--all` to the listed dirs (containment-checked);
    with no manifest, the published set is every discovered skill (prior behaviour). Discovery still finds
    everything — the manifest subtracts, it is not the source of existence. This **amends [ADR-0006](./docs/adr/0006-repo-wide-add.md) §6**
    (which deferred manifest handling as discovery-only) and is a deliberate, *stricter* divergence from
    vercel's grouping-only manifest use.
  - **`metadata.internal` excluded** — any skill with frontmatter `metadata.internal: true` is dropped
    from the published set (ecosystem-aligned), installable only when named.
  - **Unpublished installs by name only** — a discovered-but-unpublished skill (unlisted, or `internal`)
    installs **only** via explicit `--skill <name>`; there is no bulk "install the unpublished" path.
  - **Count gate** — if the resolved `--all` set exceeds **15** skills, `add` refuses and prints what it
    would install, pointing at `--skill`/`--list`/`--yes`. The new **`--yes`** flag bypasses the gate
    (`--all --yes`); `--skill` is never gated (you named them), nor are `--list`/`--dry-run`. `--yes` is
    distinct from `--force` (the drift-overwrite axis).
  - **`--list` marks `published`/`unpublished`** so excluded skills stay visible even though `--all` skips them.
- **Update-aware SOURCE column in the desktop app** ([ADR-0009](./docs/adr/0009-update-aware-source-column.md)).
  The Library SOURCE column now tells the truth and acts on it: it shows each vendored skill's real
  upstream `owner/repo` (parsed from the lockfile `source`, surfaced via new `origin`/`channel` fields
  on `skl ls --json`) instead of a hard-coded `dbskill` label, with click-through to the GitHub repo.
  A manual **Check updates** button runs `skl outdated --json` (tolerating its exit-2 "stale exists"
  signal) and paints a per-row `↑` (stale) / `⚠` (diverged) badge beside the origin; clicking updates
  the skill (`skl update`, tag-preserving) with the badge clearing optimistically, plus an **Update all
  stale (N)** bulk action. The update affordance is Library-only and never offered on linked/local
  rows (ADR-0004 safety). Badges and check are opt-in (no auto network on launch).
- **Skill-preview file navigator** — `skl show <name> [--file <relpath>]` opens any bundled file's
  contents (path-escape-guarded), and `show --json` enumerates the full reference-file tree, so the
  drawer's file panel browses references/scripts (with syntax highlighting), not just `SKILL.md`.
- **Repo-wide `skl add` — one repo, one clone** ([ADR-0006](./docs/adr/0006-repo-wide-add.md)).
  A single GitHub repo often ships many skills; installing all 21 of `anthropics/skills`
  forced a hand-rolled `gh api trees` + per-skill loop that **re-cloned the repo 21 times** — the
  same "agent writes ad-hoc code = missing primitive" signal behind ADR-0005. `skl add` now installs
  a whole repo, or a chosen subset, from a **single clone**:
  - **Discovery** (`core/fetch.ts:discoverSkills`): convention walk over a cloned repo — flat
    `skills/<name>/SKILL.md`, catalog `skills/<cat>/<name>/SKILL.md`, and a bounded recursive
    fallback; a valid skill = frontmatter with `name` **and** `description`. `locateSkillDir` is now
    `discoverSkills(...).length === 1` (single-skill path unchanged).
  - **Flags**: `--list` (discover + print, no writes) · `--all` (install every skill) · `--skill
    <a,b,…>` (install only those, by frontmatter `name`) · `--dry-run` (drift preflight, no writes).
    `--all`/`--skill` are mutually exclusive; a bare repo with several skills errors and lists them
    (never silently picks one); single-skill `add <repo>/<path>` is unchanged.
  - **Clone-once-copy-N** (`fetchRepo`): the repo is cloned **once** and the selected subset copied
    out of the single staging checkout. Each skill becomes its own lockfile entry — shared
    `source`+`ref`, its own `@subpath` + `installedHash` (no schema change), so `skl outdated`/
    `update` re-pull each by its own subpath.
  - **Drift preflight** (`--dry-run`): per skill, `new` / `identical` / `differs` against the library
    copy (frontmatter-stripped body hash). A `differs` skill in `--all` is **skipped without
    `--force`** (never clobbered), and `add` never writes *through* a LINKED (symlink) entry into its
    dev repo (ADR-0004).
  - **Boundaries kept**: `add` stays a **librarian** — writes only into the library, no agent-dir
    writes / symlink fan-out (that is `skl use` / a future `skl deploy`, ADR-0003); uses skillshelf's
    own `git clone`, never `npx skills add` (kept only as the registry-name fallback); taxonomy
    untouched with `--no-infer`.
- **Inverse + fine-grained-edit verb family** ([ADR-0005](./docs/adr/0005-inverse-and-edit-verbs.md)) —
  the write-side counterpart to a read layer that already understood states it had no commands to
  enact. Surfaced by a six-story dogfood pass where every forced ad-hoc workaround (`rm -rf`/`mv`
  against the library, hand-edited `config.json`/frontmatter, manual `ln -s`) re-introduced the
  drift skillshelf exists to remove.
  - **Removal lifecycle**: `skl retire <name>` (soft-delete into `_retired/`, reversible) ·
    `skl unretire <name>` (restore) · `skl rm <name>` (hard purge: dir/symlink + taxonomy + lock +
    re-index + prune empty `_retired/`). `rm` refuses a live **owned** skill without `--force`
    (retire first); a **linked** entry `rm`s freely (removing a symlink is the safe `unlink`, dev
    repo untouched); `--dry-run` previews.
  - **Root registry inverse**: `skl scan --remove-root <path>` and a read-only `skl roots`
    (no crawl). `SKILLSHELF_CONFIG` env redirects the config file so a sandbox can scope *all*
    persisted state (closes the `--add-root`-pollutes-real-config isolation gap).
  - **Surgical taxonomy edits** (deterministic, no LLM; central `taxonomy.json`, ADR-0002):
    `skl tag` / `untag` / `retag` (library-wide domain rename).
  - **Atomic rename**: `skl rename <old> <new>` (alias `skl mv`) moves dir + frontmatter `name:` +
    taxonomy key + lock key together; rolls the dir move back if a later write fails.
  - **Single-skill deploy**: `skl use <skill>` / `drop <skill>` resolve a skill name before a bundle.
  - **`where`-driven remediation**: `skl where --prune` (dead links) / `--fix` (prune + dedupe
    content-identical copies; drift / 2nd-source / untracked stay `manual`), `--dry-run`;
    `skl refresh` re-syncs a project's `.claude/skills` to library reality; `skl status` flags
    unmanaged real copies.
  - **Owned-vs-linked legibility**: `ls`/`show --json` carry `mode` + `linkTarget`; `outdated`
    surfaces LINKED skills with no lock entry as `linked` rows and `update` reports them
    `skipped (linked)`; `skl outdated --check-local` checks local divergence offline.

### Security
- **Repo-wide `add` hardening (adversarial review)** ([ADR-0006](./docs/adr/0006-repo-wide-add.md)).
  A multi-agent review of the repo-wide `add` diff (independent security / correctness / regression /
  discovery lenses, each finding adversarially verified) caught and fixed defects where discovery
  walks an untrusted cloned repo:
  - **Escaping symlinks** can no longer leak out-of-checkout content into the library: `discoverSkills`
    won't follow / surface a dir whose realpath escapes the checkout, and `copySkillDir` drops any
    symlink whose target escapes the source dir (was an arbitrary-file-read / exfiltration vector —
    `skills/x -> /etc`, `notes.txt -> ~/.ssh/id_rsa`).
  - **Subpath traversal** (`owner/repo/../../x`) is rejected (containment-checked).
  - **Clobber through a symlinked ancestor**: the leaf-only link guard is replaced by a
    nearest-ancestor realpath-containment check (`destEscapesLibrary`), so `--force` with a symlinked
    `--domain` folder can't write through into an external tree; single-skill add refuses a linked
    leaf even with `--force`.
  - **Name-collision clobber**: two upstream skills sharing a frontmatter `name` are no longer
    silently merged (last-write-wins) — the duplicate is skipped, so N-installed == N-on-disk.
  - **Symlink-cycle** (`self -> .`) no longer duplicates skills or records a phantom lockfile subpath
    (dedup keys by realpath; subpath derives from the realpath).
- **Path-traversal hardening**: name-keyed mutations (`rm`/`retire`/`unretire`/`rename`) validate the
  `<name>` at the `locateEntry` choke point (`assertSafeName` rejects path separators / `..` / NUL),
  so a crafted or agent-supplied name can no longer escape the library to delete/move outside it.

### Fixed
- `skl outdated` no longer reports false `stale` for monorepo skills with name-prefix siblings. It
  used `gh api commits?path=<subpath>`, whose `path` filter is a **prefix** match — so a commit to
  `skills/dbs-content-system` falsely flagged `skills/dbs` as stale forever (the body never changed,
  so `skl update` reported `uptodate` and the badge could never clear). It now resolves the repo's
  default-branch HEAD, matching the ref `skl update` records, so the two agree.
- `where --fix` no longer auto-dedupes a deployed copy whose body matches but whose (load-bearing)
  `description` was customized — a description difference now counts as drift and stays `manual`.
- `skl rm` no longer deletes a live skill without `--force` when an `active` + `_retired` twin exists.
- `skl refresh` treats a link to the library root itself as `foreign` (left), not `pruned`.

## [0.2.0]

### Added
- **Migration primitives**: `skl scan [roots…]` performs read-only discovery of skill
  candidates across configured roots (counts, duplicate and drift groups; moves nothing), and
  `skl import <name> --from <path>` adopts one of your own skills into the library via
  move + symlink-back — `--copy` to leave a project repo untouched, `--as <slug>` to rename,
  `--force` to overwrite a drift loser. Migration is agent-orchestrated over these deterministic
  verbs (`scan` → adopt-and-tag judgment → `import` per candidate → `infer`), not a god-command.
- **Persisted scan roots**: scan roots are stored in `~/.skillshelf/config.json` (`roots`) and
  grown with `skl scan --add-root <path>`; `addRoot` expands `~`, absolutizes, and de-duplicates.

### Changed
- **Domain is tags, not folders** ([ADR-0001](./docs/adr/0001-domain-is-tags-not-folders.md)):
  the library layout is now **flat and non-semantic** (`library/<name>/`); no domain is inferred
  from any parent folder. `primaryDomain` is **derived** as `domains[0]` (or `null` when a skill
  has no domains), recomputed from the post-overlay domains. Overlay domains are unioned *after*
  upstream frontmatter domains, so the upstream primary is preserved.

## [0.1.0]

Initial release.

### Added
- Agent-first CLI (`skl`) with 13 commands: `search`, `ls`, `status`, `show`, `use`,
  `drop`, `add`, `outdated`, `update`, `init`, `new`, `index`, and `infer`. Every command
  supports `--json` output for agent consumption.
- **Zero-dependency core** on Bun + TypeScript — the runtime pulls in no external packages.
- **Canonical library** model: one file per skill, organized by primary domain, with a
  generated `INDEX.md` catalog.
- **Domain bundles as tag queries** (not folders): `skl use <bundle>` symlinks every skill
  tagged with a domain into a project's `.claude/skills/`; `skl drop` reverses it.
- **Sidecar overlay** (`<skill>.shelf.json`): user-owned domain tags, bundle membership, and
  notes kept separate from the upstream `SKILL.md` body.
- **Package-manager layer**: `skl add` installs third-party skills and records provenance in
  a lockfile; `skl outdated` flags upstream drift; `skl update` re-pulls the upstream body
  with a three-way (local / `installedHash` / upstream) comparison that preserves the overlay
  and refuses to clobber local edits without `--force`.
- **AI taxonomy** (`skl infer`): dual-mode with an LLM-free deterministic core — `--emit` for
  host-agent reasoning, `--apply` to write proposals into overlays, and a provider-agnostic
  OpenAI-compatible API mode (`--provider` / `--base-url`).

[Unreleased]: https://github.com/Wang-Cankun/skillshelf/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/Wang-Cankun/skillshelf/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Wang-Cankun/skillshelf/releases/tag/v0.1.0
