// The mutation layer — the security-sensitive port of the App.svelte dispatch +
// error contract (ADR-0008 §1, ADR-0007). Every mutation:
//   1. only ever builds a VALID `skl` verb (a defense-in-depth allowlist guard
//      mirrors the Rust ALLOWED_VERBS; never edit/open/infer/prune/fix);
//   2. applies an OPTIMISTIC override to the reducer;
//   3. runs the verb through runAction and checks `res.ok`;
//   4. on failure: rolls the optimistic override back AND surfaces res.stderr;
//   5. on success: invalidateQueries (refetch real truth) + an undo toast whose
//      Undo reverses the override and issues the INVERSE verb.
// The command echo always equals the exact vector that runs.

import { useCallback } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import {
  runAction,
  cmdEcho,
  addProjectCmd,
  removeProjectCmd,
} from "../lib/skl";
import { UpdateReportSchema } from "../lib/schemas";
import { useStore } from "./store";
import { qk } from "./queries";
import { GLOBAL_SCOPE } from "./store";
import type { OutdatedReport, UpdateReport } from "../lib/types";

// Defense-in-depth: the only verbs this MUTATION layer may dispatch through
// run()/runInverse(). This is intentionally a SUBSET of the Rust ALLOWED_VERBS
// (lib.rs) — read-only loaders (ls/show/agents/…) go straight through invokeJson
// and never touch run(), so they don't appear here. The Rust list is the full
// authority and must remain a superset of this set; anything routed through
// run() that isn't here is a programming error, refused before a process spawns.
const ALLOWED = new Set(["use", "drop", "retire", "unretire", "tag", "untag", "rm", "where", "update", "add", "projects", "link", "import"]);

export function deployKey(skill: string, agentId: string, scope: string) {
  return `${skill}|${agentId}|${scope}`;
}

// ADR-0010 §5a / RISK 4: for a project scope pass the ABSOLUTE project dir as
// `--project <path>` (not the basename) so two same-named dirs don't collide
// and the engine creates the right surface. `scopePath` falls back to `scope`
// for callers that only have a basename (and for the no-path test path).
function scopeFlags(scope: string, scopePath?: string): string[] {
  return scope === GLOBAL_SCOPE
    ? ["--global"]
    : ["--project", scopePath ?? scope];
}

export function useCommands() {
  const { dispatch } = useStore();
  const qc = useQueryClient();

  const invalidate = useCallback(
    (keys: QueryKey[]) =>
      Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey }))),
    [qc],
  );

  /** Run one verb with the full contract. Returns ok. */
  const run = useCallback(
    async (
      args: string[],
      opts: {
        rollback: () => void;
        invalidate: QueryKey[];
        toast?: { msg: string; undo?: (() => void) | null };
      },
    ): Promise<boolean> => {
      dispatch({ type: "setError", error: null });
      if (!ALLOWED.has(args[0])) {
        opts.rollback();
        dispatch({
          type: "setError",
          error: `refused: \`${args[0]}\` is not a dispatchable verb`,
        });
        return false;
      }
      const res = await runAction(args);
      if (!res.ok) {
        opts.rollback();
        dispatch({
          type: "setError",
          error: res.stderr.trim() || `${cmdEcho(args)} failed`,
        });
        return false;
      }
      await invalidate(opts.invalidate);
      if (opts.toast) {
        dispatch({
          type: "showToast",
          toast: {
            msg: opts.toast.msg,
            cmd: cmdEcho(args),
            undo: opts.toast.undo ?? null,
          },
        });
      }
      return true;
    },
    [dispatch, invalidate],
  );

  // Run one or more INVERSE verbs (the Undo path). Unlike the forward `run`,
  // these have already been optimistically reverted in the reducer, so on
  // failure we must surface the error AND re-invalidate so the UI re-syncs to
  // real disk truth instead of trusting the rollback (matches the forward
  // contract — previously these were fire-and-forget and could silently diverge).
  const runInverse = useCallback(
    async (vectors: string[][], keys: QueryKey[]) => {
      const failures: string[] = [];
      for (const v of vectors) {
        const res = await runAction(v);
        if (!res.ok)
          failures.push(`${cmdEcho(v)}: ${res.stderr.trim() || "failed"}`);
      }
      await invalidate(keys);
      if (failures.length)
        dispatch({
          type: "setError",
          error: `undo failed — ${failures.join("; ")}`,
        });
    },
    [dispatch, invalidate],
  );

  // ── Link / Unlink an agent (delta 5: Global AND project scopes) ─────────
  // ADR-0010 §5a reverses ADR-0008's "project linking is CLI-only": the GUI now
  // writes project-scope symlinks. For a project scope pass the ABSOLUTE dir as
  // `scopePath` (RISK 4) — it becomes `--project <path>`; the override key stays
  // keyed by the basename `scope` so it reconciles with effState/the agents
  // report (whose scopes are basenames).
  const deploy = useCallback(
    async (
      skill: string,
      agentId: string,
      scope: string,
      on: boolean,
      scopePath?: string,
    ) => {
      const key = deployKey(skill, agentId, scope);
      dispatch({ type: "setDeployOverride", key, value: on ? "on" : "off" });
      const verb = on ? "use" : "drop";
      const args = [
        verb,
        skill,
        "--agent",
        agentId,
        ...scopeFlags(scope, scopePath),
      ];
      const rollback = () => dispatch({ type: "clearDeployOverride", key });
      const undo = () => {
        dispatch({ type: "clearDeployOverride", key });
        const inv = [
          on ? "drop" : "use",
          skill,
          "--agent",
          agentId,
          ...scopeFlags(scope, scopePath),
        ];
        dispatch({ type: "hideToast" });
        void runInverse([inv], [qk.agents, qk.where, qk.library]);
      };
      const ok = await run(args, {
        rollback,
        invalidate: [qk.agents, qk.where, qk.library],
        toast: {
          msg: `${on ? "Linked" : "Unlinked"} ${skill} · ${agentId} (${scope})`,
          undo,
        },
      });
      // RISK 2: clear-on-success. The optimistic override only papers over the
      // refetch gap; once `run` has invalidated and server truth is authoritative
      // it MUST be dropped so the cell tracks reality (a later external `drop`/
      // surface change would otherwise stay masked by the stale 'on' override).
      // On failure `rollback` already cleared it; on undo the undo handler clears.
      if (ok) dispatch({ type: "clearDeployOverride", key });
    },
    [dispatch, run, runInverse],
  );

  // ── Bulk deploy (deltas 1 & 2) — the SOLE deploy-execution point (ADR §11).
  // ONE multi-name `use`/`drop` call (the engine unions+dedupes the names and
  // runs the symlink loop once — one library crawl, one pass). Applies every
  // optimistic override up front, fires the SINGLE batch call, invalidates ONCE,
  // then clears every override (the invalidate reconciles to disk truth). The
  // batch exits 0 iff ALL names succeeded; on failure the refetch already shows
  // real (partial-success) truth, so a coarse clear-all-overrides is correct and
  // simpler than per-name bookkeeping. Undo is a SINGLE inverse batch call.
  const bulkDeploy = useCallback(
    async (
      names: string[],
      agentId: string,
      scope: string,
      on: boolean,
      scopePath?: string,
    ) => {
      if (!names.length) return;
      dispatch({ type: "setError", error: null });
      const verb = on ? "use" : "drop";
      if (!ALLOWED.has(verb)) return; // unreachable; defense-in-depth.

      // Optimistic pass: light every override up front (cc-switch ergonomics).
      const keys = names.map((n) => deployKey(n, agentId, scope));
      for (const key of keys)
        dispatch({ type: "setDeployOverride", key, value: on ? "on" : "off" });

      const clearAll = () => {
        for (const key of keys)
          dispatch({ type: "clearDeployOverride", key });
      };

      // ONE batch call: `skl use a b c --agent X [scope]`.
      const args = [
        verb,
        ...names,
        "--agent",
        agentId,
        ...scopeFlags(scope, scopePath),
      ];
      const res = await runAction(args);

      // qk.library is KEPT (NOT dropped per FIX B): the library feed carries the
      // deployment-derived `deployCount`, which the "Deployed" sort renders — so
      // it must refetch after a deploy or that sort order goes stale.
      await invalidate([qk.agents, qk.where, qk.library]);

      // RISK 2: clear-on-success. After the single invalidate, server truth is
      // authoritative, so drop every optimistic override — leaving them would
      // mask a later external state change behind a stale entry and grow the
      // override map unbounded. On failure the refetch shows the real (possibly
      // partial) on-disk truth, so clearing all is still correct.
      clearAll();

      if (!res.ok) {
        dispatch({
          type: "setError",
          error: res.stderr.trim() || `${cmdEcho(args)} failed`,
        });
        return;
      }

      const undo = () => {
        clearAll();
        dispatch({ type: "hideToast" });
        void runInverse(
          [
            [
              on ? "drop" : "use",
              ...names,
              "--agent",
              agentId,
              ...scopeFlags(scope, scopePath),
            ],
          ],
          [qk.agents, qk.where, qk.library],
        );
      };
      const word = on ? "Enabled" : "Removed";
      dispatch({
        type: "showToast",
        toast: {
          msg:
            names.length > 1
              ? `${word} ${names.length} skills · ${agentId} (${scope})`
              : `${word} ${names[0]} · ${agentId} (${scope})`,
          cmd: cmdEcho(args),
          undo,
        },
      });
    },
    [dispatch, invalidate, runInverse],
  );

  // ── Add / remove a persisted nav project (§5a) ──────────────────────────
  // Pure navigation state (never deployment truth). Invalidates qk.config (the
  // scope list) and qk.agents (the report unions empty-project scopes in S1).
  const addProject = useCallback(
    async (path: string): Promise<boolean> => {
      const res = await addProjectCmd(path);
      if (!res.ok) {
        dispatch({
          type: "setError",
          error: res.stderr.trim() || `projects add ${path} failed`,
        });
        return false;
      }
      await invalidate([qk.config, qk.agents]);
      return true;
    },
    [dispatch, invalidate],
  );

  const removeProject = useCallback(
    async (path: string): Promise<boolean> => {
      const res = await removeProjectCmd(path);
      if (!res.ok) {
        dispatch({
          type: "setError",
          error: res.stderr.trim() || `projects rm ${path} failed`,
        });
        return false;
      }
      await invalidate([qk.config, qk.agents]);
      return true;
    },
    [dispatch, invalidate],
  );

  // ── Retire (one or many) — reversible ───────────────────────────────────
  // ONE multi-name `skl retire a b c` call (the engine reindexes the library
  // ONCE at the end — the per-call reindex was the cost). Exit 0 iff all names
  // retired. The whole batch is the undo unit: on failure the refetch shows real
  // on-disk truth, so a coarse revert-all is correct and simpler.
  const retire = useCallback(
    async (names: string[]) => {
      if (!names.length) return;
      dispatch({ type: "setRetired", names, value: true });
      const res = await runAction(["retire", ...names]);
      await invalidate([qk.library, qk.where, qk.agents]);
      if (!res.ok) {
        dispatch({ type: "setRetired", names, value: false });
        dispatch({
          type: "setError",
          error: res.stderr.trim() || `retire failed`,
        });
        return;
      }
      const undo = () => {
        dispatch({ type: "setRetired", names, value: false });
        dispatch({ type: "hideToast" });
        void runInverse(
          [["unretire", ...names]],
          [qk.library, qk.where, qk.agents],
        );
      };
      dispatch({
        type: "showToast",
        toast: {
          msg: names.length > 1 ? `${names.length} skills retired` : `Retired ${names[0]}`,
          cmd: cmdEcho(["retire", ...names]),
          undo,
        },
      });
    },
    [dispatch, invalidate, runInverse],
  );

  // ── Unretire (one or many) — reversible (inverse of retire) ─────────────
  // Mirrors `retire`: ONE multi-name `skl unretire a b c` call (single reindex),
  // optimistically promotes every name back to live (setUnretired true),
  // invalidates the library/where/agents feeds, and offers an Undo that
  // re-retires the whole batch. On failure the refetch reconciles to disk truth.
  const unretire = useCallback(
    async (names: string[]) => {
      if (!names.length) return;
      dispatch({ type: "setUnretired", names, value: true });
      const res = await runAction(["unretire", ...names]);
      await invalidate([qk.library, qk.where, qk.agents]);
      if (!res.ok) {
        dispatch({ type: "setUnretired", names, value: false });
        dispatch({
          type: "setError",
          error: res.stderr.trim() || `unretire failed`,
        });
        return;
      }
      const undo = () => {
        dispatch({ type: "setUnretired", names, value: false });
        dispatch({ type: "hideToast" });
        void runInverse(
          [["retire", ...names]],
          [qk.library, qk.where, qk.agents],
        );
      };
      dispatch({
        type: "showToast",
        toast: {
          msg:
            names.length > 1
              ? `${names.length} skills unretired`
              : `Unretired ${names[0]}`,
          cmd: cmdEcho(["unretire", ...names]),
          undo,
        },
      });
    },
    [dispatch, invalidate, runInverse],
  );

  // ── Untag a domain — reversible ─────────────────────────────────────────
  const untag = useCallback(
    async (name: string, domain: string) => {
      dispatch({ type: "addRemovedTag", name, domain });
      const rollback = () =>
        dispatch({ type: "removeRemovedTag", name, domain });
      const undo = () => {
        rollback();
        dispatch({ type: "hideToast" });
        void runInverse([["tag", name, domain]], [qk.library]);
      };
      await run(["untag", name, domain], {
        rollback,
        invalidate: [qk.library],
        toast: { msg: `Removed tag "${domain}"`, undo },
      });
    },
    [dispatch, run, invalidate],
  );

  // ── Tag (single, e.g. from inbox/bulk) — reversible ─────────────────────
  const tag = useCallback(
    async (names: string[], domain: string) => {
      if (!names.length) return;
      if (!domain) {
        dispatch({ type: "setError", error: "tag requires a domain" });
        return;
      }
      const failures: string[] = [];
      for (const name of names) {
        const res = await runAction(["tag", name, domain]);
        if (!res.ok) failures.push(`${name}: ${res.stderr.trim() || "failed"}`);
      }
      if (failures.length) {
        // Some names may have been tagged on disk before the failure; refetch
        // so the successful tags are reflected from server truth.
        await invalidate([qk.library]);
        dispatch({ type: "setError", error: `tag failed — ${failures.join("; ")}` });
        return;
      }
      await invalidate([qk.library]);
      const undo = () => {
        dispatch({ type: "hideToast" });
        void runInverse(
          names.map((name) => ["untag", name, domain]),
          [qk.library],
        );
      };
      dispatch({
        type: "showToast",
        toast: {
          msg:
            names.length > 1
              ? `Tagged ${names.length} skills → ${domain}`
              : `Tagged ${names[0]} → ${domain}`,
          cmd: names.map((n) => cmdEcho(["tag", n, domain])).join(" ; "),
          undo,
        },
      });
    },
    [dispatch, invalidate],
  );

  // ── Hard remove — IRREVERSIBLE, no undo (type-to-confirm gated upstream) ─
  const hardRemove = useCallback(
    async (name: string) => {
      // Close the type-to-confirm modal immediately (it renders off
      // state.confirm); otherwise it lingers on a now-deleted skill and a
      // second confirm would re-dispatch `rm` on an absent skill.
      dispatch({ type: "cancelConfirm" });
      dispatch({ type: "setRemovedHard", name, value: true });
      const rollback = () =>
        dispatch({ type: "setRemovedHard", name, value: false });
      await run(["rm", name], {
        rollback,
        invalidate: [qk.library, qk.where, qk.agents],
        toast: { msg: `Removed ${name} — deleted from disk`, undo: null },
      });
    },
    [dispatch, run],
  );

  // ── Hard remove MANY — IRREVERSIBLE, one batch call (W7 / ADR-0008) ──────
  // Mirrors `retire`'s batched optimistic structure but stays destructive like
  // hardRemove: ONE `skl rm a b c` (the engine deletes each folder + reindexes
  // the library ONCE), ONE toast, ONE invalidate — replacing the old un-awaited
  // per-name loop (which fired N parallel `skl rm`, N invalidation storms,
  // clobbered toasts, and left partial non-undoable state on a mid-batch fail).
  // Optimistically marks every name removed and rolls ALL back on failure; the
  // refetch reconciles to real (possibly partial) disk truth. No Undo (matches
  // hardRemove — the type-to-confirm gate upstream is the guard).
  const hardRemoveMany = useCallback(
    async (names: string[]) => {
      if (!names.length) return;
      // Close the type-to-confirm modal immediately (it renders off
      // state.confirm); otherwise it lingers on now-deleted skills and a second
      // confirm would re-dispatch `rm` on absent skills.
      dispatch({ type: "cancelConfirm" });
      for (const name of names)
        dispatch({ type: "setRemovedHard", name, value: true });
      const rollback = () => {
        for (const name of names)
          dispatch({ type: "setRemovedHard", name, value: false });
      };
      await run(["rm", ...names], {
        rollback,
        invalidate: [qk.library, qk.where, qk.agents],
        toast: {
          msg:
            names.length > 1
              ? `Removed ${names.length} skills — deleted from disk`
              : `Removed ${names[0]} — deleted from disk`,
          undo: null,
        },
      });
    },
    [dispatch, run],
  );

  // ── Update a vendored skill from upstream (ADR-0009) — NOT invertible ────
  // Callers gate this to status==="stale"|"diverged" github rows only (the
  // badge logic in LibraryView/MatrixView; never linked/local). `skl update`
  // re-pulls the upstream body, preserving domain tags (taxonomy.json). It is
  // not cleanly reversible, so there is no Undo.
  // ADR-0013: STOP discarding the report. We don't route through the generic
  // run() (which only returns ok) — instead reuse loadOutdated's idiom: update
  // EXITS 2 on diverged (not a failure; JSON is still on stdout), so we call
  // runAction directly and treat "stdout parses as JSON" as success. The parsed
  // report is dispatched into the store (drives the orphaned ⊘ badge + results
  // banner). name omitted → bare `["update","--json"]` ("Update all", decision 9).
  // ponytail: browser dry-run stdout is "(dry-run: …)" which won't parse → we
  // skip the report (banner stays hidden) and keep the optimistic cache patch —
  // the honest non-Tauri no-op (we cannot clone). ceiling: no --force from UI.
  const update = useCallback(
    async (
      name?: string,
      opts?: { silent?: boolean; force?: boolean },
    ): Promise<boolean> => {
      dispatch({ type: "setError", error: null });
      // --force overwrites a diverged local body (discards the user's edits). Only
      // the diverged-row "overwrite" button passes it, behind an explicit confirm.
      const force = opts?.force ? ["--force"] : [];
      const args = name
        ? ["update", name, ...force, "--json"]
        : ["update", ...force, "--json"];
      const res = await runAction(args);
      let report: UpdateReport | null = null;
      try {
        const parsed = UpdateReportSchema.safeParse(JSON.parse(res.stdout));
        if (parsed.success) report = parsed.data;
      } catch {
        // Not JSON (browser dry-run echo). Treat as silent success — no report.
      }
      // A genuine non-zero exit WITHOUT a parseable report is a real failure
      // (clone/fetch error, binary missing). update exits 2 on diverged but
      // still emits JSON, so a parsed report always wins over res.ok.
      if (!report && !res.ok) {
        dispatch({
          type: "setError",
          error: res.stderr.trim() || `${cmdEcho(args)} failed`,
        });
        return false;
      }
      await invalidate([qk.library, qk.where, qk.agents]);
      // W2: MERGE (not replace) so a badge click / banner retry / "Update all
      // stale" loop accumulates into ONE report instead of collapsing the
      // multi-row banner down to this single skill's row.
      if (report) dispatch({ type: "mergeUpdateReport", report });
      if (!opts?.silent && name) {
        // Honest, outcome-aware toast. Saying "Updated" when the outcome was
        // diverged/orphaned/uptodate misleads (nothing changed, and the banner
        // still shows it diverged). Reflect THIS skill's actual outcome.
        const r0 = report?.results.find((r) => r.name === name);
        const msg =
          r0?.outcome === "error"
            ? `${name} failed — ${r0.note}`
            : r0?.outcome === "diverged"
              ? `${name} diverged — local edits block overwrite (use CLI --force)`
              : r0?.outcome === "orphaned"
                ? `${name} no longer published upstream`
                : r0?.outcome === "uptodate"
                  ? `${name} already up to date`
                  : r0?.relocatedFrom
                    ? `Updated ${name} (followed rename)`
                    : `Updated ${name}`;
        dispatch({
          type: "showToast",
          toast: { msg, cmd: cmdEcho(args), undo: null },
        });
      }
      // The reconciled skill(s) are now re-pinned to upstream HEAD → patch the
      // MANUAL outdated cache so the ↑/⚠ badge clears immediately (no re-check).
      // Scope strictly to the rows THIS run reconciled (updated/uptodate, incl.
      // an auto-followed rename) — so a per-vendor or per-name run never clears
      // another vendor's stale badge. Browser (no report) falls back to `name`.
      const reconciled = new Set(
        report
          ? report.results
              .filter(
                (r) =>
                  r.outcome === "updated" ||
                  r.outcome === "uptodate" ||
                  r.relocatedFrom != null,
              )
              .map((r) => r.name)
          : name
            ? [name]
            : [],
      );
      qc.setQueryData<OutdatedReport>(qk.outdated, (prev) =>
        prev
          ? {
              ...prev,
              rows: prev.rows.map((r) =>
                reconciled.has(r.name)
                  ? { ...r, status: "current" as const }
                  : r,
              ),
              stale: prev.rows.filter(
                (r) => r.status === "stale" && !reconciled.has(r.name),
              ).length,
              diverged: prev.rows.filter(
                (r) => r.status === "diverged" && !reconciled.has(r.name),
              ).length,
            }
          : prev,
      );
      // Honest boolean: a single-skill update whose result errored is NOT a success,
      // even though a report was produced (report-wins-over-res.ok governs SURFACING,
      // not the success verdict). Callers that gate on the return must see the failure.
      if (name && report?.results.find((r) => r.name === name)?.outcome === "error") {
        return false;
      }
      return true;
    },
    [dispatch, invalidate, qc],
  );

  // ── Update ONE vendor (owner/repo) — `skl update --repo <source> --json`.
  //    Replaces the removed library-wide "Update all": one clone, results scoped
  //    to that vendor (the banner shows only it). Same safe parse-report path as
  //    update() — the engine REPORTS diverged without --force (never clobbers),
  //    orphaned is non-destructive. `repo` is the parsed key e.g. github:owner/repo.
  const updateVendor = useCallback(
    async (repo: string): Promise<boolean> => {
      dispatch({ type: "setError", error: null });
      const args = ["update", "--repo", repo, "--json"];
      const res = await runAction(args);
      let report: UpdateReport | null = null;
      try {
        const parsed = UpdateReportSchema.safeParse(JSON.parse(res.stdout));
        if (parsed.success) report = parsed.data;
      } catch {
        /* browser dry-run echo — not JSON; no report */
      }
      if (!report && !res.ok) {
        dispatch({
          type: "setError",
          error: res.stderr.trim() || `${cmdEcho(args)} failed`,
        });
        return false;
      }
      await invalidate([qk.library, qk.where, qk.agents]);
      if (report) {
        // W2: a full per-vendor run REPLACES the report (fresh multi-row result);
        // only targeted single-skill updates merge (see update() above).
        dispatch({ type: "setUpdateReport", report });
        const reconciled = new Set(
          report.results
            .filter(
              (r) =>
                r.outcome === "updated" ||
                r.outcome === "uptodate" ||
                r.relocatedFrom != null,
            )
            .map((r) => r.name),
        );
        qc.setQueryData<OutdatedReport>(qk.outdated, (prev) =>
          prev
            ? {
                ...prev,
                rows: prev.rows.map((r) =>
                  reconciled.has(r.name)
                    ? { ...r, status: "current" as const }
                    : r,
                ),
                stale: prev.rows.filter(
                  (r) => r.status === "stale" && !reconciled.has(r.name),
                ).length,
                diverged: prev.rows.filter(
                  (r) => r.status === "diverged" && !reconciled.has(r.name),
                ).length,
              }
            : prev,
        );
      }
      return true;
    },
    [dispatch, invalidate, qc],
  );

  // ── Add the NEW (untracked) skills of a source repo (ADR-0013 newAvailable
  //    button). Adds exactly the listed names via `--skill` — NOT `--all` — so it
  //    installs only what's new and sidesteps the ADR-0012 `--all` >15 count gate
  //    (which counts the repo's FULL published set, not the new ones, and would
  //    otherwise block "Add 6 new" when the repo publishes 17). `--skill` is never
  //    gated. A separate deliberate click (curator boundary); never auto-run. ────
  const addAll = useCallback(
    async (repo: string, names: string[]): Promise<boolean> => {
      if (names.length === 0) return true;
      return run(["add", repo, "--skill", names.join(",")], {
        rollback: () => {},
        invalidate: [qk.library, qk.where, qk.agents],
        toast: { msg: `Added ${names.length} new skill(s) from ${repo}`, undo: null },
      });
    },
    [run],
  );

  // ── Resolve a `copy` anomaly (ADR-0010 §4c, Bug 1) — NOT invertible ──────
  // Runs an exact pre-built `link`/`import` vector (the resolve popover builds it
  // from the recovered on-disk copy path). Both verbs mutate the filesystem in a
  // way `skl` exposes no clean inverse for (link discards the copy; import adopts
  // it into the library), so there is no Undo — the action labels carry the
  // consequence. Invalidates the deployment + library feeds so the cell re-derives.
  const resolveCopy = useCallback(
    async (args: string[], msg: string): Promise<boolean> => {
      return run(args, {
        rollback: () => {},
        invalidate: [qk.where, qk.agents, qk.library],
        toast: { msg, undo: null },
      });
    },
    [run],
  );

  return {
    deploy,
    bulkDeploy,
    addProject,
    removeProject,
    retire,
    unretire,
    untag,
    tag,
    hardRemove,
    hardRemoveMany,
    update,
    updateVendor,
    addAll,
    resolveCopy,
  };
}
