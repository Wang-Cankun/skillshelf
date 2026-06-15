---
name: sample-guide
description: >-
  A demo authoring skill that produces a structured how-to guide with sections,
  callouts, and reference files. Use as an example of a multi-file skill with a
  README and a references/ directory.
  Triggers: /sample-guide, "write a guide", "how-to".
license: MIT
---

# Sample Guide

An example skill demonstrating a multi-file layout: a main `SKILL.md`, a
human-facing `README.md`, and a `references/` directory with deeper material.
It exists only to give SkillShelf realistic content to render in dev mode.

## Workflow

1. Define the guide's goal and audience in one line.
2. Draft an outline of 3–5 sections before writing prose.
3. Fill each section, adding a callout for any common pitfall.
4. Cross-check links and code samples (see `references/api.md`).

## Style

Keep sections short, lead with the action, and prefer examples over
description. The design rationale lives in `references/design-theory.md`.
