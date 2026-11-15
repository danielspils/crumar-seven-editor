#!/bin/bash
# Launch the app for a diagnostic or a screenshot, against a SCRATCH COPY of
# the library.
#
# WHY THIS EXISTS AT ALL — two reasons, and the first is the important one.
#
# RULE 7: A TEST MUST NEVER WRITE TO THE REAL LIBRARY. `SEVEN_UI_TEST=… npm
# start` used to run against whatever library the app would normally open, and
# on 2026-09-08 a diagnostic run that way renamed the sound in Daniel's real
# nada-clav.sevenlib.json. src/main.js now refuses SEVEN_UI_TEST without
# SEVEN_LIBRARY_DIR; this script is the same refusal one level up, so the
# mistake cannot be made by forgetting a prefix either. It will not start
# without a library directory, and --copy makes a fresh one for you.
#
# AND IT IS ONE COMMAND INSTEAD OF A PREFIXED ONE. An environment prefix
# defeats permission matching — `SEVEN_NO_DEVICE=1 npm start` can never match
# a rule for `npm start` — so every diagnostic launch was a fresh approval
# prompt. One script, one rule: Bash(./scripts/dev-offline.sh *).
#
# USAGE
#   ./scripts/dev-offline.sh --copy                      fresh copy of the real library
#   ./scripts/dev-offline.sh --copy --probe p.js         …and run a UI probe in it
#   ./scripts/dev-offline.sh --lib /path/to/scratch      an existing scratch dir
#   ./scripts/dev-offline.sh --copy --device             keep the instrument attached
#   ./scripts/dev-offline.sh --copy --seed               seed the demo fixtures
#
# OFFLINE BY DEFAULT. Most diagnostics want SEVEN_NO_DEVICE=1: it is the real
# disconnected path (seven-midi.js lies in exactly one place, _findPort), and
# it leaves the USB port free for a sibling session or a UI suite run. Pass
# --device when the thing under test genuinely needs hardware — the carousel's
# peek faces, a recall burst, a panel hold.

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIB=""
PROBE=""
OFFLINE=1
SEED=0
MAKE_COPY=0
LOG=""

while [ $# -gt 0 ]; do
  case "$1" in
    --copy)   MAKE_COPY=1; shift ;;
    --lib)    LIB="${2:-}"; shift 2 ;;
    --probe)  PROBE="${2:-}"; shift 2 ;;
    --log)    LOG="${2:-}"; shift 2 ;;
    --device) OFFLINE=0; shift ;;
    --seed)   SEED=1; shift ;;
    -h|--help) sed -n '2,30p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "dev-offline: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

# THE REFUSAL, and it is the point of the script. No library directory, no
# launch — never a silent fallback to the real one.
if [ "$MAKE_COPY" -eq 0 ] && [ -z "$LIB" ]; then
  echo "dev-offline: refusing to start without a library directory." >&2
  echo "  --copy              take a fresh copy of the real library (safe)" >&2
  echo "  --lib <dir>         use an existing scratch directory" >&2
  echo "Rule 7: a test must never write to the real library." >&2
  exit 2
fi

if [ "$MAKE_COPY" -eq 1 ]; then
  SOURCE="$HOME/Library/Application Support/This Seven Goes to Eleven/Library"
  # No `rm -rf` on a variable: mktemp -d hands back a directory that is new by
  # construction, so nothing has to be deleted to make room for it.
  LIB="$(mktemp -d "${TMPDIR:-/tmp}/seven-dev-lib.XXXXXX")"
  if [ -d "$SOURCE" ]; then
    cp -R "$SOURCE/." "$LIB/"
    echo "dev-offline: copied $(find "$LIB" -maxdepth 1 -type f | wc -l | tr -d ' ') files to $LIB"
  else
    echo "dev-offline: no library at \"$SOURCE\" — starting with an empty one at $LIB"
  fi
fi

if [ ! -d "$LIB" ]; then
  echo "dev-offline: library directory does not exist: $LIB" >&2
  exit 2
fi

# A PROBE IS A PATH, checked before launch. SEVEN_UI_TEST pointing at nothing
# starts the app and reports no result, which reads exactly like a probe that
# found nothing.
if [ -n "$PROBE" ] && [ ! -f "$PROBE" ]; then
  echo "dev-offline: probe file not found: $PROBE" >&2
  exit 2
fi

export SEVEN_LIBRARY_DIR="$LIB"
[ "$OFFLINE" -eq 1 ] && export SEVEN_NO_DEVICE=1
[ "$SEED" -eq 1 ] && export SEVEN_SEED_DEMO=1
[ -n "$PROBE" ] && export SEVEN_UI_TEST="$PROBE"

echo "dev-offline: library=$LIB device=$([ "$OFFLINE" -eq 1 ] && echo off || echo on)${PROBE:+ probe=$PROBE}"

cd "$REPO"
if [ -n "$LOG" ]; then
  npm start > "$LOG" 2>&1
  echo "dev-offline: output in $LOG"
else
  npm start
fi
