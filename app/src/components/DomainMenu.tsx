// Reusable domain popover (ADR-0008 §4/§5). One affordance, four homes:
//   - drawer / inspector TAGS  → "+ add" chip   (variant="add-chip")
//   - inbox UNTAGGED row       → "Tag ▾" button  (variant="menu", with suggested)
//   - library toolbar          → "+ tag filter"  (variant="filter")
// It is a PURE PICKER: it never mutates on its own — the caller's onPick decides
// what a chosen domain means (tag a skill via the undoable `tag` command, or set
// a library filter). Domains come from the real library (select.allDomains); a
// typed value that matches nothing offers an explicit "create" row (tag variants
// only — filtering by a non-existent domain is meaningless).

import { useEffect, useId, useRef, useState } from "react";
import { domainHue } from "../lib/tokens";

export type DomainMenuVariant = "add-chip" | "menu" | "filter";

const TRIGGER_LABEL: Record<DomainMenuVariant, string> = {
  "add-chip": "+ add",
  menu: "Tag ▾",
  filter: "+ tag filter",
};

function triggerStyle(
  variant: DomainMenuVariant,
  open: boolean,
): React.CSSProperties {
  if (variant === "menu") {
    return {
      background: "#18181B",
      color: "#FFFFFF",
      border: "1px solid #18181B",
      borderRadius: 6,
      padding: "4px 11px",
      fontSize: 12,
      fontWeight: 500,
      cursor: "pointer",
      whiteSpace: "nowrap",
      fontFamily: "inherit",
    };
  }
  // add-chip + filter share the dashed/soft chip look; filter is pill-rounded.
  return {
    background: open ? "#EFEFF1" : variant === "filter" ? "#F4F4F5" : "#FFFFFF",
    color: "#52525B",
    border:
      variant === "filter" ? "1px solid transparent" : "1px dashed #D4D4D8",
    borderRadius: variant === "filter" ? 20 : 6,
    padding: variant === "filter" ? "3px 10px" : "2px 8px",
    fontSize: 11.5,
    cursor: "pointer",
    fontFamily: "inherit",
  };
}

export function DomainMenu({
  domains,
  exclude = [],
  suggested = null,
  onPick,
  variant,
  align = "left",
  placement = "down",
}: {
  /** all selectable domains (real library set) */
  domains: string[];
  /** domains to hide (already applied to this skill) */
  exclude?: string[];
  /** a pre-offered domain (inbox prefix-infer); shown first if not excluded */
  suggested?: string | null;
  onPick: (domain: string) => void;
  variant: DomainMenuVariant;
  align?: "left" | "right";
  /** open upward — for a bottom-anchored trigger (e.g. the floating bulk bar) */
  placement?: "down" | "up";
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Close the menu but DON'T let the drawer's own Esc handler also fire.
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    // focus the filter input on open
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
      window.clearTimeout(t);
    };
  }, [open]);

  const lower = q.trim().toLowerCase();
  const selectable = domains.filter((d) => !exclude.includes(d));
  const filtered = selectable.filter((d) => d.toLowerCase().includes(lower));
  const exists = domains.some((d) => d.toLowerCase() === lower);
  const canCreate = variant !== "filter" && lower.length > 0 && !exists;
  const showSuggested =
    !!suggested && !exclude.includes(suggested) && (!lower || suggested.includes(lower));

  function choose(domain: string) {
    const v = domain.trim();
    if (!v) return;
    onPick(v);
    setOpen(false);
    setQ("");
  }

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={triggerStyle(variant, open)}
      >
        {TRIGGER_LABEL[variant]}
      </button>
      {open ? (
        <div
          role="listbox"
          aria-label={listId}
          style={{
            position: "absolute",
            ...(placement === "up"
              ? { bottom: "calc(100% + 5px)" }
              : { top: "calc(100% + 5px)" }),
            [align]: 0,
            zIndex: 70,
            width: 224,
            maxHeight: 280,
            display: "flex",
            flexDirection: "column",
            background: "#FFFFFF",
            border: "1px solid #E7E7E9",
            borderRadius: 9,
            boxShadow: "0 10px 30px rgba(0,0,0,0.14)",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: 7, borderBottom: "1px solid #F0F0F1" }}>
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (filtered.length) choose(filtered[0]);
                  else if (canCreate) choose(lower);
                }
              }}
              placeholder={
                variant === "filter" ? "Filter by domain…" : "Find or create tag…"
              }
              aria-label="domain filter"
              style={{
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
              }}
            />
          </div>
          <div style={{ overflow: "auto", padding: 5 }}>
            {showSuggested ? (
              <button
                type="button"
                onClick={() => choose(suggested!)}
                style={{ ...rowStyle, justifyContent: "space-between" }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <Dot domain={suggested!} />
                  {suggested}
                </span>
                <span
                  style={{
                    fontSize: 9.5,
                    color: "#15A34A",
                    background: "#ECF6EF",
                    borderRadius: 4,
                    padding: "1px 6px",
                    fontWeight: 600,
                  }}
                >
                  suggested
                </span>
              </button>
            ) : null}
            {filtered.map((d) =>
              showSuggested && d === suggested ? null : (
                <button
                  key={d}
                  type="button"
                  onClick={() => choose(d)}
                  style={rowStyle}
                >
                  <Dot domain={d} />
                  {d}
                </button>
              ),
            )}
            {canCreate ? (
              <button
                type="button"
                onClick={() => choose(lower)}
                style={{ ...rowStyle, color: "#2563EB" }}
              >
                <span style={{ width: 8, textAlign: "center" }}>+</span>
                Create “{lower}”
              </button>
            ) : null}
            {!filtered.length && !canCreate && !showSuggested ? (
              <div style={{ padding: "8px 9px", fontSize: 11.5, color: "#9A9AA2" }}>
                {variant === "filter"
                  ? "No matching domain"
                  : "Type to create a new tag"}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "5px 9px",
  borderRadius: 6,
  border: "none",
  background: "none",
  fontSize: 12.5,
  color: "#3F3F46",
  cursor: "pointer",
  textAlign: "left",
  fontFamily: "inherit",
};

function Dot({ domain }: { domain: string }) {
  return (
    <span
      style={{
        width: 7,
        height: 7,
        borderRadius: 2,
        background: domainHue(domain),
        flexShrink: 0,
      }}
    />
  );
}
