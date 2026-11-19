#!/bin/bash
# Build a timelapse of This Seven Goes to Eleven: Crumar's browser editor,
# then every shipped tag, then the branch in flight.
#
# WHY A WORKTREE PER TAG, NEVER A CHECKOUT. Daniel dogfoods the dev branch and
# his working tree must not move under him. Every tag is rendered in a throwaway
# worktree under out/timelapse/wt and the worktree is REMOVED as soon as its
# frame exists — an orphaned, locked registration is exactly the mess that had
# to be cleaned out of .git/worktrees on 18 Nov 2026.
#
# WHY EVERY RUN CARRIES SEVEN_LIBRARY_DIR. A script that can drive the app can
# save patches. On 2026-09-08 a probe without it renamed a sound in Daniel's
# real library, and it was only caught because that probe happened to print
# what it had done. Each run gets its own scratch library here.
#
# WHY SEVEN_NO_DEVICE. Consistency first — every frame shows the same
# connection state rather than whichever one the Seven happened to be in — and
# it keeps twelve app launches away from an instrument Daniel may be playing.
# Tags older than 2026-08-21 predate the flag and simply ignore it; they will
# try a real connect, find the port busy or the cable absent, and show the
# offline state anyway.
#
# NOT `pkill -f`. SEVEN_SHOT quits the app itself. A -f pattern built from the
# repo name also matches the controlling session's own command line, which is
# recorded at length in CLAUDE.md.
set -u

REPO="/Users/danielspils/crumar-seven-editor"
OUT="$REPO/out/timelapse"
FRAMES="$OUT/frames"
WT="$OUT/wt"
FONT="/System/Library/Fonts/SFNS.ttf"

# The app's own caption colours: --text-dim on --bg-panel, dark theme.
INK="0x8b8b93"
PANEL="0x2d2a26"

TAGS=(v1.0.0 v1.1.0 v1.2.0 v1.3.0 v1.4.0 v1.5.0 v1.5.1 v1.5.2 v1.5.3 v1.5.4 v1.5.5 v1.5.6)

mkdir -p "$FRAMES" "$OUT/lib"
RENDERED=()
SKIPPED=()

# EVERY RUN GETS A POPULATED LIBRARY, AND THAT IS NOT A GARNISH.
#
# The first correct render produced TEN BYTE-IDENTICAL FRAMES from v1.0.0 to
# v1.5.4 — not a bug, a finding: with an empty library and no instrument, the
# start screen did not change by a single pixel across those releases. Every
# build was genuinely its own (v1.0.0 reports 460 DOM nodes and 132,911 chars
# of CSS, v1.5.4 reports 471 and 154,104); the extra markup is all modals and
# strips that are not on screen. A timelapse of that is one still image shown
# ten times.
#
# Where the releases visibly differ is where there is CONTENT: slot lists,
# the detail panel, the engine art, parameter rows, the effects chain. So each
# run is seeded with the same library and the frames show the app changing
# rather than the window being empty in fourteen different years.
#
# RULE 7: THIS COPIES, IT NEVER POINTS AT THE ORIGINAL. The same thing
# test/ui/run.js does. A script that can drive the app can save patches, and
# fourteen builds of varying age are exactly what you do not aim at real data.
LIBTEMPLATE="$OUT/libtemplate"
REAL_LIB="/Users/danielspils/Library/Application Support/This Seven Goes to Eleven/Library"
if [ ! -d "$LIBTEMPLATE" ]; then
  mkdir -p "$LIBTEMPLATE"
  cp -R "$REAL_LIB/." "$LIBTEMPLATE/" 2>/dev/null
fi

shoot() { # <srcdir> <outfile> ; returns 0 if a PNG appeared
  local src="$1" out="$2" lib
  lib="$(mktemp -d "$OUT/lib/run-XXXXXX")"
  cp -R "$LIBTEMPLATE/." "$lib/" 2>/dev/null
  ( cd "$src" && \
    SEVEN_NO_DEVICE=1 \
    SEVEN_LIBRARY_DIR="$lib" \
    SEVEN_SHOT="$out" \
    SEVEN_SHOT_DELAY=2600 \
    SEVEN_SHOT_JS="document.documentElement.setAttribute('data-theme','dark'); 'dark'" \
    "$REPO/node_modules/.bin/electron" "$src" ) >"$OUT/lib/last.log" 2>&1
  [ -s "$out" ]
}

# THE EXPLICIT BINARY AND AN EXPLICIT APP PATH, never `npx electron .`.
#
# The first run of this script used npx and reported "12 rendered, 0 skipped"
# — and TEN OF THE TWELVE FRAMES WERE BYTE-IDENTICAL. v1.0.0 and v1.5.0 had
# the same md5. npx was resolving electron somewhere that made `.` mean the
# repo rather than the worktree, so every tag rendered the SAME app and the
# run looked like a complete success.
#
# It was caught by the file sizes being equal to the digit, which is not a
# thing twelve releases of a UI can do. Nothing in the script checked that the
# frames differed, so the check is below now: identical consecutive frames are
# reported rather than quietly assembled into a video that shows one picture
# fourteen times.

# ---- frames 1..12, one per tag -------------------------------------------
for tag in "${TAGS[@]}"; do
  f="$FRAMES/$(printf '%02d' "$((${#RENDERED[@]} + 1))")-$tag.png"
  echo "=== $tag ==="
  # ALREADY SHOT? LEAVE IT. Twelve worktrees and twelve app launches is the
  # expensive half; captioning and assembly are seconds. Re-running to change
  # a caption or a timing should not re-render the app fourteen times.
  if ls "$FRAMES"/[0-9][0-9]-"$tag".png >/dev/null 2>&1; then
    RENDERED+=("$tag (cached)"); continue
  fi
  rm -rf "$WT"
  git -C "$REPO" worktree add --detach "$WT" "$tag" >/dev/null 2>&1 || {
    SKIPPED+=("$tag: worktree add failed"); continue; }

  # THE REPO'S OWN node_modules FIRST, not `npm ci`. Electron 43 is pinned
  # across every tag, so the installed one serves them all — and twelve `npm
  # ci` runs is many minutes of network for a dependency that does not change.
  # npm ci is the FALLBACK, not the first move.
  ln -sfn "$REPO/node_modules" "$WT/node_modules"
  if shoot "$WT" "$f"; then
    RENDERED+=("$tag")
  else
    echo "  symlinked node_modules did not render it; trying npm ci"
    rm -f "$WT/node_modules"
    ( cd "$WT" && npm ci ) >"$OUT/lib/npm-$tag.log" 2>&1
    if shoot "$WT" "$f"; then
      RENDERED+=("$tag (npm ci)")
    else
      SKIPPED+=("$tag: would not build or capture")
      rm -f "$f"
    fi
  fi
  git -C "$REPO" worktree remove --force "$WT" >/dev/null 2>&1
done

# ---- frame 13, the branch in flight ---------------------------------------
# FROM THE MAIN CHECKOUT, which is already on the branch: reading it renders
# the right thing and MOVES NOTHING. A worktree would be a second copy of a
# tree that is already where it needs to be.
BRANCH_FRAME="$FRAMES/99-branch.png"
if [ -s "$BRANCH_FRAME" ]; then RENDERED+=("four-tab-nav-wip (cached)")
elif shoot "$REPO" "$BRANCH_FRAME"; then RENDERED+=("four-tab-nav-wip")
else SKIPPED+=("branch"); fi

git -C "$REPO" worktree prune
echo "worktrees left: $(git -C "$REPO" worktree list | wc -l) (1 = just the repo)"

# ---- DID THE FRAMES ACTUALLY DIFFER? -------------------------------------
# The check that would have caught the npx bug on the first run. A timelapse
# of one picture repeated is the failure this cannot be allowed to report as
# success.
echo "=== distinct frames ==="
md5 -q "$FRAMES"/[0-9]*.png "$FRAMES/99-branch.png" 2>/dev/null | sort | uniq -c | sort -rn | head -3
DISTINCT=$(md5 -q "$FRAMES"/[0-9]*.png "$FRAMES/99-branch.png" 2>/dev/null | sort -u | wc -l | tr -d ' ')
TOTAL=$(ls "$FRAMES"/[0-9]*.png "$FRAMES/99-branch.png" 2>/dev/null | wc -l | tr -d ' ')
echo "$DISTINCT distinct of $TOTAL frames"
[ "$DISTINCT" = "$TOTAL" ] || echo "WARNING: some frames are identical — see above"
printf 'rendered: %s\n' "${RENDERED[*]:-none}"
printf 'skipped: %s\n' "${SKIPPED[*]:-none}"

# =========================================================================
# CAPTION AND ASSEMBLE
# =========================================================================

# ---- frame 0: Crumar's own editor ----------------------------------------
#
# Their captures are full-page scroll shots, not viewport shots — 2110x16384
# for the tallest. Scaled to frame height that is an unreadable ribbon, so it
# is CROPPED to the frame's aspect from the TOP of the page: their logo and
# the first panel. "Seven Editor 5.png" was chosen over 1 (near-identical) and
# 4 (parameter sliders, no branding): the job of a "before" frame is to say
# whose editor this is, and only the branded crop does that.
SRC0="$OUT/source/Seven Editor 5.png"
CROP0="$FRAMES/00-crumar.png"
if [ -f "$SRC0" ]; then
  SW=$(sips -g pixelWidth "$SRC0" | awk '/pixelWidth/{print $2}')
  SH=$(python3 -c "print(int($SW/(2294/1374)))")
  ffmpeg -loglevel error -y -i "$SRC0" -vf "crop=$SW:$SH:0:0,scale=2294:1374" "$CROP0"
fi

# ---- captions ------------------------------------------------------------
#
# THE APP'S OWN: --text-dim on --bg-panel, in the UI font, bottom left. Not a
# drop shadow over the screenshot — a drop shadow is a caption pretending to
# float, and this one is a label sitting on the app's own panel colour.
# TEXTFILE, NOT text='...'. drawtext's own parser treats an apostrophe as a
# quote and swallows it: "Crumar's editor" came out as "Crumars editor" in the
# first assembled video. Escaping it through a shell variable AND ffmpeg's
# filter syntax is two layers of quoting to get wrong; a file has neither.
cap() { # <in> <out> <text>
  local tf; tf="$(mktemp "$OUT/lib/cap-XXXXXX.txt")"
  printf '%s' "$3" > "$tf"
  ffmpeg -loglevel error -y -i "$1" -vf \
    "drawtext=fontfile=$FONT:textfile=$tf:fontcolor=$INK:fontsize=44:x=44:y=h-96:box=1:boxcolor=$PANEL:boxborderw=22" \
    "$2"
  rm -f "$tf"
}
mkdir -p "$FRAMES/capped"
ORDER=()
[ -f "$CROP0" ] && { cap "$CROP0" "$FRAMES/capped/00.png" "Crumar's editor"; ORDER+=("$FRAMES/capped/00.png"); }
i=1
for tag in "${TAGS[@]}"; do
  src=$(ls "$FRAMES"/[0-9][0-9]-"$tag".png 2>/dev/null | head -1)
  [ -n "$src" ] || continue
  out="$FRAMES/capped/$(printf '%02d' "$i").png"
  cap "$src" "$out" "$tag"
  ORDER+=("$out"); i=$((i + 1))
done
if [ -f "$FRAMES/99-branch.png" ]; then
  cap "$FRAMES/99-branch.png" "$FRAMES/capped/99.png" "four-tab-nav-wip — the next release"
  ORDER+=("$FRAMES/capped/99.png")
fi

# ---- assemble ------------------------------------------------------------
# 1.2s a frame, 0.3s crossfade, 2s on the first and last so the before and
# after can be read. yuv420p and even dimensions so it plays everywhere.
N=${#ORDER[@]}
T=0.3
INPUTS=(); FILTER=""; CUM=0
for n in $(seq 0 $((N - 1))); do
  if [ "$n" = 0 ] || [ "$n" = $((N - 1)) ]; then D=2.0; else D=1.2; fi
  INPUTS+=(-loop 1 -t "$D" -framerate 30 -i "${ORDER[$n]}")
  FILTER="${FILTER}[$n:v]scale=2294:1374,setsar=1,fps=30[v$n];"
  CUM=$(python3 -c "print(round($CUM + $D, 3))")
  eval "SUM$n=$CUM"
done
PREV="[v0]"
for n in $(seq 1 $((N - 1))); do
  k=$((n - 1)); S=$(eval echo \$SUM$k)
  OFF=$(python3 -c "print(round($S - $n * $T, 3))")
  LABEL="[x$n]"; [ "$n" = $((N - 1)) ] && LABEL="[out]"
  FILTER="${FILTER}${PREV}[v$n]xfade=transition=fade:duration=$T:offset=$OFF$LABEL;"
  PREV="$LABEL"
done
FILTER="${FILTER%;}"
MP4="$OUT/seven-timelapse.mp4"
ffmpeg -loglevel error -y "${INPUTS[@]}" -filter_complex "$FILTER" -map "[out]" \
  -c:v libx264 -pix_fmt yuv420p -movflags +faststart -r 30 "$MP4"
echo "=== $MP4 ==="
ls -la "$MP4" | awk '{print $5" bytes"}'
ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$MP4"
