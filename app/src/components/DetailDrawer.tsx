// Detail drawer (ADR-0008 centerpiece, mockup lines 409-551; renderVals
// 802-859). A right-side overlay with a file tree, a Rendered/Raw/Explanation
// content area, and a meta rail (frontmatter, provenance, agents, tags,
// lifecycle). Every fact is backed by the live `skl show`/`skl agents` feeds;
// the Explanation tab is an honest "coming soon" placeholder (ADR-0007).

import { useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { useStore } from "../state/store";
import { useShow, useLibrary, useAgents } from "../state/queries";
import { useCommands } from "../state/commands";
import { effState } from "../lib/agents";
import { stripFrontmatter } from "../lib/derive";
import { openInEditor, revealInFinder } from "../lib/shell";
import { DEPLOY_GLYPH, MONO } from "../lib/tokens";
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
  const skill = useLibrary().data?.find((s) => s.name === name);
  const agentsReport = useAgents().data ?? EMPTY_AGENTS;
  const commands = useCommands();

  if (!name) return null;

  const isVendored = skill?.source === "vendored";
  const removedTags = state.removedTags[name] ?? [];
  const domains = (skill?.domains ?? []).filter(
    (d) => !removedTags.includes(d),
  );
  const refFiles = show?.refFiles ?? DEFAULT_FILES;

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
              void openInEditor(skill ? `${skill.path}/SKILL.md` : undefined)
            }
            style={hdrBtn}
          >
            Edit SKILL.md
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
                onClick={() => {
                  try {
                    void navigator.clipboard.writeText(show?.body ?? "");
                  } catch {
                    /* clipboard unavailable */
                  }
                }}
                style={{
                  background: "#FFFFFF",
                  border: "1px solid #E2E2E5",
                  color: "#52525B",
                  borderRadius: 6,
                  padding: "4px 10px",
                  fontSize: 11.5,
                  cursor: "pointer",
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
                ) : (
                  <div className="md-body" style={{ maxWidth: 760 }}>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeSanitize]}
                    >
                      {stripFrontmatter(show.body)}
                    </ReactMarkdown>
                  </div>
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

            {/* AGENTS */}
            <div
              style={{ padding: "15px 16px", borderBottom: "1px solid #EFEFF1" }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 7,
                }}
              >
                <span style={CAPTION}>AGENTS</span>
                <span
                  style={{ fontSize: 10, color: "#B6B6BC", fontFamily: MONO }}
                >
                  global + projects
                </span>
              </div>
              {agentsReport.agents.map((agent) => {
                const g = effState(
                  agentsReport,
                  state.deployOverrides,
                  name,
                  agent.id,
                  "Global",
                );
                const deployedGlobal = g !== "absent";
                const projChips = agentsReport.scopes
                  .filter((sc) => sc !== "Global")
                  .map((sc) => ({
                    scope: sc,
                    st: effState(
                      agentsReport,
                      state.deployOverrides,
                      name,
                      agent.id,
                      sc,
                    ),
                  }))
                  .filter((p) => p.st !== "absent");
                const anywhere = deployedGlobal || projChips.length > 0;
                const gl = DEPLOY_GLYPH[g];
                return (
                  <div
                    key={agent.id}
                    style={{
                      padding: "10px 0",
                      borderBottom: "1px solid #F5F5F6",
                      opacity: agent.installed ? 1 : 0.6,
                    }}
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 7 }}
                    >
                      <span
                        style={{
                          fontSize: 12.5,
                          fontWeight: 600,
                          color: anywhere ? "#18181B" : "#71717A",
                          fontFamily: MONO,
                        }}
                      >
                        {agent.short}
                      </span>
                      {!agent.installed ? (
                        <span
                          style={{
                            fontSize: 9,
                            color: "#C7C7CC",
                            border: "1px solid #ECECEE",
                            borderRadius: 4,
                            padding: "0 5px",
                          }}
                        >
                          not installed
                        </span>
                      ) : null}
                      <span style={{ flex: 1 }} />
                      <button
                        onClick={() =>
                          commands.deploy(
                            name,
                            agent.id,
                            "Global",
                            !deployedGlobal,
                          )
                        }
                        style={{
                          background: deployedGlobal ? "#FFFFFF" : "#18181B",
                          color: deployedGlobal ? "#52525B" : "#FFFFFF",
                          border:
                            "1px solid " +
                            (deployedGlobal ? "#E2E2E5" : "#18181B"),
                          borderRadius: 6,
                          padding: "3px 11px",
                          fontSize: 11,
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        {deployedGlobal ? "Unlink" : "Link"}
                      </button>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                        marginTop: 5,
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          fontSize: 11,
                          color: deployedGlobal ? gl.color : "#9A9AA2",
                        }}
                      >
                        {deployedGlobal
                          ? `${gl.glyph} global · ${g}`
                          : "+ not in global"}
                      </span>
                      {projChips.map((p) => {
                        const pg = DEPLOY_GLYPH[p.st];
                        return (
                          <span
                            key={p.scope}
                            style={{
                              background: "#F4F4F5",
                              color: pg.color,
                              borderRadius: 5,
                              padding: "1px 7px",
                              fontSize: 10.5,
                              fontFamily: MONO,
                            }}
                          >
                            {p.scope} {pg.glyph}
                          </span>
                        );
                      })}
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        fontFamily: MONO,
                        fontSize: 9,
                        color: "#C7C7CC",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {agent.global}/{name}
                    </div>
                  </div>
                );
              })}
              <div
                style={{
                  marginTop: 9,
                  fontSize: 10,
                  color: "#B6B6BC",
                  fontFamily: MONO,
                }}
              >
                project copy shadows global · live from skl where
              </div>
            </div>

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
                <span
                  style={{
                    border: "1px dashed #D4D4D8",
                    color: "#9A9AA2",
                    borderRadius: 6,
                    padding: "2px 8px",
                    fontSize: 11.5,
                  }}
                >
                  + add
                </span>
              </div>
            </div>

            {/* LIFECYCLE */}
            <div style={{ padding: "15px 16px" }}>
              <div style={{ ...CAPTION, marginBottom: 9 }}>LIFECYCLE</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                <button style={lifeBtn} disabled title="coming soon">
                  Rename
                </button>
                <button
                  onClick={() => commands.retire([name])}
                  style={lifeBtn}
                >
                  Retire
                </button>
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
                <span style={{ color: "#A1A1AA" }}>$</span> skl retire {name}
              </div>
            </div>
          </div>
        </div>
      </div>
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
