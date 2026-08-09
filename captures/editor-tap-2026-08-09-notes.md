# USB-editor outbound tap — 2026-08-09 (derived record)

Source: `window.__sevenTap` log from the browser hook (tools/capture-hook.js)
armed on the gsidsp.com Seven editor, pasted verbatim into the working session.
This file is a **derived record with verbatim excerpts** — the full 770-row
paste lives in the session transcript. Direction: editor → device only.

## The whole log is one opcode

Every captured frame matches `F0 73 26 14 22 00 00 <id> F7` — the 0x22 value
read — sweeping ids 0x00–0x6D (0–109, all 110 parameters) in ascending order.
Seven sweeps, each completing in ~2ms:

| Sweep start (UTC) | Note |
|---|---|
| 16:34:13.333 | followed 0.88s later by a second full sweep |
| 16:34:14.213 | the doubled companion |
| 16:37:40.547 | |
| 16:38:44.878 | |
| 16:39:48.712 | |
| 16:39:57.096 | followed 2.4s later by another |
| 16:39:59.528 | |

Context: the user was recalling presets from the panel while the editor was
connected. The editor re-syncs after each recall by re-reading the full edit
buffer; some recalls produced two sweeps (trigger unknown — possibly one for
the 0x45 broadcast and one for the CC burst).

Verbatim first rows of the first sweep:

```json
{"t":"2026-08-09T16:34:13.333Z","port":"Crumar Seven","hex":"f0 73 26 14 22 00 00 00 f7"}
{"t":"2026-08-09T16:34:13.333Z","port":"Crumar Seven","hex":"f0 73 26 14 22 00 00 01 f7"}
{"t":"2026-08-09T16:34:13.333Z","port":"Crumar Seven","hex":"f0 73 26 14 22 00 00 02 f7"}
```

…and the last row of the last sweep:

```json
{"t":"2026-08-09T16:39:59.532Z","port":"Crumar Seven","hex":"f0 73 26 14 22 00 00 6d f7"}
```

## What this establishes

1. **The USB editor's post-recall sync = 110 individual 0x22 reads.** The
   manufacturer's own editor uses exactly the read pattern planned for the
   app's backup path. No bulk-dump opcode is used (consistent with the 0x12
   wedge finding).
2. **Negative evidence for 0x72/0x70/0x46:** none appeared during editor
   patch-browsing. As of this date those opcodes remain unobserved across:
   full enumeration, globals, set-param, set-global, panel recalls, incoming
   PC recalls, and editor re-sync traffic. 0x72 ACTION may be exercised only
   via the instrument-hosted Wi-Fi editor over HTTP (see manual-notes.md,
   "TWO different editors") — in which case it will never be observable on
   USB-MIDI.
