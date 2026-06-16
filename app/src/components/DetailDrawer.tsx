// Detail drawer (ADR-0008 centerpiece, mockup lines 409-551; renderVals
// 802-859). A right-side overlay with a file tree, a Rendered/Raw/Explanation
// content area, and a meta rail (frontmatter, provenance, agents, tags,
// lifecycle). Every fact is backed by the live `skl show`/`skl agents` feeds;
// the Explanation tab is an honest "coming soon" placeholder (ADR-0007).

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import hljs from "highlight.js/lib/common";
import "highlight.js/styles/github.css";
import { useStore } from "../state/store";
import { useShow, useLibrary, useAgents, useConfig } from "../state/queries";
import { useCommands } from "../state/commands";
import { projectScopeName } from "../lib/skl";
import { stripFrontmatter } from "../lib/derive";
import { allDomains } from "../lib/select";
import { openInEditor, revealInFinder } from "../lib/shell";
import { DomainMenu } from "./DomainMenu";
import { AgentToggle } from "./AgentToggle";
import { ResolvePopover } from "./ResolvePopover";
import { InheritedPopover } from "./InheritedPopover";
import { AddToProjectPicker } from "./AddToProjectPicker";
import { SourceCell } from "./SourceCell";
import { MONO } from "../lib/tokens";
import { GLOBAL_SCOPE } from "../state/store";
import type { AgentsReport, RefFile } from "../lib/types";
import type { DrawerTab } from "../state/store";

const EMPTY_AGENTS: AgentsReport = { agents: [], scopes: [], deployments: {} };
const DEFAULT_FILES: RefFile[] = [{ path: "SKILL.md", kind: "md", depth: 0 }];

const CAPTION: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.07em",
  color: "#A1A1AA",
};


export function DetailDrawer() {
  const { state, dispatch } = useStore();
  const name = state.drawer;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dispatch({ type: "closeDrawer" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch]);

  const show = useShow(name, state.drawerFile).data;
  const library = useLibrary().data ?? [];
  const skill = library.find((s) => s.name === name);
  const agentsReport = useAgents().data ?? EMPTY_AGENTS;
  const config = useConfig().data;
  const commands = useCommands();
  // Projects added transiently via "+ Add to project…" — they appear as matrix
  // rows even before a deployment exists (the ONLY way a non-deployed row shows;
  // RISK 3). Reset whenever the drawer target changes.
  const [extraScopes, setExtraScopes] = useState<string[]>([]);
  useEffect(() => setExtraScopes([]), [name]);

  // ResolvePopover + InheritedPopover are mounted globally here (DetailDrawer is
  // always mounted) so a list-row anomaly/inherited click resolves even with the
  // drawer closed.
  if (!name)
    return (
      <>
        <ResolvePopover />
        <InheritedPopover />
      </>
    );

  const isVendored = skill?.source === "vendored";
  // Retired = server truth OR optimistic retire, unless optimistically unretired.
  // A retired skill can't be deployed (footgun), so the drawer swaps its
  // DEPLOYMENTS matrix for a muted note and its LIFECYCLE Retire → Unretire.
  const isRetired =
    (skill?.retired || state.retired[name]) && !state.unretired[name];
  const removedTags = state.removedTags[name] ?? [];
  const domains = (skill?.domains ?? []).filter(
    (d) => !removedTags.includes(d),
  );
  const refFiles = show?.refFiles ?? DEFAULT_FILES;
  // Only SKILL.md (and other markdown) gets prose rendering; code / data files
  // are shown verbatim so the navigator can preview anything in the dir.
  const isMd = state.drawerFile.toLowerCase().endsWith(".md");
  const fileLabel = state.drawerFile.split("/").pop() ?? state.drawerFile;

  // ── Anti-sparse agent × scope sub-matrix (delta 3 / RISK 3) ───────────────
  // ROWS = Global + ONLY the projects where THIS skill is actually deployed
  // (any agent has a non-absent project state) + any transiently added rows.
  // We NEVER iterate all `agentsReport.scopes` — that reintroduces the sparsity
  // the old Matrix died of. Empty added rows surface via `extraScopes`.
  const byAgent = agentsReport.deployments[name] ?? {};
  const deployedProjectScopes = new Set<string>();
  for (const dep of Object.values(byAgent)) {
    if (dep.p)
      for (const [sc, st] of Object.entries(dep.p))
        if (st && st !== "absent") deployedProjectScopes.add(sc);
  }
  for (const sc of extraScopes) deployedProjectScopes.add(sc);
  // basename → absolute path so deploy emits `--project <path>` (RISK 4).
  const pathByScope = new Map<string, string>();
  for (const p of config?.projects ?? [])
    pathByScope.set(projectScopeName(p), p);
  const projectRows = [...deployedProjectScopes].sort();
  const matrixScopes: { scope: string; scopePath?: string }[] = [
    { scope: GLOBAL_SCOPE },
    ...projectRows.map((sc) => ({ scope: sc, scopePath: pathByScope.get(sc) })),
  ];
  const shownScopes = [GLOBAL_SCOPE, ...projectRows];

  return (
    <>
      <div
        onClick={() => dispatch({ type: "closeDrawer" })}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(24,24,27,0.30)",
          zIndex: 50,
          animation: "var(--animate-scrim-in)",
        }}
      />
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(1080px,94vw)",
          background: "#FFFFFF",
          zIndex: 51,
          display: "flex",
          flexDirection: "column",
          boxShadow: "-22px 0 64px rgba(0,0,0,0.20)",
          animation: "var(--animate-drawer-in)",
        }}
      >
        {/* header */}
        <div
          style={{
            flex: "0 0 auto",
            display: "flex",
            alignItems: "center",
            gap: 11,
            padding: "14px 18px",
            borderBottom: "1px solid #EFEFF1",
          }}
        >
          <span
            style={{
              fontFamily: MONO,
              fontSize: 15.5,
              fontWeight: 650,
              letterSpacing: "-0.01em",
            }}
          >
            {name}
          </span>
          <span
            style={
              isVendored
                ? {
                    color: "#2563EB",
                    background: "#EAF1FD",
                    borderRadius: 20,
                    padding: "3px 9px",
                    fontSize: 11,
                    fontWeight: 500,
                  }
                : {
                    color: "#18181B",
                    background: "#F4F4F5",
                    borderRadius: 20,
                    padding: "3px 9px",
                    fontSize: 11,
                    fontWeight: 500,
                  }
            }
          >
            {isVendored ? "◆ vendored" : "● local"}
          </span>
          <div style={{ display: "flex", gap: 5 }}>
            {domains.map((d) => (
              <span
                key={d}
                style={{
                  background: "#F4F4F5",
                  color: "#52525B",
                  borderRadius: 6,
                  padding: "2px 9px",
                  fontSize: 11.5,
                }}
              >
                {d}
              </span>
            ))}
          </div>
          <span style={{ flex: 1 }} />
          <button
            onClick={() =>
              void openInEditor(
                skill ? `${skill.path}/${state.drawerFile}` : undefined,
              )
            }
            style={hdrBtn}
            title={`Edit ${state.drawerFile}`}
          >
            Edit {fileLabel}
          </button>
          <button
            onClick={() => void revealInFinder(skill?.path)}
            style={hdrBtn}
          >
            Open folder
          </button>
          <button
            onClick={() => dispatch({ type: "closeDrawer" })}
            style={{
              background: "#F4F4F5",
              border: "none",
              color: "#52525B",
              borderRadius: 7,
              width: 30,
              height: 30,
              fontSize: 15,
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* body: 3 columns */}
        <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
          {/* file tree */}
          <div
            style={{
              flex: "0 0 212px",
              borderRight: "1px solid #EFEFF1",
              overflow: "auto",
              padding: "12px 9px",
              background: "#FCFCFD",
            }}
          >
            <div style={{ ...CAPTION, padding: "0 7px 8px" }}>FILES</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {refFiles.map((f) => {
                const isDir = f.kind === "dir";
                const sel = f.path === state.drawerFile;
                const label =
                  f.depth > 0 ? f.path.split("/").pop() ?? f.path : f.path;
                const icon =
                  f.kind === "dir" ? "▸" : f.kind === "json" ? "{}" : "·";
                const iconColor =
                  f.kind === "json"
                    ? "#0891B2"
                    : f.kind === "dir"
                      ? "#B6B6BC"
                      : "#2563EB";
                const rowStyle: React.CSSProperties = {
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "4px 8px",
                  paddingLeft: 8 + f.depth * 14,
                  borderRadius: 6,
                  fontSize: 12,
                  color: isDir ? "#9A9AA2" : sel ? "#18181B" : "#52525B",
                  background: sel ? "#EFF4FE" : "transparent",
                  fontWeight: sel ? 600 : 450,
                  fontFamily: MONO,
                };
                const iconEl = (
                  <span
                    style={{
                      width: 14,
                      color: iconColor,
                      fontSize: 11,
                      fontFamily: MONO,
                      flexShrink: 0,
                      textAlign: "center",
                    }}
                  >
                    {icon}
                  </span>
                );
                const labelEl = (
                  <span
                    style={{
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {label}
                  </span>
                );
                if (isDir) {
                  return (
                    <div key={f.path} style={rowStyle}>
                      {iconEl}
                      {labelEl}
                    </div>
                  );
                }
                return (
                  <button
                    key={f.path}
                    onClick={() =>
                      dispatch({ type: "setDrawerFile", file: f.path })
                    }
                    style={{
                      ...rowStyle,
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    {iconEl}
                    {labelEl}
                  </button>
                );
              })}
            </div>
          </div>

          {/* center: tabs + content */}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                flex: "0 0 auto",
                display: "flex",
                alignItems: "center",
                gap: 2,
                padding: "0 14px",
                borderBottom: "1px solid #EFEFF1",
                background: "#FFFFFF",
              }}
            >
              {(
                [
                  ["rendered", "Rendered"],
                  ["raw", "Raw"],
                  ["expl", "Explanation"],
                ] as [DrawerTab, string][]
              ).map(([t, label]) => (
                <button
                  key={t}
                  onClick={() => dispatch({ type: "setDrawerTab", tab: t })}
                  style={{
                    padding: "9px 13px",
                    background: "none",
                    border: "none",
                    borderBottom:
                      "2px solid " +
                      (state.drawerTab === t ? "#18181B" : "transparent"),
                    color: state.drawerTab === t ? "#18181B" : "#71717A",
                    fontSize: 12.5,
                    fontWeight: state.drawerTab === t ? 600 : 500,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {label}
                </button>
              ))}
              <span style={{ flex: 1 }} />
              <button
                disabled={!show?.body}
                onClick={() => {
                  const body = show?.body ?? "";
                  if (!body) return;
                  // writeText rejects ASYNCHRONOUSLY (insecure ctx / denied), so
                  // a sync try/catch never fires — handle the promise + surface.
                  navigator.clipboard.writeText(body).then(
                    () =>
                      dispatch({
                        type: "showToast",
                        toast: {
                          msg: `Copied ${state.drawerFile}`,
                          cmd: `${state.drawerFile} → clipboard`,
                          undo: null,
                        },
                      }),
                    (err) =>
                      dispatch({
                        type: "setError",
                        error: `copy failed: ${String(err)}`,
                      }),
                  );
                }}
                style={{
                  background: "#FFFFFF",
                  border: "1px solid #E2E2E5",
                  color: "#52525B",
                  borderRadius: 6,
                  padding: "4px 10px",
                  fontSize: 11.5,
                  cursor: show?.body ? "pointer" : "default",
                  opacity: show?.body ? 1 : 0.5,
                  marginRight: 2,
                }}
              >
                Copy raw
              </button>
            </div>
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflow: "auto",
                padding: "22px 28px",
              }}
            >
              {state.drawerTab === "rendered" &&
                (!show?.body ? (
                  <div style={{ color: "#9A9AA2", fontSize: 13 }}>Loading…</div>
                ) : isMd ? (
                  <div className="md-body" style={{ maxWidth: 760 }}>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeSanitize]}
                    >
                      {stripFrontmatter(show.body)}
                    </ReactMarkdown>
                  </div>
                ) : (
                  // Non-markdown (code, data, plain text): preview verbatim
                  // with syntax highlighting — markdown rendering would mangle it.
                  <CodeView code={show.body} file={state.drawerFile} />
                ))}
              {state.drawerTab === "raw" && (
                <pre
                  style={{
                    fontFamily: MONO,
                    fontSize: 11.5,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    color: "#3F3F46",
                    lineHeight: 1.6,
                    margin: 0,
                  }}
                >
                  {show?.body ?? ""}
                </pre>
              )}
              {state.drawerTab === "expl" && (
                <div
                  style={{
                    maxWidth: 520,
                    margin: "30px auto",
                    textAlign: "center",
                    color: "#9A9AA2",
                  }}
                >
                  <div style={{ fontSize: 30, marginBottom: 10 }}>⌁</div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#52525B",
                      marginBottom: 6,
                    }}
                  >
                    AI explanation — coming soon
                  </div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>
                    An opt-in suggestion channel (ADR-0007), clearly labelled and
                    never rendered as fact. Will be backed by{" "}
                    <span style={{ fontFamily: MONO }}>skl suggest --json</span>{" "}
                    in P3.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* right rail: meta */}
          <div
            style={{
              flex: "0 0 296px",
              borderLeft: "1px solid #EFEFF1",
              overflow: "auto",
            }}
          >
            {/* FRONTMATTER */}
            <div
              style={{ padding: "15px 16px", borderBottom: "1px solid #EFEFF1" }}
            >
              <div style={{ ...CAPTION, marginBottom: 9 }}>FRONTMATTER</div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: "#A1A1AA" }}>
                name
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  color: "#18181B",
                  marginBottom: 9,
                  fontFamily: MONO,
                }}
              >
                {name}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: "#A1A1AA" }}>
                description
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  color: "#52525B",
                  lineHeight: 1.55,
                  maxHeight: 130,
                  overflow: "auto",
                  marginBottom: 9,
                }}
              >
                {show?.frontmatter.description ?? ""}
              </div>
              {show?.frontmatter.triggers &&
              show.frontmatter.triggers.length > 0 ? (
                <>
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: 10,
                      color: "#A1A1AA",
                      marginBottom: 5,
                    }}
                  >
                    triggers
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 5,
                      marginBottom: 9,
                    }}
                  >
                    {show.frontmatter.triggers.map((t) => (
                      <span
                        key={t}
                        style={{
                          background: "#F4F4F5",
                          color: "#52525B",
                          borderRadius: 5,
                          padding: "2px 7px",
                          fontSize: 11,
                          fontFamily: MONO,
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </>
              ) : null}
              <div style={{ display: "flex", gap: 8, fontSize: 11.5 }}>
                <span style={{ color: "#A1A1AA", width: 56 }}>license</span>
                <span style={{ color: "#52525B" }}>
                  {show?.frontmatter.license ?? "—"}
                </span>
              </div>
            </div>

            {/* PROVENANCE */}
            {show?.prov ? (
              <div
                style={{
                  padding: "15px 16px",
                  borderBottom: "1px solid #EFEFF1",
                }}
              >
                <div style={{ ...CAPTION, marginBottom: 9 }}>PROVENANCE</div>
                {skill ? (
                  <div style={{ marginBottom: 8 }}>
                    {/* owner/repo links out to GitHub for vendored github rows */}
                    <SourceCell skill={skill} variant="drawer" />
                  </div>
                ) : null}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 7,
                    fontSize: 11,
                  }}
                >
                  <ProvRow label="source" value={show.prov.source} breakAll />
                  <ProvRow label="ref" value={show.prov.ref} />
                  <ProvRow label="hash" value={show.prov.hash} />
                </div>
                {show.prov.localEdits ? (
                  <div
                    style={{
                      marginTop: 9,
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      background: "#FAF1E2",
                      border: "1px solid #F0DCB8",
                      borderRadius: 7,
                      padding: "6px 9px",
                      fontSize: 11,
                      color: "#92600A",
                    }}
                  >
                    <span>⚠</span> local edits
                  </div>
                ) : (
                  <div
                    style={{
                      marginTop: 9,
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      background: "#ECF6EF",
                      border: "1px solid #CDE9D6",
                      borderRadius: 7,
                      padding: "6px 9px",
                      fontSize: 11,
                      color: "#15803D",
                    }}
                  >
                    <span>✓</span> clean — no local edits
                  </div>
                )}
              </div>
            ) : null}

            {/* AGENTS × SCOPE sub-matrix (delta 3, anti-sparse): one row per
                scope where this skill lives (Global + deployed projects only),
                columns = agents, cells = the shared AgentToggle (size 30).
                "+ Add to project…" is the only way to surface a fresh row.
                Retired skills aren't deployed anywhere, so the matrix is
                replaced with a muted note (deploying a retired skill is a
                footgun — unretire first). */}
            {isRetired ? (
              <div
                style={{
                  padding: "15px 16px",
                  borderBottom: "1px solid #EFEFF1",
                }}
              >
                <div style={{ ...CAPTION, marginBottom: 9 }}>DEPLOYMENTS</div>
                <div
                  style={{
                    background: "#F6F6F7",
                    border: "1px solid #ECECEE",
                    borderRadius: 8,
                    padding: "8px 10px",
                    fontSize: 11.5,
                    lineHeight: 1.55,
                    color: "#71717A",
                  }}
                >
                  Retired — not deployed anywhere. Unretire to deploy.
                </div>
              </div>
            ) : (
            <div
              style={{ padding: "15px 16px", borderBottom: "1px solid #EFEFF1" }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 9,
                }}
              >
                <span style={CAPTION}>DEPLOYMENTS</span>
                <span
                  style={{ fontSize: 10, color: "#B6B6BC", fontFamily: MONO }}
                >
                  scope × agent
                </span>
              </div>

              {/* agent column header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  paddingLeft: 92,
                  marginBottom: 5,
                }}
              >
                {agentsReport.agents.map((a) => (
                  <span
                    key={a.id}
                    title={a.name}
                    style={{
                      width: 30,
                      textAlign: "center",
                      fontSize: 9.5,
                      fontWeight: 600,
                      color: a.installed ? "#71717A" : "#C7C7CC",
                      fontFamily: MONO,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {a.short}
                  </span>
                ))}
              </div>

              {matrixScopes.map(({ scope, scopePath }) => (
                <div
                  key={scope}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "5px 0",
                    borderTop: "1px solid #F5F5F6",
                  }}
                >
                  <span
                    style={{
                      width: 86,
                      flexShrink: 0,
                      fontSize: 11.5,
                      fontWeight: scope === GLOBAL_SCOPE ? 600 : 500,
                      color: scope === GLOBAL_SCOPE ? "#18181B" : "#52525B",
                      fontFamily: MONO,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={scopePath ?? scope}
                  >
                    {scope === GLOBAL_SCOPE ? "● Global" : scope}
                  </span>
                  {agentsReport.agents.map((a) => (
                    <AgentToggle
                      key={a.id}
                      skill={name}
                      agentId={a.id}
                      scope={scope}
                      scopePath={scopePath}
                      size={30}
                    />
                  ))}
                </div>
              ))}

              <AddToProjectPicker
                shownScopes={shownScopes}
                onPicked={(path) =>
                  setExtraScopes((prev) =>
                    prev.includes(projectScopeName(path))
                      ? prev
                      : [...prev, projectScopeName(path)],
                  )
                }
              />

              <div
                style={{
                  marginTop: 9,
                  fontSize: 10,
                  color: "#B6B6BC",
                  fontFamily: MONO,
                }}
              >
                warning cells open a resolve flow · live from skl where
              </div>
            </div>
            )}

            {/* TAGS */}
            <div
              style={{ padding: "15px 16px", borderBottom: "1px solid #EFEFF1" }}
            >
              <div style={{ ...CAPTION, marginBottom: 9 }}>TAGS</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {domains.map((d) => (
                  <button
                    key={d}
                    onClick={() => commands.untag(name, d)}
                    style={{
                      background: "#EAF1FD",
                      color: "#2563EB",
                      borderRadius: 6,
                      padding: "2px 9px",
                      fontSize: 11.5,
                      cursor: "pointer",
                      border: "none",
                      fontFamily: "inherit",
                    }}
                  >
                    {d} ✕
                  </button>
                ))}
                <DomainMenu
                  domains={allDomains(library)}
                  exclude={domains}
                  onPick={(d) => commands.tag([name], d)}
                  variant="add-chip"
                />
              </div>
            </div>

            {/* LIFECYCLE */}
            <div style={{ padding: "15px 16px" }}>
              <div style={{ ...CAPTION, marginBottom: 9 }}>LIFECYCLE</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                <button style={lifeBtn} disabled title="coming soon">
                  Rename
                </button>
                {isRetired ? (
                  <button
                    onClick={() => commands.unretire([name])}
                    style={lifeBtn}
                  >
                    Unretire
                  </button>
                ) : (
                  <button
                    onClick={() => commands.retire([name])}
                    style={lifeBtn}
                  >
                    Retire
                  </button>
                )}
                <button
                  onClick={() => dispatch({ type: "askConfirm", name })}
                  style={{
                    ...lifeBtn,
                    border: "1px solid #F1D4D4",
                    color: "#DC2626",
                  }}
                >
                  Remove
                </button>
              </div>
              <div
                style={{
                  marginTop: 10,
                  background: "#F6F6F7",
                  border: "1px solid #ECECEE",
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontFamily: MONO,
                  fontSize: 10,
                  color: "#52525B",
                  overflow: "auto",
                  whiteSpace: "nowrap",
                }}
              >
                <span style={{ color: "#A1A1AA" }}>$</span> skl{" "}
                {isRetired ? "unretire" : "retire"} {name}
              </div>
            </div>
          </div>
        </div>
      </div>
      <ResolvePopover />
      <InheritedPopover />
    </>
  );
}

const hdrBtn: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E2E2E5",
  color: "#3F3F46",
  borderRadius: 7,
  padding: "6px 12px",
  fontSize: 12,
  cursor: "pointer",
};
const lifeBtn: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E2E2E5",
  color: "#3F3F46",
  borderRadius: 7,
  padding: "5px 11px",
  fontSize: 11.5,
  cursor: "pointer",
  fontFamily: "inherit",
};

// File extension → highlight.js language. Unmapped extensions render plain
// (no auto-detect — predictable beats clever for lockfiles / unknown text).
const EXT_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  cs: "csharp",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  fish: "bash",
  yml: "yaml",
  yaml: "yaml",
  toml: "ini",
  ini: "ini",
  css: "css",
  scss: "scss",
  less: "less",
  html: "xml",
  xml: "xml",
  svg: "xml",
  sql: "sql",
  php: "php",
  swift: "swift",
  kt: "kotlin",
  lua: "lua",
  r: "r",
  pl: "perl",
  dockerfile: "dockerfile",
  makefile: "makefile",
};

function CodeView({ code, file }: { code: string; file: string }) {
  const base = file.split("/").pop() ?? file;
  const ext = (base.includes(".") ? base.split(".").pop()! : base).toLowerCase();
  const lang = EXT_LANG[ext];
  const html = useMemo(() => {
    if (!lang || !hljs.getLanguage(lang)) return null;
    try {
      return hljs.highlight(code, { language: lang }).value;
    } catch {
      return null;
    }
  }, [code, lang]);
  const preStyle: React.CSSProperties = {
    fontFamily: MONO,
    fontSize: 11.5,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    color: "#3F3F46",
    lineHeight: 1.6,
    margin: 0,
    background: "transparent",
  };
  if (html) {
    return (
      <pre style={preStyle}>
        <code
          className="hljs"
          style={{ background: "transparent", padding: 0 }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </pre>
    );
  }
  return <pre style={preStyle}>{code}</pre>;
}

function ProvRow({
  label,
  value,
  breakAll,
}: {
  label: string;
  value: string;
  breakAll?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <span style={{ color: "#A1A1AA", width: 48, flexShrink: 0 }}>{label}</span>
      <span
        style={{
          fontFamily: MONO,
          fontSize: 10,
          color: "#52525B",
          wordBreak: breakAll ? "break-all" : "normal",
        }}
      >
        {value}
      </span>
    </div>
  );
}
