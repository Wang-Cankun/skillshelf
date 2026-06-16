# Design brief — Library-first management UI (ADR-0010)

**For:** the design pass (claude designer).
**Authority:** the *model* is fixed by [ADR-0010](../adr/0010-library-first-management-skill-agent-scope.md)
— do not redesign it. You own only the **visual layout** of three sub-areas: **(b) drawer**,
**(c) anomaly-resolution flow**, **(d) deploy count bar**. Everything else here is context/guardrails.

Read first, in order: ADR-0010 (the model) → ADR-0008 §0 (the committed stack/tokens) → ADR-0007
(fact-vs-inference: never render an AI judgment as fact).

---

## What you are designing (the only deliverables)

1. **(b) Detail drawer** — the single deep surface for *one* skill. Must contain:
   - a per-skill **`agent × scope` sub-matrix**: a **Global** row + one row per project; each cell
     is a two-tier toggle (see §toggle).
   - **lifecycle**: tag/untag (domain chips), **retire** and **rm** (drawer-only, destructive —
     keep them out of the way; rm already has a type-to-confirm modal, see `RemoveModal.tsx`).
   - **source / provenance**: owned vs linked, vendored `owner/repo` (link out to GitHub),
     update-available state.
   - the skill body (Rendered/Raw tabs already exist). Explanation/AI tab stays "coming soon".

2. **(c) Anomaly-resolution flow** — what happens when a user clicks a **warning** cell
   (`drift / copy / dead / aliased`). Design the concrete options per state, e.g.:
   - `drift` → view diff · pull upstream · overwrite · keep
   - `copy` (a real dir, not a symlink) → convert to link (DANGER: would replace hand-edited
     content — must be explicit) · keep copy · adopt into library
   - `dead` (broken symlink) → repair · remove
   - `aliased` (links to library but name differs) → rename/realign · keep
   This flow can live inline (popover) and/or in the drawer — your call, but it must never
   blind-toggle a symlink.

3. **(d) Deploy count bar** — a cc-switch-style at-a-glance summary
   (`Installed N · Claude X · Codex Y · …`). Reflects the **active scope's** counts. Candidate
   placement: in/under the top scope switcher. Counts come from the deployment data, not stored.

---

## The locked model you must honor (from ADR-0010)

- **One primitive, reused everywhere:** a *filtered list of skill rows with inline per-agent
  toggles.* Three scopes = three slices of the same list: **Library** (Global), **Project view**
  (one project), **Drawer** (one skill × all scopes). **No grid** — the old Matrix is retired
  (it was ~8% dense and useless).
- **Top = scope switcher** (`● Global | <project> | + Add project`); **left rail = filters**
  (domains, provenance, `Needs attention`); **main = a list**; **drawer = the only deep surface**.
- **Scopes are additive, flat, no inheritance.** Inline row toggles always mean **Global**;
  per-project deployment is the drawer's job (this design's part b).
- **Toggle is two-tier (honest about a 6-state derived reality):**
  - happy path `absent ↔ clean` = lit/grey boolean, one click = one symlink, optimistic + error
    toast (cc-switch feel).
  - anomaly `drift/copy/dead/aliased` = **warning glyph**, click → resolve flow (your part c),
    never a blind toggle.
- **Agents shown = the user's real ones** (2–3: Claude, Codex, future `pi`), via hybrid
  auto-detect + custom register — design for a **variable, small** icon set, not a fixed 5.
- **Row anatomy (already agreed — match it):** two lines.
  line 1: `name · owner/repo|Local · (warning) · agent icons · hover:update`;
  line 2: `truncated description · always-on dim domain chips`.
  Click name/desc → drawer; click `owner/repo` → GitHub; **retire/rm are NOT in the row**.
- **Derive-from-FS invariant:** never introduce stored deployment/subscription state. Counts and
  cell states are computed.

Out of scope (do not design): acquisition (Discover/ZIP/Import) and AI-suggested deployment —
both deferred per ADR-0010 §11.

---

## Stack & tokens (from ADR-0008 §0)

React 19 + Vite + Tailwind v4 (CSS-var tokens) + **shadcn/ui** (Radix) + lucide-react +
TanStack Query (optimistic mutation + rollback = the undo pattern) + Zod (boundary types) +
react-markdown. Keep the mockup's Unicode status glyphs for cells; lucide for chrome.

**Agent brand icons** live in `app/src/assets/agent-icons/` (named by agent id — see its
`README.md` for the id→file→tint map and trademark caveat). Lookup is `agent-icons/${agent.id}.svg`;
custom agents (e.g. `pi`) fall back to first-letter + auto-colour. "Enabled" cell = tinted bg+ring
on the icon; "disabled" = same icon at `opacity-35` (cc-switch pattern). `github.svg` is for the
row's `owner/repo` link.

Deploy-state glyphs already defined in `app/src/lib/tokens.ts` (`DEPLOY_GLYPH`):
`clean ✓ #15A34A · source ⊙ #71717A · drift ⚠ #D97706 · copy □ #D97706 · dead ✗ #DC2626 ·
absent · #D4D4D8`. Reuse these hues for the two-tier toggle and anomaly flow.

---

## Existing components & data (where to plug in)

**Views / shell**
- `app/src/components/MainPane.tsx` — current 3-tab shell (Inbox/Matrix/Library). **The tabs become
  the scope switcher; Matrix view is removed; Inbox view folds into the `Needs attention` filter.**
- `app/src/components/LibraryView.tsx` — current list (multi-column table). Becomes the primary
  list with inline toggles + the new row anatomy.
- `app/src/components/MatrixView.tsx` — **retire.**
- `app/src/components/InboxView.tsx` — **demote** to the left-rail filter behavior.
- `app/src/components/DetailDrawer.tsx` — **this is your part (b)**; today it has an AGENTS rail
  with Link/Unlink (Global only). Extend to the full agent × scope sub-matrix.
- `app/src/components/SourceCell.tsx` — source/update-available rendering (reuse in row + drawer).
- `app/src/components/RemoveModal.tsx` — type-to-confirm rm (reuse in drawer).

**Data / state**
- `app/src/state/queries.ts` — `useLibrary()` / `useWhere()` / `useAgents()` / `useOutdated()`.
- `app/src/state/commands.tsx` — mutations: deploy (use/drop), retire, tag/untag, rm, update.
  The deploy mutation is your toggle's backend; bulk = call it over a selection.
- `app/src/state/store.tsx` — reducer/context (drawer open, selection, deployOverrides for
  optimistic UI). Default view will change to Library/Global.
- `app/src/lib/types.ts` — `Skill`, `DeploymentReport`/`DeploymentSite`, `AgentsReport`/
  `AgentDeployment`, `DeployState`. `AgentsReport.scopes` = `["Global", ...projectNames]` — this is
  the drawer sub-matrix's row set. `deployments[skill][agentId]` = `{ g?, p?{scope:state} }`.
- `app/src/lib/tokens.ts` — `DEPLOY_GLYPH` (above).
- `app/src/lib/fixtures.ts` — synthetic data for browser/dev mode (no backend). **Design and demo
  against these; extend them with multi-project + anomaly examples so all states are visible.**

**Engine (for reference; do not change behavior)**
- `src/core/agents.ts` (`AGENT_SEEDS`, `AgentInfo`, `AgentsReport`), `src/core/surfaces.ts`,
  `src/core/deployments.ts` (`inventoryDeployments`, the 6-state classifier), `src/core/bundle.ts`.

---

## Deliverable

Component-level mockups (and/or shadcn-based implementation) for **b, c, d** that:
1. honor every guardrail above,
2. make all six deploy states + the two-tier toggle visually unambiguous,
3. demo cleanly against extended `fixtures.ts` (multi-project + each anomaly present),
4. reuse `DEPLOY_GLYPH` hues and the agreed row anatomy.

When in doubt about the *model*, defer to ADR-0010; when in doubt about *visual fidelity*, match
ADR-0008's tokens. Surface any place where b/c/d force a model change back to the ADR author — do
not silently diverge.

---

## Design-review amendments (2026-06-15)

The delivered mockup (`skillshelf-function1.zip` → `Management UI.dc.html`) is a faithful port and
the **implementation baseline**. It already nails: scope switcher, per-scope count bar, two-line
rows, inline two-tier toggles, the **same chip in rows + drawer**, inline-or-drawer **resolve
popover** (drift → view diff / pull upstream / overwrite / keep), left-rail filters, project view
with `Installed here ↔ All skills`, and a working bulk bar. Build on it, with these **five deltas**:

1. **Bundle sugar (was missing).** Add a **Select-all** affordance on the list meta strip (selects
   `visibleSkills()` = the current filter). When a domain filter is active, the bulk bar labels the
   selection as bundle `<domain>` and shows a **drift hint** ("N tagged · M selected"). This is the
   ADR §8 one-click "deploy a bundle" path; engine deploy stays a one-shot snapshot.
2. **Bulk Remove (was Enable-only).** Bulk bar gets an `[Enable | Remove]` segmented control;
   the agent buttons act per mode. Remove mode tints the bar as a "destructive" state.
3. **Anti-sparse drawer matrix.** The drawer DEPLOYMENT matrix must show **Global + only the
   projects where this skill is deployed**, plus a **`+ Add to project…`** picker — not every
   scope as a row (else sparsity returns at 10+ projects). Same philosophy as the project list.
4. **Agent registration UI.** A **gear/＋ at the end of the count bar** opens an *Agents* popover:
   detected agents (hide toggles) + **Add custom agent** (display name · global path · project
   convention; icon optional, `provider-icons/` + first-letter fallback). Replaces the hardcoded
   `AGENTS` array (merge built-in seeds + `~/.skillshelf/config.json`).
5. **GUI deploys at project scope** (ADR-0010 §5a; ADR-0008's CLI-only rule is dropped). Toggles in
   the project view and drawer matrix **write project symlinks for real**.

### Engine / data prerequisites (not the designer's job — flag for the build)

- `use` / `drop` must target an **arbitrary project dir, including a new one** with no
  `.claude/skills` yet (first deploy creates the surface) — required by `+ Add project` and §5a.
- The scope list = discovered surfaces **+ user-added project dirs**; added-but-empty projects need
  **light persistence** (navigation state, e.g. in `config.json`) — they are not deployment truth,
  so the derive-from-FS invariant holds.
- `config.json` gains an **`agents`** block (custom agents) consumed by both CLI and GUI.
- Replace the mock's `CL/CX/PI` text glyphs with `agent-icons/${agent.id}.svg` at build time.
