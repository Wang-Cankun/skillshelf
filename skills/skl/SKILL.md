---
name: skl
description: >-
  Drive the `skl` (skillshelf) CLI to manage agent skills — one canonical
  library, deployed on demand. Use this whenever the user wants to find,
  install, deploy, organize, tag, audit, update, or clean up skills, or
  mentions skillshelf / `skl`. Triggers include: "install this skill",
  "add a skill from GitHub", "deploy/activate the <X> skills in this project",
  "what skills do I have / search my skills", "where is this skill deployed",
  "my skills are scattered / consolidate them", "tag / organize my skills",
  "retire / remove a skill", "is this skill out of date", and "develop this
  skill in its own repo". Reach for this even when the user says "skill"
  loosely and is clearly talking about managing reusable agent instructions,
  not writing application code.
---

# Driving the `skl` CLI

`skl` (the binary for **skillshelf**) is a package manager for agent skills. It keeps
**one canonical library** of skills and deploys exactly what a project needs, exactly when
it needs it — instead of dumping every skill into one agent dir and paying the token cost of
loading them all. Your job is to translate the user's intent into the right `skl` command,
respecting a few safety rules that protect their real files.

When you act on the user's behalf, prefer driving `skl` over hand-editing files in
`~/.claude/skills` or `taxonomy.json` — the CLI keeps the library, the central taxonomy, the
provenance lockfile, and `INDEX.md` transactionally in sync. Hand-edits drift.

## The mental model (read this first)

Five nouns explain almost everything:

- **Library** — a flat git repo, one folder per skill (`library/<name>/SKILL.md`). It's a
  *passive shelf*: nothing here auto-loads. This is what kills the all-at-once token cost.
  Location resolves from `SKILLSHELF_LIBRARY` → `~/.skillshelf/config.json` → default
  `~/.skillshelf/library`.
- **Domain = tags, not folders.** A skill tagged `domains: [coding, bioinfo]` belongs to
  *both* bundles from a single copy on disk. Tags live in the central `taxonomy.json`, never
  in folder structure. So you never move a skill to retag it. (ADR-0001/0002)
- **Bundle** — a virtual group: every skill carrying one domain tag. `skl use bioinfo`
  resolves the query at that moment. A bundle is never a directory.
- **Deployment** — the library is the *source*; a skill becomes *active* in a project when
  `skl use` symlinks it into that project's `./.claude/skills/` (or another agent's dir). The
  same library skill can be deployed to many places, or nowhere.
- **Owned vs Linked** (ADR-0004 — the one with a sharp edge): an entry either **owns** its
  bytes (a real copy in the library — the default, for downloads and stabilized skills) or is
  **linked** (the library folder is a *symlink to an external dev repo* that stays canonical —
  for a skill you actively develop in its own git). The mode is derived from the filesystem
  (does `library/<name>` resolve outside the library?), never stored.

Two more: **global core** = the thin set of always-on skills symlinked permanently into
`~/.claude/skills` (tag `global-core`); **scan root** = an external dir you crawl to find
skills worth adopting.

## ⚠️ Safety rules — internalize these, don't just obey them

1. **Never pull upstream into a LINKED entry.** `skl update` / `outdated` already *skip*
   linked entries on purpose — following the symlink to overwrite would clobber the user's
   live dev repo through the link. So if an update is "skipped (linked)", that is correct
   behavior, not a bug to force around. Don't reach past the CLI to do it by hand.
2. **`add` is the librarian; `use`/`drop` are the movers.** `skl add` only writes to the
   *library* — it never touches an agent's skills dir. Installing and deploying are two steps:
   `add` then `use`. Don't expect `add` to make a skill active in a project.
3. **Never clobber real files.** `use` refuses to overwrite a real (non-symlink) file in a
   skills dir, and `import`/`link` refuse to write through symlinks or into the library
   itself. If a command refuses, surface the conflict to the user instead of forcing it.
4. **`import` is mechanical — it decides no domain.** Adopt first (`scan` → `import`), tag
   *after* (`tag` or `infer`). This is by design; there's no chicken-and-egg.
5. **Renaming doesn't repoint external deploys.** After `skl rename`, symlinks in project
   dirs still point at the old name. Re-run `skl use` (or check `skl where`) to fix them.
6. **Drive with `--json` whenever you'll parse the result.** Every command accepts it and
   emits structured, stable output. Human-readable text is for showing the user.
7. **Reversible by default.** Prefer `retire` (soft, restorable) over `rm` (hard). Use
   `--dry-run` on anything destructive (`rm`, `update`, `where --fix`, `refresh`) when unsure.

## Intent → command routing

Match what the user wants to the right verb. Full flags live in
`references/commands.md`; multi-step recipes in `references/workflows.md`.

| The user wants to… | Command |
|---|---|
| Find a skill / browse the library | `skl search <kw…>` · `skl ls [bundle]` |
| Read a skill's instructions (then a ref file) | `skl show <name>` · `skl show <name> --file <rel>` |
| See what's deployed **here** / **everywhere** / **per agent** | `skl status` · `skl where [name]` · `skl agents [name]` |
| Activate / deactivate a bundle or skill in this project | `skl use <bundle\|skill>` · `skl drop <bundle\|skill>` |
| Repair stale/dead deploy symlinks | `skl refresh` (this project) · `skl where --fix` (everywhere) |
| Install a third-party skill | `skl add github:owner/repo[/path]` (then `skl use`) |
| Consolidate scattered skills | `skl scan` → `skl import <name> --from <path>` → `skl infer` |
| Develop a skill in its own repo (stays canonical) | `skl link --from <dev-repo>` |
| Collapse a stray external copy into the library | `skl link <name> --at <path>` |
| Create a brand-new skill | `skl new <name> --domain <d> --desc "…"` |
| Tag / organize | `skl tag` · `untag` · `retag` · `infer` (AI tagging) |
| Rename a skill | `skl rename <old> <new>` (then re-`use`) |
| Remove a skill | `skl retire <name>` (soft) · `skl rm <name>` (hard) |
| Check / apply upstream updates | `skl outdated [name]` · `skl update [name]` |
| First-time setup | `skl init` |

If the request is broad ("organize my skills", "my skills are a mess"), start read-only —
`skl ls`, `skl where`, `skl scan` — to inventory reality before mutating anything, then show
the user the picture and propose the moves.

## How to operate

- **Read before you write.** For any cleanup/audit task, run the read-only command first
  (`status`/`where`/`scan`/`outdated`) and report what you found. Many problems have a
  one-shot fix (`where --fix`, `refresh`) — preview with `--dry-run`, then apply.
- **Single skill is first-class.** Every deploy verb (`use`/`drop`) and `add`/`import` accept
  a single skill name, not just a bundle. You don't need a domain to move one skill.
- **The inference seam.** `skl infer` is the *only* place judgment (LLM tagging) enters; every
  other verb is deterministic. Inside Claude Code, `infer` defaults to `--emit` (it hands you
  a payload to reason over — you then write the proposal and `skl infer --apply <file>`). It
  does **not** call an API unless `--provider`/`--base-url` is set. See `references/commands.md`.
- **Confirm destructive multi-skill moves.** A single `retire` is cheap and reversible; a
  bulk `rm --force` or a `retag` across the whole library deserves a heads-up to the user first.

## Reference files

- `references/commands.md` — every command, every flag, exact semantics, exit behavior, and
  the config/state files. Read this when you need a flag you don't remember or the precise
  contract of a verb (especially `add`, `link`, `import`, `update`, `infer`, `where`).
- `references/workflows.md` — copy-pasteable multi-step recipes: install-and-deploy,
  migrate-scattered-skills, audit-and-clean-deployments, develop-as-linked then stabilize,
  AI-tag-the-library, and safe-remove. Read this when the task spans more than one command.
