# skillshelf — Feature Scope v2 (post-competitive study)

> A rethink of what the skillshelf app should *do*, after studying
> [`iamzhihuix/skills-manage`](https://github.com/iamzhihuix/skills-manage) (Apache-2.0,
> Tauri v2 + React + SQLite, GUI-first). We **pause implementation** and refine scope first.
> This sits above ADR-0008 (visual port) and ADR-0007 (fact-vs-inference). Where this doc and
> ADR-0008 disagree on the Inspector, **this doc wins** (the detail view gets richer).

---

## 0. The bet (don't lose the identity while borrowing the polish)

skills-manage is a more mature **GUI app**. We will borrow its best UX, but keep the three
things that make skillshelf *not* a clone:

- **CLI-first / agent-drivable.** Every capability is a `skl … --json` verb a human OR an agent
  can run. The GUI is one face; skills-manage has no CLI and can't be scripted/agent-driven.
- **Git-backed, transparent state.** Flat library + `taxonomy.json` + `shelf.lock.json` —
  diffable, versionable. We do **NOT** introduce a SQLite metadata DB (skills-manage's choice).
- **The consolidation/drift engine.** `where` (deployment classification), content-hash drift,
  dedupe, owned-vs-linked, realpath alias-collapse — our moat, and our user's original pain.

Hard rule (ADR-0007): no LLM judgment rendered as fact. The AI "explanation" tab becomes a
**suggestion channel**, opt-in, clearly labelled, backed by a future `skl suggest --json`.

**Licensing:** skills-manage is Apache-2.0 → reuse is allowed *with attribution* (keep a NOTICE
entry). It's React→Svelte, so we mostly reimplement patterns, not lift files.

## 1. Feature matrix — current + new

Legend: **HAVE** = already built/works · **NEW** = to add · **L2** = needs a `skl --json` change.

### A. Browse & find
| Feature | Status | Source |
|---|---|---|
| Library list (name, domains, description, mode) | HAVE | `ls --json` |
| Fuzzy search (name/desc/tags) | HAVE | client |
| **Sort by name / domain / created / modified / #deployments** ⭐ | **NEW · L2** | `ls --json` + new `createdAt`/`modifiedAt` (file stat), `deployCount` (from `where`) |
| Filter by domain / source(owned·vendored) / status(untagged·drift·retired) | NEW | `ls`+`where`+lockfile |
| List ↔ grouped view (by domain / by prefix-family) toggle | NEW | client (his `SkillListModeToggle`) |
| Virtualized list (smooth at 100s–1000s) | NEW | client |

### B. Skill detail — the big borrow ⭐ (his `SkillDetailView`)
A rich detail surface (full panel or drawer), replacing the slim Inspector for "view" mode:
| Part | Status | Source |
|---|---|---|
| Tabs: **Rendered Markdown · Raw source · (deferred) AI suggestion** | **NEW** | body via `show --json`; render w/ a Svelte markdown lib (`marked`+sanitize or `svelte-markdown`) + GFM |
| **Frontmatter card** (parsed name/description/triggers/license) | **NEW** | `show --json` parsed frontmatter (reuse `src/lib/frontmatter.ts`) |
| **File / directory tree** of the skill (SKILL.md + reference files), each viewable | **NEW · L2** | `show --json` → `refFiles[]` (path, kind); per-file read |
| Copy-raw button | NEW | client |
| **Provenance** (source/ref/hash, clean vs local-edits) | NEW | lockfile via L2 (see §2) |
| **Deployed-at / drift** (every place it lives, classified) | HAVE-ish | `where <name> --json` |
| **Tags editor** (add/remove domains) | HAVE | `tag`/`untag` |
| **Lifecycle actions** (rename/retire/unretire/rm) + command echo | HAVE | verbs |

### C. Where-is-it / drift — keep & feature it (our moat)
| Feature | Status | Source |
|---|---|---|
| Matrix: skill × domain ↔ skill × **location/surface** toggle | NEW (domain) / HAVE (location) | `ls` + `where` |
| Drift inbox (drift/dead/untracked/2nd-source) + auto-fix-safe | HAVE | `where --problems`, `--fix/--prune` |
| Dedupe / owned-vs-linked / alias-collapse | HAVE | `scan`, `where` |

### D. Deploy / install across tools (borrow his breadth)
| Feature | Status | Source |
|---|---|---|
| Link/unlink a skill or bundle into a project (`.claude/skills`) | HAVE | `use`/`drop`/`link` |
| **Per-platform install/uninstall panel** across the agent-surface registry | NEW · L2 | expand `core/surfaces.ts` registry + `--json` |
| **Custom platform config** (add your own skill dir convention) | NEW | settings → roots/surfaces |
| Cross-agent breadth (claude, codex, cursor, gemini, windsurf, copilot, aider, openclaw…) | NEW | surfaces registry (he has 25+) |

### E. Organize
| Feature | Status | Source |
|---|---|---|
| Tags-as-domains (flat, multi-tag) | HAVE | `taxonomy.json` |
| **Bundles** = saved tag-queries (our answer to his "collections") | HAVE-ish | `ls <bundle>`; surface in UI |
| Bulk tag / retire (tag needs a domain) | HAVE | verbs |

### F. Acquire
| Feature | Status | Source |
|---|---|---|
| Import a scattered copy into the library | HAVE | `import` |
| Add third-party from GitHub | HAVE | `add` |
| Outdated / update vendored (provenance) | HAVE | `outdated`/`update`/`refresh` |
| **Marketplace browser** (browse community repos, import) | NEW (P3) | network; mirror his `marketplace` surface |

### G. App-level
| Feature | Status | Source |
|---|---|---|
| Command palette ⌘K (jump / run any verb) | NEW | client |
| ~~i18n EN / 中文~~ | **DEFERRED** (§7.4 — not in scope yet) | — |
| Live updates (FSEvents → re-query) | NEW | Tauri watcher |
| Themes (light default; optional accents) | NEW (P3) | client |
| Onboarding (first-run: pick roots/surfaces) | NEW (P3) | client |

## 2. Backend (`skl --json`) additions this implies — the L2 work

Keep logic in the engine so the agent gets it too. Small, bounded additions:

1. **`skl ls --json`** → add `source` (provenance), `createdAt` + `modifiedAt` (file stat on the
   skill dir / SKILL.md), `deployCount` (count of clean `where` sites). *(Enables sort + Source
   column + provenance sidebar.)*
2. **`skl show <name> --json`** (new or extend) → `{ body, frontmatter, refFiles:[{path,kind}],
   createdAt, modifiedAt, source }` + a per-file read (`skl show <name> --file <path> --raw`).
   *(Enables the Rendered/Raw tabs + the file tree.)*
3. **Surface/platform registry `--json`** → list known + custom agent surfaces with install state
   per skill. *(Enables the deploy panel + custom platforms.)*
4. Fixtures regenerated after each, so browser/dev still renders real data.

No SQLite. No new state store — timestamps come from `stat`, everything else from the existing
files. (This is the deliberate divergence from skills-manage.)

## 3. The two functions you called out, specified

- **View a skill as Rendered Markdown / Raw / (later) Explanation** — a tabbed detail panel
  (his `PreviewTab = "markdown" | "raw" | "explanation"`). Rendered = Svelte markdown + GFM with
  sanitize; Raw = the verbatim `SKILL.md` in a mono `<pre>` with copy; Explanation = **deferred**
  to the ADR-0007 suggestion channel (greyed/"coming soon", never faked). Plus the **frontmatter
  card** and the **file tree** so multi-file skills are fully browsable.
- **Sort the list by created / modified** (and name / domain / #deployments), ascending/descending.
  Requires the `createdAt`/`modifiedAt` fields from §2.1. Default sort: modified ↓ (recently
  touched first) — matches how you actually work.

## 4. What we deliberately do NOT take from skills-manage

- **SQLite metadata DB** — stays git-backed JSON (our transparency bet).
- **GUI-only logic** — every feature routes through `skl --json` (agent parity).
- **AI explanation as a peer tab** — becomes an opt-in suggestion (ADR-0007), not a default fact.
- **Unencrypted PAT/key storage** — we don't store secrets; auth stays in the existing gateway/env.
- Marketplace, themes, onboarding — **later** (P3), not core.

## 5. Phasing (we paused, so re-baseline)

- **P1 — Core manager** (mostly built; finish + reskin per ADR-0008): library list **+ sort + filter**,
  the **rich detail view** (render/raw/frontmatter/tree), where/drift, tags, lifecycle, deploy
  (use/drop). Ship this first — it's a complete, differentiated tool.
- **P2 — Reach & ergonomics:** per-platform deploy panel + custom platforms, bundles UI, ⌘K palette,
  live FSEvents. *(i18n dropped — §7.4.)*
- **P3 — Growth:** marketplace browser, AI suggestion channel (`skl suggest --json`), themes,
  onboarding.

## 6. Layout impact (reconciles ADR-0008)

The Workbench shell (top bar · sidebar · tabs · health strip) from ADR-0008 stays. The change
(resolved §7.1): the slim right **Inspector** stays for quick select/edit, and opening a skill
slides out a **full-width Detail DRAWER** (his `SkillDetailDrawer` shape) holding the tabbed
Rendered/Raw view + frontmatter card + file tree, with provenance / deploy / tags / lifecycle as
side sections. The Library tab gains the **sort control** + filter chips + list/group toggle.

## 7. Resolved decisions ✅

1. **Detail surface = full-width DRAWER for view.** Opening a skill slides out a drawer (his
   `SkillDetailDrawer` shape) with the tabbed Rendered/Raw + frontmatter card + file tree + the
   provenance/deploy/tags/actions sections. The slim right Inspector stays only for quick
   select/edit; deep viewing happens in the drawer.
2. **No new "collections" concept — use BUNDLES** (saved tag-queries, `skl ls <bundle>`) surfaced
   in the UI as the grouping primitive. One fewer concept.
3. **Platform breadth is P2.** P1 ships with the current surfaces (claude / codex / cursor /
   opencode); expand toward his 25+ + custom-platform config in P2.
4. **No i18n yet.** Dropped from P1/P2 scope. English-only for now; revisit later if needed.
