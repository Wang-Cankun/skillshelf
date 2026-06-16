// Design tokens as JS constants — the same hex values encoded in index.css
// @theme, exposed here for inline-style ports of the mockup (ADR-0008 §2 says
// copy the mockup's exact px/hex verbatim; this dense bespoke UI is most
// faithfully reproduced with inline styles keyed off one shared source).

export const C = {
  page: "#FAFAFA",
  panel: "#FFFFFF",
  border: "#E7E7E9",
  borderSubtle: "#EFEFF1",
  borderFaint: "#F3F3F4",
  ink: "#18181B",
  sub: "#71717A",
  faint: "#9A9AA2",
  absent: "#C7C7CC",
  green: "#15A34A",
  amber: "#D97706",
  blue: "#2563EB",
  red: "#DC2626",
  gray: "#8A8A92",
} as const;

export const MONO = "ui-monospace,'SF Mono',Menlo,monospace";

// 12 domain hues (mockup domData order = sidebar order, by count desc).
export const DOMAIN_HUES: Record<string, string> = {
  "portfolio": "#2563EB",
  content: "#0891B2",
  business: "#D97706",
  "sci-writing": "#DC2626",
  docs: "#7C3AED",
  meta: "#15A34A",
  philosophy: "#DB2777",
  ops: "#71717A",
  bioinfo: "#0D9488",
  browser: "#65A30D",
  media: "#9333EA",
  _unclassified: "#C7C7CC",
};

export function domainHue(domain: string): string {
  return DOMAIN_HUES[domain] ?? C.absent;
}

// Deployment-state glyphs for the Matrix (agent mode) + drawer AGENTS rail.
// Mirrors the mockup G2 map: state -> [glyph, color].
export type DeployState =
  | "clean"
  | "source"
  | "drift"
  | "copy"
  | "dead"
  | "absent";

export const DEPLOY_GLYPH: Record<DeployState, { glyph: string; color: string }> =
  {
    clean: { glyph: "✓", color: C.green },
    source: { glyph: "⊙", color: C.sub },
    drift: { glyph: "⚠", color: C.amber },
    copy: { glyph: "□", color: C.amber },
    dead: { glyph: "✗", color: C.red },
    absent: { glyph: "·", color: "#D4D4D8" },
  };
