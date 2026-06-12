# Contributing to skillshelf

Thanks for your interest in improving skillshelf. This is an agent-first skill
registry and manager (`skl`) built on Bun + TypeScript with **zero runtime
dependencies**. Contributions of all sizes are welcome.

## Development setup

You need [Bun](https://bun.sh) `>= 1.0.0`. No other toolchain is required.

```sh
git clone https://github.com/Wang-Cankun/skillshelf
cd skillshelf
bun install   # installs dev/type tooling only; there are no runtime deps
```

Run the CLI directly from source:

```sh
bun run src/cli.ts <command>   # or: bun run skl <command>
```

## Running tests

Tests run against the checked-in fixture library so they are deterministic and
never touch your real skill folders. Point `SKILLSHELF_LIBRARY` at the fixture
library:

```sh
SKILLSHELF_LIBRARY="$PWD/fixtures/library" bun test
```

All tests must stay green before a PR is merged. Add tests for any new
behaviour (`*.test.ts` next to the code it covers).

## Project layout

```
src/
  cli.ts          # argv parsing + command dispatch
  config.ts       # resolves Config + builds the Ctx handed to every command
  types.ts        # domain model + the command contract (source of truth)
  commands/       # one file per `skl <command>` (add, ls, infer, ...)
  core/           # library logic: crawl, dedupe, bundle, indexgen, fetch, ...
  adapters/       # external integrations (e.g. inference: agent / api backends)
  lib/            # small standalone helpers (frontmatter, fs)
tests/            # integration / end-to-end tests
fixtures/         # fixture skill library used by the test suite
```

## How to add a command

Every command is a module under `src/commands/` that exports two things,
matching the contract in `src/types.ts` (`CommandModule`):

```ts
import type { Ctx } from "../types.ts";

export const meta = {
  name: "hello",
  summary: "One-line description shown in help",
  usage: "skl hello [name] [--json]",
} as const; // satisfies CommandMeta

export async function run(argv: string[], ctx: Ctx): Promise<number> {
  try {
    const json = argv.includes("--json");
    const skills = await ctx.loadLibrary();
    if (json) {
      ctx.json({ count: skills.length });
      return 0;
    }
    ctx.log(`Library has ${skills.length} skills.`);
    return 0;
  } catch (err) {
    ctx.error(`hello failed: ${(err as Error).message}`);
    return 1;
  }
}
```

Contract notes:

- `meta` carries `name`, `summary`, and `usage`.
- `run(argv, ctx)` returns a numeric exit code: `0` on success, non-zero on
  failure. `argv` is the command's own arguments (the command name is already
  stripped).
- Use `ctx` for everything environmental — never read global state directly:
  - `ctx.loadLibrary()` to load the effective skill set,
  - `ctx.log(...)` for human output, `ctx.error(...)` for stderr,
  - `ctx.json(value)` for machine-parseable output,
  - `ctx.config` / `ctx.libraryPath` for resolved paths.
- Register the command in the dispatch table in `src/cli.ts`.

## Coding norms

- **Zero runtime dependencies.** Do not add packages to `dependencies`. Use the
  Bun standard library and Web APIs. Dev-only tooling is acceptable in
  `devDependencies` when justified.
- **Agent-parseable output.** Any command that emits data should support
  `--json` and route it through `ctx.json(...)` (single-line JSON to stdout).
  Keep human (`ctx.log`) and machine (`ctx.json`) output strictly separate.
- **Exit codes matter.** Return `0`/non-zero from `run`; report errors on
  stderr via `ctx.error`.
- **TypeScript, strict.** Code against the types in `src/types.ts`; avoid `any`.
- **No personal data.** Use neutral, generic examples in code, tests, and docs.
  Do not commit real names, private emails, internal hosts/URLs, absolute home
  paths, or API keys.
- Keep modules small and focused; pure logic in `core/`, side-effecting
  integrations in `adapters/`.

## Commit & PR conventions

- Use clear, imperative commit subjects, ideally
  [Conventional Commits](https://www.conventionalcommits.org/) style, e.g.
  `feat(commands): add ls --all flag` or `fix(core): dedupe retired skills`.
- Keep each PR focused on a single concern; split unrelated changes.
- Before opening a PR:
  - `SKILLSHELF_LIBRARY="$PWD/fixtures/library" bun test` passes,
  - new behaviour has tests,
  - no runtime dependencies were added,
  - the diff is free of personal/private data.
- Describe what changed and why in the PR body, and link any related issue.

By contributing you agree your contributions are licensed under the project's
[MIT License](./LICENSE).
