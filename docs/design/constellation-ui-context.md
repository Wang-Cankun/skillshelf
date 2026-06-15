# skillshelf — Constellation UI · Design Context

> Paste this whole file into Claude's design tool as grounding context. It describes
> the product, the **real** data shapes the UI binds to, the chosen visual direction
> (a force-directed "constellation" map), and the interaction + visual language.
> Everything here is taken from the actual skillshelf codebase, not invented.

---

## 0. One-liner

A **desktop app that maps where every AI-agent skill lives** across a person's machine —
global dirs, an Obsidian vault, a dozen project `.claude/` folders — and lets them see
duplicates, drift, and orphans at a glance, then fix them with one click.

The home screen is a **constellation graph**: skills are stars, locations and projects are
anchor nodes, and a **drift between two copies of the same skill renders as a glowing red
edge you can't unsee.**

## 1. Who it's for & the pain

A power user (developer / researcher) with **~113 skills** scattered across **9+ locations**.
The pain in their words: *"I don't know what I don't know — if I have hundreds of skills, I
don't know which are where; some are global, some in Obsidian, some in projects. How do I
manage and move them with less mental burden?"*

The CLI (`skl`) already solves **moving** skills (scan / import / use / drop / link / where).
What's missing is **seeing** — a spatial map. That's what this UI is.

## 2. Product model (vocabulary the UI must speak)

- **Library** — one canonical, git-backed folder (`~/.skillshelf/library/<name>/`). Flat
  layout. The single source of truth. A skill "in the library" is *owned*.
- **Skill** — a directory containing a `SKILL.md` (frontmatter: `name`, `description`) plus
  optional reference files. Identified by **slug** and by **content hash** (sha-256 of the body).
- **Domain** — a **tag**, never a folder. A skill has 1..n domains. Domain assignments live in
  one central `taxonomy.json` (skill → tags). Real tags in use:
  `bioinfo, business, philosophy, content, ops, browser, meta, sci-writing, media`.
- **Root / Location** — a directory skillshelf scans for skills (the 9 real ones below).
- **Surface** — a directory an *agent* reads skills from (`~/.claude/skills`, `~/.codex/skills`,
  `~/.cursor/skills`, project `./.claude/skills`, …). Skillshelf is agent-agnostic.
- **Deployment** — a skill appearing in a surface. Classified (this is the heart of the graph):
  - `linked` ✓ — symlink resolving *into* the library (clean deploy)
  - `source` ✓ — a real external dir the library symlinks *at* (intended, not redundant)
  - `foreign-link` ⚠ — symlink resolving *outside* the library (a second source)
  - `copy` ⚠ — a real dir; `redundant` (identical to library), `drifted` (body differs), or
    `untracked` (no library skill of this name)
  - `dead` ✗ — symlink whose target no longer exists
- **Drift** — two copies of the same-named skill whose body content hashes differ. The thing
  the user most needs to *see*.
- **Mirror / alias** — `.agents/skills` bridge mirrors and realpath-aliased roots (e.g.
  `~/Dropbox/Obsidian` vs `~/Library/CloudStorage/Dropbox/Obsidian` are the *same* vault).
  These are **collapsed automatically** — never shown as conflicts.
- **Retired** — a skill under a `_retired/` dir: tagged but not active.
- **Mode** — a library entry is `owned` (real dir in library) or `linked` (library symlinks at
  an external source — "linked-bookshelf" mode).

## 3. The real data contracts the UI binds to

Every `skl` command emits `--json`. The UI calls these and renders the result. Below are the
**actual TypeScript shapes** (from `src/types.ts`) and example payloads.

### 3a. `skl where --json` → `DeploymentReport` (PRIMARY feed for the graph)

```ts
type DeploymentKind = "linked" | "foreign-link" | "source" | "copy" | "dead";

interface DeploymentSite {
  name: string;        // skill name as deployed
  surface: string;     // the surface dir it was found under
  path: string;        // absolute path of the entry
  kind: DeploymentKind;
  target: string | null; // symlink target (null for a real copy)
  inLibrary: boolean;  // a library skill of this name exists
  drift: boolean;      // a copy whose body diverged from the library copy
}
interface DeploymentReport {
  surfaces: string[];          // surfaces scanned (realpath-deduped, existing)
  sites: DeploymentSite[];     // every classified entry
  problems: DeploymentSite[];  // the subset that is NOT a clean `linked` deploy
}
```

Example:

```json
{
  "surfaces": [
    "/Users/me/.claude/skills",
    "/Users/me/.codex/skills",
    "/Users/me/Dropbox/Obsidian/.agents/skills",
    "/Users/me/Documents/GitHub/analysis-repo/.claude/skills"
  ],
  "sites": [
    { "name": "rnaseq-qc", "surface": "/Users/me/.claude/skills", "path": "/Users/me/.claude/skills/rnaseq-qc", "kind": "linked", "target": "/Users/me/.skillshelf/library/rnaseq-qc", "inLibrary": true, "drift": false },
    { "name": "rnaseq-qc", "surface": "/Users/me/Documents/GitHub/analysis-repo/.claude/skills", "path": "/Users/me/Documents/GitHub/analysis-repo/.claude/skills/rnaseq-qc", "kind": "copy", "target": null, "inLibrary": true, "drift": true },
    { "name": "web-search", "surface": "/Users/me/.claude/skills", "path": "/Users/me/.claude/skills/web-search", "kind": "linked", "target": "/Users/me/.skillshelf/library/web-search", "inLibrary": true, "drift": false },
    { "name": "headline-picker", "surface": "/Users/me/.codex/skills", "path": "/Users/me/.codex/skills/headline-picker", "kind": "copy", "target": null, "inLibrary": false, "drift": false }
  ],
  "problems": [
    { "name": "rnaseq-qc", "surface": "/Users/me/Documents/GitHub/analysis-repo/.claude/skills", "path": "/Users/me/Documents/GitHub/analysis-repo/.claude/skills/rnaseq-qc", "kind": "copy", "target": null, "inLibrary": true, "drift": true },
    { "name": "headline-picker", "surface": "/Users/me/.codex/skills", "path": "/Users/me/.codex/skills/headline-picker", "kind": "copy", "target": null, "inLibrary": false, "drift": false }
  ]
}
```

### 3b. `skl ls --json` → the library catalog (NODE list for skills)

```json
[
  { "name": "rnaseq-qc", "description": "QC gate for RNA-seq count matrices", "primaryDomain": "bioinfo", "domains": ["bioinfo", "meta"], "path": "/Users/me/.skillshelf/library/rnaseq-qc", "retired": false, "mode": "owned", "linkTarget": null },
  { "name": "web-search", "description": "Search across many platforms", "primaryDomain": "browser", "domains": ["browser", "media"], "path": "/Users/me/.skillshelf/library/web-search", "retired": false, "mode": "owned", "linkTarget": null }
]
```

### 3c. `skl scan --json` → discovery across roots (NEW + duplicate/drift groups)

```json
{
  "roots": ["/Users/me/.claude/skills", "/Users/me/Dropbox/Obsidian/.agents/skills"],
  "totals": { "roots": 9, "candidates": 187, "new": 6, "duplicateGroups": 7, "driftGroups": 4, "exactDuplicateGroups": 3 },
  "perRoot": [
    { "root": "/Users/me/.claude/skills", "candidates": 48, "new": 0 },
    { "root": "/Users/me/Dropbox/Obsidian/.agents/skills", "candidates": 31, "new": 2 }
  ],
  "dedupedRoots": ["/Users/me/Library/CloudStorage/Dropbox/Obsidian/.agents/skills"],
  "newCandidates": [
    { "name": "headline-picker", "description": "...", "path": "/Users/me/.codex/skills/headline-picker", "root": "/Users/me/.codex/skills", "retired": false, "mirror": false, "imported": false }
  ],
  "duplicateGroups": [
    { "name": "rnaseq-qc", "kind": "drift", "identical": false,
      "canonical": "/Users/me/.skillshelf/library/rnaseq-qc",
      "divergent": ["/Users/me/Documents/GitHub/analysis-repo/.claude/skills/rnaseq-qc"],
      "duplicates": [], "locations": ["...","..."],
      "recommendation": "drift — 2 copies of \"rnaseq-qc\" differ; review and pick a canonical copy" }
  ]
}
```

### 3d. `skl status --json` → what's linked into the current project

```json
{
  "projectRoot": "/Users/me/projects/my-analysis",
  "linkedCount": 5,
  "unmanaged": [{ "name": "old-thing", "inLibrary": false }],
  "bundles": [{ "name": "bioinfo", "skills": ["rnaseq-qc", "claim-log"] }],
  "linked": [{ "link": "rnaseq-qc", "target": "/Users/me/.skillshelf/library/rnaseq-qc", "skill": "rnaseq-qc", "inLibrary": true, "domains": ["bioinfo","meta"] }]
}
```

### 3e. `taxonomy.json` → skill → domain tags (drives node color / clustering)

```json
{ "version": 1, "skills": { "rnaseq-qc": ["bioinfo","meta"], "web-search": ["browser","media"], "note-kit": ["business"] } }
```

## 4. Real sample data (use this so mockups feel true)

**9 locations** (roots), with real character:

| Location | ~count | note |
|---|---|---|
| `~/.claude/skills` | 48 | main collection (global, Claude Code) |
| `~/Dropbox/Obsidian/.agents/skills` | 31 | portfolio / business / philosophy; `.agents` bridge fmt |
| `~/Library/CloudStorage/Dropbox/Obsidian/...` | (alias) | **same vault** → collapsed |
| `/Volumes/External/.../skills` | 12 | external drive, writing skills |
| `~/Documents/GitHub/writing-skills/skills` | 18 | nature-* writing/figure set |
| `~/Documents/GitHub/analysis-repo/.claude/skills` | ~20 | bioinfo + a `_retired/` subdir |
| `~/Documents/GitHub/infra-repo/.claude/skills` | few | cloud-cost; `.agents` mirror |
| `~/Documents/GitHub/webapp/.claude/skills` | ~? | project skills |
| `~/Documents/GitHub/claim-log/skill` | 9 | claim log |

**Library:** ~113 skills. **Domains:** `bioinfo, business, philosophy, content, ops, browser,
meta, sci-writing, media`. **Example skill names:** `rnaseq-qc, web-search, config-backup,
claim-log, style-guide, attention-audit, prose-style, cost-report`, and a large `note-*`
family (`note-kit, note-action, note-benchmark, note-chatroom, note-decision, …`).

**Cross-agent surfaces:** `~/.claude/skills`, `~/.codex/skills`, `~/.cursor/skills`,
`~/.opencode/skills`, plus project `./.claude/skills`.

## 5. Chosen design direction — the Constellation

### Node + edge model (the spine)

```
NODES
  ★ skill    — sized by # of deployments; hue = primary domain; ◆ badge if NEW (not in library)
  ◆ location — one of the 9 roots / surfaces; larger, labeled anchor
  ○ project  — a project that has skills linked into it (ringed node)

EDGES
  skill → location   "lives-in"   thin gray
  skill → project    "linked"     blue
  skill ↔ copy       "DRIFT"      red, pulsing      ← the hero signal
  skill ↔ copy       "dupe"       amber
  dead/orphan        dashed gray, faded
```

A drifted skill = a ★ with two gray "lives-in" lines, **one turned red** because the bodies
disagree, plus blue lines to the projects it's linked into. The story tells itself.

### Layout

Force-directed (ForceAtlas2) with **same-domain attraction**, so `bioinfo`, `business`,
`philosophy`, etc. each gather into a visible **constellation**. The clusters answer "what do
I have a lot of" for free. Realpath-aliases and bridge-mirrors are collapsed before layout.

### Taming 113+ nodes (critical — must stay legible)

1. **"Problems only" toggle** — collapses the sky to just the `problems[]` subgraph (drift /
   foreign-link / untracked copy / dead / untagged). Turns a hairball into a short to-do list.
2. **Ego-focus on click** — selecting a node lights its neighborhood; everything else dims to ~10%.
3. **Filter bar** — `[domain ▾] [location ▾] [status ▾]` + a fuzzy search box.

## 6. Screens (information architecture)

1. **🗺️ Map (home)** — the constellation. Filter bar + "Problems only" switch + live ⟳ dot.
2. **⚠️ Drift Inbox** — the `problems[]` list as a triage queue (each row → diff + fix buttons).
3. **🔍 Skill detail** (side panel) — opens on node click:
   - canonical path + `owned`/`linked` mode + "✅ in library"
   - **lives at (N):** every deployment site with its kind label (`✓ linked`, `⚠ drifted copy`, …)
   - **linked into:** project list
   - tags (editable), retired flag
   - actions: `View diff` · `Keep library` · `Keep <copy>` · `Import` · `Edit` · `Drop`
4. **📚 Library** — flat catalog (from `skl ls --json`), search + tag filter, grid/list.
5. **📦 Projects** — per-project linked skills (`skl status --json`), `use`/`drop` toggles.

## 7. Interaction principles

- **Read to understand, click to act.** Every ⚠ badge is a button that runs the matching verb.
- **Command echo.** Each action shows the exact `skl` command it will run, e.g.
  `$ skl where rnaseq-qc --fix` or `$ skl import headline-picker --from ~/.codex/skills/headline-picker`.
  Builds trust (no hidden mutation) and teaches the CLI.
- **Never auto-resolve a real decision.** Dead links / identical copies can auto-fix; **drift,
  second-source, and untracked copies always require a human choice** (mirror the CLI's
  `--prune` vs `--fix` vs `manual` split).
- **Keyboard-first.** `⌘K` command palette to jump to any skill or fire any verb.
- **Live.** FSEvents watcher → the graph updates as files change on disk.

## 8. Visual language

- **Night-sky / terminal-adjacent.** Dark canvas. Skills glow by domain hue. Locations are
  larger labeled anchors; projects are ringed nodes.
- **Calm until it matters.** Mostly muted; **drift edges pulse red** to pull the eye.
- **Monospace** for every path / command / code; sans for chrome.
- **Status palette (learn in 5s):** `● in-library` `◆ new` `⚠ drift` `⧉ dupe` `🔗 linked`
  `✗ dead`.

## 9. Proposed tech stack (for reference — design need not assume it)

Tauri 2 shell · Svelte 5 + Vite · Tailwind · TanStack Query (binds the `--json` feeds) ·
graphology + sigma.js (WebGL graph) + forceatlas2 layout · CodeMirror 6 (drift diff + editor).
Frontend talks to the engine over the `skl … --json` contract (Tauri `invoke` → Rust → `skl`).

## 10. What to generate first

The **Map (home) screen**: dark constellation canvas with the filter bar, the "Problems only"
toggle, a selected-skill **side panel** (Skill detail from §6.3 with command-echo actions), and
the bottom status strip (`⚠ 4 drift · ⧉ 3 dupes · 🏷 9 untagged · ◆ 6 new → Drift Inbox`).
Use the real sample data from §4 so it reads true.
