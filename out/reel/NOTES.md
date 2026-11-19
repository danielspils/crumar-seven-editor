# The reel rig — how it works, and the three things that were wrong first

`SEVEN_REEL` in `src/main.js` captures many frames from ONE running session
while a driving script works the app. `out/reel/reel.sh` shoots the four
offline shots and cuts them together. Everything except the rig, the shot
scripts and this file is build output and stays ignored.

```
SEVEN_REEL=<dir>         0001.png, 0002.png, … written here
SEVEN_REEL_JS=<path>     the driving script, same shape as a UI scenario
SEVEN_REEL_FPS=15        capture rate
SEVEN_REEL_SLOWMO=4      how much to slow the app's own motion
SEVEN_REEL_ARM=1         wait for the script to say `[reel-arm]` before capturing
```

**It refuses to start without `SEVEN_LIBRARY_DIR`**, the same refusal
`SEVEN_UI_TEST` takes and for the same reason: a script that drives the app
for seconds at a time can save patches. This hook is exactly the hazard the
2026-09-08 rule was written for. Every shot gets its own copy of the library.

---

## THE SLOW-MOTION TRICK, AND IT TOOK THREE GOES

The card stack's transition is 0.3s. At 15fps that is four frames and reads as
teleporting. So the app is slowed and the video is sped back up — net result,
smooth motion with nothing shipped changed.

**MEASURED, against the stack's known 0.3s:**

| SLOWMO | the shipped 0.3s takes |
|---|---|
| 1 (control) | **308ms** |
| 4 | **1201ms** |

Exactly 4x. The verification shot is `shots/verify-slowmo.js`; it times the
real transition rather than a synthetic one.

**What did NOT work, both of which looked plausible:**

1. **Web Animations `playbackRate`.** CSS transitions are real Animation
   objects in `document.getAnimations()`, and setting `playbackRate = 0.25`
   on them is accepted — it reads back as 0.25 — **and does not retime the
   transition**. Measured by hand on all five of the stack's running
   transitions: 347ms against an untouched 348ms. Chromium takes the value
   and ignores it for a CSSTransition.
2. **Scaling the CSS durations alone.** That worked on the CSS and broke the
   app: the transition became 1200ms while `app.js`'s own `TURN_MS` stayed at
   300, so the turn ENDED and re-rendered a quarter of the way through,
   **cancelling** the transitions. The tell was animations reporting
   themselves as 1200ms and finishing in 348 — the signature of a
   cancellation rather than a completion.

**What works is both halves together:** each element's computed
`transition-duration`, `animation-duration` and the matching delays are
multiplied element by element — scaled, not replaced, so the 140ms chevron,
the 180ms tray and the 300ms stack stay in proportion — **and**
`setTimeout`/`setInterval` are multiplied by the same factor so the app's own
sequencing keeps step with its own motion. A MutationObserver re-applies the
scaling after every render, because the detail pane replaces its contents
wholesale and the replacements arrive at shipped speed.

That also stretches the driving script's `ui.sleep`, which is the point: the
same gesture is captured in 4x as many frames and ffmpeg plays them back at
`FPS * SLOWMO` = 60fps. **Sleeps in the shot scripts are written in SHIPPED
time** — what a viewer should feel — and the rig does the stretching.

**`prefers-reduced-motion` is OFF on this machine** (checked in the page, not
assumed). The rig warns on stderr if it is ever on, because there would be no
motion to shoot.

---

## Captured vs skipped

`capturePage()` is slower than 15fps asks for, so a tick arriving while one is
in flight is **skipped and counted** rather than queued — an unbounded queue
drifts further behind all run and makes the timings a fiction.

| shot | captured | skipped | duration |
|---|---|---|---|
| a-tabs | 142 | **0** | 2.37s |
| b-dashboard | 150 | **0** | 2.50s |
| c-fx | 100 | **0** | 1.67s |
| d-carousel | 142 | **0** | 2.37s |

Nothing was skipped in any shot, so the timings above are what was actually
captured.

---

## The shots

**Each is its own run, frame directory and mp4**, so one bad shot is one
re-run.

- **a-tabs** — Seven → Patches → Setlists → Backups → Seven, each landing
  before the next.
- **b-dashboard** — five patches **chosen by the sound they name**, not
  alphabetically: Clavi Piano, MKS Synth Piano, Venice Upright K8, Tine Piano,
  Combo Piano. Four patches of one sound relight almost nothing — same engine
  group, same artwork, same rows — so grouping by sound is what makes the
  panel visibly change.
- **c-fx** — FX1 and Amp Simulator near the top, Expression Pedal at the
  bottom, opened then closed. The bottom one also shows the pane travelling to
  the tray, which is the anchoring behaviour added 18 Nov.
- **d-carousel** — the stack hovered open, then three turns forward and two
  back. Offline it marks itself unverified, which is the app being honest and
  is left alone.

**ARMING.** Every shot needs setup — open the library, select a patch, wait
for the pane — and capturing from frame one put seconds of nothing at the head
of a two-second clip. A script logs `[reel-arm]` when its setup is done and
capture starts there. Scripts that say nothing are captured from the
beginning. The signal travels by `console-message` rather than polling the
page, because asking the renderer for a flag every tick is an IPC round trip
per frame and the ticks already compete with `capturePage`.

---

## A bug in shot B worth keeping

It first reported `distinctSounds: 1` and shot a single click. The sound is in
`.lib-origin`; the selector read `.patch-sound`, **which exists on every row
and is empty**. So every row keyed to `""`, the seven patches collapsed into
one group, and the "fall back to the row's text" guard never fired because
`cell ? cell.textContent : …` saw a present element.

**An empty element is not a missing one.** Each candidate selector is tried in
turn now and the first non-empty one wins.

(The flat Patches list holds **7** patches, not 78 — the library's other files
are setlists and backups.)

---

## The Crumar rip — ffmpeg only, no app

Their tallest capture is **2110x16384**, a full-page scroll shot. A crop
window the reel's shape travels top to bottom across **15,121px in 2 seconds**,
which reads as "this goes on forever". Same dimensions and frame rate as the
app shots so it cuts straight in.

```
ffmpeg -loop 1 -framerate 60 -t 2 -i "Seven Editor 4.png" \
  -vf "crop=2110:1263:0:'min(t/2,1)*15121',scale=2294:1374,setsar=1,fps=60" \
  -c:v libx264 -pix_fmt yuv420p crumar-rip.mp4
```

---

## Housekeeping

- **`git worktree list` shows only the repo.** The reel needs no worktrees —
  every shot runs the working tree as it stands.
- **The real library is unchanged**: 78 files, mtimes untouched. Shots run
  against copies of `out/timelapse/libtemplate`, which is itself a copy.
- **676 unit tests pass** with the `SEVEN_REEL` hook in `main.js`.
- `reel.sh` died once on `local name="$1" dir="$OUT/.../$name"` — under
  `set -u` the second reads the first before it is bound. Separate statements
  now.
