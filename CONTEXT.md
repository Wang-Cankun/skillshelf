# skillshelf — Domain Context

Canonical vocabulary for skillshelf. Terms here are meaningful to users and contributors;
implementation detail lives in `docs/ARCHITECTURE.md`.

## Core nouns

- **Library** — the single git-backed store that holds one canonical copy of each managed
  skill. A *passive shelf*: nothing in it auto-loads.
- **Skill** — a `SKILL.md` instruction body plus optional reference files in its own directory.
- **Bundle** — a domain grouping resolved as a *tag query* over skills' `domains`, not a
  folder. A skill with multiple domains appears in multiple bundles from one copy on disk.
- **Overlay** — `<skill>.shelf.json` sidecar holding the user's additions (domain tags,
  bundle membership, notes), kept separate from the upstream `SKILL.md` so updates never
  clobber it. Effective skill = upstream + overlay.
- **Global core** — the small set of universal skills symlinked permanently into
  `~/.claude/skills` so they always auto-trigger.
- **Provenance** — a vendored skill's recorded upstream (`origin` = `owner/repo`, `channel`,
  `ref`, `installedHash`) in `shelf.lock.json`. The app's update-aware SOURCE column surfaces
  it: click-through to the repo root + a manual "Check updates" → `↑` stale / `⚠` diverged
  badges beside the name; linked/local entries are never updated (ADR-0004, ADR-0009).

## Migration nouns

- **Root** — a directory that `skl scan` searches for skills (e.g. `~/.claude/skills`, an
  Obsidian `.agents/skills` dir, a project's `.claude/skills`).
- **Candidate** — a skill discovered in a root that is **not yet in the library**. Scanning
  reports candidates; importing turns a candidate into a managed library skill.
- **Scan** — the read-only discovery pass over roots (`skl scan`). Reports candidates,
  duplicates, and drift; never moves anything. ("Crawl" is the internal mechanism behind it
  and is not user-facing.)
- **Import** — the atomic operation that moves one candidate into the library and leaves a
  symlink behind in its old location (move + symlink-back).
- **Drift** — two copies of a same-named skill whose bodies differ. Resolving drift (which
  copy is canonical) is a judgment call left to the user/agent, not the tool.
