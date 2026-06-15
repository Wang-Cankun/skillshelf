# `skl` command reference

Complete flag-level reference for every `skl` command. Read the section you need; don't load
the whole file unless you're auditing the surface. Every command accepts `--json` (structured
output) and `--help`. Exit 0 = success, exit 1 = error (errors go to stderr).

## Contents

- [Invocation & state files](#invocation--state-files)
- Query & read: [`search`](#search) · [`ls`](#ls) · [`show`](#show)
- Deployment view: [`status`](#status) · [`where`](#where) · [`agents`](#agents)
- Deploy verbs: [`use`](#use) · [`drop`](#drop) · [`refresh`](#refresh)
- Install & adopt: [`add`](#add) · [`scan`](#scan) · [`roots`](#roots) · [`import`](#import) · [`link`](#link)
- Curate: [`tag`](#tag) · [`untag`](#untag) · [`retag`](#retag) · [`rename`](#rename) · [`retire`](#retire) · [`unretire`](#unretire) · [`rm`](#rm)
- Versioning: [`outdated`](#outdated) · [`update`](#update)
- AI & index: [`infer`](#infer) · [`index`](#index)
- Setup & scaffold: [`init`](#init) · [`new`](#new)

## Invocation & state files

- Binary: `skl` (installed via `bun add -g skillshelf`); run ad-hoc with `bunx skillshelf <cmd>`.
  Requires Bun ≥ 1.0 — the bin is a TypeScript entrypoint, not a Node build (`npm i` won't work).
- **`~/.skillshelf/config.json`** — `{ "library": "...", "globalCore": "..." }`. Created by `init`.
  Also persists scan roots.
- **`<library>/taxonomy.json`** — `{ version, skills: { name: [domains…] } }`. Written by
  `tag`/`untag`/`retag`/`infer --apply`. Survives `update`.
- **`<library>/shelf.lock.json`** — provenance for third-party skills: `source`, `ref`,
  `channel`, `installedAt`, `installedHash`, `localEdits`. Written by `add`/`update`. No entry
  for hand-written (`import`) or `new` skills.
- **`<library>/INDEX.md`** — auto-generated catalog grouped by domain. Re-run with `index`.
- **`<library>/_retired/<name>/`** — soft-deleted skills.
- Env overrides: `SKILLSHELF_LIBRARY` (highest precedence for library path),
  `SKILLSHELF_GLOBAL_CORE` (where global-core symlinks land, default `~/.claude/skills`).

---

## search
`skl search <kw…> [--json]` — Fuzzy match over name + description + domains across the library.
`<kw…>` are joined with spaces. Use when the user describes a skill by purpose, not exact name.

## ls
`skl ls [bundle] [--all] [--sort modified|name|domain|deploys|source] [--json]`
One-line listing of the whole library, or just one bundle/domain.
- `[bundle]` — filter to a single domain tag.
- `--all` — include retired skills (default excludes them).
- `--sort` — `modified` (mtime desc), `name`, `domain`, `deploys` (clean deploy count desc), `source` (vendored/local).
- `--json` — adds `mode`, `linkTarget`, `source`, timestamps, `deployCount`.

## show
`skl show <name> [--file <relpath>] [--json]`
Progressive disclosure: by default prints the SKILL.md **body** and lists bundled reference
file *paths* (does not read them). Pass `--file <relpath>` to read one bundled file verbatim
(resolved inside the skill dir; `..` escapes are refused). `--json` carries body, `refFiles`,
domains, `mode`, `linkTarget`.

## status
`skl status [--agent <id>] [--project <dir>] [--json]`
Which library skills are symlinked into a project's skills dir. Default agent `claude`
(→ `./.claude/skills/`); `--agent codex` → `./.codex/skills/`. `--project <dir>` inspects
another project. Flags **unmanaged real copies** (drift-prone) separately from clean symlinks.

## where
`skl where [name] [--agent <id>] [--project <dir>] [--problems] [--prune | --fix] [--dry-run] [--json]`
The deployment map: every copy/symlink of every skill across **all** agent surfaces, classified.
- `[name]` — one skill's deployment instead of the full map.
- `--problems` — show only problem sites (hide clean `linked`/`source`).
- `--prune` — remove dead symlinks only. **Mutually exclusive** with `--fix`.
- `--fix` — remove dead links **and** dedupe content-identical copies down to symlinks.
- `--dry-run` — preview either of the above without writing.
- Classification glyphs: `✓ linked` (clean symlink to library), `✓ source` (external dev repo a
  LINKED entry points to — healthy), `✗ dead link`, `⚠ 2nd-source` (symlink to a non-library
  copy), `⚠ aliased link` (link name ≠ skill name), `⚠ untracked copy`, `⚠ drifted copy`
  (differs from library), `⚠ redundant copy` (identical dup).

## agents
`skl agents [name] [--agent <id>] [--project <dir>] [--json]`
Multi-agent matrix: for each known agent × scope, each skill's deployment state.
`[name]` shows one skill's row across agents. Glyphs: `✓ clean`, `⊙ source`, `· absent`,
`⚠ drift`, `□ copy`, `✗ dead`.

## use
`skl use <bundle|skill> [--agent <id>] [--global | --project <name>] [--json]`
Symlink a bundle (domain) **or** a single skill into an agent's skills dir. Default target
`./.claude/skills/`. `--agent <id>` changes the agent; `--global` targets `~/<agent>/skills`;
`--project <name>` targets `./<name>/skills`. Idempotent — reports `linked`/`already`/`conflict`.
Refuses to clobber a real file (conflict → resolve manually).

## drop
`skl drop <bundle|skill> [--agent <id>] [--global | --project <name>] [--json]`
Inverse of `use`: removes the bundle's/skill's symlinks. Idempotent; never touches real files.

## refresh
`skl refresh [--dry-run] [--json]`
Re-sync **this project's** `./.claude/skills` symlinks to current library reality: repoint
stale absolute paths, prune links to removed/retired/renamed skills, leave foreign links
(pointing outside the library) untouched. `--dry-run` previews.

## add
`skl add <src> [--all | --skill <a,b,…>] [--list] [--dry-run] [--domain <d>] [--name <slug>] [--no-infer] [--force] [--json]`
Install third-party skill(s) into the **library only** (never an agent dir — deploy with `use`
after). One repo = one clone.
- Sources: `github:owner/repo`, `github:owner/repo/path`, `git:url#subpath`, or a registry name.
- `--list` — discover and print available skills, no writes.
- `--dry-run` — drift preflight (new / identical / differs) without writing.
- `--all` — install every discovered skill; `--skill <a,b>` — install a named subset (conflicts with `--all`).
- `--domain <d>` — frontmatter domain to apply; `--no-infer` — skip AI domain tagging (stay untagged).
- `--name <slug>` — single-skill only: override the installed name.
- `--force` — overwrite when an existing skill's body differs (multi-skill: a `differs` skill is skipped without it).
- Never installs through symlinks (ADR-0004). Writes a `shelf.lock.json` entry per skill.

## scan
`skl scan [roots…] [--add-root <path>] [--remove-root <path>] [--json]`
Read-only crawl of registered + ad-hoc roots; reports candidates, duplicates, and drift groups.
**Moves nothing.** `--add-root` persists a root in config (then reports); `--remove-root`
(alias `--rm-root`) de-registers (idempotent). Positional `roots…` scan ad-hoc without
persisting. Output groups duplicates/drift with a recommended canonical. First step of migration.

## roots
`skl roots [--json]` — List the persisted scan roots only (no crawl, unlike `scan`).

## import
`skl import <name> --from <path> [--copy | --no-link-back] [--follow] [--as <slug>] [--force] [--json]`
Adopt **your own** skill (source must contain `SKILL.md`) into the library as an OWNED copy.
Default: **move** the dir into the library and leave a **symlink-back** at the original path so
old references still resolve.
- `--copy` — copy instead of move; original untouched (use for skills inside a project repo).
- `--no-link-back` — move without the symlink-back (empties the old path).
- `--follow` / `--deref` — if the source is a symlink, dereference and copy the target (move is
  refused on symlink sources by default).
- `--as <slug>` — import under a different library name. `--force` — overwrite a same-named entry.
- Mechanical: decides **no domain** — run `infer`/`tag` afterward.

## link
`skl link <name> --at <path>` **or** `skl link [<name>] --from <dev-repo> [--force] [--json]`
Two modes of the bookshelf model (ADR-0004):
- `--at <path>` (OWNED side): replace an external **copy** with a symlink *into* the library —
  collapse a stray duplicate so the library becomes its single source. `<name>` required.
  Refuses if content mismatches without `--force`; never touches the library bytes.
- `--from <dev-repo>` (LINKED side): make the library entry a **symlink to a dev repo** that
  stays canonical — for a skill you actively develop in its own git. `<name>` optional (defaults
  to the dir name). `--force` replaces an existing entry. After this, `update`/`outdated` skip it.

## tag
`skl tag <name> <domain> [<domain>…] [--json]` — Add domain tag(s) in `taxonomy.json` only
(never edits SKILL.md). Deterministic, no LLM. Reports added / already-present / resulting domains.

## untag
`skl untag <name> <domain> [--json]` — Remove one tag (inverse of `tag`). If the domain is
declared in the skill's frontmatter rather than the taxonomy, it errors and points you to edit the body.

## retag
`skl retag <old-domain> <new-domain> [--json]` — Rename a domain across the **whole** library:
every skill tagged `<old>` becomes `<new>`. Deterministic; good for fixing a typo without re-inferring.

## rename
`skl rename <old> <new> [--json]` (alias `skl mv`) — Rename a skill slug atomically: directory +
frontmatter `name` + taxonomy key + lockfile key in one pass. `<new>` must be a valid slug.
**Does not** repoint external deploy symlinks — re-run `skl use` or check `skl where` after.

## retire
`skl retire <name> [--json]` — Soft-delete into `_retired/<name>/`: excluded from bundles/deploys,
marked retired, fully reversible via `unretire`. Prefer this over `rm` for anything you might want back.

## unretire
`skl unretire <name> [--json]` — Restore a retired skill to the active library (inverse of `retire`).

## rm
`skl rm <name> [--force] [--dry-run] [--json]` — Hard-delete: remove dir/symlink + taxonomy +
lockfile entries, then re-index. Refuses a **live OWNED** skill without `--force` (protects real
bytes). A **LINKED** entry `rm`s freely (only the symlink goes; the dev repo is untouched). A
**retired** skill deletes without `--force`. `--dry-run` previews the plan.

## outdated
`skl outdated [name] [--check-local] [--json]` — For each locked (third-party) skill, probe
upstream for the latest ref and report stale ones. Per-skill fields: channel, source,
`installedRef`, `latestRef`, status (`stale`/`current`/`unknown`/`linked`/`diverged`).
`--check-local` also computes `localEdits` offline. **LINKED entries report as `linked` and are
never probed** — their own git owns versioning.

## update
`skl update [name] [--force] [--dry-run] [--json]` — Re-pull upstream `SKILL.md` + bundled files
for OWNED tracked skills; **taxonomy tags are never touched**. Three-way logic: if the local body
still equals the installed baseline hash, it pulls cleanly; if the user hand-edited (local ≠
baseline), it shows a diff and requires `--force` to clobber. **LINKED entries are skipped
entirely** — following the symlink to pull would overwrite the user's dev repo. `--dry-run` previews.

## infer
`skl infer [--emit | --apply <file.json> | --provider <name>] [--base-url <url>] [--model <id>] [--include-retired] [--json]`
The one judgment verb: AI domain tagging over the library. Three mutually exclusive modes:
- `--emit` — print `{instruction, schema, corpus}` for an agent (you) to reason over. **No API
  call.** This is the default inside Claude Code (`$CLAUDECODE` set). You produce a proposal, then:
- `--apply <file.json>` — write the agent's proposal into `taxonomy.json`.
- `--provider <name>` — skillshelf itself calls an OpenAI-compatible endpoint and auto-applies.
  Providers: `openai`, `openrouter`, `groq`, `ollama`, `custom`. Key comes from env/dotenv, never a flag.
- `--base-url` / `--model` override the endpoint and model; `--include-retired` tags retired skills too.
- Config resolution (each of base-url/key/model independently): CLI flag → `SKILLSHELF_LLM_*` env
  → `OPENAI_*` env → dotenv at `$SKILLSHELF_ENV_FILE` (default `./.env`).

## index
`skl index [--json]` — Regenerate `<library>/INDEX.md` (catalog grouped by primary domain,
active/retired split). Most mutations run this automatically; use it for a manual rebuild.

## init
`skl init [--force] [--json]` — First-run setup: ensure `~/.skillshelf/config.json` and the
library dir exist, then symlink every `global-core`-tagged skill into `~/.claude/skills`.
Idempotent; `--force` overwrites existing config.

## new
`skl new <name> [--domain <d>] [--desc "…"] [--force] [--json]` — Scaffold a blank skill
(`<library>/<name>/SKILL.md`) with a boilerplate template (flat layout — `--domain` is a tag,
not a folder). `--force` overwrites an existing SKILL.md. Next: edit the body, then `infer`/`tag`, then `index`.
