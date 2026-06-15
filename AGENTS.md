# AGENTS.md

`skillshelf` — the `skl` CLI for managing AI-agent skills across surfaces, plus a Tauri desktop UI.

## Runtime
- **Bun only** (never npm). CLI bin is a TypeScript entrypoint.

## CLI (`src/`)
- Run: `bun run skl -- <command>` (or `bun run src/cli.ts`)
- Test: `bun test`

## App (`app/`, React 19 + Vite + Tauri)
- `cd app && bun install`
- Dev: `bun run dev` · Typecheck: `bun run check` · Build: `bun run build`
- Browser/dev mode uses synthetic fixtures in `app/src/lib/fixtures.ts` (no backend).

## Conventions
- TypeScript throughout; flat library layout (`library/<name>/`); domain is **tags, not folders**.
- Design decisions live in `docs/adr/`. Read the relevant ADR before changing core behavior.
- Keep examples/fixtures generic — no personal data, real paths, or private skill names.
