# AGENTS.md

`skillshelf` — the `skl` CLI for managing AI-agent skills across surfaces, plus a Tauri desktop UI.

## Runtime
- **Bun only** (never npm). CLI bin is a TypeScript entrypoint.

## CLI (`src/`)
- Run: `bun run skl -- <command>` (or `bun run src/cli.ts`)
- Test: `bun test`
- Running from source uses your real home by default. `SKILLSHELF_LIBRARY` alone
  does not isolate config writes. For manual experiments, use a disposable sandbox
  and run deployment commands from its project directory:

  ```sh
  REPO="$PWD"
  SBX="$(mktemp -d)"
  mkdir -p "$SBX/home" "$SBX/project"
  (
    export HOME="$SBX/home"
    export SKILLSHELF_LIBRARY="$SBX/library"
    export SKILLSHELF_CONFIG="$SBX/home/.skillshelf/config.json"
    export SKILLSHELF_GLOBAL_CORE="$SBX/home/.claude/skills"
    cd "$SBX/project"
    bun run "$REPO/src/cli.ts" init
  )
  ```

## App (`app/`, React 19 + Vite + Tauri)
- `cd app && bun install`
- Dev: `bun run dev` · Typecheck: `bun run check` · Build: `bun run build`
- Browser/dev mode uses synthetic fixtures in `app/src/lib/fixtures.ts` (no backend).

## Conventions
- TypeScript throughout; flat library layout (`library/<name>/`); domain is **tags, not folders**.
- Design decisions live in `docs/adr/`. Read the relevant ADR before changing core behavior.
- Keep examples/fixtures generic — no personal data, real paths, or private skill names.
