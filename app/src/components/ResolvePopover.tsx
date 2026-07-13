// Anomaly-resolution flow (ADR-0010 §4 part c, delta 3-c, brief part c). Renders
// off `state.resolve` — set when a WARNING-glyph AgentToggle cell is clicked
// (rows OR drawer). A click never blind-toggles a symlink; instead it opens this
// modal of explicit, per-state choices:
//   drift   → view diff (inline unified diff) · pull upstream · overwrite from library · keep
//   copy    → adopt into library (skl import --copy) · convert to link (DANGER, skl link --at) · keep
//   dead    → repair (re-link) · remove (drop the broken link)
//   aliased → realign name (skl realign) · keep
// `aliased` is FOLDED into the derived state `drift` by stateForSite, so a cell's
// `state` alone reads as "drift". AgentToggle recovers the pre-fold distinction
// from the raw `where` feed and sets `target.aliased`, which we branch on FIRST
// here so an aliased deployment gets the dedicated "Realign name" menu instead of
// the diff/pull drift options.
//
// Each action: dispatch `applyResolve` (closes the popover) THEN run the real
// command — every action is engine-backed; "View diff" renders its result
// in-place instead of closing. We mount this globally inside DetailDrawer
// (always mounted) so a list-row anomaly click resolves even with the drawer closed.

import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import { useCommands } from "../state/commands";
import { useLibrary, useWhere } from "../state/queries";
import { GLOBAL_SCOPE } from "../state/store";
import { MONO } from "../lib/tokens";
import { copySiteFor } from "../lib/agents";
import { loadDiff } from "../lib/skl";
import type { DeployStateName } from "../lib/types";

interface ResolveAction {
  label: string;
  hint: string;
  /** the literal `skl …` vector this maps to (echoed in the toast / preview). */
  cmd: string[];
  danger?: boolean;
  /** real runner (absent only on the keep/no-op action). */
  run?: () => void;
  /** run WITHOUT closing the popover (in-place views like the diff panel). */
  keepOpen?: boolean;
}

export function ResolvePopover() {
  const { state, dispatch } = useStore();
  const commands = useCommands();
  const library = useLibrary().data ?? [];
  const where = useWhere().data;
  const target = state.resolve;
  // In-place unified-diff panel (drift → "View diff"): null = hidden,
  // "" = loading. Reset whenever the resolve target changes.
  const [diffText, setDiffText] = useState<string | null>(null);
  useEffect(() => setDiffText(null), [target]);
  if (!target) return null;

  const { skill, agent, scope, scopePath } = target;
  // W6/S4: "Pull upstream" runs `skl update`, which only works for a github-
  // vendored skill (has a real upstream). A local/linked skill has none, so the
  // engine errors — gate the action to source==="vendored" && channel==="github"
  // (mirrors the ADR-0004 update gate in SkillList / SourceCell). The target only
  // carries the skill NAME, so recover its provenance from the library feed.
  const skillMeta = library.find((s) => s.name === skill);
  const canPull =
    skillMeta?.source === "vendored" &&
    skillMeta?.channel === "github" &&
    !!skillMeta?.origin;
  // `aliased` is folded into `drift` by stateForSite; AgentToggle re-flags it on
  // the target. Treat copy/dead/source on their own; default to the drift menu.
  const st = target.state;

  const close = () => dispatch({ type: "applyResolve" });
  const scopeFlag =
    scope === GLOBAL_SCOPE ? ["--global"] : ["--project", scopePath ?? scope];

  const keep: ResolveAction = {
    label: "Keep as-is",
    hint: "Leave it untouched and close.",
    cmd: [],
    run: undefined,
  };

  const actions: ResolveAction[] = (() => {
    // Aliased site (recovered pre-fold): the deployment is linked under the WRONG
    // name. "Realign name" renames the deployed link to its library skill name
    // (`skl realign`) — never blind-toggled.
    if (target.aliased) {
      return [
        {
          label: "Realign name",
          hint: target.aliasTarget
            ? `Rename this "${skill}" deployment to match its library skill "${target.aliasTarget}".`
            : "Rename the deployment to match its library skill name.",
          cmd: ["skl", "realign", skill, "--agent", agent, ...scopeFlag],
          run: () =>
            void commands.resolveCopy(
              ["realign", skill, "--agent", agent, ...scopeFlag],
              `Realigned ${skill}${target.aliasTarget ? ` → ${target.aliasTarget}` : ""}`,
            ),
        },
        keep,
      ];
    }
    switch (st) {
      case "drift":
        return [
          {
            label: "View diff",
            hint: "Compare the deployed copy against the library source.",
            cmd: ["skl", "diff", skill, "--agent", agent, ...scopeFlag],
            keepOpen: true,
            run: () => {
              setDiffText("");
              loadDiff(skill, agent, scopeFlag)
                .then((r) =>
                  setDiffText(
                    r.identical ? "(no drift — deployed copy matches the library)" : r.diff,
                  ),
                )
                .catch((err) => setDiffText(`diff failed: ${String(err)}`));
            },
          },
          // Only a github-vendored skill has an upstream to pull; hide otherwise
          // so `skl update` never runs against a local/linked skill (W6/S4).
          ...(canPull
            ? [
                {
                  label: "Pull upstream",
                  hint: "Re-pull the upstream body into the library (preserves tags).",
                  cmd: ["skl", "update", skill],
                  run: () => void commands.update(skill),
                } as ResolveAction,
              ]
            : []),
          {
            // `skl use --force`: replace the drifted real copy with a clean
            // symlink to the library version (discards the copy's local edits).
            label: "Overwrite from library",
            hint: "DANGER: replaces the drifted deployment (and its local edits) with the library version.",
            cmd: ["skl", "use", skill, "--agent", agent, ...scopeFlag, "--force"],
            danger: true,
            run: () =>
              void commands.resolveCopy(
                ["use", skill, "--agent", agent, ...scopeFlag, "--force"],
                `Overwrote ${skill} from the library`,
              ),
          },
          keep,
        ];
      case "copy": {
        // Real verbs need the on-disk path of the standalone copy. It is derived
        // HERE, from the live `where` feed, at render time — the single source
        // (the dispatcher no longer snapshots it). If the feed can't resolve the
        // site, the actions are OMITTED (never a path-less command, never a fake
        // echo): keep-only, with the hint explaining why.
        const copyPath = where
          ? (copySiteFor(where, skill, agent, scope)?.path ?? null)
          : null;
        if (!copyPath) {
          return [
            {
              ...keep,
              hint: "The copy's on-disk path could not be recovered from the deployment scan — refresh and retry, or resolve via `skl where` in a terminal.",
            },
          ];
        }
        return [
          {
            // `skl import <name> --from <copy> --copy`: adopt the hand-made
            // copy into the library as a real skill (non-destructive — the
            // original copy is left in place; --copy doesn't move it).
            label: "Adopt into library",
            hint: "Import this hand-made copy into the library as a real skill (leaves the copy in place).",
            cmd: ["skl", "import", skill, "--from", copyPath, "--copy"],
            run: () =>
              void commands.resolveCopy(
                ["import", skill, "--from", copyPath, "--copy"],
                `Adopted ${skill} into the library`,
              ),
          },
          {
            // `skl link <name> --at <copy> --force`: collapse the stray copy
            // into a symlink INTO the library (discards the copy's hand edits).
            label: "Convert to link",
            hint: "DANGER: replaces the on-disk copy (and any hand edits) with a symlink to the library.",
            cmd: ["skl", "link", skill, "--at", copyPath, "--force"],
            danger: true,
            run: () =>
              void commands.resolveCopy(
                ["link", skill, "--at", copyPath, "--force"],
                `Converted ${skill} copy to a library link`,
              ),
          },
          keep,
        ];
      }
      case "dead":
        return [
          {
            label: "Repair link",
            hint: "Re-create the symlink from the library source.",
            cmd: ["skl", "use", skill, "--agent", agent, ...scopeFlag],
            run: () =>
              void commands.deploy(skill, agent, scope, true, scopePath ?? undefined),
          },
          {
            label: "Remove dead link",
            hint: "Drop the broken symlink from this surface.",
            cmd: ["skl", "drop", skill, "--agent", agent, ...scopeFlag],
            danger: true,
            run: () =>
              void commands.deploy(skill, agent, scope, false, scopePath ?? undefined),
          },
        ];
      default:
        // Unreachable in practice: AgentToggle only opens resolve for the ANOMALY
        // set (drift/copy/dead) and aliased is branched above. Kept as a safe
        // keep-only fallback so a future warning state can never strand the user.
        return [keep];
    }
  })();

  const onPick = (a: ResolveAction) => {
    if (!a.run) {
      close(); // keep / no-op
      return;
    }
    if (a.keepOpen) {
      a.run(); // in-place view (diff panel) — the popover stays up
      return;
    }
    close();
    a.run();
  };

  const headingFor: Record<DeployStateName, string> = {
    clean: "Linked",
    source: "Source",
    drift: "Drift detected",
    copy: "Standalone copy",
    dead: "Dead link",
    absent: "Not linked",
  };
  const heading = target.aliased ? "Misaligned name" : headingFor[st];
  const blurbFor: Record<DeployStateName, string> = {
    clean: "",
    source: "",
    drift: "The deployed skill differs from its library source. Choose how to reconcile.",
    copy: "This surface holds a real directory, not a symlink. Decide what to do with it.",
    dead: "The symlink points at a missing target. Repair it or remove it.",
    absent: "",
  };
  const blurb = target.aliased
    ? `This skill is deployed under the wrong name${
        target.aliasTarget ? ` (library skill "${target.aliasTarget}")` : ""
      }. Realign it to match the library.`
    : blurbFor[st];

  return (
    <>
      <div
        onClick={close}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(24,24,27,0.42)",
          zIndex: 65,
          animation: "var(--animate-scrim-in)",
        }}
      />
      <div
        role="dialog"
        aria-label={`Resolve ${target.aliased ? "aliased" : st} for ${skill}`}
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          zIndex: 66,
          width: 460,
          maxWidth: "92vw",
          background: "#FFFFFF",
          borderRadius: 14,
          boxShadow: "0 24px 70px rgba(0,0,0,.3)",
          padding: "20px 20px 16px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 6,
          }}
        >
          <span
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: st === "dead" ? "#FBEBEB" : "#FAF1E2",
              color: st === "dead" ? "#DC2626" : "#D97706",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 15,
              flexShrink: 0,
            }}
          >
            {st === "dead" ? "✗" : "⚠"}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 650, lineHeight: 1.2 }}>
              {heading}
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 11,
                color: "#71717A",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {skill} · {agent} · {scope}
            </div>
          </div>
        </div>
        <p
          style={{
            fontSize: 12.5,
            color: "#52525B",
            lineHeight: 1.5,
            margin: "0 0 14px",
          }}
        >
          {blurb}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {actions.map((a, i) => (
            <button
              key={a.label + i}
              onClick={() => onPick(a)}
              style={{
                display: "block",
                textAlign: "left",
                width: "100%",
                background: a.danger ? "#FEF6F6" : "#FFFFFF",
                border:
                  "1px solid " + (a.danger ? "#F1D4D4" : "#E2E2E5"),
                borderRadius: 9,
                padding: "9px 12px",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 2,
                }}
              >
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: a.danger ? "#DC2626" : "#18181B",
                  }}
                >
                  {a.label}
                </span>
              </div>
              <div style={{ fontSize: 11.5, color: "#71717A", lineHeight: 1.4 }}>
                {a.hint}
              </div>
              {a.cmd.length ? (
                <div
                  style={{
                    marginTop: 5,
                    fontFamily: MONO,
                    fontSize: 10,
                    color: "#A1A1AA",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  $ {a.cmd.join(" ")}
                </div>
              ) : null}
            </button>
          ))}
        </div>

        {diffText !== null && (
          <pre
            style={{
              marginTop: 10,
              maxHeight: 240,
              overflow: "auto",
              background: "#F6F6F7",
              border: "1px solid #ECECEE",
              borderRadius: 8,
              padding: "8px 10px",
              fontFamily: MONO,
              fontSize: 10.5,
              lineHeight: 1.5,
              color: "#3F3F46",
              whiteSpace: "pre",
            }}
          >
            {diffText === "" ? "loading diff…" : diffText}
          </pre>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: 14,
          }}
        >
          <button
            onClick={close}
            style={{
              background: "#FFFFFF",
              border: "1px solid #E2E2E5",
              color: "#3F3F46",
              borderRadius: 8,
              padding: "6px 14px",
              fontSize: 12.5,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
