// ADR-0013 decision 8 — the update results banner. Renders off the session
// `state.updateReport` (set by commands.update / commands.updateVendor). The ONE new
// component this ADR adds: the newAvailable "Add new from <repo>" buttons have
// nowhere else to live. Reuses ErrorBanner's banner styling as the visual
// template. Renders nothing when there is no report (browser dry-run never sets
// one, so this stays hidden without a backend — the honest non-Tauri behavior).
//
// Surfaces (non-destructive — the engine REPORTS, never clobbers):
//   - a one-line count summary (updated/diverged/orphaned/relocated);
//   - relocated lines ("followed rename …" — result.note where relocatedFrom set);
//   - diverged rows with an "overwrite (discard my edits)" button → an explicit
//     destructive window.confirm → commands.update(name, {force:true}), which runs
//     `update <name> --force` and overwrites the diverged local body with upstream.
//   - per newAvailable[] an "Add N new from <repo>" button → commands.addAll adds
//     exactly those names via `--skill` (gate-free; a courtesy confirm for >15).

import { useStore } from "../state/store";
import { useCommands } from "../state/commands";

export function UpdateResultsBanner() {
  const { state, dispatch } = useStore();
  const commands = useCommands();
  const report = state.updateReport;
  // W3: visibility is decoupled from the report DATA. `bannerDismissed` hides the
  // banner while KEEPING `updateReport`, so SourceCell's ⊘ orphaned badges (which
  // read updateReport) survive a dismissal. A new run resets bannerDismissed.
  if (!report || state.bannerDismissed) return null;

  const updated = report.updated;
  const diverged = report.diverged;
  const orphaned = report.orphaned ?? 0;
  const errored = report.errors ?? 0;
  const relocatedResults = report.results.filter((r) => r.relocatedFrom);
  const divergedResults = report.results.filter((r) => r.outcome === "diverged");
  const errorResults = report.results.filter((r) => r.outcome === "error");
  const newAvailable = report.newAvailable ?? [];

  const summary = [
    `${updated} updated`,
    errored ? `${errored} failed` : null,
    diverged ? `${diverged} diverged` : null,
    orphaned ? `${orphaned} orphaned` : null,
    relocatedResults.length ? `${relocatedResults.length} relocated` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      role="status"
      style={{
        borderBottom: "1px solid #BFDBFE",
        background: "#EFF6FF",
        fontSize: 12,
        color: "#1E3A8A",
        padding: "10px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <span style={{ fontWeight: 700 }}>update</span>
        <span style={{ flex: 1, wordBreak: "break-word" }}>{summary}</span>
        <button
          aria-label="dismiss update report"
          onClick={() => dispatch({ type: "dismissBanner" })}
          style={{
            background: "none",
            border: "none",
            color: "#1E3A8A",
            cursor: "pointer",
            fontSize: 14,
            lineHeight: 1,
            padding: 0,
          }}
        >
          ✕
        </button>
      </div>

      {/* relocated (rename auto-followed) — informational lines */}
      {relocatedResults.length ? (
        <ul style={{ margin: 0, paddingLeft: 18, color: "#1D4ED8" }}>
          {relocatedResults.map((r) => (
            <li key={r.name}>{r.note}</li>
          ))}
        </ul>
      ) : null}

      {/* errored — a clone/fetch failure (often a transient network blip). Surfaced
          explicitly (never silently folded into "0 updated") with a per-skill retry
          that re-runs `skl update <name>`. */}
      {errorResults.map((r) => (
        <div
          key={r.name}
          style={{ display: "flex", gap: 8, alignItems: "center" }}
        >
          <span style={{ color: "#B91C1C", flex: 1, wordBreak: "break-word" }}>
            ✕ {r.name} failed — {r.note}
          </span>
          <button
            onClick={() => void commands.update(r.name)}
            style={pillBtn("#B91C1C")}
          >
            retry
          </button>
        </div>
      ))}

      {/* diverged — local edits block an overwrite (3-way gate, never clobbered) */}
      {divergedResults.map((r) => (
        <div
          key={r.name}
          style={{ display: "flex", gap: 8, alignItems: "center" }}
        >
          <span style={{ color: "#92400E" }}>
            ⚠ {r.name} diverged — local edits block the overwrite.
          </span>
          <button
            onClick={() => {
              if (
                window.confirm(
                  `Overwrite ${r.name} with the upstream version?\n\n` +
                    `This DISCARDS your local edits to ${r.name} and cannot be undone.`,
                )
              )
                void commands.update(r.name, { force: true });
            }}
            style={pillBtn("#92400E")}
          >
            overwrite (discard my edits)
          </button>
        </div>
      ))}

      {/* newAvailable — per source repo, published-but-untracked skills. NEVER
          auto-installed (curator boundary); a deliberate click + the ADR-0012
          >15 count gate. */}
      {newAvailable.map((repo) => (
        <div
          key={repo.repo}
          style={{ display: "flex", gap: 8, alignItems: "center" }}
        >
          <span>
            +{repo.names.length} new in <code>{repo.repo}</code>
          </span>
          <button
            onClick={() => {
              const count = repo.names.length;
              // --skill installs exactly these names (gate-free). Courtesy confirm
              // for a large batch only; the explicit click is the consent.
              if (
                count > 15 &&
                !window.confirm(`Add ${count} new skills from ${repo.repo}?`)
              )
                return;
              void commands.addAll(repo.repo, repo.names);
            }}
            style={pillBtn("#1D4ED8")}
          >
            Add {repo.names.length} new from {repo.repo}
          </button>
        </div>
      ))}
    </div>
  );
}

function pillBtn(color: string): React.CSSProperties {
  return {
    background: "#FFFFFF",
    border: `1px solid ${color}`,
    borderRadius: 6,
    padding: "2px 9px",
    fontSize: 11.5,
    color,
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
  };
}
