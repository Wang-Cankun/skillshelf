// The update-aware SOURCE cell (ADR-0009), shared by LibraryView + MatrixView.
//
// - Vendored github-channel rows render their `origin` (owner/repo) as a
//   click-through that opens the GitHub repo ROOT in the external browser.
//   Non-github vendored (e.g. vercel-registry) renders a plain, non-link span.
//   linked/local rows render a muted "local".
// - BESIDE the origin (never replacing it — most rows are stale, so repo
//   identity must stay visible) we render a per-row update badge driven by the
//   manual `outdated` check (useOutdated, enabled:false → no badge until the
//   user clicks "Check updates"):
//     status "stale"    → "↑" (blue)  = update this skill.
//     status "diverged" → "⚠" (amber) = update, but CONFIRM first (clobbers edits).
//     current/linked/unknown/no-data → no badge.
//   The badge is the ONLY update affordance, so the ADR-0004 safety gate (never
//   update linked/local) holds by construction: those rows never get a badge.

import { useCommands } from "../state/commands";
import { useOutdated } from "../state/queries";
import { openExternal } from "../lib/shell";
import { MONO } from "../lib/tokens";
import type { OutdatedStatus, Skill } from "../lib/types";

/** Build a name→status lookup from the (possibly-unfetched) outdated cache. */
export function useOutdatedStatus(): (name: string) => OutdatedStatus | undefined {
  const rows = useOutdated().data?.rows ?? [];
  const byName = new Map(rows.map((r) => [r.name, r.status]));
  return (name: string) => byName.get(name);
}

function UpdateBadge({ skill }: { skill: Skill }) {
  const commands = useCommands();
  const statusOf = useOutdatedStatus();
  const status = statusOf(skill.name);
  if (status === "stale") {
    return (
      <button
        onClick={() => void commands.update(skill.name)}
        title={`Update ${skill.name} from upstream`}
        aria-label={`update ${skill.name}`}
        style={badgeStyle("#2563EB")}
      >
        ↑
      </button>
    );
  }
  if (status === "diverged") {
    return (
      <button
        onClick={() => {
          if (
            window.confirm(
              `Update ${skill.name}? Local edits diverged from upstream and may be overwritten.`,
            )
          )
            void commands.update(skill.name);
        }}
        title={`${skill.name} diverged from upstream — update may overwrite local edits`}
        aria-label={`update diverged ${skill.name}`}
        style={badgeStyle("#D97706")}
      >
        ⚠
      </button>
    );
  }
  return null;
}

function badgeStyle(color: string): React.CSSProperties {
  return {
    marginLeft: 5,
    color,
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    fontSize: 12,
    lineHeight: 1,
    fontWeight: 700,
    verticalAlign: "middle",
  };
}

export function SourceCell({
  skill,
  variant,
}: {
  skill: Skill;
  variant: "library" | "matrix";
}) {
  const isVendor = skill.source === "vendored";
  const isGithub = skill.channel === "github" && !!skill.origin;
  const label = isVendor ? skill.origin ?? "vendored" : "local";

  const textStyle: React.CSSProperties = isVendor
    ? variant === "library"
      ? {
          color: "#2563EB",
          fontFamily: MONO,
          fontSize: 11,
          background: "#EFF4FE",
          borderRadius: 5,
          padding: "2px 7px",
          maxWidth: 190, // fits a full "dontbesilent2025/dbskill"; ellipsis only beyond
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          display: "inline-block",
          verticalAlign: "bottom",
        }
      : {
          color: "#2563EB",
          fontFamily: MONO,
          fontSize: 10.5,
          maxWidth: 140,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          display: "inline-block",
          verticalAlign: "bottom",
        }
    : variant === "library"
      ? { color: "#9A9AA2", fontSize: 11.5 }
      : { color: "#9A9AA2", fontSize: 11 };

  const text =
    isVendor && isGithub ? (
      <button
        onClick={() => void openExternal(`https://github.com/${skill.origin}`)}
        title={`Open github.com/${skill.origin}`}
        aria-label={`open ${skill.origin} on GitHub`}
        style={{
          ...textStyle,
          border: "none",
          cursor: "pointer",
          textDecoration: "underline",
          textUnderlineOffset: 2,
        }}
      >
        {label}
      </button>
    ) : (
      <span style={textStyle} title={isVendor ? label : "local"}>
        {label}
      </span>
    );

  return (
    <span style={{ whiteSpace: "nowrap" }}>
      {text}
      {/* update affordance lives in the Library tab only, not the Matrix */}
      {isVendor && variant === "library" ? <UpdateBadge skill={skill} /> : null}
    </span>
  );
}
