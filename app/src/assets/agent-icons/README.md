# Agent brand icons

Brand marks for the coding-agent surfaces, used by the inline per-agent toggle row, the drawer
`agent × scope` sub-matrix, and the deploy count bar (ADR-0010 / brief-0010).

Files are named by **agent id** (matches `AGENT_SEEDS` in `src/core/agents.ts`), so a lookup is
just `agent-icons/${agent.id}.svg`. Custom/unknown agents (e.g. `pi`) fall back to
first-letter + auto-colour (no asset).

| agent id   | file            | suggested tint (Tailwind) |
|------------|-----------------|----------------------------|
| `claude`   | `claude.svg`    | orange-500                 |
| `codex`    | `codex.svg`     | amber-500 / zinc (OpenAI mark) |
| `gemini`   | `gemini.svg`    | blue-500                   |
| `opencode` | `opencode.svg`  | indigo-500                 |
| `hermes`   | `hermes.png`    | rose-500                   |

Extras: `anthropic.svg` (alt Claude mark), `github.svg` (the row's `owner/repo` link),
`mcp.svg` (MCP). The "enabled" cell uses a tinted bg + ring on the icon; "disabled" = the same
icon at `opacity-35` (cc-switch pattern). Final tints are the designer's call.

## Full icon library

`agent-icons/` (this folder) is the **curated, id-named** subset for the agents we actually surface.
The **complete 88-icon brand/provider library** (Claude, OpenAI, Gemini, Copilot, DeepSeek, Qwen,
Kimi, Grok, Ollama, Mistral, GitHub, MCP, plus many gateways) lives in
`../provider-icons/`, alongside `metadata.ts` — a `name → { displayName, category, keywords,
defaultColor }` map. Use `provider-icons/` + `metadata.ts` to power a future **icon picker** when a
user registers a custom agent (e.g. `pi`). Sponsor/partner banner logos were intentionally **not**
copied (they're ads, not brand icons).

**Provenance / license:** copied from `cc-switch` (`src/icons/extracted/`). These are third-party
**trademarks/logos** of their respective owners — use them only to *represent* those products in
the UI (nominative use). Do not restyle the marks themselves beyond sizing/opacity, and do not
imply endorsement.
