# How the `skl` skill was built and tested

This documents the full process — both so the skill is reproducible and as a worked example
of **how to test a CLI-driver skill** with a behavioral harness. The companion
`results/report.html` is the visual version of the same story.

## 1. What we built

A skill (`../SKILL.md` + `../references/`) that teaches Claude to drive the `skl` (skillshelf)
CLI for skill management. It's a **driver manual**, not a transform: success is "the agent runs
the right commands and respects the safety rules," so the skill is organized as

- `SKILL.md` — mental model (library / bundle / owned-vs-linked / deployment), seven safety
  rules, and an **intent → command** routing table.
- `references/commands.md` — every command and flag (loaded on demand).
- `references/workflows.md` — multi-step recipes (install+deploy, migrate, audit, develop-as-linked).

The split follows progressive disclosure: the always-loaded `SKILL.md` stays lean; the heavy
reference is one hop away when a flag or recipe is actually needed.

## 2. Why a *behavioral* harness (not prose review)

For a skill whose whole job is to make an agent operate a CLI correctly, reading the prose tells
you almost nothing. The real question is empirical: **given a task, does an agent with the skill
drive `skl` correctly — and does it do better than an agent without it?**

So every test:
1. spawns the task at a real agent,
2. lets it run the **real `skl` binary**,
3. grades the **filesystem end-state** the agent produced.

And critically, every task runs **twice** — once *with* the skill, once *baseline* (no skill,
only `skl --help`). Without the baseline, a 100% score is meaningless: you can't tell whether the
skill helped or the model already knew.

## 3. Isolation: testing a side-effecting CLI safely

`skl` mutates real directories (`~/.skillshelf/library`, `~/.claude/skills`). To exercise the
genuine binary with zero blast radius, each run gets a throwaway sandbox built by
[`../../../evals/setup_fixture.sh`](../../../evals/setup_fixture.sh):

```
/tmp/skl-eval/iter1/<eval>-<variant>/
  ├─ home/      ← HOME is redirected here, so `skl init` writes ~/.skillshelf and
  │               ~/.claude INSIDE the sandbox — the real ones are never touched
  ├─ library/   ← SKILLSHELF_LIBRARY
  └─ project/ rootA/ rootB/ dev/ …   ← per-eval task fixtures
```

The trick that makes isolation total is **redirecting `HOME`**. `skl` resolves its config and
global-core dir from `HOME`, so pointing it at the sandbox sandboxes *everything* — not just the
library path. Each run gets a fresh sandbox, so runs can't contaminate each other.

## 4. The three tasks (each targets one safety rule)

| Eval | Task | Safety rule under test |
|---|---|---|
| **A** install-and-deploy | adopt a local skill, make it active in a project | `add`/`import` fills the library; `use` deploys — **two steps**, deploy is a symlink |
| **B** migrate-scattered | consolidate skills from two roots with a duplicate | **scan (read-only) before import**; surface drift instead of guessing |
| **C** develop-as-linked | shelve a dev-repo skill without it drifting | `link --from` → **LINKED** entry, not an owned copy |

Tasks are deliberately aimed at the claims the skill makes — that's where a naive agent should
trip and the skill should win. Grading is end-state only, by
[`../../../evals/check.sh`](../../../evals/check.sh), which emits `{text, passed, evidence}`
assertions (e.g. "library/cairn is a symlink, not an owned copy").

## 5. Orchestration: an ultracode workflow

The 6 runs (3 evals × 2 variants) fan out concurrently through a `Workflow` script
(`skl-skill-eval`): each item is one `agent()` that sets up its sandbox, performs the task, and
returns the commands it ran. The sandboxes persist on disk, so after the fan-out a single
**deterministic** pass re-grades every sandbox with `check.sh` — the agent never grades itself.

Then [`../../../evals/grade_and_report.py`](../../../evals/grade_and_report.py) aggregates pass
rates and renders `results/report.html` and `results/benchmark.json`.

Pattern worth keeping: **parallel fan-out for the slow, model-driven part; one deterministic
script for the verdict.** Orchestration buys speed; the script buys reproducibility.

## 6. The result — a null result, reported honestly

| Configuration | Pass rate |
|---|---|
| With skill | 10/10 (100%) |
| Baseline (no skill) | 10/10 (100%) |

The skill did **not** beat the baseline on these tasks. A strong model plus skillshelf's own
good `--help` already reaches the correct end-state unaided. This is worth stating plainly rather
than tuning the eval until the skill "wins":

- The tasks are **not hard enough to discriminate** the skill's value.
- The skill's real payoff is where end-state grading can't see it: **triggering** (reaching for
  `skl` and the right verb with no exploration) and **token cost** (baseline agents spent turns
  reading `skl --help`; skilled agents didn't). Qualitatively that gap showed — e.g. in eval A
  the baseline went straight to the right verb, while the skilled agent first tried `skl add`
  because the skill frames installs around `github:` sources, then recovered.

### What the next iteration should do
1. **Add discriminating tasks** where the naive path actually produces a wrong end-state — e.g.
   the LINKED-entry update trap (force-updating a linked skill would clobber the dev repo), or a
   bulk operation where ordering matters.
2. **Measure triggering separately** with the skill-creator description optimizer, since that's
   the skill's primary value and the behavioral harness doesn't capture it.

## 7. Files

```
skills/skl/
├── SKILL.md                  # the skill (driver manual)
├── references/commands.md    # full command reference
├── references/workflows.md   # multi-step recipes
└── evals/
    ├── evals.json            # test cases + assertions
    ├── HARNESS.md            # this document
    └── results/
        ├── report.html       # visual teaching report
        └── benchmark.json    # machine-readable scores
evals/                        # harness scripts (repo root; reusable)
├── setup_fixture.sh          # builds an isolated sandbox per run
├── check.sh                  # grades a sandbox end-state → assertions
└── grade_and_report.py       # aggregates + renders report.html
```

## 8. Reproduce

```bash
# one variant by hand (sanity check):
bash evals/setup_fixture.sh /tmp/sbx-A A
HOME=/tmp/sbx-A/home SKILLSHELF_LIBRARY=/tmp/sbx-A/library \
  /Users/wang.13246/.bun/bin/skl import pdf-extract --from /tmp/sbx-A/sources/pdf-extract --copy
# … then grade:
bash evals/check.sh /tmp/sbx-A A

# full run is the Workflow `skl-skill-eval`, then:
python3 evals/grade_and_report.py /tmp/skl-eval/runs.json skills/skl/evals/results
```
