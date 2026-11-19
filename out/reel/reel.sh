#!/bin/bash
# Shoot the offline sizzle shots and cut them together.
#
# Each shot is its own RUN, its own frame directory and its own mp4, so one
# bad shot is one re-run rather than a whole reel. The stitched cut exists to
# answer one question — does the motion look right — so it has no captions, no
# music and hard cuts.
#
# THE RIG IS SEVEN_REEL in src/main.js. It captures many frames from ONE
# session while a driving script runs in the page, and it slows the app down
# so 15fps is enough to see a 0.3s transition move. Playback at FPS * SLOWMO
# takes the slowdown back out.
#
# SEVEN_LIBRARY_DIR IS NOT OPTIONAL and main.js refuses without it. A reel
# script drives the app for seconds at a time, which means it can save
# patches — the 2026-09-08 rule, and this hook is the hazard it was written
# for. Every shot gets its own COPY of the library.
set -u

REPO="/Users/danielspils/crumar-seven-editor"
OUT="$REPO/out/reel"
SHOTS="$OUT/shots"
FPS=15
SLOWMO=4
PLAYBACK=$((FPS * SLOWMO))

# THE SAME SEED THE TIMELAPSE USES, and for the reason it learned: with an
# empty library the app has nothing to show, and out/timelapse/render.sh found
# ten byte-identical frames that way. Reuse its template rather than build a
# second one — one copy of the real library, made once, never written to.
LIBTEMPLATE="$REPO/out/timelapse/libtemplate"
REAL_LIB="/Users/danielspils/Library/Application Support/This Seven Goes to Eleven/Library"
if [ ! -d "$LIBTEMPLATE" ]; then
  mkdir -p "$LIBTEMPLATE"; cp -R "$REAL_LIB/." "$LIBTEMPLATE/" 2>/dev/null
fi

mkdir -p "$OUT/frames" "$OUT/lib"

shoot() { # <name> <script>
  # SEPARATE STATEMENTS. `local a="$1" b="$OUT/$a"` reads the second from the
  # first in the same declaration, which under `set -u` is an unbound
  # variable, not a value — the whole rig died on line 40 with exactly that.
  local name="$1"
  local js="$2"
  local dir="$OUT/frames/$name"
  local lib="$OUT/lib/$name"
  rm -rf "$dir" "$lib"; mkdir -p "$dir" "$lib"
  cp -R "$LIBTEMPLATE/." "$lib/" 2>/dev/null
  echo "=== $name ==="
  ( cd "$REPO" && \
    SEVEN_NO_DEVICE=1 \
    SEVEN_LIBRARY_DIR="$lib" \
    SEVEN_REEL="$dir" \
    SEVEN_REEL_JS="$js" \
    SEVEN_REEL_FPS=$FPS \
    SEVEN_REEL_SLOWMO=$SLOWMO \
    SEVEN_REEL_ARM=1 \
    "$REPO/node_modules/.bin/electron" "$REPO" ) 2>&1 | grep -E '^\[reel'
  local n; n=$(ls "$dir"/*.png 2>/dev/null | wc -l | tr -d ' ')
  echo "  frames on disk: $n"
  # PLAYED BACK AT FPS * SLOWMO, which is what undoes the slow motion. Shot at
  # 15 and played at 60, a 0.3s transition is 18 frames of real-time movement
  # instead of 4 of teleporting.
  ffmpeg -loglevel error -y -framerate $PLAYBACK -pattern_type glob -i "$dir/*.png" \
    -c:v libx264 -pix_fmt yuv420p -movflags +faststart -r $PLAYBACK "$OUT/$name.mp4"
}

shoot a-tabs      "$SHOTS/a-tabs.js"
shoot b-dashboard "$SHOTS/b-dashboard.js"
shoot c-fx        "$SHOTS/c-fx.js"
shoot d-carousel  "$SHOTS/d-carousel.js"

# ---- THE CRUMAR RIP, ffmpeg only, no app ---------------------------------
#
# Their tallest capture is 2110x16384 — a full-page scroll shot. A crop window
# the reel's shape travelling top to bottom reads as "this goes on forever",
# which is the point of putting it next to a dashboard. Fast: two seconds.
RIP_SRC="$REPO/out/timelapse/source/Seven Editor 4.png"
if [ -f "$RIP_SRC" ]; then
  SW=$(sips -g pixelWidth "$RIP_SRC" | awk '/pixelWidth/{print $2}')
  SH=$(sips -g pixelHeight "$RIP_SRC" | awk '/pixelHeight/{print $2}')
  WINH=$(python3 -c "print(int($SW/(2294/1374)))")
  TRAVEL=$((SH - WINH))
  DUR=2
  ffmpeg -loglevel error -y -loop 1 -framerate $PLAYBACK -t $DUR -i "$RIP_SRC" \
    -vf "crop=$SW:$WINH:0:'min(t/$DUR,1)*$TRAVEL',scale=2294:1374,setsar=1,fps=$PLAYBACK" \
    -c:v libx264 -pix_fmt yuv420p -movflags +faststart "$OUT/crumar-rip.mp4"
  echo "=== crumar-rip: ${SW}x${SH}, window ${SW}x${WINH}, travel ${TRAVEL}px in ${DUR}s ==="
fi

# ---- the cut --------------------------------------------------------------
# Hard cuts only. This is a pacing check, not a trailer.
LIST="$OUT/cut.txt"; : > "$LIST"
for m in a-tabs b-dashboard c-fx d-carousel; do
  [ -f "$OUT/$m.mp4" ] && echo "file '$OUT/$m.mp4'" >> "$LIST"
done
ffmpeg -loglevel error -y -f concat -safe 0 -i "$LIST" -c copy "$OUT/offline-cut.mp4"

echo
echo "=== results ==="
for m in a-tabs b-dashboard c-fx d-carousel crumar-rip offline-cut; do
  f="$OUT/$m.mp4"; [ -f "$f" ] || continue
  printf '%-14s %8s bytes  %ss\n' "$m" "$(stat -f%z "$f")" \
    "$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$f")"
done
