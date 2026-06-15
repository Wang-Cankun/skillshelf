#!/usr/bin/env bash
# Self-test for the eval harness itself (the L2 layer: "who tests check.sh?").
#
# A grader is only trustworthy if it can BOTH go green on a correct end-state AND
# go red on a wrong one. This script proves both with known-answer controls, so a
# vacuous grader (one that always passes) can't slip through:
#
#   positive control : drive skl the RIGHT way      -> every assertion must PASS
#   negative control : empty sandbox (did nothing)  -> at least one assertion must FAIL
#   assertion audit  : flag assertions that pass in BOTH (non-discriminating)
#
# Run: bash evals/selftest.sh   (exit 0 = grader discriminates; non-zero = harness bug)
set -uo pipefail

REPO="/Users/wang.13246/Documents/GitHub/skillshelf"
SKL="/Users/wang.13246/.bun/bin/skl"
TMP="/tmp/skl-selftest"
rm -rf "$TMP"; mkdir -p "$TMP"
fail=0

# Drive skl the correct way for one eval, inside an already-built sandbox.
golden() { # <sandbox> <eval>
  local SBX="$1" E="$2"
  export HOME="$SBX/home" SKILLSHELF_LIBRARY="$SBX/library" SKILLSHELF_GLOBAL_CORE="$SBX/home/.claude/skills"
  case "$E" in
    A) "$SKL" import pdf-extract --from "$SBX/sources/pdf-extract" --copy >/dev/null 2>&1
       ( cd "$SBX/project" && "$SKL" use pdf-extract >/dev/null 2>&1 ) ;;
    B) "$SKL" import commit-helper --from "$SBX/rootA/commit-helper" >/dev/null 2>&1
       "$SKL" import xhs-title --from "$SBX/rootB/xhs-title" >/dev/null 2>&1
       "$SKL" import rnaseq-qc --from "$SBX/rootA/rnaseq-qc" >/dev/null 2>&1 ;;
    C) "$SKL" link --from "$SBX/dev/cairn" >/dev/null 2>&1 ;;
  esac
}

# Count pass/total from a check.sh run; also append the green assertion texts to $2.
counts() { # <json>  -> echoes "<pass> <total>"
  printf '%s' "$1" | python3 -c "import json,sys; a=json.load(sys.stdin); print(sum(x['passed'] for x in a), len(a))"
}
green_texts() { printf '%s' "$1" | python3 -c "import json,sys; [print(x['text']) for x in json.load(sys.stdin) if x['passed']]"; }

for E in A B C; do
  echo "===== eval $E ====="

  # ---- positive control: golden path must be ALL green ----
  pos="$TMP/pos-$E"
  bash "$REPO/evals/setup_fixture.sh" "$pos" "$E" >/dev/null
  golden "$pos" "$E"
  pj=$(bash "$REPO/evals/check.sh" "$pos" "$E")
  read -r pp pt <<<"$(counts "$pj")"
  if [ "$pp" = "$pt" ]; then echo "  ✅ positive control: $pp/$pt pass (golden path all green)"
  else echo "  ❌ positive control: only $pp/$pt pass — grader red on a CORRECT end-state (false negative)"; fail=1
       printf '%s\n' "$pj" | python3 -c "import json,sys; [print('       red:',x['text'],'—',x['evidence']) for x in json.load(sys.stdin) if not x['passed']]"; fi

  # ---- negative control: empty sandbox must NOT be all green ----
  neg="$TMP/neg-$E"
  bash "$REPO/evals/setup_fixture.sh" "$neg" "$E" >/dev/null   # build, then do NOTHING
  nj=$(bash "$REPO/evals/check.sh" "$neg" "$E")
  read -r np nt <<<"$(counts "$nj")"
  if [ "$np" -lt "$nt" ]; then echo "  ✅ negative control: $np/$nt pass (grader CAN go red on a do-nothing sandbox)"
  else echo "  ❌ negative control: $np/$nt pass — grader is VACUOUS (passes even when nothing was done)"; fail=1; fi

  # ---- assertion audit: green in BOTH golden and empty = non-discriminating ----
  both=$(comm -12 <(green_texts "$pj" | sort) <(green_texts "$nj" | sort))
  if [ -n "$both" ]; then
    echo "  ⚠️  non-discriminating assertions (green in both correct AND do-nothing — they don't separate good from bad):"
    printf '%s\n' "$both" | sed 's/^/       - /'
  fi
done

echo ""
if [ "$fail" = 0 ]; then echo "PASS — the grader discriminates (golden→green, empty→red). check.sh verdicts are trustworthy."
else echo "FAIL — harness bug above; check.sh verdicts cannot be trusted until fixed."; fi
rm -rf "$TMP"
exit "$fail"
