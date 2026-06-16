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
import { useStore } from "./store";
import { qk } from "./queries";
import { GLOBAL_SCOPE } from "./store";
import type { OutdatedReport } from "../lib/types";

// Defense-in-depth: the only verbs this MUTATION layer may dispatch through
// run()/runInverse(). This is intentionally a SUBSET of the Rust ALLOWED_VERBS
// (lib.rs) — read-only loaders (ls/show/agents/…) go straight through invokeJson
// and never touch run(), so they don't appear here. The Rust list is the full
// authority and must remain a superset of this set; anything routed through
// run() that isn't here is a programming error, refused before a process spawns.
const ALLOWED = new Set(["use", "drop", "retire", "unretire", "tag", "untag", "rm", "where", "update", "projects", "link", "import"]);

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
  const { state, dispatch } = useStore();
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
  // Loops one `use`/`drop` per skill, applies each optimistic override, then
  // emits ONE combined toast and invalidates ONCE. On any failure the failed
  // skill's override is rolled back and the error surfaced; succeeded skills
  // are real on disk and reflected after the single invalidate. Undo reverses
  // every successful override and runs the inverse vectors in one batch.
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

      const succeeded: string[] = [];
      const failures: string[] = [];
      for (const name of names) {
        const args = [
          verb,
          name,
          "--agent",
          agentId,
          ...scopeFlags(scope, scopePath),
        ];
        const res = await runAction(args);
        if (res.ok) succeeded.push(name);
        else {
          // roll back only the failed override; succeeded ones stay optimistic
          // until the single invalidate reconciles them with disk truth.
          dispatch({
            type: "clearDeployOverride",
            key: deployKey(name, agentId, scope),
          });
          failures.push(`${name}: ${res.stderr.trim() || "failed"}`);
        }
      }

      await invalidate([qk.agents, qk.where, qk.library]);

      // RISK 2: clear-on-success. After the single invalidate, server truth is
      // authoritative for every succeeded skill, so drop their optimistic
      // overrides — leaving them would mask a later external state change (a CLI
      // `drop`, another surface) behind a stale 'on'/'off' entry and grow the
      // override map unbounded. Failed overrides were already rolled back above.
      for (const name of succeeded)
        dispatch({
          type: "clearDeployOverride",
          key: deployKey(name, agentId, scope),
        });

      if (failures.length) {
        dispatch({
          type: "setError",
          error: `${verb} failed — ${failures.join("; ")}`,
        });
      }
      if (!succeeded.length) return;

      const undo = () => {
        for (const name of succeeded)
          dispatch({
            type: "clearDeployOverride",
            key: deployKey(name, agentId, scope),
          });
        dispatch({ type: "hideToast" });
        void runInverse(
          succeeded.map((name) => [
            on ? "drop" : "use",
            name,
            "--agent",
            agentId,
            ...scopeFlags(scope, scopePath),
          ]),
          [qk.agents, qk.where, qk.library],
        );
      };
      const word = on ? "Enabled" : "Removed";
      dispatch({
        type: "showToast",
        toast: {
          msg:
            succeeded.length > 1
              ? `${word} ${succeeded.length} skills · ${agentId} (${scope})`
              : `${word} ${succeeded[0]} · ${agentId} (${scope})`,
          cmd: succeeded
            .map((n) =>
              cmdEcho([verb, n, "--agent", agentId, ...scopeFlags(scope, scopePath)]),
            )
            .join(" ; "),
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
  const retire = useCallback(
    async (names: string[]) => {
      if (!names.length) return;
      dispatch({ type: "setRetired", names, value: true });
      // one verb per name; track which actually failed so we only roll those back.
      const failures: string[] = [];
      const failed: string[] = [];
      for (const name of names) {
        const res = await runAction(["retire", name]);
        if (!res.ok) {
          failed.push(name);
          failures.push(`${name}: ${res.stderr.trim() || "failed"}`);
        }
      }
      if (failures.length) {
        // Only revert the names that failed; names that succeeded are real on
        // disk. Always invalidate so the UI re-syncs to actual truth.
        dispatch({ type: "setRetired", names: failed, value: false });
        await invalidate([qk.library, qk.where, qk.agents]);
        dispatch({ type: "setError", error: `retire failed — ${failures.join("; ")}` });
        return;
      }
      const rollback = () =>
        dispatch({ type: "setRetired", names, value: false });
      await invalidate([qk.library, qk.where, qk.agents]);
      const undo = () => {
        rollback();
        dispatch({ type: "hideToast" });
        void runInverse(
          names.map((name) => ["unretire", name]),
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
    [dispatch, invalidate],
  );

  // ── Unretire (one or many) — reversible (inverse of retire) ─────────────
  // Mirrors `retire`: optimistically promotes each name back to live
  // (setUnretired true), runs `skl unretire <name>` per name, invalidates the
  // library/where/agents feeds, and offers an Undo that re-retires. On partial
  // failure only the failed names are reverted; the rest are real on disk and
  // reconciled by the invalidate.
  const unretire = useCallback(
    async (names: string[]) => {
      if (!names.length) return;
      dispatch({ type: "setUnretired", names, value: true });
      const failures: string[] = [];
      const failed: string[] = [];
      for (const name of names) {
        const res = await runAction(["unretire", name]);
        if (!res.ok) {
          failed.push(name);
          failures.push(`${name}: ${res.stderr.trim() || "failed"}`);
        }
      }
      if (failures.length) {
        dispatch({ type: "setUnretired", names: failed, value: false });
        await invalidate([qk.library, qk.where, qk.agents]);
        dispatch({
          type: "setError",
          error: `unretire failed — ${failures.join("; ")}`,
        });
        return;
      }
      const rollback = () =>
        dispatch({ type: "setUnretired", names, value: false });
      await invalidate([qk.library, qk.where, qk.agents]);
      const undo = () => {
        rollback();
        dispatch({ type: "hideToast" });
        void runInverse(
          names.map((name) => ["retire", name]),
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

  // ── Auto-fix safe deployment problems (`where --fix`) ───────────────────
  const autoFix = useCallback(async () => {
    const args = state.dryRun ? ["where", "--fix", "--dry-run"] : ["where", "--fix"];
    await run(args, {
      rollback: () => {},
      invalidate: [qk.where, qk.scan, qk.library],
      toast: { msg: state.dryRun ? "Dry-run: safe fixes previewed" : "Applied safe fixes", undo: null },
    });
  }, [run, state.dryRun]);

  // ── Update a vendored skill from upstream (ADR-0009) — NOT invertible ────
  // Callers gate this to status==="stale"|"diverged" github rows only (the
  // badge logic in LibraryView/MatrixView; never linked/local). `skl update`
  // re-pulls the upstream body, preserving domain tags (taxonomy.json). It is
  // not cleanly reversible, so there is no Undo.
  const update = useCallback(
    async (name: string, opts?: { silent?: boolean }): Promise<boolean> => {
      const ok = await run(["update", name], {
        rollback: () => {},
        // qk.outdated is a MANUAL (enabled:false) query — invalidating it would
        // NOT refetch, so the badge would never clear. We patch its cache below.
        invalidate: [qk.library, qk.where, qk.agents],
        toast: opts?.silent ? undefined : { msg: `Updated ${name}`, undo: null },
      });
      if (ok) {
        // The skill is now re-pinned to upstream HEAD → mark its outdated row
        // "current" so the ↑/⚠ badge clears immediately (no re-check needed).
        qc.setQueryData<OutdatedReport>(qk.outdated, (prev) =>
          prev
            ? {
                ...prev,
                rows: prev.rows.map((r) =>
                  r.name === name ? { ...r, status: "current" as const } : r,
                ),
                stale: prev.rows.filter(
                  (r) => r.name !== name && r.status === "stale",
                ).length,
                diverged: prev.rows.filter(
                  (r) => r.name !== name && r.status === "diverged",
                ).length,
              }
            : prev,
        );
      }
      return ok;
    },
    [run, qc],
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
    autoFix,
    update,
    resolveCopy,
  };
}
