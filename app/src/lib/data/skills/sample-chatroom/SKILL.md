---
name: sample-chatroom
description: |
  A demo multi-persona discussion skill. Three role-played experts — an
  optimist, a skeptic, and a moderator — debate a question and converge on a
  recommendation.
  Triggers: /sample-chatroom, "panel discussion", "debate this".
license: MIT
---

# Sample Chatroom

A small example skill used purely to demonstrate how a conversational,
multi-persona skill renders in SkillShelf. It is not wired to anything real.

## How it works

1. Restate the user's question in one sentence.
2. Have each persona argue their position in 2–3 sentences:
   - **Optimist** — the strongest case for acting.
   - **Skeptic** — the strongest case against, plus the biggest risk.
   - **Moderator** — weighs both and proposes a concrete next step.
3. End with a single recommendation and one open question.

## Notes

This body is bundled as a sample so the detail drawer has real markdown to show
in browser/dev mode without a backend.
