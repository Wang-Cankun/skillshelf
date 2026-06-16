# 10. Library-first management: skill × agent × scope as three list slices

Date: 2026-06-15

## Status

Accepted — **supersedes the information architecture of ADR-0008** (the three-tab
`Inbox / Matrix / Library` shell and the Domain↔Agent **Matrix** grid) **and its
"project-linking-is-CLI-only" behavioural rule** (now judged mistaken — see §5a). Does **not**
change the data/bridge layer, the fact-vs-inference stance (ADR-0007), agent-agnostic surfaces
(ADR-0003), or owned-vs-linked entries (ADR-0004).

The detailed visual layout of three sub-areas — the **drawer**, the **anomaly-resolution flow**,
and the **deploy count bar** — is **delegated to the design pass** (see §7); this ADR fixes only
the model and the constraints they must satisfy.

## Context

Most engine functions work; the pain is the **actual management UX**. Concretely: "I have many
skills — where do I install each?" The built UI is good at **skill × agent** but has no honest home
for the third axis, **scope** (Global vs each project's `.claude/skills`). The current surfaces fail
in specific ways:

- The **Matrix** grid (skill × domain, with a Domain↔Agent toggle) is **sparse to the point of
  uselessness**: domain is ~1:1 with skill, so a 112×12 grid is ~8% filled — 92% whitespace.
  A grid only earns its keep when both axes are small **and** cells are dense; none of
  skill×domain, skill×scope, or skill×agent (only 2–3 agents) satisfies that.
- **Deploy toggles are scattered and mostly read-only** — the Matrix shows state but doesn't act;
  the only live toggles are buried in the drawer, one skill at a time. The user's pain is not
  "missing a view," it's *deployment being sliced up, hidden, and read-only*.
- **cc-switch** (the reference UI) is fast because it **persists** per-agent state as a boolean
  dict and **owns the truth**. skillshelf is the opposite: it **never stores** deployment state and
  **derives** it from the filesystem, where the real state space is 6-valued
  (`clean / source / drift / copy / dead / aliased`, plus `absent`). A naive boolean toggle would
  lie (drift looks like clean) and is dangerous (toggling "off" on a real `copy` would delete
  hand-edited content). cc-switch's ergonomics can be borrowed; its model cannot.

Observed scale today: ~112 skills, 12 domains, 2–3 agents actually in use (Claude Code, sometimes
Codex, future "pi"), N projects.

## Decision

Make **Library** the single primary surface and model the `skill × agent × scope` cube as **three
purpose-built 2-D list slices** — never a grid. Every surface is the same primitive: a **filtered
list of skill rows with inline per-agent toggles**, reused across scopes.

### 1. Primary axis — skill-centric

Library is a list of skills (rows). Each row carries, inline, the user's **actual** agent toggle
icons. The skill is the mental anchor (matches the flat `library/<name>/` model).

### 2. Scope — three 2-D slices, not a grid

Slice the cube by *the question being asked*; each slice fixes one axis and degenerates to 2-D:

| Question | Fixed axis | Surface |
|---|---|---|
| "What's my **global** loadout?" | scope = Global | **Library** (skill × agent) |
| "What does **this project** need?" | scope = one project | **Project view** (skill × agent) |
| "Where is **this skill** deployed?" | skill = one | **Drawer** (agent × scope) |

The third axis is expressed by **switching which list you look at**, not by adding grid columns.

### 3. Global vs project — additive, never exclusive

Deployment is a symlink per `(skill, agent, scope)`; a skill can live in Global **and** N projects
simultaneously. There is no "move project↔global" atomic; there is only **add/remove on a scope**.
No **parent-project→child-project** cascade tree: a deployment in `~/work` does not flow into
`~/work/api`; project scopes stay a **flat set** with respect to each other. (The one inheritance
edge that *is* real — Global→project — is handled separately; see §3a.) Inline row toggles always
mean **Global**; per-project lives in the Project view + drawer.

### 3a. Global→project inheritance is real (parent→child is not)

§3 above retired the *parent→child* cascade, but there is **one** inheritance edge the runtime
genuinely has and the UI must stop hiding: **Global→project**. An agent (Claude Code, etc.) loads
its **global** skills dir (`~/.<agent>/skills`) in **every** project, on top of that project's
`.<agent>/skills`. So a globally-deployed skill is **effectively active in every project even with
no project symlink**. This is **Global→project only** (still no parent→child) and it is
**per-agent**.

- **Per-agent `inheritsGlobal` flag.** Add `inheritsGlobal: boolean` to the agent model (engine
  `AgentInfo` + `AgentConfigEntry`, app `AgentInfo`/schema). Default **true** (the `~/.<agent>/skills`
  convention; `claude = true`). Custom agents are configurable — the Agent settings form gets an
  *"inherits global"* checkbox, default on. An agent with `inheritsGlobal = false` **never** shows
  inherited: a global-only skill is grey/absent in its project cells.

- **Three cell states (replacing today's two)** in a **non-Global** scope `S`, for `(skill, agent)`,
  all **derived** from existing agents-report data
  (`deployments[skill][agent].g` = global state, `.p[S]` = project state) — **no new stored state**,
  derive-from-FS invariant preserved:
  - **Pinned here** = `.p[S]` is a present/active state → solid (today's "on" look).
  - **Inherited** = *not* pinned **and** `agent.inheritsGlobal` **and** `.g` is active
    (`clean`/`source`) **and** `scope !== Global` → tinted icon + **dashed/hollow ring**, tooltip
    *"active here via Global"*.
  - **Absent** = none of the above → plain grey.

  In **Global** scope the cell is unchanged (just `g` state, solid/grey + existing anomaly handling).
  Anomaly states (`drift`/`copy`/`dead`/`aliased`) keep their existing two-tier behaviour and **take
  precedence over inherited**.

- **Clicking an inherited cell is not a toggle.** It opens an info+action popover (mirroring the
  existing `ResolvePopover` pattern), header *"Active here via Global"*, with actions:
  - **Pin to this project** → `deploy(skill, agentId, scope, true, scopePath)` (adds the project
    symlink; cell becomes pinned/solid).
  - **Manage in Global** → switch to Global scope (dispatch `setScope Global`) and/or focus that
    cell; show a *"removing from Global affects ALL projects"* warning.
  - **Cancel.**

  You **cannot** locally disable an inherited skill — there is no per-project denylist, and the
  popover must not pretend otherwise.

- **Effective count breakdown.** In a non-Global scope the count bar (§Delegated, item d) counts
  **effective** availability per agent with a breakdown, e.g.
  *"Claude · 47 active here (8 pinned + 39 via Global)"*, where `effective = pinned ∪ inherited`.
  In Global scope it is unchanged.

- **"Pinned here" rename + range toggle.** The Project view's *"Installed here"* range becomes
  **"Pinned here"** (§10). The default still shows **pinned-only** (anti-sparse; unchanged behaviour,
  only the label moves). *"All skills"* shows the whole library with each row's state-here rendered
  via the **three-state** cell, so inherited rings are visible there.

- **Drawer matrix.** It already renders via the shared `AgentToggle`, so the three states apply
  automatically. Keep the anti-sparse row rule: rows = **Global + projects where the skill is
  pinned**; do **not** add a project row merely because it is inherited — inheritance is represented
  by the **Global** row. Cells within shown rows must still render inherited correctly.

### 4. Toggle — two-tier (honest about derived 6-state reality)

- **Happy path (≈95%):** `absent ↔ clean` is a boolean lit/grey toggle — one click links/unlinks
  one symlink, optimistic update + error toast (cc-switch ergonomics).
- **Anomaly (≈5%):** `drift / copy / dead / aliased` render as a **warning glyph**; clicking does
  **not** blind-toggle — it opens a **resolve flow** (view diff / convert to link / repair dead /
  keep copy). This *is* the inlined Inbox triage (see §6).

### 5. Navigation

- **Top = scope switcher**: `● Global | <project> | … | + Add project` (replaces the dead
  `Inbox / Matrix / Library` tabs). The highlighted scope name is the always-present "where am I."
- **Left rail = filters** (orthogonal to scope): domains, provenance, and the `Needs attention`
  smart view. These apply within whichever scope is active.
- **Main pane = always a list.** **Drawer = the single deep surface** for one skill
  (agent × scope sub-matrix + lifecycle + drift resolution + source mode + retire/rm).

### 5a. The GUI deploys at project scope (reverses ADR-0008)

ADR-0008's "project linking is CLI-only" rule is **superseded as mistaken**. The whole point of the
Project view + drawer `agent × scope` matrix + `+ Add project` is to **write project-scope symlinks
from the GUI** — anything less leaves the core pain ("quickly manage *where* skills install") half
solved. Consequences for the engine:

- `use` / `drop` must accept an **arbitrary project directory**, including a brand-new one with no
  `.claude/skills` yet (`+ Add project` picks a dir; first deploy creates the surface).
- The scope list is **discovered** (surfaces with deployments) **plus user-added** project dirs;
  added-but-empty projects persist as selectable scopes (the one piece of UI state that may need
  light persistence — it is *navigation*, not deployment truth, so it does not break the
  derive-from-FS invariant).
- Destructive/ambiguous project ops still route through the two-tier toggle + resolve flow (§4);
  GUI project deploy is not a blank cheque to blind-overwrite.

### 6. Inbox → demoted, not deleted

Inbox splits cleanly into existing mechanisms: its **triage list** becomes the left-rail
`Needs attention` filter; its **fixing** becomes the in-row warning glyph + drawer resolve flow
(§4). No standalone tab.

### 7. Matrix → retired

The grid is removed as a *management* paradigm (sparsity, §Context). Not replaced by a read-only
"landscape"; management is list-only.

### 8. Bulk & bundles

- **Bulk:** row checkboxes + a bulk bar ("for the selected N → [agent ▾] enable / disable").
- **Bundles are sugar, not a new mechanism:** filtering by a domain + "select all filtered" *is*
  the bundle. A "deploy bundle" button is a one-click shortcut over filter→selectAll→bulk.
- **One-shot snapshot, not a live subscription:** deploying `bioinfo` links the *current* members
  once. New members later do **not** auto-join (that would require persisted "subscription" state,
  violating the derive-from-FS rule). Re-running re-syncs; the button surfaces a drift hint
  ("bioinfo: 9 tagged, 8 on codex — 1 missing").

### 9. Agent set — hybrid

Default to auto-detect (agents whose skills dir exists). A settings panel can hide detected agents
and **register custom agents** (e.g. `pi`: display name + global path + project-path convention;
icon/colour optional, first-letter+auto-colour fallback). Implemented by merging built-in
`AGENT_SEEDS` with a user `agents` block in `~/.skillshelf/config.json` — not the hardcoded 5.

### 10. Project view — anti-sparse

A project defaults to **"installed here"** (only its few deployed skills) to avoid the 112-row
sparse problem. A range toggle **`Installed here ↔ All skills`** expands the same list to the full
library with project-scope toggles, where filter + bulk + bundle pick what to add. Adding is thus a
*filter on the same list*, not a separate modal/screen.

### 11. Deferred but architecturally reserved

- **Acquisition** (get *new* skills **into** the library: Discover / Install-from-ZIP / Import
  Existing) is the other pillar — **out of scope this stage**, its own ADR later.
- **AI-suggested deployment** (a configured provider that infers what a project should add) is
  **future**, and hooks in cleanly as a *third way to populate the bulk bar* (alongside manual
  selection and select-all-filtered). Constraint that keeps it cheap: the **bulk bar stays the sole
  deploy-execution point**, so AI is "one more button," not new plumbing.

## Delegated to the design pass

Model and constraints are fixed above; these layouts are for the design agent to resolve:

- **(b) Drawer layout** — the per-skill `agent × scope` sub-matrix (Global row + one row per
  project), drift resolution, source mode, and the (drawer-only, never in-row) retire/rm controls.
- **(c) Anomaly-resolution flow** — the concrete options behind a `drift / copy / dead / aliased`
  warning glyph.
- **(d) Deploy count bar** — adopt a cc-switch-style at-a-glance summary
  (`Installed N · Claude X · Codex Y · …`); placement TBD (candidate: in/under the scope switcher,
  reflecting the active scope's counts).

Row anatomy (agreed, for reference): two lines — line 1 `name · owner/repo|Local · (warning) ·
agent icons · hover:update`; line 2 `truncated description · always-on dim domain chips`. Click
name/description → drawer; click `owner/repo` → open GitHub. Destructive actions (retire/rm) are
drawer-only.

## Consequences

- One interaction primitive (filtered list + inline toggles) is reused across all three scopes →
  near-zero added mental model per surface.
- No surface ever lies about deployment state; no persisted deployment/subscription state is
  introduced (derive-from-FS invariant preserved).
- ADR-0008's Matrix and three-tab shell are obsolete; the data/bridge layer and `skl --json`
  contracts from 0008 remain intact.
- Bundle "live sync" is intentionally **not** offered; users re-deploy to pick up new tagged
  members (with a visible drift hint).
