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
# 1. Register where they live, then take a READ-ONLY inventory (moves nothing).
skl scan --add-root ~/.claude/skills
skl scan --add-root ~/notes/.agents/skills
skl scan                       # candidates + duplicate/drift groups + a recommended canonical

# 2. Adopt the keepers one at a time. `import` MOVES + leaves a symlink-back by default.
skl import rnaseq-qc --from ~/.claude/skills/rnaseq-qc
skl import deploy-check --from ~/projects/web/.claude/skills/deploy-check --copy   # in a repo → copy
skl import rnaseq-qc --from ~/projects/lab/.claude/skills/rnaseq-qc --force        # drift loser → overwrite

# 3. Tag the now-populated library in ONE pass (domain is tags, so this happens AFTER import).
skl infer --emit               # inside Claude Code → emits a payload; you reason, then:
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
```

Why: `where` is the cross-agent source of truth (ADR-0003/0008). `--fix` only does the safe,
mechanical repairs (dead links + content-identical dedupe); genuine drift (`⚠ drifted copy`)
it reports but won't silently resolve — that's a human/agent judgment call. Preview with
`--dry-run` first and show the user.

## 4. Develop a skill in its own repo, then stabilize it

Goal: iterate on a skill in its own git repo (canonical), with no drift — later "freeze" it
into the library.

```bash
# DEVELOP: shelve a LINK. The dev repo stays canonical; edits show live; no re-sync.
skl link --from ~/Documents/GitHub/cairn/skill/cairn
skl where cairn                 # shows the dev repo as a clean `✓ source`
# update/outdated will SKIP it — that's correct; its own git owns versioning.

# STABILIZE later: turn the link into an owned copy.
skl rm cairn                    # safe — only removes the symlink; dev repo untouched
skl import cairn --from ~/Documents/GitHub/cairn/skill/cairn --copy
```

Why: linked entries (ADR-0004) are for active development — the library points *at* your repo
instead of copying it, so there's no second source to drift. When the skill settles, swap to an
owned copy so the library holds the bytes and `update` can track an upstream if you want.

## 5. AI-tag the library inside Claude Code

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

Why `--emit`/`--apply` instead of `--provider`: inside Claude Code you *are* the model — emit
hands you the corpus, you tag, apply writes it back for review. No API key, no network, and the
user can inspect the proposal before it lands. Only use `--provider` when running headless
without an agent in the loop.

## 6. Safely remove a skill

Goal: get a skill out of the way without losing work or breaking deploys.

```bash
skl where <name>                # see everywhere it's deployed first
skl retire <name>               # soft-delete → _retired/ (reversible)
# … later, if truly done:
skl rm <name> --dry-run         # preview
skl rm <name>                   # retired skills delete without --force
```

Why retire-then-rm: `retire` is reversible (`unretire`) and immediately removes the skill from
bundles/deploys, so it's the safe default. Hard `rm` of a *live owned* skill needs `--force`
(it destroys real bytes); a retired or linked entry deletes freely. Check `where` first so you
know what deploys will go stale.

## Quick decision reminders

- **Find vs read:** `search`/`ls` to locate, `show` to read (and `show --file` for a ref file).
- **Here vs everywhere:** `status` = this project; `where` = all agents; `agents` = per-agent matrix.
- **Add ≠ deploy:** `add` fills the library; `use` activates it in a project.
- **Move vs link:** `import` = owned copy (library holds bytes); `link --from` = linked (dev repo
  canonical). `link --at` collapses a stray copy into a link to the library.
- **Soft vs hard delete:** `retire` first, `rm` only when sure.
