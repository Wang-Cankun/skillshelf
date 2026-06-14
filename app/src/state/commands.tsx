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
import { runAction, cmdEcho } from "../lib/skl";
import { useStore } from "./store";
import { qk } from "./queries";

// Defense-in-depth: the only verbs this layer may dispatch. Anything else is a
// programming error and is refused before a process is spawned (the Rust shell
// enforces the same set; this catches it earlier with a clear message).
const ALLOWED = new Set(["use", "drop", "retire", "unretire", "tag", "untag", "rm", "where"]);

export function deployKey(skill: string, agentId: string, scope: string) {
  return `${skill}|${agentId}|${scope}`;
}

function scopeFlags(scope: string): string[] {
  return scope === "Global" ? ["--global"] : ["--project", scope];
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

  // ── Link / Unlink an agent (drawer AGENTS rail + matrix) ────────────────
  const deploy = useCallback(
    async (skill: string, agentId: string, scope: string, on: boolean) => {
      // ADR-0008 invariant: Global is the only GUI mutation target; project
      // linking stays a CLI job. Enforce in code, not just by UI convention.
      if (scope !== "Global") {
        dispatch({
          type: "setError",
          error: "project-scope linking is a CLI operation",
        });
        return;
      }
      const key = deployKey(skill, agentId, scope);
      dispatch({ type: "setDeployOverride", key, value: on ? "on" : "off" });
      const verb = on ? "use" : "drop";
      const args = [verb, skill, "--agent", agentId, ...scopeFlags(scope)];
      const rollback = () => dispatch({ type: "clearDeployOverride", key });
      const undo = () => {
        dispatch({ type: "clearDeployOverride", key });
        const inv = [
          on ? "drop" : "use",
          skill,
          "--agent",
          agentId,
          ...scopeFlags(scope),
        ];
        void runAction(inv);
        dispatch({ type: "hideToast" });
        void invalidate([qk.agents, qk.where, qk.library]);
      };
      await run(args, {
        rollback,
        invalidate: [qk.agents, qk.where, qk.library],
        toast: {
          msg: `${on ? "Linked" : "Unlinked"} ${skill} · ${agentId} (${scope})`,
          undo,
        },
      });
    },
    [dispatch, run, invalidate],
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
        for (const name of names) void runAction(["unretire", name]);
        dispatch({ type: "hideToast" });
        void invalidate([qk.library, qk.where, qk.agents]);
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

  // ── Untag a domain — reversible ─────────────────────────────────────────
  const untag = useCallback(
    async (name: string, domain: string) => {
      dispatch({ type: "addRemovedTag", name, domain });
      const rollback = () =>
        dispatch({ type: "removeRemovedTag", name, domain });
      const undo = () => {
        rollback();
        void runAction(["tag", name, domain]);
        dispatch({ type: "hideToast" });
        void invalidate([qk.library]);
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
        for (const name of names) void runAction(["untag", name, domain]);
        dispatch({ type: "hideToast" });
        void invalidate([qk.library]);
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

  return { deploy, retire, untag, tag, hardRemove, autoFix };
}
