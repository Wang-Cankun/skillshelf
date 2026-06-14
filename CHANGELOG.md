# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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
- **Path-traversal hardening**: name-keyed mutations (`rm`/`retire`/`unretire`/`rename`) validate the
  `<name>` at the `locateEntry` choke point (`assertSafeName` rejects path separators / `..` / NUL),
  so a crafted or agent-supplied name can no longer escape the library to delete/move outside it.

### Fixed
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
