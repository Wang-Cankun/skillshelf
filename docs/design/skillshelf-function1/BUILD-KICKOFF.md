# skillshelf Workbench — Build Kickoff (cold-session prompt)

> Paste this whole file as the first message of a fresh Claude Code session in
> `skillshelf-ui` on branch `feat/ui-workbench`. It is the build handoff for ADR-0008 rev. 2
> (visual port + Detail Drawer + multi-agent). Everything it needs is in-repo.

---

## Mission

Rebuild the **presentation layer** of the Tauri skill manager in **React 19 + Vite + plain CSS**
(see ADR-0008 §0 — the view layer is migrating off Svelte; **no Tailwind, no shadcn**), so it
faithfully reproduces the approved design mockup, wired to **real deterministic `skl --json` data**,
and finally **reads as multi-agent**. Preserve every hardened bridge/Rust behaviour from the prior
review. AI stays an opt-in, clearly-deferred suggestion (ADR-0007) — never rendered as fact.

**First, re-point the toolchain:** swap `@sveltejs/vite-plugin-svelte` + `@tsconfig/svelte` +
`svelte` + `@tailwindcss/vite` for `@vitejs/plugin-react` + `react`/`react-dom` (+ `@types/*`);
`bun run check` becomes `tsc --noEmit`. `src-tauri/**` + `src/lib/*.ts` are untouched.

## Read these first (in order, in full)

1. `docs/adr/0008-ui-design-alignment.md` — **the spec.** Sections 1–8 are the build contract.
2. `docs/design/skillshelf-function1/Workbench.dc.html` — **visual + interaction source of truth.**
   Read the whole file: the `<style>` tokens, every `<!-- SECTION -->`, and the `<script>`
   `renderVals()` logic (state model, `AGENTS`, `SCOPES`, `DEP`, `setDeploy`, sort/group, drawer).
3. `docs/design/feature-scope-v2.md` — **why.** On any Inspector dispute, this doc wins.
4. `docs/adr/0007-fact-vs-inference-and-ui-scope.md` — the non-negotiable invariant.
5. Sample real data the mockup binds to: `docs/design/skillshelf-function1/skills/<name>/…`
   (file trees), `uploads/{taxonomy.json,shelf.lock.json,INDEX.md}`.

## Preserve — DO NOT rewrite (passed review + verification)

- `app/src/lib/skl.ts` — bridge (`IS_TAURI`, `invokeJson` guarded parse + non-zero throw,
  `runAction → SklResult`, `cmdEcho`, browser fixture fallback). Only **add** new feed loaders.
- `app/src/lib/types.ts` — `--json` contract types. Extend only.
- `app/src/lib/fixtures.ts` — real captured data; **regenerate** after the `--json` additions.
- `app/src-tauri/**` — Rust shell: absolute-`skl`-path resolution (Finder launch), the subcommand
  **allowlist** `ALLOWED_VERBS`, `SklResult`, CSP. ⚠ **Add `agents`, `show`, `diff` to
  `ALLOWED_VERBS`** before dispatching them — a missing verb fails silently at the bridge (this
  exact regression bit us once).
- `app/src/lib/{skl,types,fixtures}.ts` are **plain framework-agnostic TS** — React imports them
  unchanged.
- The dispatch + error **contract** (currently in `App.svelte`) — preserve the *behaviour*,
  re-implement in the React root: `dispatch(args,onOk)` checks `res.ok`, surfaces `res.stderr`,
  reloads only on success; `loadAll` uses `Promise.allSettled`; valid verbs only. ⚠ It's
  security-sensitive — port deliberately and **re-run the review pass** (don't treat it as free).

## Build order (P1 — ship this)

1. **Tokens + shell.** Lift the `<style>` design tokens (surfaces/borders/text/status/12 domain
   hues, radii, fonts, the `livepulse/drawerIn/scrimIn/toastIn` keyframes) **verbatim into plain
   CSS** (no Tailwind). Layout: top bar (46px) · three panes · health strip (30px). Rendered
   markdown via `marked` + GFM + `DOMPurify` (or `react-markdown` + `remark-gfm` +
   `rehype-sanitize`), frontmatter stripped.
2. **Sidebar (234px).** SMART VIEWS (5 rows: ⚠ Needs attention·6 → Inbox; ◆ Vendored·21 /
   ● Local·92 / 🏷 Untagged·1 → Library+filter; ◇ All·113 → Library, clears filter) / BY DOMAIN·12
   (hue dot + count + bar normalized to max domain) / PROVENANCE + pinned card `◆ dbskill @a58f647`.
   Rows are clickable, but **only the middle ones set a library filter** — `Needs attention` →
   `{view:'inbox'}`, `All skills` → `filter:null`. Filter kinds: `source`, `domain`, `untagged`.
3. **Tabs + Library.** Columns `☐·SKILL·DOMAINS·SOURCE·MODIFIED·DEPLOYS·DESCRIPTION`; SORT pills
   (`Modified·Name·Domain·Deploys` + dir toggle, default **Modified ↓**); VIEW pills
   (`List·By domain·By family`); multi-select → dark bulk bar (**Tag** needs a domain + **Retire**;
   drop Export/Update for v1 unless the verb is real). Echo = a `useMemo`-derived value of the real verb.
4. **Inbox.** Deterministic triage from real signals (UNTAGGED/STUB/**THIN TAGS**/TRACKED/FAMILY
   from the sample; DRIFT/DEAD/UNTRACKED/2ND-SOURCE from the real `where --problems` feed).
   **Intentionally omit the NEAR-DUP row** (LLM ≈-judgment = AI-as-fact; the mockup renders it but
   v1 drops it + its toolbar-summary segment). Title + faint summary subline; Dry-run toggle +
   `Auto-fix safe (n)` → `where --fix`; mono footer legend. Skill name (mono) → opens drawer.
5. **Matrix.** GRID pills **Domain | Agent**. Domain: rows=skills, SOURCE col, 11 domain columns,
   `●` primary / `◦` also-tagged. Agent: columns=agents (dimmed if not installed) + **SCOPE** pill
   row (`Global` + projects) + cell glyph per `(skill,agent,scope)` state
   (`✓⊙⚠□✗·`). Legend swaps per mode. Click skill → drawer.
6. **Detail Drawer ⭐** (`min(1080px,94vw)`, right, scrim + `drawerIn`, **Esc closes**):
   file tree (212px, lazy `skl show <name> --file <path>`) · center tabs **Rendered/Raw/
   Explanation** + Copy raw (Explanation = "coming soon" placeholder) · right rail (296px):
   FRONTMATTER / PROVENANCE (vendored only) / **AGENTS rail** / TAGS / LIFECYCLE.
   Header `Edit SKILL.md` / `Open folder` route through the **Tauri shell** (`$EDITOR`/Finder),
   NOT a `skl edit/open` verb (those don't exist).
7. **Multi-agent.** Registry from `skl agents --json` (claude/codex/cursor/opencode/gemini +
   `installed`). AGENTS rail: per-agent Link/Unlink → `skl use|drop <skill> --agent <id>
   --global` (global is the GUI mutation target); project deployments are **read-only chips**
   ("project copy shadows global"). Every toggle fires the **undo toast**.
8. **Global affordances.** Undo toast (deploy/retire/untag, ~6s, command echo + Undo + `✕`
   dismiss; a **no-undo variant** fires after a hard Remove) + type-to-confirm **Remove** modal
   (`skl rm`, irreversible, in-modal echo, type exact name to enable the red button).

## Backend additions (`skl --json`) — keep in the engine (NO SQLite)

1. `ls --json` → add `source`, `modifiedAt` (+`createdAt`) from `stat`, `deployCount`.
2. `show <name> --json` → `{body, frontmatter:{name,description,triggers[],license}, refFiles:[{path,kind,depth}]}`;
   `show <name> --file <path> --json` → one file's content.
3. `agents --json` → registry + per-skill deployment state across agents × scopes (may reuse
   `where --json` + a **surface→agent resolver**: map each site's surface path → agent id + scope).
4. `use|drop … --agent <id> --global | --project <name>` → target a specific agent's global/project dir.
5. Regenerate `fixtures.ts` (`ls`, `where`, `scan`, `status`, `agents`, a couple `show`) after each.

## Invariants (ADR-0007 + review — non-negotiable)

- Presentation only; every value is a backend **fact** or a clearly-deferred suggestion.
- Only valid `skl` verbs dispatched/echoed. **Never** `prune`/`fix`/`export`/`open`/`edit`
  top-level or `infer <name>`. Keep `ALLOWED_VERBS` in sync (`agents`/`show`/`diff`).
  (Note: the mockup's hover-tooltips show `skl infer/edit/diff` echoes — those are design hints;
  do not wire them as dispatched verbs.)
- Every mutation checks `res.ok`, surfaces `res.stderr`; destructive ops confirm;
  deploy/retire/untag are **undoable** via the toast. Command echo == the exact vector that runs.
- No LLM judgment as fact: Explanation tab + the Inspector near-dup block are **deferred**.
- A11y: clickable rows/cells are real buttons / `role`+`tabindex`+keydown; inputs have names.

## Verify gate (all must pass)

```bash
cd app
bun install && bun run check        # tsc --noEmit → 0 errors
bun run build                       # vite green
source "$HOME/.cargo/env" && ( cd src-tauri && cargo check )   # clean
bunx --bun @tauri-apps/cli build --debug --bundles app         # launchable skillshelf.app
```
Dev (real fixtures, no Rust): `bun run dev`. Live desktop (real `skl`): `bun run tauri dev`.

**Done = visual parity with `Workbench.dc.html` side-by-side + multi-agent renders real
deployment state + drawer opens from any skill name with real body/ref files + the verify gate
is green.**
