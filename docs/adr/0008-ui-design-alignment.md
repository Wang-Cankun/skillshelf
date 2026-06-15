# 8. Align the built UI with the Workbench design (visual port, multi-agent, drawer)

Date: 2026-06-14 (rev. 4 — stack pinned: **React 19 + Tailwind v4 + shadcn/ui + TanStack Query +
Zod + react-markdown** (see §0). rev. 3 switched Svelte 5 → React; rev. 2 fidelity-audited the
design against `Workbench.dc.html` and added the Drawer + multi-agent)

## Status

Accepted — supersedes the *visual/layout* of the first UI build (`e5ee101`). Implements the
visual + feature target set by the **remade design mockup** and `feature-scope-v2.md`. Does NOT
change ADR-0007 (fact-vs-inference, function-first).

## Context

The remade, self-contained design mockups are the **visual + interaction source of truth**:

- the Workbench mockup HTML — READ IT FIRST (in full)
- the sample uploads it was designed against — real data it was designed against
- the sample skill files (per-skill directories) — for the file-tree/detail

It is a big evolution over rev. 1: it adds the **Detail Drawer** (file tree + Rendered/Raw/
Explanation tabs + frontmatter + provenance + an **AGENTS** rail), a **Matrix** that toggles
**Domain ↔ Agent** (with a scope selector), **multi-agent deploy toggles**, library **sort/group**
(Modified/Deploys columns), a global **undo toast**, and a **type-to-confirm Remove** modal.

The data/bridge layer from the first build is good and **must be preserved**; the visual layer
(App shell + components) is rebuilt to match, and several **small `skl --json` additions** are
needed (see §7) — kept in the engine so the agent gets them too.

## Decision

Rebuild the presentation layer to faithfully reproduce `Workbench.dc.html`, wired to REAL
deterministic `skl` data, preserving every hardened behaviour from the review. AI stays an
opt-in deferred suggestion (ADR-0007): the drawer's **Explanation tab is "coming soon"**, and the
slim Inspector's "near-duplicate" block is **deferred/omitted** for v1 (it's the one AI-as-fact
remnant; do not render an LLM judgment as fact).

### 0. Stack — React + Tailwind/shadcn + a small typed data layer (rev. 4)

Since rev. 2 is a near-total UI rebuild anyway, the sunk cost of staying on Svelte is ~nil, so we
pick the framework with the most forward leverage for **how this app is actually built (by agents)**.
The committed stack:

| Layer | Pick | Why for skillshelf |
|---|---|---|
| Build | **Vite + React 19 + TypeScript** | Tauri default; fast HMR; agents emit React most reliably. |
| Styling | **Tailwind v4 + CSS variables** | Token-driven, dense-UI friendly; the §2 design tokens become CSS vars (theme + status hues). |
| Components | **shadcn/ui (Radix + Tailwind)** | You own the source — ideal for a tool you customize forever. Pull only what you need; re-skin to the §2 light tokens. |
| Icons | **lucide-react** | Pairs with shadcn. Keep the mockup's Unicode status glyphs (`●◆✓⚠□✗🏷`) for cells; lucide for chrome. |
| Server state (`skl --json`) | **TanStack Query** | Caches `ls`/`where`/`scan`; optimistic mutation + `onError` rollback = the Undo pattern for free; `invalidateQueries` on FSEvents = live updates. |
| Schema / types | **Zod** | Runtime-validate every `--json` payload at the boundary; Zod is the **single source of truth** that generates the TS types the whole UI binds to (`DeploymentReport`, `ls`, lockfile). |
| Markdown (drawer) | **react-markdown + remark-gfm + rehype-sanitize** | React-native render for the Rendered tab; frontmatter stripped first. |

- **Why React (the honest driver)** — agents generate React reliably and the ecosystem /
  skills-manage adjacency is deeper. **Not** "1:1 code reuse" (the mockup is a bespoke `DCLogic`
  DSL, not React — it ports to either framework with equal effort).
- **Deliberately deferred (don't pre-pay):** **TanStack Table/Virtual** — only when rows hit 1000s
  (Matrix ~17×12, Library ~113 today render fine; hand-roll sort/group per the mockup until then);
  **cmdk** (⌘K is P2); **sonner** (use shadcn's toaster when wired, else the mockup's hand-rolled
  toast); **Zustand** (start with `useReducer` + context; add only if prop-drilling hurts);
  **React Hook Form** (no real multi-field forms in P1 — keep Zod, skip RHF); **TanStack Router**
  (single-window desktop app — `view`/`scope`/`filter` live in reducer state, not a URL).
- **What this does NOT touch** — `skl.ts`, `types.ts`, `fixtures.ts`, and all of `src-tauri/**`
  are framework-agnostic and carry over **untouched** (§1). Only `App.svelte` + the components are
  rebuilt — which rev. 2 was already rebuilding.
- **One real cost (do not wave off)** — adopting TanStack Query means the preserved dispatch/error
  **contract** (§1) is re-expressed as Query **mutations** (optimistic patch → `onError` rollback →
  `invalidateQueries`). That logic is *security-sensitive* (the `ALLOWED_VERBS` sync that regressed
  once, path-traversal + rm-guard, `res.ok`/`stderr` surfacing). Port it **deliberately and re-run
  the same review pass** — the behaviour is preserved even though the mechanism changes.

### 1. Preserve (DO NOT rewrite — passed review + verification)

- `app/src/lib/skl.ts` — bridge (`IS_TAURI`, `invokeJson` guarded parse + non-zero throw,
  `runAction` → `SklResult`, `cmdEcho`, browser fixture fallback). Add loaders for new feeds (§7).
- `app/src/lib/types.ts` — `--json` contract types. Extend only — and back them with **Zod schemas**
  (§0) so the same definition validates the payload at runtime *and* generates the TS type.
- `app/src/lib/fixtures.ts` — real captured data; regenerate after §7.
- `app/src-tauri/**` — Rust shell: absolute-`skl`-path resolution (Finder launch), subcommand
  **allowlist** (`ALLOWED_VERBS` — keep covering every dispatched verb; **add `agents`, `show`,
  `diff`** as they get used), `SklResult`, CSP.
- The **dispatch + error contract** currently in `App.svelte` — **the behaviour, not the file**:
  `dispatch(args,onOk)` checks `res.ok`, surfaces `res.stderr`, reloads only on success; `loadAll`
  uses `Promise.allSettled`; bulk tag needs a domain; valid verbs only. Re-express as **TanStack
  Query mutations** (optimistic patch → `onError` rollback → `invalidateQueries`) preserving every
  one of those guarantees; it's security-sensitive (§0) — re-review.
- `app/src/lib/skl.ts` / `types.ts` / `fixtures.ts` are **framework-agnostic** — they're plain TS,
  so React imports them unchanged (no Svelte store/`.svelte` coupling to unwind). `skl.ts` becomes
  the `queryFn`/`mutationFn` body Query calls; `fixtures.ts` is the browser-mode `queryFn` fallback.

### 2. Design tokens (from the mockup `<style>` — use everywhere)

- surfaces: page `#FAFAFA`, panel `#FFFFFF`; borders `#E7E7E9` / subtle `#EFEFF1`/`#F3F3F4`
- text: ink `#18181B`, sub `#71717A`, faint `#9A9AA2`, absent `#C7C7CC`
- status: green `#15A34A`, amber `#D97706`, blue `#2563EB`, red `#DC2626`, gray `#8A8A92`
- domain hues: portfolio `#2563EB`, content `#0891B2`, business `#D97706`, sci-writing `#DC2626`,
  docs `#7C3AED`, meta `#15A34A`, philosophy `#DB2777`, ops `#71717A`, bioinfo `#0D9488`,
  browser `#65A30D`, media `#9333EA`, `_unclassified` `#C7C7CC`
- type: `system-ui` sans (chrome) + `ui-monospace,'SF Mono',Menlo` (paths/commands/names/counts).
  radii 6–14px, 1px borders. Encode all of the above as **Tailwind v4 `@theme` CSS variables**
  (`--color-ink`, `--color-domain-portfolio`, …) so utilities + shadcn components read the same
  token set; the `livepulse`/`drawerIn`/`scrimIn`/`toastIn` keyframes + `.md-body` styles port from
  the mockup. Rendered markdown uses **`react-markdown` + `remark-gfm` + `rehype-sanitize`** into
  the `.md-body` scope; strip frontmatter before render.

### 3. Layout shell

Full-height flex column: **top bar (46px)** (logo + bold `skillshelf` + divider + faint `workbench`
sub-label + centered search pill `Search {n} skills, run a command…` `⌘K` + Live/FSEvents dot) ·
**three panes** · **health strip (30px)** (`113 skills · 12 domains · 1 source repo` left;
right side = four **individually-colored, count-bearing** spans `◆ {n} vendored` (blue) ·
`✓ {n} local edits` (green) · `🏷 {n} untagged` (amber) · `◆ {n} stub` (gray), sample 21/0/1/1).
Global overlays: **undo toast** (§6), **type-to-confirm Remove** (§6), **Detail Drawer** (§5).
*(Exact px/hex for every element live in the mockup `<style>`/markup — §2 says copy them verbatim;
this ADR specifies structure + behaviour, not each token.)*

- **Sidebar (234px):** `SMART VIEWS` — 5 rows with colored glyph + label + mono count:
  `⚠ Needs attention · 6` (→ Inbox, **no filter**), `◆ Vendored · tracked · 21`, `● Local ·
  authored · 92`, `🏷 Untagged · 1` (→ Library with the matching filter), `◇ All skills · 113`
  (→ Library, **filter:null** = clears). So **most** rows set `{view:'library', filter}` but
  `Needs attention` sets `{view:'inbox'}` and `All skills` clears the filter — not a blanket
  library-filter. `BY DOMAIN · 12` (hue dot + count + bar normalized to the max domain,
  portfolio 26 → 100%; click → domain filter). `PROVENANCE` (3 rows + a pinned-source card reading
  `◆ skills @a58f647 · pinned`, mono, blue diamond). Filter kinds: `source`, `domain`, `untagged`.
- **Main:** tab row `Inbox · Matrix · Library` (active = ink underline + dark count badge),
  per-tab toolbar, scrolling content (§4).
- **Inspector (slim, 312px):** quick select/edit only — name + source badge + tag chips + an
  **`Open detail ↗`** button (opens the drawer) + a provenance summary. (Omit the near-dup block.)

### 4. Tabs

- **Inbox** (`Needs attention`): deterministic triage from real signals — `UNTAGGED`
  (domains empty), `STUB` (description == scaffold default), `THIN TAGS` (one prefix-family spans
  several domains = tag drift; glyph `🏷` gray), `TRACKED` (lockfile, clean), `FAMILY`
  (string-prefix), plus `DRIFT`/`DEAD`/`UNTRACKED`/`2ND-SOURCE` from `where --problems`. *(The
  sample mockup renders UNTAGGED/STUB/THIN-TAGS/TRACKED/FAMILY rows; DRIFT/DEAD/UNTRACKED/2ND-SOURCE
  come from the real `where --problems` feed and simply aren't in the static sample — not a missing
  requirement.)* **Intentionally omitted: the `NEAR-DUP` row** — the mockup *does* render one
  (`□` amber, `Diff`/`Merge ▾`, echo `skl diff …`), but it is an LLM ≈-similarity judgment, so per
  ADR-0007 v1 drops it (drop the `near-dup` segment from the toolbar summary too). Toolbar: title
  `Needs attention` + a faint summary subline (`N untagged · N stub · N to review`) on the left;
  `⚙ Dry-run` toggle + `Auto-fix safe (n)` → `where --fix` on the right. Rows: severity glyph +
  label + skill (mono, **click → open drawer**) + detail + counts + `✓ auto` + valid-verb actions.
  Below the table: a mono footer legend — green `✓ auto` = safe one-click (prefix-infer tag) + a
  "Click a skill name to open its detail drawer" hint.
- **Matrix** — `GRID` mode pills **Domain | Agent**:
  - Two **fixed leading columns persist in both modes**: a **sticky** `SKILL` name column (the
    click→drawer target) + a non-sticky `SOURCE` column (`skills` blue / `local` faint).
  - **Domain mode:** columns = 11 domains; cell `●` primary / `◦` also-tagged / empty. A fully
    **untagged row** renders empty with an amber tint, and the legend carries `empty row =
    untagged`. Toolbar also shows an inline `● primary · ◦ also-tagged` hint. From `ls --json`.
  - **Agent mode:** columns = **agents** (`AGENTS` registry §6; dimmed if not installed) + a
    `SCOPE` pill row (`Global` + each project, e.g. `my-analysis`, `lab`; mono, **blue** active
    accent vs the dark mode pills); cell glyph = deployment state for that (skill, agent, scope):
    `✓` linked/clean, `⊙` source, `⚠` drift, `□` copy, `✗` dead, `·` absent. The rendered legend
    shows 5 chips (omits `✗ dead`, still a valid cell glyph). "project copy shadows global." From
    `where --json` mapped to agents (§6/§7).
  - Click a skill name → open drawer. Legend swaps per mode.
- **Library** — table columns: `☐ · SKILL · DOMAINS · SOURCE · MODIFIED · DEPLOYS · DESCRIPTION`.
  Toolbar (top row): fuzzy search + active filter chip + a persistent `+ tag filter` chip +
  right-aligned `{n} skills` count. Sort row: **SORT** pills `Modified · Name · Domain · Deploys`
  + a direction toggle (`↓/↑`, default Modified ↓); **VIEW** pills `List · By domain · By family`
  (grouped rendering with bucket label + count; family buckets label as `<prefix>-*`, domain
  buckets fall back to `_unclassified`). Row: checkbox (bulk) + name (mono, **click → open
  drawer**) + domains + source chip + modified (mono) + deploys (mono) + description. Multi-select
  → dark sticky **bulk bar**: a `▸ {n} selected` summary + **Tag** (needs a domain) + **Retire**
  only (drop Export/Update for v1, or wire only if valid) + an `⌫ clear`. Bulk echo = a derived
  value (`useMemo`) of the real verb + full names.

### 5. Detail Drawer ⭐ (the centerpiece — `feature-scope-v2.md §7.1`)

Opens on any skill-name click; full-width `min(1080px, 94vw)`, right-anchored, scrim + `drawerIn`
animation, **Esc closes**. Build on shadcn's **`Sheet`** (Radix Dialog — gives scrim, focus-trap,
Esc, `side="right"` for free); restyle to the mockup tokens + the `drawerIn` keyframe. Three columns:

1. **File tree (212px):** `FILES` list from the skill's `refFiles` — `[path, kind, depth]`,
   indented by depth, icons (`·` md, `{}` json, `▸` dir; dirs non-clickable). Clicking a file
   **lazy-loads** it (`skl show <name> --file <path>`), cached.
2. **Center — tabs `Rendered · Raw · Explanation` + `Copy raw`:**
   - **Rendered:** markdown→HTML (GFM, sanitized, frontmatter stripped) in `.md-body`.
   - **Raw:** verbatim file in a mono `<pre>` (wrap).
   - **Explanation:** **"AI explanation — coming soon"** placeholder — an opt-in suggestion channel
     (ADR-0007), never faked, backed by a future `skl suggest --json` (P3).
   - Body loads on demand via `skl show <name> [--file <path>] --json`.
3. **Right rail (296px):**
   - **FRONTMATTER:** name, description, triggers (chips), license — parsed from the body.
   - **PROVENANCE** (vendored only): source / ref / hash. The mockup renders only the **clean**
     state (`✓ clean — no local edits`, green); the "local edits" variant is design-implied — spec
     it explicitly from the lockfile `localEdits`/hash compare when wiring (don't assume the mockup
     shows it).
   - **AGENTS** (multi-agent, §6) — section caption `global + projects` (mono, faint): one row per
     agent — name (+ `not installed` badge; **not-installed rows dimmed ~0.6**), a global
     **Link/Unlink** toggle (Link = solid dark; Unlink = white/bordered), the global state
     glyph+label (`✓ global · clean` / `+ not in global`), **project chips** (projects where
     deployed + state), and the target path — **always the agent's GLOBAL dir**
     `~/.<agent>/skills/<name>` regardless of where it's actually deployed (projects show only as
     chips). Footnote: "project copy shadows global · live from `skl where`".
   - **TAGS:** domain chips (**gray** `#F4F4F5`/`#52525B`, not blue) with `✕` (untag) + a dashed
     `+ add` chip.
   - **LIFECYCLE:** `Rename` (placeholder — inert in the mockup) · `Retire` · `Remove` (red) + a
     single command-echo line hardcoded to `skl retire <name>` (doesn't switch per button).
     Remove → §6 modal.
   - Drawer **header:** mono skill name + source badge (`◆ vendored` / `● local`) + domain tag
     chips, then `Edit SKILL.md` / `Open folder` / `✕ close`. `Edit SKILL.md` / `Open folder` route
     through the **Tauri shell** (open in `$EDITOR` / Finder), NOT a `skl edit/open` verb (those
     don't exist). The drawer has three close affordances: `✕` button, scrim click, and Esc.

### 6. Multi-agent model (the headline addition)

- **Agent registry** — `{ id, name, short, global:'~/.<id>/skills', projConvention:'.<id>/skills',
  installed }`. Seeds: claude, codex, cursor, opencode, gemini. From `skl agents --json` (§7).
- **Scopes** — `Global` + each known project that has deployments (derived from `where`).
- **Deployment state** — per `(skill, agent, scope)` ∈ `clean | source | drift | copy | dead |
  absent`, computed from `where --json` sites resolved to agent + scope. `project copy shadows
  global`.
- **Three lenses on the same skill↔agent relationship:**
  1. **From a skill** → the drawer **AGENTS rail** (Link/Unlink per agent, global + project chips).
  2. **The bird's-eye** → the **Matrix Agent mode** (skill × agent grid + scope selector).
  3. **From an agent** → (P2) a dedicated agent view; for v1 the sidebar/matrix suffice.
- **Deploy verbs:** Link → `skl use <skill> --agent <id> --global` (or `--project <name>`);
  Unlink → `skl drop <skill> --agent <id> --global|--project <name>`. Every toggle shows an
  **undo toast** with the exact command (§6 toast).
- **Scope rule (ADR-discussion):** Global agent surfaces are the **actionable** targets in the GUI;
  project deployments render as **read-only context** (chips) — a desktop app has no "current
  project," so GUI mutation targets Global; project linking stays a CLI job.

### 6b. Global affordances

- **Undo toast:** after deploy / retire / untag, a bottom-center toast: message + command echo +
  `Undo` + a `✕` manual-dismiss (auto-dismiss ~6s). Undo reverses the optimistic state and
  re-issues the inverse verb. A **no-undo variant** exists (Undo hidden when there's nothing to
  reverse): confirming a hard **Remove** fires `Removed <name> — deleted from disk` echoing
  `skl rm <name>` with no Undo. Implement on **`sonner`** (shadcn toaster) restyled to the dark
  mockup token; the Undo `action`/inverse-verb falls out of the Query mutation's `onError` rollback.
- **Type-to-confirm Remove:** `skl rm` modal (shadcn **`AlertDialog`**) — warns it deletes from disk
  + **irreversible**, suggests Retire instead, shows an in-modal `$ skl rm <name>` echo, and only
  enables the red `Remove` once the user types the exact skill name. (Retire stays one-click +
  undoable.)

### 7. Backend additions (`skl --json`) this implies — keep in the engine

1. **`skl ls --json`** → add `source` (provenance), `modifiedAt` (+ `createdAt`) from file stat,
   `deployCount` (clean `where` sites). Enables Source col, sort, Deploys col.
2. **`skl show <name> --json`** → `{ body, frontmatter:{name,description,triggers[],license},
   refFiles:[{path,kind,depth}] }`; **`skl show <name> --file <path> --json`** → one file's content.
   Enables the drawer's tree + Rendered/Raw tabs (lazy).
3. **`skl agents --json`** → the agent registry (id/name/dirs/installed) + per-skill deployment
   state across agents × scopes. (May reuse `where --json` + a **surface→agent resolver**: map each
   site's `surface` path to an agent id and a scope (Global vs project name); collapse aliases.)
4. **`skl use/drop … --agent <id> --global | --project <name>`** → new flags targeting a specific
   agent's global or named-project skill dir (today they target `./.claude/skills`).
5. Regenerate `fixtures.ts` (`ls`, `where`, `scan`, `status`, `agents`, a couple `show`) after each,
   so browser/dev still renders real data. **No SQLite, no new state store** (the divergence from
   skills-manage): timestamps from `stat`, everything else from the existing files.

### 8. Invariants (ADR-0007 + review — non-negotiable)

- UI is presentation only; every value is a backend fact, or a clearly-deferred suggestion.
- Only valid `skl` verbs dispatched/echoed — never `prune`/`fix`/`export`/`open`/`edit` top-level
  or `infer <name>`. Keep `ALLOWED_VERBS` in `lib.rs` in sync (add `agents`/`show`/`diff`).
- Every mutation checks `res.ok` and surfaces `res.stderr`; destructive ops confirm; deploy/retire/
  untag are **undoable** via the toast.
- Command echo always matches the exact vector that runs.
- No LLM judgment as fact: Explanation tab + near-dup are deferred suggestions, not defaults.
- A11y: clickable rows/cells are real buttons/`role`+`tabindex`+keydown; inputs have names.

## Build, run, verify

First re-point the toolchain: **drop** `@sveltejs/vite-plugin-svelte` + `@tsconfig/svelte` +
`svelte`; **add** `@vitejs/plugin-react` + `react`/`react-dom` (+ `@types/*`), `@tanstack/react-query`,
`zod`, `react-markdown` + `remark-gfm` + `rehype-sanitize`, `lucide-react`. **Keep**
`@tailwindcss/vite` (v4 — it was already wired) and init **shadcn/ui** (`components.json` + a
`src/components/ui/` you own). `check` becomes `tsc --noEmit` (not `svelte-check`). Then:

```bash
cd ~/Documents/GitHub/skillshelf/app
bun install && bun run check        # tsc --noEmit → 0 errors
bun run build                       # vite green
source "$HOME/.cargo/env" && ( cd src-tauri && cargo check )   # clean
bunx --bun @tauri-apps/cli build --debug --bundles app         # skillshelf.app (no dmg)
```
Dev (real fixtures, no Rust): `bun run dev`. Live desktop (real `skl`): `bun run tauri dev`.

## Acceptance criteria

- **Visual parity** vs `Workbench.dc.html`: top bar, 234px sidebar (clickable filters), tab row,
  per-tab toolbars (sort/group, matrix mode/scope), slim 312px Inspector, 30px health strip,
  and the **Detail Drawer** (file tree + Rendered/Raw/Explanation + frontmatter + provenance +
  **AGENTS** + tags + lifecycle). Reads as the same product side-by-side.
- **Multi-agent works:** Matrix Agent mode + scope renders real deployment state; the drawer AGENTS
  rail Link/Unlink dispatches `skl use/drop --agent --global/--project` with an undo toast.
- **Detail works:** drawer opens from any skill name; Rendered/Raw load real body + ref files.
- **Library:** sort (Modified default) + group + Modified/Deploys columns from real data.
- **Function-first/ADR-0007 honored:** valid verbs, errors surfaced, undo, no AI-as-fact.
- **Toolchain:** `bun run check` (`tsc --noEmit`) 0 errors, `bun run build` green, `cargo check`
  clean, `tauri build`
  produces a launchable app that finds `skl` from Finder.

## Consequences

- **Positive:** the app matches the approved design and finally *reads as multi-agent* (the user's
  gap), with the rich detail/drawer; keeps the function-first, git-backed, agent-drivable identity;
  the `where`/drift engine becomes visible and actionable per agent.
- **Cost:** real (but bounded) CLI work — `agents --json`, `show --json`/`--file`, `use/drop
  --agent --global/--project`, `ls --json` timestamps/deploys, plus a surface→agent resolver and
  fixture regen. The mockup's near-dup AI block + Explanation are deferred to `skl suggest --json`.
- **Risk to watch:** keep `ALLOWED_VERBS` (Rust) in sync with new dispatched verbs (`agents`,
  `show`, `diff`), or buttons fail at the bridge (caught once already). Don't let the Agent matrix
  mutate project scope (read-only); Global is the only GUI mutation target.
