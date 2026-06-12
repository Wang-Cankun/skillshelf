# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/Wang-Cankun/skillshelf/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Wang-Cankun/skillshelf/releases/tag/v0.1.0
