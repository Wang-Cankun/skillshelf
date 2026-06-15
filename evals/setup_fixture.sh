#!/usr/bin/env bash
# Build an isolated skillshelf sandbox for one eval case.
# Usage: setup_fixture.sh <sandbox_dir> <eval_id: A|B|C>
# Everything lives under <sandbox_dir>; HOME is redirected there so the real
# ~/.skillshelf and ~/.claude are never touched. Prints the sandbox dir on success.
set -euo pipefail

SBX="${1:?need sandbox dir}"
EVAL="${2:?need eval id A|B|C}"
SKL="/Users/wang.13246/.bun/bin/skl"   # absolute: PATH may lose ~/.bun after HOME override

rm -rf "$SBX"
mkdir -p "$SBX/home" "$SBX/project"
export HOME="$SBX/home"
export SKILLSHELF_LIBRARY="$SBX/library"
export SKILLSHELF_GLOBAL_CORE="$SBX/home/.claude/skills"
mkdir -p "$SKILLSHELF_GLOBAL_CORE"

# Helper: write a minimal valid skill dir
mkskill() { # <dir> <name> <desc> [bodyline]
  mkdir -p "$1"
  cat > "$1/SKILL.md" <<EOF
---
name: $2
description: $3
---

# $2

${4:-Do the $2 thing carefully and report results.}
EOF
}

"$SKL" init >/dev/null 2>&1 || true

case "$EVAL" in
  A) # install-and-deploy: a local source skill to adopt, then activate in project
    mkskill "$SBX/sources/pdf-extract" "pdf-extract" "Extract text and tables from PDF files into clean markdown."
    ;;
  B) # migrate-scattered: two roots, a duplicate and a drifted copy
    mkskill "$SBX/rootA/rnaseq-qc" "rnaseq-qc" "QC gate for RNA-seq count matrices." "Original body A."
    mkskill "$SBX/rootA/commit-helper" "commit-helper" "Write atomic conventional commits."
    mkskill "$SBX/rootB/rnaseq-qc" "rnaseq-qc" "QC gate for RNA-seq count matrices." "DRIFTED body B — differs from rootA."
    mkskill "$SBX/rootB/xhs-title" "xhs-title" "Generate catchy Xiaohongshu titles."
    ;;
  C) # develop-as-linked: a dev repo that should be linked, not copied
    mkskill "$SBX/dev/cairn" "cairn" "Cairn project scaffolding helper." "Dev-repo body; user edits this live."
    ( cd "$SBX/dev/cairn" && git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm init )
    ;;
  *) echo "unknown eval $EVAL" >&2; exit 1 ;;
esac

echo "$SBX"
