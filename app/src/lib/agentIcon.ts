// Agent icon resolver (ADR-0010 delta 4). One function — `iconFor(agent)` —
// resolves the chip glyph for an agent across three tiers, in order:
//   1. a bundled `agent-icons/<id>.svg` keyed by the agent id (the built-in
//      agents: claude/codex/gemini/…);
//   2. a `provider-icons/<key>` chosen via the custom-agent icon picker
//      (`agent.icon`), matched against the eager glob (svg or png);
//   3. a first-letter + auto-colour fallback (delta 4: a custom agent like `pi`
//      with no svg renders its initial in a hashed/brand hue).
//
// Both globs are EAGER `as: "url"` so the bundler emits hashed asset URLs at
// build time and there is no async load. Used by AgentToggle, CountBar, and
// AgentSettingsPopover so the whole UI reads one icon source of truth.

import { getIconMetadata } from "../assets/provider-icons/metadata";
import type { AgentInfo } from "./types";

// agent-icons/<id>.svg — the built-in seed icons (id-keyed).
const AGENT_ICON_URLS = import.meta.glob("../assets/agent-icons/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

// provider-icons/<key>.(svg|png) — the icon-picker library (key-keyed).
const PROVIDER_ICON_URLS = import.meta.glob(
  "../assets/provider-icons/*.{svg,png}",
  { eager: true, query: "?url", import: "default" },
) as Record<string, string>;

/** stem (filename without dir/extension) of a glob path key. */
function stem(path: string): string {
  return path.split("/").pop()!.replace(/\.[^.]+$/, "");
}

// stem -> url maps, built once at module load.
const agentById = new Map<string, string>();
for (const [path, url] of Object.entries(AGENT_ICON_URLS))
  agentById.set(stem(path), url);

const providerByKey = new Map<string, string>();
for (const [path, url] of Object.entries(PROVIDER_ICON_URLS))
  providerByKey.set(stem(path), url);

/** Every provider-icon key (for the picker grid). */
export function providerIconKeys(): string[] {
  return [...providerByKey.keys()].sort();
}

/** Resolve a provider-icon key to its bundled asset url (svg or png). */
export function providerIconUrl(key: string): string | undefined {
  return providerByKey.get(key);
}

// 8-hue palette for the first-letter fallback — stable per id via a string hash.
const FALLBACK_HUES = [
  "#2563EB",
  "#0891B2",
  "#D97706",
  "#DC2626",
  "#7C3AED",
  "#15A34A",
  "#DB2777",
  "#0D9488",
];

function hashHue(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return FALLBACK_HUES[Math.abs(h) % FALLBACK_HUES.length];
}

export interface AgentIcon {
  /** bundled asset url when a matching svg/png exists; absent → letter mode. */
  svgUrl?: string;
  /** first letter for the fallback chip (always present). */
  letter: string;
  /** tint: brand colour for the matched icon / picker metadata, else hashed. */
  color: string;
}

/**
 * Resolve an agent to a renderable icon. Tier 1: `agent-icons/<id>.svg`.
 * Tier 2: `provider-icons/<agent.icon>`. Tier 3: first-letter + colour
 * (agent.color → picker defaultColor → hashed hue).
 */
export function iconFor(agent: Pick<AgentInfo, "id" | "icon" | "color"> & {
  short?: string;
  name?: string;
}): AgentIcon {
  const letter = (agent.short || agent.name || agent.id || "?")
    .charAt(0)
    .toUpperCase();

  // Tier 1 — built-in id-keyed svg.
  const byId = agentById.get(agent.id);
  if (byId) {
    return { svgUrl: byId, letter, color: agent.color ?? hashHue(agent.id) };
  }

  // Tier 2 — custom-agent picker icon from provider-icons.
  if (agent.icon) {
    const url = providerByKey.get(agent.icon);
    const meta = getIconMetadata(agent.icon);
    const metaColor =
      meta?.defaultColor && meta.defaultColor !== "currentColor"
        ? meta.defaultColor
        : undefined;
    if (url) {
      return { svgUrl: url, letter, color: agent.color ?? metaColor ?? hashHue(agent.id) };
    }
    // icon key set but no asset — still let its metadata tint the letter.
    return { letter, color: agent.color ?? metaColor ?? hashHue(agent.id) };
  }

  // Tier 3 — first-letter + colour.
  return { letter, color: agent.color ?? hashHue(agent.id) };
}
