#!/bin/bash
# Quit THIS checkout's editor, so the MIDI port is free for a suite run.
#
# WHY A SCRIPT AND NOT A PATTERN (Daniel, 18 Nov 2026).
#
# The allow rule used to be `Bash(pkill -f MacOS/Electron)` and CLAUDE.md's
# example ran `pkill -f Electron`. Both match EVERY Electron app running from a
# dev checkout — on this machine the JUNO-Xtra, JP Patches and Hammond M-solo
# editors as well as this one — so freeing one MIDI port took down three
# unrelated projects mid-work.
#
# AND THERE IS NO NARROWER PATTERN TO USE. This app's main process is
#
#   <repo>/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron
#
# Every segment of that except the repo directory is shared by every Electron
# dev checkout, and the repo directory is the one thing a pattern must NOT
# match on: "crumar-seven-editor" appears in a Claude Code session's own
# command line (inside a permission rule), which is exactly the bug just fixed
# in test/ui/run.js — `pkill -f "crumar-seven-editor"` killed the session that
# ran it. So there is nothing to narrow the pattern TO.
#
# A PID IS THE ONLY SAFE DISCRIMINATOR, and finding one needs a few lines of
# logic rather than a string. That is what this script is for: one name, one
# allow rule, no pattern — the same trade dev-offline.sh makes.
#
# HOW IT IDENTIFIES THE APP: `ps -Ao pid=,comm=` reports each process's
# EXECUTABLE path, which a process cannot spell however it likes — a shell's
# comm is /bin/zsh whatever its arguments say. Two conditions, both required:
#   - the executable lives under THIS repo, resolved from this script's own
#     location, so another checkout can never match
#   - it ends in /Contents/MacOS/Electron, the MAIN process. Electron's GPU,
#     renderer and utility helpers all live under the same root and all have
#     "Electron" in their path; only the main process holds the MIDI port.
# This mirrors test/ui/app-running.js, which is unit-tested; see the comment
# there for the history of getting it wrong.
#
# USAGE
#   ./scripts/quit-editor.sh           quit it (SIGTERM, so it closes cleanly)
#   ./scripts/quit-editor.sh --list    say what is running and change nothing

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIST=0
case "${1:-}" in
  --list) LIST=1 ;;
  -h|--help) sed -n '2,45p' "${BASH_SOURCE[0]}"; exit 0 ;;
  "") ;;
  *) echo "quit-editor: unknown argument '$1'" >&2; exit 2 ;;
esac

# The main-process pids. awk splits off the pid and keeps the REST as the path,
# because an Electron helper's path contains spaces ("Electron Helper
# (Renderer)") and a whitespace split would mangle it.
pids="$(ps -Ao pid=,comm= | awk -v repo="$REPO/" '
  {
    pid = $1
    sub(/^[ \t]*[0-9]+[ \t]+/, "")
    if (index($0, repo) == 1 && $0 ~ /\/Contents\/MacOS\/Electron$/) print pid
  }
')"

if [ -z "$pids" ]; then
  echo "quit-editor: this checkout's editor is not running."
  exit 0
fi

for p in $pids; do
  echo "quit-editor: $(basename "$REPO") editor is running as pid $p"
done

if [ "$LIST" -eq 1 ]; then
  exit 0
fi

# THAT EDITOR MAY BE SOMEBODY ELSE'S HARDWARE SESSION. Sibling Claude sessions
# share this checkout, and one of them may be mid-run against the instrument.
# The script cannot tell; it says so rather than implying it checked.
echo "quit-editor: if a sibling session is mid-run against the Seven, stop here."

for p in $pids; do
  kill "$p" 2>/dev/null || true
done

# SIGTERM AND THEN PATIENCE — NEVER kill -9 (18 Nov 2026). This app writes to
# the instrument and to the library, and a transfer walk interrupted between
# the recall and the store leaves a preset half-written on hardware that no
# amount of local cleanup can undo. A clean quit lets main.js finish whatever
# it is doing; if it will not go, that is worth a human looking at it rather
# than a bigger hammer.
for _ in 1 2 3 4 5 6 7 8 9 10; do
  left="$(ps -Ao pid= -p $(echo "$pids" | tr '\n' ',' | sed 's/,$//') 2>/dev/null | tr -d ' ' | grep -c . || true)"
  [ "$left" = "0" ] && break
  sleep 0.5
done

still="$(ps -Ao pid=,comm= | awk -v repo="$REPO/" '
  { pid = $1; sub(/^[ \t]*[0-9]+[ \t]+/, "");
    if (index($0, repo) == 1 && $0 ~ /\/Contents\/MacOS\/Electron$/) print pid }
')"

if [ -n "$still" ]; then
  echo "quit-editor: it did not quit. Still running: $still" >&2
  echo "  Quit it from the app (Cmd+Q). Not kill -9 — this app writes to the" >&2
  echo "  instrument, and a transfer interrupted mid-walk leaves a preset" >&2
  echo "  half-written on hardware." >&2
  exit 1
fi

echo "quit-editor: closed. The instrument's port is free."
