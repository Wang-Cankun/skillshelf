# 7. Fact vs Inference boundary, and a function-first UI scope

Date: 2026-06-14

## Status

Accepted. Sets the architectural contract for the desktop UI (Tauri + Svelte) being built
over the `skl` CLI, before any inference logic leaks into the presentation layer. Reached
with the user after an early AI-design draft mixed deterministic facts with LLM-inferred
judgments indistinguishably and placed the inference inside the UI.

## Context

### The signal: a draft that couldn't tell the disk from the model

A first AI-generated UI design rendered LLM guesses (suggested tags, "this looks like a
duplicate", quality scores) in the same visual channel as disk-derived facts (content hash,
deployment kind, taxonomy membership) — and computed those guesses *inside the Svelte layer*.
Both moves are wrong in the same way: they erase the line between **what is true on disk** and
**what a model thinks**, and they scatter judgment logic where neither the agent nor a test
can reach it.

skillshelf **is** intentionally AI-agentic — LLM capability is a feature, not a contaminant
(`skl infer` already exists and writes `taxonomy.json`). So the fix is not "no AI in the
product." It is: **make the boundary explicit, put inference in the backend, and never let a
suggestion masquerade as a fact.**

### The litmus test

The question that classifies every value the UI shows:

> **"Can two runs, or two different models, disagree on the answer?"**

- **No** → it is a **FACT**: deterministic, engine-computed, reproducible.
- **Yes** → it is a **JUDGMENT**: probabilistic, LLM-derived, true only as a *suggestion with
  provenance* — never rendered as truth.

A content hash is a fact (same bytes → same hash, every time, every model). "These two skills
do the same thing" is a judgment (a second run, or GPT vs Claude, can disagree).

## Decision

### 1. The litmus test is the law

Apply it to every value before deciding how it is computed and how it is shown. **No** → FACT,
owned by the deterministic engine. **Yes** → JUDGMENT, owned by the inference layer and
rendered as a suggestion carrying its provenance, never as established truth.

### 2. Three layers, hard boundaries

- **L1 — UI (Tauri + Svelte): presentation only.** Zero domain logic, zero inference. A pure
  function of backend JSON. It renders facts and suggestions in **visually distinct channels**
  and does nothing a backend command didn't already decide.
- **L2 — Core engine (`skl --json`): facts from disk.** Deterministic, reproducible, the source
  of truth. Drift = content-hash mismatch; untagged = absent from `taxonomy.json`; stub = body
  matches the scaffold template; dup = same hash; family = string-prefix match; deployment kind
  from `realpath` classification. None of these can disagree across runs or models.
- **L3 — Inference (`skl infer` / future `skl suggest --json`): judgments.** LLM-backed. Emits a
  typed `Suggestion { kind; subjects[]; claim; confidence; evidence[]; model; generatedAt }`,
  cached and invalidated on content-hash change. **It lives in the backend** so the agent and
  the GUI consume the *same* suggestions — no split-brain where the CLI agent and the desktop
  app disagree about what the model said.

### 3. Function-first UI scope — a manager, not a showcase

The UI is a **graphical front for the existing deterministic verbs**, not an AI demo. v1 is a
manager for: `ls`, `search`, `show`, `scan`, `where`, `status`, `import`, `add`, `tag`/`untag`/
`retag`, `rename`, `retire`/`unretire`/`rm`, `use`/`drop`/`link`, `roots`, `outdated`/`update`/
`refresh`, `edit`. Every one of these is a fact-layer (L2) operation.

The **only** AI footprint in v1 is a single optional, clearly-labelled **"Suggest tags"** button
(`skl infer`) on untagged skills: opt-in, confirm-to-apply, and rendered as a suggestion, not a
fact. No ambient scoring, no auto-classification, no "AI insights" panel. The product manages
the shelf; the one AI affordance is held to the same suggestion rules as everything in L3.

### 4. Lifecycle — suggestions are promoted to facts, not shown as them

```
L3 suggests → human/agent confirms → promoted to L2 fact (persisted)
```

A judgment only becomes a fact by an explicit confirmation step that persists it.
`taxonomy.json` is the existing instance of this: it is **persisted `infer` output** — once
written and confirmed, the tags it holds are treated as facts (taxonomy membership is an L2
query). The model's role ended at the moment of persistence; what's on disk afterward is fact.

### 5. UI rendering rule — the user never has to guess who's talking

- **Facts** render **solid and authoritative** — the default, unmarked, trustworthy chrome.
- **Suggestions** render in a distinct **"✨ AI suggests"** channel: tinted/dashed, a confidence
  chip, expandable `evidence[]`, **Apply / Dismiss** actions, and a visible `{model, generatedAt}`
  footprint. **Never auto-applied.**

The invariant: a user must **never** have to ask *"is this the disk or the model talking?"* The
two channels are visually unambiguous, and a suggestion always carries the provenance needed to
judge it.

## Consequences

**Positive**

- **Trust.** A fact never wears a suggestion's uncertainty and a suggestion never wears a fact's
  authority — the user always knows the epistemic status of what they're looking at.
- **Agent/GUI parity.** Inference in the backend (L3) means the CLI agent and the desktop app
  consume identical suggestions; no split-brain, no "the app said X but `skl` said Y."
- **Testable deterministic core.** L2 is reproducible by construction, so the fact layer is
  unit-testable without a model in the loop, and the UI is testable against fixed JSON.
- **Cheap renders.** L1 being a pure function of backend JSON keeps the UI thin, fast, and free
  of hidden state or per-frame model calls.

**Negative / cost**

- **Inference must be a backend service, not a UI convenience.** The tempting shortcut — call a
  model straight from Svelte where the value is needed — is forbidden; every judgment has to
  round-trip through `skl` (L3). More plumbing for the simple cases.
- **One extra contract to maintain.** The `Suggestion { kind; subjects[]; claim; confidence;
  evidence[]; model; generatedAt }` type is a versioned boundary between L3 and L1 that must be
  kept stable and tested alongside the existing `--json` fact schemas.
