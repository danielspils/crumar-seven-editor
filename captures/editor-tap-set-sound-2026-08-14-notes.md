# Editor tap — set-sound (`0x46`) zero-based proof, 2026-08-14

Outbound editor→device frames from the browser tap (`tools/capture-hook.js`) on
gsidsp.com/Seven, SELECT PIANO and EDIT PIANO pages, FW 1.37. Raw log:
`editor-tap-set-sound-2026-08-14.json`, 308 frames.

**Outbound only.** No `tools/listen.js` session was running, so the device's
replies — the `0x45`/`0x47` pair after each `0x46`, and every `0x23` answering
the reads below — are NOT in this capture. Anything here that depends on what
the instrument said rests on what the editor displayed, and is marked as such.

What was clicked, in order: **Clavi, then Tine** (the zero-based proof); **all
24 sounds top to bottom** (the sweep); then **Metallic dragged up and back to
0 on Tine, to Clavi, back to Tine**.

## READ THIS BEFORE TAKING ANY VALUE OUT OF THIS FILE

In `20 00 00 <id> <value>` frames the **value token is DECIMAL** while every
other token is hex. Metallic's ramp reads `11 12 13 15 19 … 85 … 03 00`, and
across all 59 write frames not one value token contains a hex digit `a`–`f`.
Read as hex the peak would be `0x85` = 133, which cannot travel in SysEx at all
(data bytes are 7-bit, 0–127).

The cause is in the tap, and it is reproducible:

```
b.toString(16)   where b is the number 85   → "55"
b.toString(16)   where b is the string "85" → "85"     ← radix ignored
```

`String.prototype.toString` takes no radix, so a string element passes through
the formatter unconverted and lands in the log as its decimal text. The editor
builds that byte from a string — a slider's `.value`, most likely — and
`Uint8Array.from(["85"])` still puts **85 decimal** (`0x55`) on the wire, so the
frame itself is correct. Only the log is mixed-base.

The 9 Aug capture recorded the same quirk without explaining it
(`editor-tap-set-sound-2026-08-09-notes.md`: "the tap's hex formatter in this
round printed the parameter *value* byte in decimal"). This is the mechanism.
Fixing the snippet would mean coercing with `Number(b)` before formatting —
deliberately not done here, because Rule 5 says the raw stays raw, and the
frames are already logged.

So: **Metallic went 0 → 85 → 0 in device units** (`rho_met`, id 5, max 127).

## 1. Zero-based, proved directly

```
19:54:55.644  f0 73 26 14 46 03 f7     click Clavi Piano  → id 3
19:54:57.186  f0 73 26 14 46 00 f7     click Tine Piano   → id 0
```

The id in the payload is the sound's own id, zero-based. This does not lean on
the page's list order, on what was active before, or on `0x00` being binary
rather than ASCII — the two clicks name two sounds and the two frames carry
their two ids.

## 2. The sweep is COMPLETE — 24 frames, and re-clicking sends

Clicking all 24 sounds top to bottom produced **24** frames, `46 00` through
`46 17`, contiguous with no gap:

```
19:55:03.832  46 00      19:55:19.390  46 0a      19:55:31.561  46 12
19:55:05.657  46 01      19:55:20.932  46 0b      19:55:33.110  46 13
19:55:07.349  46 02      19:55:22.911  46 0c      19:55:34.477  46 14
19:55:09.065  46 03      19:55:24.320  46 0d      19:55:35.973  46 15
19:55:10.425  46 04      19:55:25.653  46 0e      19:55:37.952  46 16
19:55:12.290  46 05      19:55:27.119  46 0f      19:55:39.519  46 17
19:55:13.239  46 06      19:55:28.860  46 10
19:55:14.590  46 07      19:55:30.588  46 11
19:55:16.508  46 08
19:55:17.840  46 09
```

Note the first sweep frame: `46 00` at 19:55:03, when **Tine was already active**
from the click six seconds earlier. **Re-selecting the active sound still sends
a frame.** An earlier account of this session claimed 23 frames with the first
one absent because the instrument powers on at 1-1 already holding Tine; the log
says otherwise, and that reasoning must not be carried forward. It was a missed
click in the retelling, not device behaviour. The encoding conclusion is
unaffected.

## 3. Retention across a sound change — device-side

```
19:56:02.467 → 19:56:03.327   59 × 20 00 00 05 <value>    Metallic 0 → 85 → 0
19:56:12.136                  46 03                       to Clavi
19:56:14.403                  46 00                       back to Tine
19:56:19.693 → .698           110 × 22 00 00 <id>         full re-read, ids 00–6d
```

**Nothing sits between the two `0x46` frames** — no `0x20`, nothing at all. The
editor then read all 110 parameters back and displayed Metallic as 0. The value
therefore survived the round trip on the DEVICE; the page had asked for it
afresh rather than redrawn a cache.

Daniel's session note, worth keeping because it is stronger than the log alone:
Metallic was **already at 0 on arrival**, carried over from an earlier session
that included a full browser reload. It survived the editor being torn down and
rebuilt, so it was held on the instrument, not in the page. He dragged it up and
back to 0 anyway so that the writes appear here.

## 4. OPEN QUESTION — what triggers the 110-parameter read sweep

Two full sweeps of `22 00 00 <id>`, ids `00`–`6d` (110 reads, ~5 ms each):

```
19:55:59.066 → .071    1.3 s after the 46 00 at 19:55:57.765
19:56:19.693 → .698    5.3 s after the 46 00 at 19:56:14.403
```

An earlier account of this session said no `0x22` reads follow a `0x46`. That is
wrong for this capture: both sweeps land shortly after a sound change.

But **both also land right after navigating to the EDIT PIANO page**, so this
capture cannot separate "the editor re-reads after a sound change" from "the
editor re-reads when the edit page loads". Outbound frames alone cannot answer
it — the page's own navigation is not on the wire. Marked UNKNOWN rather than
decided. Resolving it needs one sound change made **without** leaving the edit
page, with `tools/listen.js` running.

The app does not depend on the answer: it reads back what it needs rather than
trusting a cached view.
