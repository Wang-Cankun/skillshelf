#!/usr/bin/env bash
# Grade the end-state of a skillshelf sandbox for one eval.
# Usage: check.sh <sandbox_dir> <eval_id: A|B|C>
# Emits a JSON array of {text, passed, evidence} assertions (the schema the eval viewer wants).
set -uo pipefail

SBX="${1:?need sandbox dir}"
EVAL="${2:?need eval id}"
LIB="$SBX/library"
PROJ="$SBX/project"

# Resolve a symlink target (portable-ish)
deref() { readlink "$1" 2>/dev/null || true; }
# realpath of a path, following links
rp() { python3 -c "import os,sys; print(os.path.realpath(sys.argv[1]))" "$1" 2>/dev/null || echo ""; }

declare -a OUT
add() { # <text> <passed:true|false> <evidence>
  local t p e
  t=$(printf '%s' "$1" | python3 -c "import json,sys;print(json.dumps(sys.stdin.read()))")
  e=$(printf '%s' "$3" | python3 -c "import json,sys;print(json.dumps(sys.stdin.read()))")
  OUT+=("{\"text\":$t,\"passed\":$2,\"evidence\":$e}")
}

case "$EVAL" in
  A)
    # pdf-extract should be OWNED in the library (real dir, not missing)
    if [ -f "$LIB/pdf-extract/SKILL.md" ]; then add "pdf-extract is in the library" true "found $LIB/pdf-extract/SKILL.md"
    else add "pdf-extract is in the library" false "missing $LIB/pdf-extract/SKILL.md"; fi
    # deployed as a symlink into the project's .claude/skills
    link="$PROJ/.claude/skills/pdf-extract"
    if [ -L "$link" ]; then
      tgt=$(rp "$link")
      if printf '%s' "$tgt" | grep -q "/library/pdf-extract"; then add "pdf-extract is symlinked into the project" true "$link -> $tgt"
      else add "pdf-extract is symlinked into the project" false "link resolves outside library: $tgt"; fi
    else add "pdf-extract is symlinked into the project" false "no symlink at $link"; fi
    # no real copy in the project (would be drift)
    if [ -e "$link" ] && [ ! -L "$link" ]; then add "project has no drifting real copy" false "real file at $link"
    else add "project has no drifting real copy" true "deploy is a symlink (or absent)"; fi
    ;;
  B)
    # both unique skills adopted
    for s in commit-helper xhs-title; do
      if [ -f "$LIB/$s/SKILL.md" ]; then add "$s adopted into library" true "found $LIB/$s"
      else add "$s adopted into library" false "missing $LIB/$s"; fi
    done
    # the contested rnaseq-qc landed (one canonical copy)
    if [ -f "$LIB/rnaseq-qc/SKILL.md" ]; then add "rnaseq-qc adopted (one canonical copy)" true "found $LIB/rnaseq-qc"
    else add "rnaseq-qc adopted (one canonical copy)" false "missing $LIB/rnaseq-qc"; fi
    # at least 3 skills total in library (proves consolidation happened)
    n=$(find "$LIB" -maxdepth 2 -name SKILL.md 2>/dev/null | grep -v _retired | wc -l | tr -d ' ')
    if [ "${n:-0}" -ge 3 ]; then add "library consolidated (>=3 skills)" true "$n skills present"
    else add "library consolidated (>=3 skills)" false "only $n skills"; fi
    ;;
  C)
    # cairn must be a LINKED entry: library/cairn resolves to the dev repo
    entry="$LIB/cairn"
    devrp=$(rp "$SBX/dev/cairn")
    if [ -e "$entry/SKILL.md" ]; then
      entryrp=$(rp "$entry")
      if [ "$entryrp" = "$devrp" ]; then add "cairn is LINKED to the dev repo" true "library/cairn -> $entryrp"
      else add "cairn is LINKED to the dev repo" false "library/cairn resolves to $entryrp, not dev repo $devrp"; fi
    else add "cairn is LINKED to the dev repo" false "no cairn entry in library"; fi
    # the link relationship means it's a symlink, not an owned copy
    if [ -L "$entry" ]; then add "library/cairn is a symlink (not an owned copy)" true "$(deref "$entry")"
    else add "library/cairn is a symlink (not an owned copy)" false "library/cairn is a real dir (copied, will drift)"; fi
    # dev repo still intact
    if [ -f "$SBX/dev/cairn/SKILL.md" ]; then add "dev repo left intact" true "dev repo SKILL.md present"
    else add "dev repo left intact" false "dev repo damaged"; fi
    ;;
esac

printf '[%s]\n' "$(IFS=,; echo "${OUT[*]}")"
