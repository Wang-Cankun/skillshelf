# 5. The library has inverse + fine-grained-edit verbs, not just forward ones

Date: 2026-06-13

## Status

Accepted. Closes the write-side gap that the read layer (ADR-0004's `where`, the
retired-aware `ls`/`index`) already understood but had no primitives to enact. Grounded
in a six-story dogfood pass (see Context) that drove every lifecycle through `skl` alone
and logged each forced ad-hoc workaround.

## Context

### The signal: an agent writing ad-hoc code is a missing primitive

When a CLI lacks a primitive, an agent does not complain — it silently drops to raw
shell to get the job done. Each such drop is a design hole, and a *dangerous* one here:
the workarounds were overwhelmingly `rm -rf`/`mv` against `~/.skillshelf/library`,
hand-edits of `config.json` and `SKILL.md` frontmatter, and manual `ln -s` — i.e. they
re-introduced the exact manual symlinks, hand-edited state, and silent drift that
skillshelf exists to eliminate. The agent's workaround defeats the product.

### Evidence: the dogfood pass

Six agents each ran a real lifecycle story in an isolated sandbox, driving only through
`skl`. They surfaced 26 frictions across 9 clusters. The shape was singular: skillshelf
had a complete set of **forward** verbs (`add`, `scan --add-root`, `link`, `import`,
`new`, `use`) and a strong **read/diagnosis** layer (`where` classifies five problem
kinds with `--json`; `ls`/`index` are retired-aware; `outdated`/`update` emit clean
schemas) — but almost none of the **inverse** and **fine-grained-edit** verbs the same
lifecycle requires. The read side knew about states (`_retired`, drift, dead links,
linked-vs-owned) the write side gave you no command to enter, leave, or fix.

### The asymmetry, concretely

| Forward primitive exists | Inverse / edit was missing → forced workaround |
|---|---|
| `scan --add-root` | no `--remove-root` → hand-edit `config.json` |
| `link` / `import` | no `rm` / `unlink` → `rm -rf library/<name>` (+ stale lock/taxonomy) |
| read layer renders `_retired` | no `retire`/`unretire` → `mkdir _retired && mv` |
| `infer` (whole-library AI retag) | no single-item `tag`/`untag` → frontmatter `sed` (silently no-op'd) |
| `new`/`import` create a slug | no `rename` → `mv` left dir=new, frontmatter/taxonomy=old |
| `use <bundle>` | no `use <skill>` → `mkdir + ln -s` one skill by hand |
| `where` *diagnoses* problems | no verb to *fix* → scrape stdout, hand `rm`/`ln -sfn` |
| ADR-0004 skips LINKED on update | linked skills reported as *nothing* → `shasum` dev repo by hand |

`SKILLSHELF_LIBRARY` isolated the library but not `config.json`, so even sandboxing an
experiment forced a hand-edit of the real config (a state-isolation hole of the same
family).

## Decision

1. **Ship the inverse/edit verbs as a coherent family**, styled consistently with the
   existing forward verbs (`--json` everywhere, `--force`/`--dry-run` where destructive,
   refuse-by-default + a named escape hatch copied from `link --at`):

   - **Removal lifecycle (reversible):** `retire <name>` (soft-delete into `_retired/`)
     → `unretire <name>` (restore) → `rm <name>` (hard purge). `rm` refuses a live
     **owned** skill without `--force` (retire first — reversible); a **linked** entry
     `rm`s freely (removing a symlink loses nothing — it *is* the `unlink`); a retired
     entry purges without `--force`. `--dry-run` previews.
   - **Root registry:** `scan --remove-root <path>` (inverse of `--add-root`) and a
     read-only `roots` (no crawl). Plus `SKILLSHELF_CONFIG` to redirect *all* persisted
     state into a sandbox.
   - **Taxonomy edits (deterministic, no LLM):** `tag` / `untag` / `retag`, editing the
     central `taxonomy.json` (ADR-0002), not frontmatter.
   - **Rename:** `rename <old> <new>` (alias `mv`) — moves dir + frontmatter `name:` +
     taxonomy key + lock key atomically.
   - **Single-skill deploy:** `use <skill>` / `drop <skill>` resolve a skill name before
     a bundle.
   - **`where`-driven remediation:** `where --prune` (dead links) and `where --fix`
     (prune + dedupe identical copies), plus `refresh` (re-sync a project to library
     reality) and a `status` drift line for unmanaged real copies.
   - **Mode legibility:** `ls`/`show --json` carry `mode` (`owned`|`linked`) +
     `linkTarget`; `outdated` surfaces LINKED skills with no lock entry as `linked`
     rows; `update` reports them as explicitly `skipped (linked)`; `outdated
     --check-local` answers "have I diverged?" offline (body-hash vs `installedHash`).

2. **Mutations are transactional across the three state surfaces.** A skill's truth is
   spread across its on-disk entry (`<library>/<name>` or `_retired/<name>`), the central
   `taxonomy.json`, and `shelf.lock.json`. Every removal/rename moves or drops all of
   them together and re-generates `INDEX.md`, because a hand-done partial is exactly what
   an agent botches. This lives in `core/lifecycle.ts`.

3. **Determinism over guessing — preserve "the tool never chooses for you."** `where
   --fix` auto-applies *only* deterministic, non-destructive remediations: remove a dead
   link, dedupe a content-**identical** copy to a symlink. A drifted copy, a 2nd-source
   (foreign link), or an untracked copy carries a real which-wins decision and stays
   `manual` — reported with its suggested command, never auto-resolved. `retag` renames a
   domain across the taxonomy but does not touch a frontmatter-declared domain (honest
   `changed: []`). `rename` rekeys library metadata but never edits a LINKED dev repo's
   `SKILL.md`.

## Consequences

**Positive**

- The common lifecycles complete through `skl` alone — no `rm -rf`/`mv`/`ln -s`/config
  hand-edits — so the agent stops re-introducing the drift skillshelf removes.
- Reversibility by default: `retire` before `rm`, `--dry-run` on every destructive verb,
  `link --at`'s refuse-then-name-the-escape-hatch pattern generalized.
- The write side now matches what the read side already understood; `where` finally has
  verbs to act on what it reports.

**Negative / cost**

- More surface area (≈9 new commands + flags) to keep consistent and tested.
- `where --fix` is powerful: it can mutate every scanned agent surface, so it is
  deterministic-only and `--dry-run`-previewable by design — but operators must still
  aim it deliberately.
- `rename` does not repoint external deploy symlinks (they go stale); `refresh` /
  re-`use` is the follow-up. A full transitive repoint is deferred.
- Taxonomy verbs own `taxonomy.json` only; a domain declared in upstream frontmatter is
  out of their reach (reported honestly, not silently).

## Deferred

- `rm --keep-source` / a true `unimport` that restores an imported skill to its origin —
  needs `import` to record the origin path (it currently writes no provenance).
- `rename` repointing live deploy symlinks transitively.
- A `where --fix` mode that proposes (not applies) merges for drifted copies.
