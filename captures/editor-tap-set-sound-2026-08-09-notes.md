# Editor tap — set-sound (`0x46`) capture, 2026-08-09

Outbound editor→device frames from the browser tap (`tools/capture-hook.js`) on
gsidsp.com, FW 1.37. Device replies for the same window are in
`set-sound-2026-08-09T19-53-37.jsonl` (passive recorder, `tools/listen.js`).

The tap's hex formatter in this round printed the parameter *value* byte in
decimal (a formatter inconsistency in the snippet as pasted); the frames below
are reproduced exactly as logged. Header/opcode/id bytes are hex.

## Round 1 — reset test (drag `rho_atk` to max, switch away and back)

Attack Level drag on the editor's EDIT PIANO page — ordinary `0x20` writes to
param id 1 (`rho_atk`), value ramping to 127 (value byte logged in decimal):

```
2026-08-09T19:57:09.391Z  f0 73 26 14 20 00 00 01 77 f7
2026-08-09T19:57:09.495Z  f0 73 26 14 20 00 00 01 78 f7
2026-08-09T19:57:09.504Z  f0 73 26 14 20 00 00 01 79 f7
2026-08-09T19:57:09.521Z  f0 73 26 14 20 00 00 01 82 f7
2026-08-09T19:57:09.537Z  f0 73 26 14 20 00 00 01 86 f7
2026-08-09T19:57:09.545Z  f0 73 26 14 20 00 00 01 90 f7
2026-08-09T19:57:09.554Z  f0 73 26 14 20 00 00 01 93 f7
2026-08-09T19:57:09.562Z  f0 73 26 14 20 00 00 01 96 f7
2026-08-09T19:57:09.571Z  f0 73 26 14 20 00 00 01 100 f7
2026-08-09T19:57:09.579Z  f0 73 26 14 20 00 00 01 105 f7
2026-08-09T19:57:09.587Z  f0 73 26 14 20 00 00 01 109 f7
2026-08-09T19:57:09.595Z  f0 73 26 14 20 00 00 01 113 f7
2026-08-09T19:57:09.604Z  f0 73 26 14 20 00 00 01 117 f7
2026-08-09T19:57:09.613Z  f0 73 26 14 20 00 00 01 121 f7
2026-08-09T19:57:09.621Z  f0 73 26 14 20 00 00 01 125 f7
2026-08-09T19:57:09.629Z  f0 73 26 14 20 00 00 01 127 f7
2026-08-09T19:57:09.637Z  f0 73 26 14 20 00 00 01 127 f7
2026-08-09T19:57:09.912Z  f0 73 26 14 20 00 00 01 127 f7
```

Then the two SELECT PIANO clicks (away to Reed, back to Tine):

```
2026-08-09T19:57:19.480Z  f0 73 26 14 46 01 f7      → Reed Piano
2026-08-09T19:57:25.722Z  f0 73 26 14 46 00 f7      → Tine Piano
```

Read-back ~10 minutes later (our own `0x22` probe, reply in the listener capture
and reproduced here because it is the reset-test verdict):

```
→ f0 73 26 14 22 00 00 01 f7
← f0 73 26 14 23 00 31 7c 72 68 6f 5f 61 74 6b 7c 31 32 37 7c 31 32 37 f7
                        "1|rho_atk|127|127"
```

`rho_atk` was still 127 on the device after Tine→Reed→Tine. **Sound changes do
not reset engine parameters.**

## Round 2 — sampled sounds (two-digit ids)

```
2026-08-09T20:05:27.799Z  f0 73 26 14 46 15 f7      → 21, Venice Grand
2026-08-09T20:05:30.207Z  f0 73 26 14 46 16 f7      → 22, Venice Upright U1 Felt
2026-08-09T20:05:33.148Z  f0 73 26 14 46 17 f7      → 23, Venice Upright U1
```

Sound names above come from the device's `0x47` replies in the listener capture
and match `schema/seven-1.37.json`'s interrogated sound table exactly.

## Observations

- `0x46` payload is **one binary byte**, no `0x00` pad (id 0 arrived as `0x00`,
  not ASCII `0x30`; ids 21–23 fit the same single byte).
- The editor sent **no re-sync sweep** after `0x46` — no `0x22` reads followed
  either switch, so the editor UI's parameter display can go stale after a
  sound change.
