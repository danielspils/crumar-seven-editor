# Timelapse — how it was made, and what it shows

`render.sh` builds `out/timelapse/seven-timelapse.mp4`: Crumar's browser
editor, then every shipped tag, then the branch in flight. Everything except
this file and the script is ignored — the frames and the mp4 are build output.

Re-running is cheap: a tag whose frame already exists is left alone, so
changing a caption or a timing re-captions and re-assembles without launching
the app fourteen times.

---

## Frame 0 — which crop was chosen, and why

**`Seven Editor 5.png`, cropped to the frame's aspect from the TOP of the
page.** It gives Crumar's logo over GLOBAL OPTIONS.

Their three captures are full-page scroll shots, not viewport shots —
2140x5826, 2110x16384 and 2110x5870. Scaled to frame height the tallest is an
unreadable ribbon, so each was cropped to 2294:1374 from the top and compared:

| source | top of the page | why not |
|---|---|---|
| `Seven Editor 1.png` | logo + GLOBAL OPTIONS | near-identical to 5, slightly tighter framing |
| `Seven Editor 4.png` | "1. Master", Volume/Bass sliders | the better *editing* surface, but no branding — it could be any app |
| **`Seven Editor 5.png`** | **logo + GLOBAL OPTIONS** | **chosen** |

The job of a "before" frame is to say *whose* editor this is, and only a
branded crop does that. `2.png` and `3.png` are byte-identical duplicates and
were not used.

---

## Which tags rendered

**All twelve, and the branch. Nothing was skipped.** The repo's existing
`node_modules` served every tag — Electron 43 is pinned across all of them —
so the `npm ci` fallback never had to run.

---

## THE FRAMES ARE NOT ALL DIFFERENT, AND THAT IS A RESULT

Thirteen app frames, **five distinct images**:

| frames | state |
|---|---|
| v1.0.0, v1.1.0, v1.2.0, v1.3.0, v1.4.0 | identical |
| v1.5.0, v1.5.1, v1.5.2, v1.5.3 | identical |
| v1.5.4 | its own |
| v1.5.5, v1.5.6 | identical |
| four-tab-nav-wip | its own |

**This is not the render failing.** Each build is genuinely itself — asked to
report its own size, v1.0.0 answers 460 DOM nodes and 132,911 characters of
CSS where v1.5.4 answers 471 and 154,104. The releases in each group changed
things that are not on this screen: modals, the backup runner, audition, the
save flow, protocol work.

**The first correct render was worse: TEN identical frames.** Every run had an
EMPTY library and no instrument, and in that state the start screen did not
change by a single pixel from v1.0.0 to v1.5.4. So every run is now seeded
with the same populated library, which puts slot lists, the detail panel, the
engine artwork, parameter rows and the effects chain on screen — the places
the releases actually differ.

**And the big structural change is branch-only.** The four-tab navigation
exists nowhere in a shipped version: every released build has the two-region
"ON THE SEVEN / ON THIS COMPUTER" layout, so the last frame is the only
structural jump in the sequence.

---

## The library, and Rule 7

Each run gets its **own copy** of the library, from a template copied once
from the real one. Nothing ever points at the original. This is what
`test/ui/run.js` does and the reason is the 2026-09-08 probe that renamed a
sound in Daniel's real library: a script that can drive the app can save
patches, and fourteen builds of varying age are the last thing to aim at real
data. Verified after the pass — the real library is unchanged, 78 files, mtime
untouched.

---

## Window, theme, worktrees

- **2294x1374** every frame — the app's default window (1147x687 content) at
  2x. The default was used rather than `SEVEN_WINDOW_WIDTH`, since the height
  is not settable and the default is identical across tags on this machine.
- **Dark**, forced through `SEVEN_SHOT_JS` setting `data-theme`. Both the
  variable and the attribute exist in every tag back to v1.0.0.
- **`SEVEN_NO_DEVICE=1`** so all fourteen frames show the same connection
  state, and so twelve app launches stay away from an instrument Daniel may
  be playing. Tags predating the flag ignore it and show the offline state
  anyway.
- **A worktree per tag, removed as soon as its frame exists.** `git worktree
  list` reports only the repo at the end. Daniel dogfoods the dev branch and
  his working tree never moved; frame 13 was read from the main checkout,
  which is already on the branch, so nothing was checked out anywhere.

---

## Two bugs this went through, both of which looked like success

**`npx electron .` rendered the repo, not the worktree.** The first run
reported "12 rendered, 0 skipped" and ten of the twelve frames were
byte-identical — v1.0.0 and v1.5.0 had the same md5. It was caught by the file
sizes being equal to the digit, which twelve releases of a UI cannot do.
Fixed by invoking the binary with an explicit app path. The script now ends
with a distinct-frame count, which is the check that would have caught it.

**`drawtext` ate an apostrophe.** "Crumar's editor" assembled as "Crumars
editor": drawtext's own parser reads `'` as a quote. Captions go through
`textfile=` now, which has no quoting layer to get wrong.

---

## The ffmpeg command

Captions, one per frame, in the app's own colours — `--text-dim` `#8b8b93` on
`--bg-panel` `#2d2a26`, system UI font, bottom left, a label on a panel rather
than a drop shadow floating over the screenshot:

```
ffmpeg -i <frame> -vf "drawtext=fontfile=/System/Library/Fonts/SFNS.ttf\
:textfile=<caption>:fontcolor=0x8b8b93:fontsize=44:x=44:y=h-96\
:box=1:boxcolor=0x2d2a26:boxborderw=22" <out>
```

Assembly — 1.2s a frame, 0.3s crossfades, 2s on the first and last, built as a
chain of `xfade` with each offset at `sum(durations so far) - n * 0.3`:

```
ffmpeg -loop 1 -t <d> -framerate 30 -i <frame0> ... \
  -filter_complex "[0:v]scale=2294:1374,setsar=1,fps=30[v0]; ... \
                   [v0][v1]xfade=transition=fade:duration=0.3:offset=1.7[x1]; ..." \
  -map "[out]" -c:v libx264 -pix_fmt yuv420p -movflags +faststart -r 30 \
  seven-timelapse.mp4
```

14 frames, 2.0 + 12x1.2 + 2.0 = 18.4s of holds, minus 13 overlaps of 0.3s =
**14.5s**, which is what the file reports.
