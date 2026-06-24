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
- **Published set** — the subset of a repo's discovered skills that `skl add --all` installs: the
  skills listed in the repo's `.claude-plugin` manifest when one is present (else *all* discovered),
  minus any `metadata.internal: true`. The rest are **unpublished** — still real, shown by `--list`
  marked as such, but reachable only by explicit `--skill <name>`. `--all` is bounded by a count
  gate (refuses > 15 without `--yes`). The manifest is read as an *allowlist*, deliberately stricter
  than vercel's grouping-only use (ADR-0012, amending ADR-0006 §6).
  _Avoid_: "all skills" (means the published set, not every `SKILL.md` on disk)

- **Orphaned** — a tracked (OWNED) skill whose upstream subpath has vanished: the repo still
  clones, but no skill with the same `name` exists anywhere in the fresh checkout. `update`
  reports it and **keeps the library copy** — it never auto-deletes (ADR-0004, ADR-0013). The
  copy is now effectively local until the user `skl remove`s it or it reappears upstream.
  _Avoid_: "deleted", "missing" (the library copy is intact; only the *upstream* is gone)

- **Relocated** — a tracked skill found at a **new subpath under the same `name`** (an upstream
  directory rename). `update` auto-follows it: re-points the lock entry's `source` subpath and
  reports the move, then runs the normal body 3-way (ADR-0013). Distinct from a *frontmatter-name*
  rename, which is indistinguishable from remove+add and surfaces as **Orphaned**.

## Verbs (and the curator boundary)

- **Add** — vendor a skill *into the library* (`skl add`): copy + record provenance. This is
  curation, not deployment. "Install" in skillshelf means *this* — it never implies activation.
- **Use** — *activate* a library skill at an agent surface (`skl use`): symlink it into
  `~/.claude/skills` (or another agent dir). Accepts skill names (exact) or a bundle tag.
- **Update** — re-pull the upstream **body** of tracked OWNED skills (`skl update [name]`),
  preserving domain tags. It **reconciles per source repo** (groups entries, clones each repo
  once, ADR-0013), so it also *reports* structural drift it sees in that checkout — **Relocated**
  (auto-followed), **Orphaned** (kept, flagged), and new published skills not yet tracked — but it
  **never installs**. Discovering/installing new skills is `add`'s job (`skl add <repo> --all`);
  `update` only ever refreshes what you already track. Floating-HEAD: it tracks the default branch,
  not version tags. The per-skill **verdict** (current / stale / diverged / edited / adopted / orphaned)
  is computed by one shared classifier, `src/core/reconcile.ts` — which is why `update` (online) and
  `outdated --check-local` (offline) can give the *same* skill different-but-correct answers: the first
  asks "do I differ from upstream now?", the second "have I edited since install?" (ADR-0014).
- **Curator boundary** — `add` only ever writes the library; `use` only ever writes agent dirs.
  skillshelf deliberately does **not** offer one-shot install-and-activate (the `vercel-labs/skills`
  installer model); getting-and-activating in one command is out of scope by ADR-0003. To install
  and turn on a set: `skl add …` then `skl use <name…>` — never deploy a whole domain tag to
  activate a few named skills.

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
