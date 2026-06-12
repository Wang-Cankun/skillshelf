---
name: commit-push
description: Stage all changes, write a conventional-commit message, and push to the current branch's remote. Use when the user says "commit and push", "commit this", or finishes a unit of work and wants it saved upstream.
domains: [coding, git]
---

# commit-push

1. `git add -A`
2. Compose a conventional-commit subject from the diff.
3. Commit and `git push` to the tracking branch (branch first if on default).
