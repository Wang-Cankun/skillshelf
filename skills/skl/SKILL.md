---
name: skl
description: >-
  Install, deploy, find, organize, audit, and clean up agent skills with the
  `skl` (skillshelf) CLI — one canonical library, deployed on demand. Use when
  the user says "install this skill", "add a skill from GitHub", "deploy/activate
  these skills", "what skills do I have", "where is this skill deployed", "my
  skills are scattered", "tag/organize my skills", "remove a skill", "is this
  skill out of date", or mentions skillshelf / `skl`. Also when they say "skill"
  loosely about managing reusable agent instructions (not writing app code).
---

# Driving the `skl` CLI

`skl` (skillshelf) is a package manager for agent skills: **one canonical library**, deployed
to a project only when needed — instead of dumping every skill into one agent dir and paying the
token cost. Translate the user's intent into the right `skl` command; prefer driving the CLI over
hand-editing `~/.claude/skills` or `taxonomy.json` (the CLI keeps the library, taxonomy, lockfile,
and `INDEX.md` in sync — hand-edits drift).

## Mental model

- **Library** — flat git repo, one folder per skill (`library/<name>/`). A passive shelf; nothing
  auto-loads. Resolves from `SKILLSHELF_LIBRARY` → `~/.skillshelf/config.json` → `~/.skillshelf/library`.
- **Domain = tags, not folders** — a skill tagged `[coding, bioinfo]` is in both bundles from one
  copy. Tags live in `taxonomy.json`; you never move a skill to retag it. (ADR-0001/0002)
- **Bundle** — every skill carrying one domain tag, resolved on demand. Never a directory.
- **Deployment** — the library is the *source*; `skl use` symlinks a skill into a project's
  `./.claude/skills/` (or another agent's dir) to make it *active*. One skill → many places, or none.
- **Owned vs Linked** (ADR-0004) — an entry either owns its bytes (a real copy; default) or is
  *linked* (the library folder is a symlink to an external dev repo that stays canonical). Derived
  from the filesystem, never stored.

## Safety rules

1. **Never pull upstream into a LINKED entry.** `update`/`outdated` skip linked entries on purpose —
   following the symlink would clobber the user's live dev repo. "Skipped (linked)" is correct.
2. **`add` writes the library; `use`/`drop` move to agent dirs.** Installing and deploying are two
   steps: `add` then `use`. `add` never makes a skill active.
3. **Never clobber real files.** `use` won't overwrite a real file in a skills dir; `import`/`link`
   won't write through symlinks or into the library. If a command refuses, surface it — don't force.
4. **`import` decides no domain** — adopt first (`scan`→`import`), tag after (`tag`/`infer`).
5. **Rename doesn't repoint deploys** — re-run `skl use` (or check `skl where`) after `rename`.
6. **`--json` whenever you'll parse.** Human-readable text is only for showing the user.
7. **Reversible by default** — prefer `retire` over `rm`; `--dry-run` destructive ops when unsure.

## Intent → command

Full flags in `references/commands.md`; multi-step recipes in `references/workflows.md`.

| The user wants to… | Command |
|---|---|
| Find / browse | `skl search <kw…>` · `skl ls [bundle]` |
| Read a skill (then a ref file) | `skl show <name> [--file <rel>]` |
| See what's deployed here / everywhere / per agent | `skl status` · `skl where [name]` · `skl agents [name]` |
| Activate / deactivate in this project | `skl use <bundle\|skill…>` · `skl drop <…>` |
| Repair stale/dead symlinks | `skl refresh` (here) · `skl where --fix` (everywhere) |
| Install a third-party skill | `skl add github:owner/repo[/path]` (then `skl use`) |
| Consolidate scattered skills | `skl scan` → `skl import <name> --from <path>` → `skl infer` |
| Develop a skill in its own repo | `skl link --from <dev-repo>` |
| Create a new skill | `skl new <name> --domain <d> --desc "…"` |
| Tag / organize | `skl tag` · `untag` · `retag` · `infer` |
| Rename / remove | `skl rename <old> <new>` (re-`use`) · `skl retire` (soft) · `skl rm` (hard) |
| Check / apply updates | `skl outdated [name]` · `skl update [name]` |
| First-time setup | `skl init` |

Broad request ("my skills are a mess")? Start read-only (`ls`/`where`/`scan`) to inventory, show
the user, then propose moves.

## Activating a set — don't over-deploy

- **Activate named skills by name:** `skl use <name1> <name2> …` takes a space-separated list in one
  pass. To turn on 5 skills, name the 5 — **never deploy a whole domain tag** (`skl use coding`) to
  activate a few; that fans the entire bundle (often dozens) into the agent dir.
- **Don't tag a fresh install into a big existing domain just to group it.** Tagging 5 new skills
  `coding` to "bundle them" silently lumps them with every other `coding` skill on the next
  `skl use coding`. Leave a new install untagged, or give it its own tag.
- **`infer` is the only place judgment enters.** Inside Claude Code it defaults to `--emit` (hands you
  a payload; you write the proposal, then `skl infer --apply <file>`). No API unless `--provider`/`--base-url` is set.

## Reference files

- `references/commands.md` — every command, flag, and exact contract (esp. `add`, `link`, `import`,
  `update`, `infer`, `where`).
- `references/workflows.md` — copy-pasteable recipes: install-and-deploy, migrate-scattered,
  audit-and-clean, develop-as-linked, AI-tag, safe-remove.
