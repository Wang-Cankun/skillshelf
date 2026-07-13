# skillshelf — Manager Workbench · Design Context (v2, light)

> **SUPERSEDED (historical record).** The Matrix-centerpiece / Inbox-default IA described
> here was retired by `brief-0010-management-ui.md` + ADR-0010 (list-first, "No grid — the
> old Matrix is retired"). Kept as the design lineage between the constellation direction
> and the shipped 0010 build. Do not treat the IA here as current.

> Paste this whole file into Claude's design tool as grounding context.
> This is the **practical, management-first** redesign. The earlier "constellation graph"
> looked great but was a poster, not a tool — you can't sort, multi-select, or triage a
> galaxy. This version is built from first principles around the *jobs* a person actually
> does when they own 113 skills across 9 locations. **Light background.**

---

## 0. What changed & why (read this first)

The constellation answered *"what's the shape of my universe?"* — a one-time wow. But the
real work is **repetitive triage**: find a skill, see where it lives, fix a drift, tag a batch,
deploy a bundle. That work wants **density, sorting, filtering, multi-select, keyboard, and
bulk actions** — i.e. a **workbench** (think email client × package manager × spreadsheet),
not a data-viz. So we optimize for the frequent job, not the first impression.

## 1. First principles (the spine of this design)

- **P1 — Optimize the frequent job, not the first impression.** Triage and find happen daily;
  "admire the whole graph" happens once. Default to the worklist, not the wow.
- **P2 — Density beats decoration.** Show many rows at once, sortable and filterable. Whitespace
  serves scanning, not spectacle.
- **P3 — Every intersection has a knowable state.** For each (skill × location) there is exactly
  one status (linked / owned / drift / copy / dead / absent). Make that state a glyph you can
  scan down a column. This is the literal answer to *"which skills are where."*
- **P4 — Bulk by default.** Managing 113 means acting on many at once: select N rows → one action.
- **P5 — Reversible & transparent.** Every action shows the exact `skl` command, supports
  dry-run, and is undoable. No hidden mutation.
- **P6 — Keyboard- and selection-driven.** Arrow / j-k to move, space to select, `⌘K` for anything.
  A power user should rarely touch the mouse.
- **P7 — One source of truth.** The **Library** is the anchor. Every status and action is framed
  *relative to the library* ("is this owned? linked? a drifted copy of the library version?").
- **P8 — Decisions stay human; chores auto-resolve.** Dead links & identical copies can one-click
  fix. Drift / second-source / untracked copies present a choice — never auto-pick.

## 2. Jobs-to-be-done (what the UI must make fast)

1. **Triage** — "What needs my attention right now?" (drift, dupes, orphans, dead links)
2. **Find** — "Do I already have a skill for X?" (search + browse, sub-second)
3. **Locate** — "Where does `rnaseq-qc` live, and is any copy dirty?"
4. **Consolidate** — adopt scattered copies into the library; dedupe; pick canonical on drift.
5. **Organize** — assign domain tags, in batches.
6. **Deploy** — link a skill/bundle into a project or agent surface; unlink when done.
7. **Audit** — one-glance health of the whole shelf.

## 3. Core metaphor: the Workbench (three-pane)

```
┌───────────────┬──────────────────────────────────────────────┬──────────────────┐
│  SIDEBAR      │  MAIN  (switchable: Inbox · Matrix · Library)  │  INSPECTOR       │
│  smart views  │  dense, sortable, multi-selectable            │  selected skill  │
│  + filters    │                                                │  + actions       │
└───────────────┴──────────────────────────────────────────────┴──────────────────┘
                          ▲ bulk action bar appears on multi-select
```

- **Left — Smart views & filters.** Saved views ("⚠ Needs attention", "◆ New / unmanaged",
  "🏷 Untagged", "By domain → bioinfo…", "By location → ~/.claude/skills…"). Counts on every row.
- **Middle — three interchangeable lenses on the SAME selectable rows** (tabs at top):
  **Inbox** (triage), **Matrix** (where-is-what grid), **Library** (catalog table).
- **Right — Inspector** for the selected skill: every deployment, drift diff, tags, actions.

## 4. The four surfaces

### 4.1 Inbox (DEFAULT landing) — triage queue

The `problems[]` from `skl where --json`, sorted by severity. Each row is one fixable thing.
This is the "I don't know what I don't know" → "here's the list, knock it out" surface.

```
 Needs attention (12)                            [ ⚙ dry-run ]  [ Fix all safe (5) ]
 ───────────────────────────────────────────────────────────────────────────────────
 ⚠ DRIFT      rnaseq-qc        library ✦ vs analysis-repo/.claude        +12 −3   [Diff] [Resolve▾]
 ⚠ DRIFT      note-decision    library ✦ vs Obsidian/.agents      +4  −1   [Diff] [Resolve▾]
 ◆ UNTRACKED  headline-picker  ~/.codex/skills (not in library)            [Import] [Ignore]
 □ REDUNDANT  web-search       webapp/.claude (identical)          [Dedupe→link] ✓auto
 ✗ DEAD LINK  old-figure       writing-skills/.claude → (missing)           [Prune] ✓auto
 🏷 UNTAGGED  claim-log        in library, no domains                       [Tag▾]
 ───────────────────────────────────────────────────────────────────────────────────
   ✓auto = safe one-click (dead links, identical copies).  Drift/untracked need your call.
```

- Group/sort by severity or by skill. Multi-select → bulk resolve.
- Each action shows its command on hover/expand (e.g. `$ skl where rnaseq-qc --fix`).

### 4.2 Matrix — the where-is-what grid (THE centerpiece for the stated pain)

A spreadsheet: **rows = skills, columns = Library + each location/surface, cell = status glyph.**
This is what a graph fundamentally can't do — scan a column to see "everything in Obsidian",
scan a row to see "everywhere rnaseq-qc lives", spot drift as a ⚠ in a sea of ✓.

```
 Skill ▾          Dom        │ Library │ .claude │ .codex │ Obsidian │ analysis-repo │ nature │ …
 ────────────────────────────┼─────────┼─────────┼────────┼──────────┼────────┼────────┼──
 rnaseq-qc        bioinfo    │   ●     │   ✓     │   ·    │    ✓     │   ⚠    │   ·    │   ← drift in analysis-repo
 web-search       browser    │   ●     │   ✓     │   □    │    ·     │   ·    │   ·    │
 note-decision    business   │   ●     │   ✓     │   ·    │    ⚠     │   ·    │   ·    │
 headline-picker  —          │   –     │   ·     │   ◆    │    ·     │   ·    │   ·    │   ← untracked, not owned
 claim-log        (untagged) │   ●     │   ·     │   ·    │    ·     │   ·    │   ⊙    │
 config-backup    ops        │   ●     │   ✓     │   ·    │    ·     │   ·    │   ·    │
 ────────────────────────────┴─────────┴─────────┴────────┴──────────┴────────┴────────┴──
 CELL LEGEND  ● owned  ◧ linked-mode  ✓ clean link  ⊙ source  ⚠ drift  □ redundant copy
              ◆ untracked copy  ✗ dead  · absent  – not in library
 Sort by: name · domain · #locations · health      Filter: [domain▾][status▾][location▾] 🔎
```

- **Click a cell** → Inspector scoped to that intersection + the right contextual action
  (drift cell → `[Keep library] [Keep this copy] [Diff]`; untracked cell → `[Import]`).
- **Click a column header** → bulk-act on that whole location (e.g. "link all of bioinfo here").
- Column for realpath-**aliased** roots is auto-collapsed (one Obsidian column, not two).
- Sticky first columns (Skill, Domain, Library) while scrolling many location columns.

### 4.3 Library — dense catalog table (find / browse / bulk organize)

From `skl ls --json`. The "do I already have one?" surface. Sortable, multi-selectable.

```
 ☑  Skill            Domains            Mode    Deploys  Description
 ──────────────────────────────────────────────────────────────────────────────────────
 ☑  rnaseq-qc        bioinfo · meta     owned     3      QC gate for RNA-seq count matrices
 ☐  web-search       browser · media    owned     1      Search across many platforms
 ☑  note-decision    business           owned     2      Decision framework for …
 ☐  claim-log        (none) 🏷           owned     1      Claim log
 ──────────────────────────────────────────────────────────────────────────────────────
 ▸ 2 selected   [ Tag▾ ]  [ Link into project▾ ]  [ Retire ]  [ Export ]   ⌫ clear
```

- Multi-select → **bulk action bar** (tag, link/use into a project, retire, export).
- Fuzzy search across name + description + tags. Tag chips filter on click.

### 4.4 Inspector (right pane) — one skill, everything about it

```
 rnaseq-qc                                              owned ● · in library
 ─────────────────────────────────────────────────────────────────────────
 Domains:  bioinfo  meta   [+ add]
 Canonical: ~/.skillshelf/library/rnaseq-qc

 Deployed at 3 sites
   ✓ linked     ~/.claude/skills/rnaseq-qc
   ⚠ drift      analysis-repo/.claude/skills/rnaseq-qc        (+12 −3)   [Diff]
   ✓ identical  Obsidian/.agents/skills/rnaseq-qc
 Linked into:  my-analysis · lab

 Resolve drift:  ( ) keep library   ( ) keep analysis-repo copy        [Apply]
   $ skl import rnaseq-qc --from …/analysis-repo --force        ← command echo
 ─────────────────────────────────────────────────────────────────────────
 [ Edit SKILL.md ]   [ Open folder ]   [ Retire ]   [ Drop from project▾ ]
```

## 5. Cross-cutting mechanics

- **Bulk action bar** — appears whenever ≥1 row/cell is selected; the verbs adapt to selection.
- **Command palette (`⌘K`)** — jump to any skill, switch view, run any verb, change a filter.
- **Command echo** everywhere — the literal `skl …` for each action; trust + teaches the CLI.
- **Dry-run toggle** — preview what a bulk action *would* do before committing; pairs with undo.
- **Health strip** (persistent footer): `113 skills · 9 locations · ⚠4 drift · ◆6 new · 🏷9 untagged`.
- **Live** — FSEvents → rows/cells update in place as disk changes.

## 6. Visual language — LIGHT, clean, calm

- **Light background** (`#FAFAFA`/white), thin neutral borders (`#E5E7EB`), near-black text.
  Aesthetic reference: Linear / Notion / Raycast (light) — airy, data-dense, no chrome noise.
- **Color only for status**, used sparingly so a ⚠ pops on a calm field:
  green `✓ clean` · amber `⚠ drift` / `□ redundant` · blue `🔗 linked / new ◆` · gray `· absent`
  · red `✗ dead`. Owned `●` is neutral/near-black.
- **Monospace** for paths / commands / diffs; sans for everything else.
- **Tables are the hero.** Tight row height, zebra-free, hover highlight, sticky headers,
  right-aligned counts. Selection = subtle blue row tint + left accent bar.
- Generous but purposeful whitespace; rounded-md cards; soft shadows only on the Inspector/palette.

## 7. Data contracts (what the UI binds to)

All `skl` commands emit `--json`. Full payloads + TS types are in
`constellation-ui-context.md §3`; the manager primarily needs:

- **`skl where --json` → `DeploymentReport`** — drives **Inbox** (`problems[]`) and **Matrix**
  (`sites[]`: each has `name`, `surface`, `kind` ∈ `linked|foreign-link|source|copy|dead`,
  `inLibrary`, `drift`). This single feed builds the whole grid.
- **`skl ls --json`** — the **Library** table rows (`name, description, domains, primaryDomain,
  mode: owned|linked, retired`).
- **`skl status --json`** — per-project linked skills (the "Linked into" + Projects view).
- **`skl scan --json`** — `newCandidates[]` (untracked) + `duplicateGroups[]` for the Inbox.
- **`taxonomy.json`** — skill → domain tags (the Domain column + tag filters).

Real data to make mockups true (see also constellation doc §4): **113 skills**; domains
`bioinfo, business, philosophy, content, ops, browser, meta, sci-writing, media`; the `note-*`
family; **9 locations** incl. `~/.claude/skills` (48), `~/Dropbox/Obsidian/.agents/skills` (31,
bridge fmt), `/Volumes/External/.../skills` (12, ext drive), `writing-skills` (18), `analysis-repo`
(bioinfo + `_retired/`), `claim-log/skill` (9); cross-agent surfaces `.claude .codex .cursor
.opencode`; the Dropbox/CloudStorage alias is realpath-collapsed.

## 8. What to generate first

The **Workbench shell** in **light theme**: three-pane layout, **Inbox as the default middle
view** (§4.1) with severity-sorted rows + safe-fix buttons, the left **smart-views sidebar**
with counts, and the right **Inspector** (§4.4) populated by the `rnaseq-qc` drift example with
command-echo actions. Then a second frame switching the middle pane to the **Matrix** (§4.2)
grid. Use the real sample data so it reads true.
