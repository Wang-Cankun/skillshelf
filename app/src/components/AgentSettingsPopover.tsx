// Agent-registration popover (ADR-0010 delta 4). Opened from the CountBar gear.
//   • lists the detected/registered agents with a hide toggle (display only —
//     hiding trims the chips/counts, it never touches deployments);
//   • an "Add custom agent" form: name · global path · project convention ·
//     optional icon from the provider-icons picker.
// Persists via addAgentCmd (`skl agents add`, a real engine write verb — §9),
// then invalidates qk.config/qk.agents so the merged registry refreshes from disk
// truth. The Hide toggle ALSO persists (RISK 8): it writes a `hidden:true` config
// override (setAgentHiddenCmd → `skl agents add --hidden`) that the engine's
// mergeAgents drops, so a hidden agent leaves the count bar / rows / drawer too —
// not just dimmed here. Local `hidden` state mirrors the pending write so the row
// stays visible-but-dimmed in THIS popover session (offering "Show" to undo).

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAgents, qk } from "../state/queries";
import { useStore } from "../state/store";
import { addAgentCmd, setAgentHiddenCmd } from "../lib/skl";
import { iconFor, providerIconKeys, providerIconUrl } from "../lib/agentIcon";
import { getIconMetadata } from "../assets/provider-icons/metadata";
import type { AgentInfo } from "../lib/types";

export function AgentSettingsPopover({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { dispatch } = useStore();
  const agents = useAgents().data?.agents ?? [];
  const wrapRef = useRef<HTMLDivElement>(null);

  // local hide set — mirrors the pending persisted hide so the row stays visible
  // (dimmed, with a "Show" affordance) in THIS session even after the agent is
  // dropped from the refreshed report.
  const [hidden, setHidden] = useState<Record<string, boolean>>({});

  const onToggleHidden = async (a: AgentInfo, next: boolean) => {
    setHidden((h) => ({ ...h, [a.id]: next }));
    const res = await setAgentHiddenCmd(a, next);
    if (!res.ok) {
      // roll back the optimistic dim on a failed persist.
      setHidden((h) => ({ ...h, [a.id]: !next }));
      dispatch({
        type: "setError",
        error: res.stderr.trim() || `could not ${next ? "hide" : "show"} agent`,
      });
      return;
    }
    await qc.invalidateQueries({ queryKey: qk.config });
    await qc.invalidateQueries({ queryKey: qk.agents });
  };

  // add-custom form.
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [globalPath, setGlobalPath] = useState("");
  const [projConv, setProjConv] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [iconQuery, setIconQuery] = useState("");
  // Default ON — the ~/.x/skills inheritance convention (ADR-0010). Off opts the
  // agent out so global-only skills read as absent (not inherited) in its cells.
  const [inheritsGlobal, setInheritsGlobal] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  const resetForm = () => {
    setName("");
    setGlobalPath("");
    setProjConv("");
    setIcon(null);
    setIconQuery("");
    setInheritsGlobal(true);
    setShowForm(false);
  };

  const id = name.trim().toLowerCase().replace(/\s+/g, "-");
  const canSave = !!id && !!globalPath.trim() && !!projConv.trim();

  const onSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    const entry: AgentInfo = {
      id,
      name: name.trim(),
      short: name.trim(),
      global: globalPath.trim(),
      projConvention: projConv.trim(),
      installed: true,
      custom: true,
      // The ~/.x/skills inheritance convention (ADR-0010). Toggled by the
      // "Inherits global" checkbox below; the engine treats omitted as true too.
      inheritsGlobal,
      ...(icon ? { icon } : {}),
    };
    const res = await addAgentCmd(entry);
    setSaving(false);
    if (!res.ok) {
      dispatch({
        type: "setError",
        error: res.stderr.trim() || "could not save custom agent",
      });
      return;
    }
    await qc.invalidateQueries({ queryKey: qk.config });
    await qc.invalidateQueries({ queryKey: qk.agents });
    dispatch({
      type: "showToast",
      toast: {
        msg: `Registered agent "${entry.name}"`,
        cmd: `skl agents add ${entry.id}`,
        undo: null,
      },
    });
    resetForm();
  };

  const iconKeys = providerIconKeys()
    .filter((k) => {
      const q = iconQuery.trim().toLowerCase();
      if (!q) return true;
      const meta = getIconMetadata(k);
      return (
        k.includes(q) ||
        meta?.displayName.toLowerCase().includes(q) ||
        meta?.keywords.some((kw) => kw.includes(q))
      );
    })
    .slice(0, 60);

  return (
    <div
      ref={wrapRef}
      role="dialog"
      aria-label="Agent settings"
      style={{
        position: "absolute",
        top: "calc(100% + 6px)",
        right: 0,
        zIndex: 70,
        width: 320,
        maxHeight: 460,
        display: "flex",
        flexDirection: "column",
        background: "#FFFFFF",
        border: "1px solid #E7E7E9",
        borderRadius: 11,
        boxShadow: "0 14px 40px rgba(0,0,0,0.16)",
        overflow: "hidden",
        fontSize: 12.5,
        color: "#3F3F46",
      }}
    >
      <div
        style={{
          padding: "10px 13px",
          borderBottom: "1px solid #F0F0F1",
          fontWeight: 600,
          color: "#18181B",
        }}
      >
        Agents
      </div>

      <div style={{ overflow: "auto", padding: 8 }}>
        {agents.map((a) => {
          const ic = iconFor(a);
          const isHidden = !!hidden[a.id];
          return (
            <div
              key={a.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "6px 6px",
                borderRadius: 7,
                opacity: isHidden ? 0.5 : 1,
              }}
            >
              {ic.svgUrl ? (
                <img
                  src={ic.svgUrl}
                  alt=""
                  style={{ width: 18, height: 18, objectFit: "contain" }}
                />
              ) : (
                <span
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: ic.color,
                    color: "#FFFFFF",
                    fontSize: 10,
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {ic.letter}
                </span>
              )}
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 540, color: "#27272A" }}>
                  {a.name}
                </span>
                {a.custom ? (
                  <span
                    style={{
                      marginLeft: 6,
                      fontSize: 9.5,
                      color: "#2563EB",
                      background: "#EAF1FD",
                      borderRadius: 4,
                      padding: "1px 5px",
                    }}
                  >
                    custom
                  </span>
                ) : null}
              </span>
              <button
                onClick={() => void onToggleHidden(a, !isHidden)}
                aria-pressed={isHidden}
                title={isHidden ? "Show" : "Hide"}
                style={{
                  background: "none",
                  border: "1px solid #E7E7E9",
                  borderRadius: 6,
                  padding: "2px 8px",
                  fontSize: 11,
                  cursor: "pointer",
                  color: "#71717A",
                  fontFamily: "inherit",
                }}
              >
                {isHidden ? "Show" : "Hide"}
              </button>
            </div>
          );
        })}
      </div>

      <div style={{ borderTop: "1px solid #F0F0F1", padding: 10 }}>
        {!showForm ? (
          <button
            onClick={() => setShowForm(true)}
            style={{
              width: "100%",
              background: "#18181B",
              color: "#FFFFFF",
              border: "1px solid #18181B",
              borderRadius: 7,
              padding: "6px 10px",
              fontSize: 12.5,
              fontWeight: 550,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            + Add custom agent
          </button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <Field
              label="Name"
              value={name}
              onChange={setName}
              placeholder="e.g. Cursor"
            />
            <Field
              label="Global path"
              value={globalPath}
              onChange={setGlobalPath}
              placeholder="~/.cursor/skills"
              mono
            />
            <Field
              label="Project convention"
              value={projConv}
              onChange={setProjConv}
              placeholder=".cursor/skills"
              mono
            />
            <div>
              <div style={{ fontSize: 10.5, color: "#A1A1AA", marginBottom: 4 }}>
                Icon (optional)
              </div>
              <input
                value={iconQuery}
                onChange={(e) => setIconQuery(e.target.value)}
                placeholder="Search icons…"
                style={inputStyle}
              />
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 5,
                  marginTop: 6,
                  maxHeight: 96,
                  overflow: "auto",
                }}
              >
                {iconKeys.map((k) => {
                  const url = providerIconUrl(k);
                  const active = icon === k;
                  return (
                    <button
                      key={k}
                      onClick={() => setIcon(active ? null : k)}
                      title={k}
                      aria-pressed={active}
                      style={{
                        width: 26,
                        height: 26,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 6,
                        border: active
                          ? "1px solid #2563EB"
                          : "1px solid #E7E7E9",
                        background: active ? "#EAF1FD" : "#FFFFFF",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      {url ? (
                        <img
                          src={url}
                          alt={k}
                          style={{ width: 16, height: 16, objectFit: "contain" }}
                        />
                      ) : (
                        <span style={{ fontSize: 9 }}>{k.charAt(0)}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 7,
                cursor: "pointer",
                marginTop: 2,
              }}
            >
              <input
                type="checkbox"
                checked={inheritsGlobal}
                onChange={(e) => setInheritsGlobal(e.target.checked)}
                style={{ marginTop: 2, cursor: "pointer" }}
              />
              <span style={{ minWidth: 0 }}>
                <span style={{ color: "#27272A", fontWeight: 540 }}>
                  Inherits global
                </span>
                <span
                  style={{
                    display: "block",
                    fontSize: 10.5,
                    color: "#A1A1AA",
                    marginTop: 1,
                  }}
                >
                  Globally-deployed skills are active in every project for this
                  agent.
                </span>
              </span>
            </label>
            <div style={{ display: "flex", gap: 7, marginTop: 2 }}>
              <button
                onClick={() => void onSave()}
                disabled={!canSave || saving}
                style={{
                  flex: 1,
                  background: canSave ? "#18181B" : "#D4D4D8",
                  color: "#FFFFFF",
                  border: "none",
                  borderRadius: 7,
                  padding: "6px 10px",
                  fontSize: 12.5,
                  fontWeight: 550,
                  cursor: canSave && !saving ? "pointer" : "default",
                  fontFamily: "inherit",
                }}
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={resetForm}
                style={{
                  background: "none",
                  border: "1px solid #E7E7E9",
                  borderRadius: 7,
                  padding: "6px 12px",
                  fontSize: 12.5,
                  cursor: "pointer",
                  color: "#71717A",
                  fontFamily: "inherit",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 28,
  padding: "0 9px",
  border: "1px solid #E7E7E9",
  borderRadius: 6,
  background: "#FAFAFA",
  fontSize: 12,
  color: "#18181B",
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

function Field({
  label,
  value,
  onChange,
  placeholder,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ fontSize: 10.5, color: "#A1A1AA" }}>{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          ...inputStyle,
          marginTop: 3,
          fontFamily: mono ? "ui-monospace,'SF Mono',Menlo,monospace" : "inherit",
        }}
      />
    </label>
  );
}
