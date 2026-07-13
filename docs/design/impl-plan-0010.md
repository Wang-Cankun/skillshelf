# ADR-0010 Library-First Management — File-by-File Implementation Plan
Branch: `feat/management-ui-0010`

> **Status: executed (historical plan).** The build landed; RISK 9's deferred resolve verbs
> (`view diff` / `adopt` / `realign`) were later implemented for real (`skl diff`,
> `skl realign`, `skl use --force` — see CHANGELOG), so the "coming soon" degradations
> described below no longer exist in the app. Only the Explanation/AI tab remains deferred
> (ADR-0007, P3).

## Verified ground truth (drives the plan)
- **Engine use/drop already targets arbitrary/new project dirs.** `parseDeployTarget` (src/core/agents.ts:302) resolves `--project <name|path>` (relative→`join(cwd,...)`, absolute as-is); `use.ts` already `mkdir(skillsDir,{recursive:true})`. **No engine change needed for the deploy mechanic itself** — only for the `agents` config block and the persisted projects list.
- **Rust gate checks the verb only**, not flags (lib.rs:105). `use`/`drop` are already allow-listed (lib.rs:22). **No Rust change for delta 5.**
- **The single blocker for GUI project deploy (delta 5)** is the hard guard `if (scope !== "Global")` in `commands.tsx:117` and `scopeFlags()` (commands.tsx:31) which already emits `["--project", scope]`. Lifting the guard + passing a project *path* (not just basename) is the whole change.
- `agents --json` emits `{agents, scopes, deployments}` (agents.ts:74); `scopes` is the drawer matrix row set.
- Icons exist: `claude.svg, codex.svg, gemini.svg, opencode.svg, hermes.png, github.svg, mcp.svg, anthropic.svg`. `provider-icons/` (90 files) + `metadata.ts` power the custom-agent icon picker.

---

## STAGE S1 — Engine (`src/`)  [no UI dependency; defines S2 contracts]

### S1.1 — `src/types.ts` (MODIFY)
Extend the loose `ConfigFile` and resolved `Config` to carry custom agents + persisted nav projects.
```ts
export interface AgentConfigEntry {
  id: string; name: string; short: string;
  global?: string;           // override ~/.<id>/skills
  projConvention?: string;   // override .<id>/skills
  icon?: string;             // provider-icons key, optional
  color?: string;            // hex tint, optional
  hidden?: boolean;          // hide a detected/seed agent
}
export interface ConfigFile {
  library?: string; globalCore?: string;
  roots?: Array<string | RootEntry>;
  agents?: AgentConfigEntry[];                 // delta 4
  projects?: Array<string | { path: string; name?: string }>; // §5a light persistence
}
export interface Config {
  /* ...existing... */
  agents: AgentConfigEntry[];   // resolved (defaulted [])
  projects: string[];           // resolved absolute dirs
}
```
Add to `Ctx`: `addProject(path): Promise<string[]>`, `removeProject(path): Promise<{projects:string[];removed:boolean}>`.
**Serves:** delta 4 (agents block), §5a (projects list).

### S1.2 — `src/config.ts` (MODIFY)
- `resolveConfig`: add `const agents = Array.isArray(fileCfg?.agents) ? fileCfg!.agents : [];` and `const projects = normalizeRoots(fileCfg?.projects);` (reuse `normalizeRoots` — it already handles `{path}` objects). Return both.
- Add `addProject(configFilePath, existing, path)` and `removeProject(configFilePath, path)` mirroring `addRoot`/`removeRoot` verbatim but keyed on `projects` (preserve `agents`/`roots`/`library` via `{...current, projects: next}`).
- Wire both into `loadContext` Ctx (mirror addRoot/removeRoot live-sync block at config.ts:204).
**Serves:** §5a persistence (added-but-empty projects survive as selectable scopes). **Derive-from-FS invariant preserved** — this is *navigation* state, never deployment truth.

### S1.3 — `src/core/agents.ts` (MODIFY)
- `computeAgentsReport(report, home, opts?: { extraScopes?: string[]; agents?: AgentConfigEntry[] })`:
  - Merge `AGENT_SEEDS` with `opts.agents` (custom override/append; drop `hidden`) for the returned `agents[]` and `AGENT_IDS` used by surface detection.
  - Union `opts.extraScopes` (persisted-but-empty project names) into the `scopes` array so empty projects still appear as drawer/scope rows. Keep deployments derived from FS only.
- Keep signature backward-compatible (opts optional) so existing tests pass unchanged.
**Serves:** delta 4 (custom agents in matrix), §5a (empty project scopes visible), delta 3 anti-sparsity feeds off real `scopes`.

### S1.4 — `src/commands/agents.ts` (MODIFY)
Pass config through: `computeAgentsReport(report, undefined, { agents: ctx.config.agents, extraScopes: projectNames(ctx.config.projects) })`. Add resolved config-project surfaces into the `surfaces` union (line 45) so a deployed config-project is inventoried.
**Serves:** GUI reads custom agents + empty projects from `skl agents --json`.

### S1.5 — `src/commands/projects.ts` (NEW)
Add a `skl projects [add|rm|ls] [path]` verb. Register in `src/cli.ts` MODULES + add `"projects"` to Rust `ALLOWED_VERBS`. The GUI needs this CLI verb behind the Tauri bridge to persist `+ Add project`.
**Serves:** §5a `+ Add project` persistence path through the bridge.

### S1.6 — `app/src-tauri/src/lib.rs` (MODIFY — minimal)
Add `"projects"` to `ALLOWED_VERBS` (line 22). **No other Rust change.** (`use`/`drop` with `--project`/`--agent` already pass.)
**Serves:** delta 5 + §5a bridge.

> **Minimal-engine-change summary:**
> | Need | Exact function/file | Change |
> |---|---|---|
> | use/drop arbitrary/new project dir | `parseDeployTarget` src/core/agents.ts:302 + `use.ts` mkdir | **already works — none** |
> | config `agents` block | `resolveConfig` src/config.ts:43 + `ConfigFile`/`Config` src/types.ts | add field + resolve |
> | persisted projects list | `addProject`/`removeProject` src/config.ts (new, mirror addRoot) + `loadContext` | new fns |
> | empty projects as scopes | `computeAgentsReport` src/core/agents.ts:160 (extraScopes) | optional param |

---

## STAGE S2 — App data/state layer + fixtures  [depends on S1 contracts]

### S2.1 — `app/src/lib/types.ts` (MODIFY)
Add `AgentInfo` optional fields `icon?: string; color?: string; custom?: boolean;`. Confirm `AgentsReport.scopes`/`deployments[skill][agentId] = {g?, p?{scope:state}}` already present (they are).

### S2.2 — `app/src/lib/schemas.ts` (MODIFY)
Extend `AgentInfoSchema` with `.icon/.color/.custom` optional. Add `ConfigSchema` (agents[], projects[]) for the `skl config --json`/`projects --json` loader. Keep `.passthrough()`.

### S2.3 — `app/src/lib/skl.ts` (MODIFY)
- `loadAgents()` already merges `visibleAgents`; ensure it surfaces custom agents + extra scopes from the real `agents --json`.
- Add `loadConfig(): Promise<{agents, projects}>` loader (Tauri: `["projects","--json"]`/`["config","--json"]`; browser: fixture). Used by scope switcher (empty projects) + agent-settings popover.
- Add mutation helpers via existing `runAction`: `addProjectCmd(path)`, `removeProjectCmd(path)`, `saveAgentsConfig(entries)`.

### S2.4 — `app/src/state/commands.tsx` (MODIFY — the keystone for delta 5)
- **Lift the Global-only guard** (delete lines 117–123).
- Change `deploy(skill, agentId, scope, on, scopePath?)`: when `scope !== "Global"`, emit `["--project", scopePath ?? scope]` (pass the **absolute project dir**, not basename). `scopeFlags` updated to accept an optional path.
- `deployKey`/`setDeployOverride` already scope-keyed (`${skill}|${agent}|${scope}`) — works unchanged.
- Add `bulkDeploy(names, agentId, scope, on)` — loops `deploy`; single combined toast; invalidate once. **Sole deploy-execution point (ADR §11).** Drives deltas 1,2.
- Add `addProject`/`removeProject` mutations invalidating `qk.agents` (+ new `qk.config`).

### S2.5 — `app/src/state/queries.ts` (MODIFY)
Add `qk.config = ["config"]` and `useConfig()` (browser-fixture fallback). Keep `useAgents/useWhere/useLibrary`.

### S2.6 — `app/src/state/store.tsx` (MODIFY — single-owner: S2 authors it, S3-A must not re-refactor)
- Replace `view: "inbox"|"matrix"|"library"` with `scope: string` (default `"Global"`) and `range: "installed"|"all"`.
- Fold Inbox into filter `{kind:"needs"}`; keep `source`/`domain`/`untagged`.
- Add `sort: "name"|"attention"|"deployed"`; `bulkMode: "enable"|"remove"`; `resolve: {skill,agent,scope,state} | null`.
- Actions: `setScope`, `setRange`, `setSort`, `setBulkMode`, `openResolve`, `closeResolve`, `applyResolve`. Keep `deployOverrides`, `selected`, `drawer*`, `confirm*`, `toast`, `removed*`. **Remove** `matrixMode`/`matrixAgent`.

### S2.7 — `app/src/lib/fixtures.ts` + `app/src/lib/agents.ts` (MODIFY)
Extend synthetic data so **every state is demoable** in browser mode:
- ≥2 projects (`webapp`, `data-pipeline`) with per-skill project deployments incl. each anomaly: `drift` (csv-profiler@webapp), `copy` (db-snapshot@webapp), `dead` (link-checker global), `aliased` (md-toc→markdown-toc).
- One custom agent fixture (`pi`: no svg → first-letter fallback) to exercise delta 4.
- One persisted-but-empty project (`scratch`) to exercise §5a/scope switcher.
- `deriveAgentsReport(realWhere)` updated to include the empty scope + custom agent.

### S2.8 — `app/src/lib/prefs.ts` (MODIFY)
`visibleAgents` already applies a hide-list; extend to also *merge custom agents* from config (one source of truth).

---

## STAGE S3 — Components / shell  [depends on S2]

### File-ownership partition (zero overlap)

**Agent A — shell + list + row + toggle + bulk + scope/count bar + agent-settings + icon util**
- `app/src/App.tsx` (MODIFY) — remove Matrix/Inbox overlays; default scope=Global.
- `app/src/components/MainPane.tsx` (MODIFY) — 3-tab row → **scope switcher** (`● Global | <project> | + Add project` + gear). Keep search/filter/sort toolbar; drop Inbox/Matrix toolbars. Render CountBar + project `Installed here ↔ All` toggle.
- `app/src/components/Sidebar.tsx` (MODIFY) — left rail: add `Needs attention` → `{kind:"needs"}` (folds Inbox); keep domain/provenance filters; remove `setView`.
- `app/src/components/SkillList.tsx` (NEW, replaces LibraryView) — two-line rows; **Select-all** on meta strip (delta 1).
- `app/src/components/SkillRow.tsx` (NEW) — line1 `name·owner/repo|Local·(warning)·agent toggles·hover-update`; line2 `desc·dim domain chips`. Click name/desc→openDrawer; click owner/repo→GitHub.
- `app/src/components/AgentToggle.tsx` (NEW) — the **shared two-tier chip** (rows + drawer). Props `{skill, agentId, scope, scopePath?, size?, readOnly?}`. clean↔absent → `deploy()`; anomaly → `openResolve()`; source → no-op. `agent-icons/${id}.svg`, `opacity-35` disabled, tinted bg+ring enabled, first-letter fallback. Reuse `DEPLOY_GLYPH` hues.
- `app/src/components/CountBar.tsx` (NEW) — `Installed N · Claude X · Codex Y …` for active scope (computed) + gear → AgentSettingsPopover (delta 4).
- `app/src/components/BulkBar.tsx` (MODIFY) — `[Enable | Remove]` segmented (delta 2, destructive tint in Remove), per-agent buttons calling `bulkDeploy`; bundle label `<domain>` + drift hint `N tagged · M selected` when domain filter active (delta 1).
- `app/src/components/AgentSettingsPopover.tsx` (NEW) — detected agents w/ hide toggles + **Add custom agent** form (name·global path·proj convention·optional icon via `provider-icons` picker). Persists via `saveAgentsConfig`. (delta 4)
- `app/src/lib/agentIcon.ts` (NEW) — `iconFor(agent): {svgUrl?, letter, color}` via `import.meta.glob('../assets/agent-icons/*.svg', {eager, as:'url'})`; fallback to `provider-icons/` via `agent.icon`; final first-letter + auto-color (metadata.ts defaultColor or hashed hue). Used by AgentToggle, CountBar, AgentSettingsPopover.
- DELETE `MatrixView.tsx`, `InboxView.tsx`, `LibraryView.tsx` + all imports.

**Agent B — drawer + resolve flow + provenance/lifecycle**
- `app/src/components/DetailDrawer.tsx` (MODIFY) — replace Global-only AGENTS rail with the **anti-sparse `agent × scope` sub-matrix** (delta 3): rows = **Global + only the projects where this skill is deployed** + `+ Add to project…` picker (never iterate all scopes). Cells = shared `AgentToggle` (size 30). Keep tag/untag, source/provenance/update, Retire, Remove (RemoveModal), Rendered/Raw/Explanation(coming-soon) tabs, file tree.
- `app/src/components/ResolvePopover.tsx` (NEW) — part (c): drift→view diff/pull upstream/overwrite/keep; copy→adopt/convert(DANGER)/keep; dead→repair/remove; aliased→realign/keep. Reads `state.resolve`; dispatch `applyResolve` + run cmd (or echo + "coming soon" for deferred verbs); never blind-toggle.
- `app/src/components/AddToProjectPicker.tsx` (NEW) — Tauri dir dialog when IS_TAURI else fixture list; on pick → `addProject(path)` then `deploy(skill,agentId,projectPath)`.
- `app/src/components/SourceCell.tsx` (MODIFY) — align with row/drawer usage; owner/repo links to GitHub.

**Shared/ownership rules:** `store.tsx`,`commands.tsx`,`queries.ts`,`skl.ts`,`fixtures.ts`,`types.ts`,`schemas.ts`,`prefs.ts` are S2 (done before S3; neither S3 agent edits them — if a contract gap appears, Agent A owns data-layer fixes). **`AgentToggle.tsx` — A authors, B imports read-only; B must not edit it.**

---

## STAGE S4 — Wire + final integration
- agentIcon.ts (authored in S3-A since AgentToggle needs it).
- Integration sweep (Agent A): default scope→Global; scope switch clears `selected`+`filter`; optimistic deploy + `invalidate([qk.agents,qk.where,qk.library])` re-syncs (no stale override; project scopes too); Tauri vs fixtures both render all states; no dangling imports to deleted views.

---

## The 5 deltas — explicit mapping
1. **Bundle select-all + drift hint** → `SkillList` meta-strip Select-all (selects `visibleSkills()`); `BulkBar` bundle label + `N tagged · M selected` when domain filter active; backed by `bulkDeploy` (one-shot snapshot, ADR §8).
2. **Bulk Enable|Remove** → `store.bulkMode` + `BulkBar` segmented + destructive tint; agent buttons call `bulkDeploy(...,on=mode==='enable')`.
3. **Anti-sparse drawer matrix** → `DetailDrawer` rows = Global + deployed-in projects only + `AddToProjectPicker`; `ResolvePopover` for anomaly cells.
4. **Agent-registration popover** → `CountBar` gear → `AgentSettingsPopover`; config `agents` block (S1.1/S1.2) merged into `loadAgents`; icon picker over `provider-icons/`.
5. **GUI project-scope deploy** → lift guard in `commands.tsx:117`; `deploy`/`bulkDeploy` emit `--project <path>`; engine already creates the surface; project view + drawer toggles write real symlinks.

---

## TEST plan
**Engine (bun test) — add/update:**
- `src/config.test.ts`: `agents` block round-trips through `resolveConfig`; `addProject`/`removeProject` round-trip + preserve `roots`/`agents`/`library`; `projects` normalize (dedupe, `{path}` form).
- `src/core/agents.test.ts`: `computeAgentsReport` with `opts.agents` (custom `pi` appears) and `opts.extraScopes` (empty project listed in `scopes`, no phantom deployments). Existing tests must stay green (opts optional).
- `src/commands/use.test.ts`: `use <skill> --project <new-empty-dir> --agent claude --json` creates `.claude/skills` and links; `drop --project` symmetric. Confirm scope basename in JSON.
- `src/commands/agents.test.ts`: config projects/agents flow into JSON output.
- `tests/smoke.test.ts`: subprocess `use→drop` against a fresh project dir.
- New `src/commands/projects.test.ts` for the projects verb.

**App gate (per CLAUDE.md):** `cd app && bun run check` (tsc) after S2 and each S3 owner; `cd app && bun run build` green before sign-off. No app unit runner — typecheck + build is the gate.

---

## RISKS / ambiguities implementers must watch
1. **Derive-from-FS invariant.** `config.projects` is *navigation only* — never deployment truth. Cell/count state always from `agents --json`/`where`, even for an empty added project (all-absent toggles, no fabricated `clean`).
2. **Optimistic update + invalidate race.** `deployOverrides` keyed `${skill}|${agent}|${scope}`; after `invalidate([qk.agents,qk.where,qk.library])` the override must clear/reconcile. Project scopes multiply keys — verify clearOverride on success AND undo (commands.tsx:128–139 pattern).
3. **Don't reintroduce sparsity (delta 3).** Drawer matrix filters to deployed projects + Global; never iterate all `scopes`. `+ Add to project` is the only way a non-deployed row appears (transiently).
4. **Project scope identity: name vs path.** Engine derives scope = basename (`parseDeployTarget:347`); two dirs with same basename collide. **Pass absolute project paths** from GUI deploy; key UI scopes by path, display basename. agents-report `scopes` are basenames — reconcile (path→name map in fixtures/config).
5. **Tauri vs fixtures dev mode.** Every new loader/mutation needs a browser fallback in `skl.ts`/`fixtures.ts`. The `+ Add project` dir dialog is Tauri-only — guard with `IS_TAURI`, fixture list in browser.
6. **Rust gate is verb-only** — safe; but the new `projects` verb MUST be in `ALLOWED_VERBS` (lib.rs:22) or the bridge silently rejects it.
7. **Shared `AgentToggle` ownership.** A authors, B imports. Full prop contract `{skill, agentId, scope, scopePath?, size?, readOnly?}` fixed up front.
8. **`AGENT_SEEDS` is 5 but real agents are 2–3.** Prune absent/undetected agents via `visibleAgents`/config `hidden` so count bar/rows aren't noisy.
9. **Deferred resolve actions.** `view diff`/`adopt`/`realign` may be stubs. ResolvePopover echoes the command + degrades gracefully (toast "coming soon") rather than calling an unimplemented path.
