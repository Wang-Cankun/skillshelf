# `skl` workflows — multi-step recipes

These are the common jobs that span more than one command. Each recipe states the *goal*, the
*sequence*, and the *why* so you can adapt it rather than copy it blindly. Read the relevant
recipe, then run the commands (add `--json` when you'll parse the output).

## 1. Install a third-party skill and use it here

Goal: a skill from GitHub is active in the current project.

```bash
skl add github:owner/repo/path/to/skill   # → library only (librarian step)
skl show <name>                           # sanity-check what landed
skl use <name>                            # → symlink into ./.claude/skills (deploy step)
skl status                                # confirm it's linked here
```

Why two steps: `add` never writes to an agent dir (safety rule #2). A skill is *owned* once
added and *active* only once `use`d. For a repo holding several skills, discover first:
`skl add github:owner/repo --list`, then `--all` or `--skill a,b`.

## 2. Consolidate scattered skills (migration)

Goal: skills strewn across `~/.claude/skills`, vaults, and project dirs become one curated library.

```bash
# 1. Register roots (writes config), then inventory without moving skills.
skl scan --add-root ~/.claude/skills
skl scan --add-root ~/notes/.agents/skills
skl scan                       # candidates + duplicate/drift groups + a recommended canonical

# 2. Adopt the keepers one at a time. `import` MOVES + leaves a symlink-back by default.
skl import rnaseq-qc --from ~/.claude/skills/rnaseq-qc
skl import deploy-check --from ~/projects/web/.claude/skills/deploy-check --copy   # in a repo → copy
# For a divergent duplicate, compare and choose the version to keep FIRST.
skl diff rnaseq-qc --agent claude --project ~/projects/lab
# Only if the library version wins: explicitly discard the divergent deployment.
skl use rnaseq-qc --agent claude --project ~/projects/lab --force
# ALTERNATIVE, not a next step: if the project copy wins, preserve its source:
# skl import rnaseq-qc --from ~/projects/lab/.claude/skills/rnaseq-qc --copy --force

# 3. Tag the now-populated library in ONE pass (domain is tags, so this happens AFTER import).
skl infer --emit               # any host agent → emits a payload; you reason, then:
# (write proposal.json) skl infer --apply proposal.json
skl index
```

Why this order: `import` is mechanical and decides no domain (ADR-0001), so there's no
chicken-and-egg — adopt everything, *then* tag once. Always `scan` (read-only) before any
`import` so the user sees duplicates/drift and picks winners; the tool never guesses.

## 3. Audit and clean up deployments

Goal: find drift, dead links, and stray copies across every agent, then fix safely.

```bash
skl where --problems            # only the messy sites (copies, drift, 2nd-sources, dead links)
skl where --fix --dry-run       # preview the auto-fix (remove dead links, dedupe copies → symlinks)
skl where --fix                 # apply it
# project-local stale links only:
skl refresh --dry-run && skl refresh
# an aliased link (deployed under the wrong name):
skl realign <deployed-name> --agent <id> --global
# a genuinely drifted copy — inspect, then decide which side wins:
skl diff <name> --agent <id> --project <dir>        # inspect the full skill directory
skl use <name> --agent <id> --project <dir> --force # only if the library version wins
# For a global deployment use --global instead of --project <dir> on BOTH commands.
# Alternative if the copy wins: `skl import <name> --from <copy path> --copy --force`.
```

Why: `where` is the cross-agent source of truth (ADR-0003/0008). `--fix` only does the safe,
mechanical repairs (dead links + content-identical dedupe); genuine drift (`⚠ drifted copy`)
it reports but won't silently resolve — that's a human/agent judgment call: `diff` informs it,
then `use --force` (library wins) or `import --copy --force` (copy wins) executes it. The
`--dry-run` previews above apply to `where` and `refresh`; `use` and `import` do not support it.

## 4. Develop a skill in its own repo, then stabilize it

Goal: iterate on a skill in its own git repo (canonical), with no drift — later "freeze" it
into the library.

```bash
# DEVELOP: shelve a LINK. The dev repo stays canonical; edits show live; no re-sync.
skl link --from ~/dev/cairn/skill/cairn
skl where cairn                 # shows the dev repo as a clean `✓ source`
# update/outdated will SKIP it — that's correct; its own git owns versioning.

# STABILIZE later: turn the link into an owned copy.
skl rm cairn                    # safe — only removes the symlink; dev repo untouched
skl import cairn --from ~/dev/cairn/skill/cairn --copy
```

Why: linked entries (ADR-0004) are for active development — the library points *at* your repo
instead of copying it, so there's no second source to drift. When the skill settles, swap to an
owned copy so the library holds the bytes and `update` can track an upstream if you want.

## 5. AI-tag the library in a host agent

Goal: assign domains across the library using your own reasoning (no external API).

```bash
skl infer --emit > /tmp/infer-payload.json   # {instruction, schema, corpus}
# Read the payload. Reason over each skill's name+description+body. Produce a proposal that
# matches the emitted schema: { skills: { "<name>": ["domain1", "domain2"], … } }.
# Write it to /tmp/proposal.json, then:
skl infer --apply /tmp/proposal.json
skl index
skl ls --sort domain                          # eyeball the result
```

Why `--emit`/`--apply` instead of `--provider`: inside Codex, Claude Code, or another host agent,
you *are* the model — emit
hands you the corpus, you tag, apply writes it back for review. No API key, no network, and the
user can inspect the proposal before it lands. Only use `--provider` when running headless
without an agent in the loop.

## 6. Safely remove a skill

Goal: deactivate a skill, then archive its library entry without losing work.

```bash
skl where <name> --json         # inventory known surfaces; include --project <dir> as needed
# Repeat for each managed deployment, while the skill is still active:
skl drop <name> --agent <id> --project <dir>
# Global deployment instead: skl drop <name> --agent <id> --global
skl retire <name>               # soft-delete → _retired/ (reversible)
# … later, if truly done:
skl rm <name> --dry-run         # preview
skl rm <name>                   # retired skills delete without --force
```

`retire` is reversible (`unretire`) and excludes the skill from future bundles/deployments,
but does not remove existing deployment links or real copies. Verify each `drop` result;
copies and foreign links need separate review. If already retired, `drop` cannot resolve it:
use `skl where <name> --prune --dry-run` then `skl where <name> --prune` for dead links,
adding the same `--project <dir>` to both commands for unregistered projects. Hard `rm` of a
live owned skill needs `--force`; a retired or linked entry deletes without it.

## Quick decision reminders

- **Find vs read:** `search`/`ls` to locate, `show` to read (and `show --file` for a ref file).
- **Here vs everywhere:** `status` = this project; `where` = all agents; `agents` = per-agent matrix.
- **Add ≠ deploy:** `add` fills the library; `use` activates it in a project.
- **Move vs link:** `import` = owned copy (library holds bytes); `link --from` = linked (dev repo
  canonical). `link --at` collapses a stray copy into a link to the library.
- **Soft vs hard delete:** `retire` first, `rm` only when sure.
