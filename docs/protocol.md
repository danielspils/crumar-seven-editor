# Crumar Seven — SysEx protocol

Derived by interrogating the device directly (firmware **v1.37, build Thu May 12 15:43:17 2022**)
over class-compliant USB-MIDI. Every fact below was observed in a live request/response, not
inferred. Opcode names are the manufacturer's own constant names, read from the editor's
protocol module; no manufacturer code was copied.

## Frame

```
F0 73 26 14 <opcode> <payload…> F7
   └──┬──┘ └┬┘
      │     └─ product ID 0x14
      └─────── manufacturer ID 0x73 0x26
```

## Opcodes

Requests and replies pair as `n` / `n+1`.

| RQ | RP | Meaning |
|----|----|---------|
| `0x10` | `0x11` | Max parameter ID |
| `0x12` | `0x13` | All parameter specs (streamed) |
| `0x14` | `0x15` | Parameter spec, one |
| `0x20` | `0x21` | Set parameter value |
| `0x22` | `0x23` | Get parameter value |
| `0x30` | `0x31` | Set global |
| `0x32` | `0x33` | Get globals |
| `0x40` | `0x41` | Max sound |
| `0x42` | `0x43` | Sound specs |
| `0x44` | `0x45` | Current sound |
| `0x46` | `0x47` | Set sound |
| `0x70` | `0x71` | String |
| `0x72` | `0x73` | Action |

## Addressing

Parameter IDs are sent as **two 7-bit bytes, MSB first**, preceded by a `0x00` byte:

```
F0 73 26 14 14 00 <idHi> <idLo> F7      request spec for parameter <id>
F0 73 26 14 22 00 <idHi> <idLo> F7      request current value
```

`idHi = (id >> 7) & 0x7F`, `idLo = id & 0x7F`.

Verified: max parameter ID replies `F0 73 26 14 11 00 00 6E F7` → **0x6E = 110**.

> IDs 0–109 are real. **ID 110 is a sentinel** — it returns a malformed spec with a garbage
> key/label and nonsense numeric fields. Enumerate 0–109 and stop.

## Writing a parameter value (`0x20`) — verified

Captured from the editor dragging Master Volume (`veq_vol`, ID 68 = `0x44`) across its
full range:

```
F0 73 26 14 20 00 <idHi> <idLo> <value> F7      set parameter <id> to <value>
```

Same `0x00, idHi, idLo` addressing as the read requests, then a **single value byte**
(0–max; no MSB/LSB split, writes clamp at max). Each write drew a `0x23` reply echoing the
new value, confirmed across a full 0→127 drag. This frame is **verified**, not inferred.

### Get-value reply (`0x23`) — verified; 4 fields, the 4th is the DISPLAY STRING

The reply is FOUR fields, `id|key|value|display` — the 4th is the device's own
human-readable rendering of the value: a decimal string for continuous params, a **text
label for enums and switches**. Pinned 2026-08-09 across two sessions' captures
(`captures/action-export-2026-08-09*.jsonl` holds full sweeps):

```
1|rho_atk|64|064            continuous: zero-padded decimal
0|rho_tp|8|Default e.piano  enum: label
75|fx1_md|0|Mono Tremolo    enum: label
73|veq_byp|1|Bypass ON      switch: label (and confirms the inversion semantics)
91|amp_mo|1|AC              enum: label
```

**The device labels its own enum values** — and the enum-labels open item was CLOSED
this way the same day: a snapshot/sweep/restore pass over all 20 params with `max <= 9`
harvested every label (`captures/enum-label-sweep-2026-08-09-notes.md`; labels merged
into the schema, no `valuesUnverified` flags remain). Notable corrections vs the old
manual-derived guesses: `zd6_ab`/`zd6_cd` were inverted (0 = "B"/"D"), `amp_mo` 3 is
"RJC", `fx2_md` labels carry no "Stereo" prefix.

## Payloads are ASCII

Replies carry pipe-delimited ASCII text, not packed binary. This is the single most useful
property of the protocol: **the device describes itself.**

### Parameter spec (`0x15`)

```
<id>|<group>|<key>|<label>|<cc>|<max>|<value>|<flag>
3|pno_rho|rho_hrd|Hammer Hardness|-1|127|64|0
```

| Field | Meaning |
|---|---|
| `id` | Parameter ID, 0–109 |
| `group` | Section — `pno_*` engine, `efx_*` effect, `pdl_exp` pedal |
| `key` | Stable internal identifier — use this as your schema key, not the label |
| `label` | Display string |
| `cc` | Assigned MIDI CC, or `-1` if unassigned |
| `max` | Maximum value; minimum is 0 throughout |
| `value` | Current value at time of query |
| `flag` | **`1` = fixed panel CC** (cannot be reassigned); **`0` = user-assignable** CC slot |

**`flag` — verified across a full 0–109 enumeration, and confirmed by the manufacturer's
documentation.** It is `1` for exactly the 22 parameters carrying a fixed panel CC (`veq_*`,
`fx1_*`, `fx2_*`, `amp_sw`, `amp_dr`, `rev_sw`, `rev_lv`, `rev_dc`, `pad_*`) and `0` for all
others. The manual states that parameters accessible from the physical panel have pre-assigned
fixed CC numbers that cannot be changed, while all other parameters are unassigned by default
and freely assignable — and its fixed-CC table lists **exactly these 22**. Observation and
manufacturer documentation agree. A `flag=0` slot may still hold a live CC assignment — see
`pdl_exp` below. Per-parameter values are in the schema.

The ASCII text of a `0x15` reply is preceded by a leading `0x00` pad byte (strip it before
parsing the first field). Same for the `0x33` globals reply.

Values are plain 0–max in a single byte. **No MSB/LSB split anywhere.** Writes clamp at max
rather than wrapping.

### Sound spec (`0x42`/`0x43`) — addressing verified 2026-08-09

Request addressing is a `0x00` pad plus a **single binary id byte** — NOT the two-byte
param addressing (`captures/probe-sound-table-2026-08-09-notes.md`):

```
→ F0 73 26 14 42 00 <id> F7
← F0 73 26 14 43 <id> <ascii "id|sampled|name"> F7    e.g. 43 15 "21|1|Venice Grand"
```

`sampled` is `0` for a modeled engine, `1` for a GSP-01 sample set. Sound count depends on
installed expansions — this unit reports 24 (8 modeled + 16 sampled).

- The reply echoes the **binary id** before the ASCII triple — match on it.
- An **out-of-range id echoes back with an empty name** (`42 00 18` → `"24|0|"`), which is
  the termination rule for enumerating the table without touching `0x40`.
- Misframings observed: param-style `42 00 <hi> <lo>` reads the byte after the pad as the
  id (extras ignored — `42 00 00 17` returned sound 0); no pad (`42 15`) gets an empty
  `0x43`.

### Max sound (`0x40`) — triggers the full self-description dump

A bare `F0 73 26 14 40 F7` answers with `41 <binary count> <ascii first digit>` (mirroring
the `0x45` shape) and then, unprompted, streams **all sound specs (`0x43`), the max param
id (`0x11`), and the entire 110-parameter spec stream (`0x15` frames, each with a trailing
`0x0A`)**. This dump is how the manufacturer's editor syncs on page load. For a plain
sound-table read, prefer enumerating `0x42` per id — deterministic and quiet.

### Current sound (`0x45`) — returns the active sound ID

Reply to `0x44`. **Also broadcast unsolicited on every preset recall** — panel recall and
incoming Program Change alike — **and on every `0x46` sound change** (the latter without
the CC burst; see the set-sound section below). Captured live 2026-08-09, FW 1.37; raw
frames in `captures/pc-recall-*.jsonl` and `captures/pc-receive-*.jsonl`:

```
F0 73 26 14 45 <soundId> <digit> F7
```

- `soundId` — binary sound ID of the recalled preset's sound. Verified: recalling three
  sampled presets emitted 22/20/19, and a `0x44` read immediately after returned 19.
- `digit` — one ASCII character. Across all captured frames it equals the **first
  decimal digit of `soundId`** ('0'–'3' for ids 0–3, '1' for 10/19, '2' for 20/22/23;
  further confirmed on `0x46` sound changes — ids 21/22/23 all broadcast '2').
  Looks like a truncated ASCII rendering of the id; meaning not pinned. It is NOT the
  preset number (presets 6/7/8 emitted '2','2','1').
- **Bank and preset number are NOT in the frame.** Preset 1 of banks 1, 2 and 3 produced
  byte-identical frames.

Each recall is immediately followed by a burst of the **22 fixed panel CCs** (`flag=1`
set, ID order — CC 7, 12–16, 20–33, 91, 92) carrying the recalled preset's values, then a
doubled `B0 01` (mod wheel) pair — unexplained. **No Program Change is emitted.**

### Panel-owned parameters: the six Clavi tabs — verified 2026-08-11

The Clavinet tab switches (`zd6_br` Brilliant, `zd6_tr` Treble, `zd6_md` Medium,
`zd6_sf` Soft, `zd6_cd` Pickup C/D, `zd6_ab` Pickup A/B) behave differently from every
other parameter. All six are `flag=0, cc=-1` in the schema — they are NOT among the 22
fixed panel CCs — and two live tests pin down what that means:

**They mirror the physical switches.** A 30-second poll of all six while the tabs were
flipped by hand: every one tracked the panel, with no write from the app.

```
start zd6_br=1 zd6_tr=1 zd6_md=1 zd6_sf=1 zd6_cd=1 zd6_ab=1
+10.9s zd6_br: 1 -> 0        (all six switched off, in panel order)
+11.5s zd6_tr: 1 -> 0
+12.0s zd6_md: 1 -> 0
+12.4s zd6_sf: 1 -> 0
+12.9s zd6_cd: 1 -> 0
+13.2s zd6_ab: 1 -> 0
+13.8s zd6_ab: 0 -> 1        (and back on, in reverse order)
...
+15.9s zd6_br: 0 -> 1
```

The ~0.5s spacing is the poll cycle (six reads at ~90ms each), not the device.

**A write is accepted and sticks, but the sound follows the tab.** Writing `zd6_br=0`
while the tab is physically on: the `0x23` echoes 0, a read returns 0, and it is still 0
after 900ms — the panel does not overwrite it. But the instrument keeps sounding as the
tab says. A normal engine parameter (`rho_atk`) and the Clavi damper lever (`zd6_lv`)
behave conventionally under the same test.

`zd6_lv` (Damper Lever) is NOT one of them: it takes a write normally.

**Established, and the question below is now closed:**

1. **They mirror the panel.** The poll above tracked all six as the tabs were flipped by
   hand, with no write from the app.
2. **Nothing announces them.** `flag=0, cc=-1` — they are not among the 22 panel CCs, so
   the only way to follow them is to poll.
3. **A write sticks.** `zd6_br` set to 0 read back 0 at 200ms, 600ms, 1.2s, 2s, 3s, 5s and
   8s. The panel does not overwrite it.
4. **A write REACHES THE AUDIO — verified 2026-08-11.** Setting all four filter tabs to 0
   from the app, while the tabs were physically on, silenced the instrument; setting them
   back to 1 from the app restored the sound. The manual states that all four off produces
   no sound, and the instrument agreed in both directions. So these six are ordinary
   writable parameters that happen to mirror hardware switches, not read-only reports of
   them.

   Both halves matter: silence alone could have been something else failing, and only the
   return of sound proves the app put it back.

The earlier report that "the software controls don't work" was a UI defect, not the
device: `pointer-events: none` on the switch wrapper meant a real mouse click never
reached the control, so nothing was ever sent. Recorded because it cost two rounds of
investigating the instrument for a bug that was in a stylesheet.

**Consequence for the app:** these can be set like any other parameter, and are followed
by polling because the device will not tell us when a hand moves one.

### `0x46` again, pinned zero-based — second capture, 2026-08-14

The frame was first captured 2026-08-09 (the section below). This is an independent
second capture from the same page, and it settles what the first left inferred. Raw
frames: `captures/editor-tap-set-sound-2026-08-14.json`, decoded in
`captures/editor-tap-set-sound-2026-08-14-notes.md`.

**Outbound only** — no listener was running, so the `0x45`/`0x47` replies and every
`0x23` are absent from this capture. Claims below that need the device's answer say so.

**Frame.** `F0 73 26 14 46 <sound-id> F7` — one payload byte, no checksum, and no
terminator of its own beyond the SysEx `F7`.

**The payload is the sound ID, zero-based, observed directly:** clicking *Clavi Piano*
emitted `46 03`, clicking *Tine Piano* emitted `46 00`. That does not lean on the page's
list order, on what was active before, or on the 9 Aug argument from `0x00` being binary
rather than ASCII `'0'`. Two clicks, two named sounds, two ids.

**The 24-sound sweep is complete: `46 00` through `46 17`, contiguous.** And the first
sweep frame is `46 00` sent while Tine was *already* the active sound, six seconds after
being selected — so **re-selecting the active sound still emits a frame**. The editor
does not suppress a no-op change. (An earlier account of this session reported 23 frames
with the first suppressed because the instrument powers on at 1-1 holding Tine; the log
contradicts it — that was a missed click in the retelling. Recorded because the
suppression story is plausible enough to be repeated.)

**Engine parameters survive a sound change — now shown from the device side.** Metallic
(`rho_met`, id 5) was dragged 0 → 85 → 0, the sound switched to Clavi and back, and the
two `0x46` frames have **nothing between them** — no `0x20`, no traffic at all. The
editor then re-read all 110 parameters and displayed Metallic as 0, so the value was held
by the instrument rather than redrawn from the page's cache. The 9 Aug entry reached the
same conclusion from a single `0x22` read-back; this rules out the editor having quietly
repaired the value.

Stronger still, and outside the log: Metallic was already 0 when the session began,
carried across a full browser reload — the editor was destroyed and rebuilt and the value
was still there.

The picture both captures point at: the edit buffer holds all 110 parameters at once,
each modeled sound has its own group within them, and `0x46` selects which group is
audible rather than loading anything.

**OPEN: what triggers the 110-parameter read sweep.** Two full `0x22` sweeps (ids `00`–
`6d`) appear in this capture, 1.3 s and 5.3 s after a `0x46`. They also fall immediately
after navigating to the EDIT PIANO page, and outbound frames cannot separate the two
causes — page navigation leaves no trace on the wire. So "the editor re-reads after a
sound change" is UNKNOWN, not established, and an earlier claim in the other direction
("no `0x22` follows a `0x46`") is withdrawn. To settle it: change a sound without leaving
the edit page, with `tools/listen.js` running.

**Consequence for sending.** Send ordering does not matter, because nothing is reset.
`src/patch-sender.js` sends the sound first and its header says "order matters and is
device-verified"; the ordering is in fact free, and that instruction was a precaution
against a reset that does not happen. Sending sound-first stays harmless — this is a
comment that overclaims, not a behaviour to change.

**Unchanged caution: the sound id is unit-specific.** Ids move with installed expansions,
so a patch's sound NAME is resolved against the connected instrument's own sound table
before sending and a stored id never goes on the wire — `resolveSoundId` in the sender.

**Reading the raw file:** in `0x20` write frames the value token is DECIMAL while every
other token is hex, because the tap's formatter calls `.toString(16)` on a value the page
supplies as a string and `String.prototype.toString` ignores the radix. The frame on the
wire is correct; only the log is mixed-base. Full explanation in the notes file.

### The sample player's eight parameters all accept writes — verified 2026-08-14

`pno_rom` (IDs 60-67: `rom_p00`-`rom_p05`, `rom_p08`, `rom_p09`) is the engine every
sampled sound uses. All eight are `flag=0, cc=-1`, so the device announces nothing for
them and the app must poll — the same shape as the six Clavi tabs above, but NOT
panel-owned.

The question was whether the ones below Release do anything at all: a patch could see
no change and it was unclear whether the write was being refused or simply not audible.

**Method.** `Venice Grand D-274` loaded into the edit buffer with `0x46` and no
parameters. Then, for each of the eight: read the held value, write 0, read back, write
127, read back, restore. Every read is a `0x22`/`0x23` round trip, so the numbers below
are the device's own answers, not the app's.

```
param     label              held   wrote 0  read   wrote 127  read   restored
rom_p00   Level                64         0     0         127    127         64
rom_p01   Attack               64         0     0         127    127         64
rom_p02   Release              64         0     0         127    127         64
rom_p03   Filter               64         0     0         127    127         64
rom_p04   Velocity             64         0     0         127    127         64
rom_p05   Piano Harp           64         0     0         127    127         64
rom_p08   Rel. Smp. Level      64         0     0         127    127         64
rom_p09   Ped. Smp. Level      64         0     0         127    127         64
```

**Every one took the value and echoed it exactly**, at both extremes, and read back the
same afterwards. A control write on a modeled engine through the identical path
(`rho_atk` 32 on Tine Piano, echoed 32) rules out a broken write path.

So "no effect on the tone" is NOT the instrument refusing the write. What remains
UNKNOWN is whether a given parameter is audible on a given sample set — a set with no
release samples has nothing for `rom_p08` to scale. That is a listening question, and
nothing here answers it; it must not be filled in from the v1.22 manual (Rule 1), which
describes this engine as having ten parameters when the device has eight.

One incidental observation, not yet explained: all eight read **64** immediately after
the sound was loaded with `0x46` and no parameters. Whether 64 is what the sound
player resets to, or what the buffer happened to hold, is untested.

### Set sound (`0x46`) → confirmation `0x45` + name reply `0x47` — verified

**Audibly confirmed 2026-08-13.** Everything below was wire evidence — the `0x45`, the
`0x47`, and a read-back — and none of it proved the instrument actually *sounds*
different. It does: with the buffer set to sound 6, Daniel played and heard a
vibraphone. Worth having written down, because "the device echoed our write" and "the
write did something" are different claims, and this protocol has at least one parameter
(`dly_mf`/`dly_ml`, open item 5b) where the first is true and the second is not.

**A sound change keeps the rest of the patch.** The engine swaps; the effects chain, EQ
and pad stay exactly as they were. That is the documented behaviour and it is what makes
auditioning a sound *on a preset* meaningful — but it has a consequence worth designing
around: a Vibraphone loaded onto a Clavi patch arrives through the Clavi's Pedal Wha-Wha
and its Synth Pad layer, and the result can be unrecognisable as either. This is what
made a working sound change read as "nothing happened, I still hear the old patch"
(Daniel, 2026-08-13), which cost an hour of chasing an app bug that was never there.

The last previously-unobserved opcode, captured 2026-08-09 from the editor's SELECT
PIANO page (outbound frames in `captures/editor-tap-set-sound-2026-08-09-notes.md`,
device replies in `captures/set-sound-2026-08-09T19-53-37.jsonl`):

```
→ F0 73 26 14 46 <soundId> F7
← F0 73 26 14 45 <soundId> <digit> F7        same shape as a recall broadcast
← F0 73 26 14 47 <soundId> <ascii name> F7   e.g. 47 15 "Venice Grand"
```

- `soundId` is **one binary byte, no `0x00` pad** — provably binary, because sound 0
  arrived as `0x00` (ASCII '0' would be `0x30`); two-digit ids 21–23 fit the same
  single byte. Captured for both modeled (0 Tine, 1 Reed) and sampled (21–23, the
  three Venice sounds) — five ids total, names in the `0x47` replies matching the
  interrogated sound table in `schema/seven-1.37.json` byte-for-byte.
- `0x47` is the **sound name reply**: `<soundId>` then the plain-ASCII name, no
  leading pad, no field separators.
- **No CC burst.** A sound change answers with exactly the `0x45` + `0x47` pair —
  unlike a preset recall, which follows `0x45` with the 22-CC panel dump. Clean
  discriminator between "preset recalled" and "sound changed" for a passive listener.
- **Engine parameters survive a sound change.** `rho_atk` (id 1) was written to 127,
  the sound switched Tine→Reed→Tine via `0x46`, and a direct `0x22` read-back
  returned `"1|rho_atk|127|127"` — the value held on the device. Transfer/audition
  may therefore send `0x46` first, then the parameter writes, without the sound
  change clobbering them.
- The editor sends **no `0x22` re-sync sweep after `0x46`** (it does after recalls),
  so its parameter display can go stale across a sound change. Our app reads back
  instead of trusting a cached view.

### Preset recall via incoming Program Change (verified)

The Seven **acts on received `Cn <program>`**: each PC triggered the full recall
broadcast above within ~5ms (`captures/pc-receive-2026-08-09*.jsonl`). Program numbers
are **0-based global slots across all four banks**: bank = ⌊n/8⌋+1, preset = (n mod 8)+1.
Evidence: PC 0/1 reproduced the sounds of bank 1 presets 1/2 from the controlled panel
capture; PC 8 reproduced bank 2 preset 1; PC 31's 22-CC burst was **byte-identical** to a
panel recall of bank 4 preset 8 captured minutes earlier.

**Edit buffer follows recall** — verified by reading params over SysEx right after a PC
recall and comparing against that recall's own CC broadcast: `rev_lv`, `fx2_dp`, `rev_dc`
matched exactly. `veq_vol` did NOT (CC said 116, buffer read 127) — suspicion is the
physical volume knob re-asserting its position over the recalled value; open item.

Backup implication: **unattended backup works** — for each slot, send PC n, await the
`0x45` + CC burst, read the 110-parameter edit buffer, store. No panel interaction.

### Outgoing Program Change on recall — the Send PC global (glb index 3, verified)

With the **Send PC** global ON, every panel recall ALSO emits `Cn <slot>` (~60ms after
the `0x45`), using the **same 0-based global slot numbering as the receive direction** —
captured 2026-08-09 (`captures/send-pc-2-*.jsonl`): recalls of bank 2 presets 3/7/1
emitted PC 10/14/8 alongside sounds 2/20/0, all cross-checked against earlier rounds.

**glb index 3 = Send PC — pinned by a captured write**: flipping the editor's Send PC
switch to YES sent `F0 73 26 14 30 03 01 F7` (ack `31 03`), and this unit's stored glb
had index 3 = 0 back when no PC was observed on recall. Third confirmed global name
(with 2 = Send CC, 8 = Memory Protect); the DOM-order assumption for the rest gains a
consistent data point. Schema updated.

App implication: with Send PC on, panel recalls are **slot-identified** — the UI can
follow the hardware's bank/preset exactly, and manual recalls can be labeled without
prompting.

### String (`0x70`/`0x71`) and Action (`0x72`/`0x73`) — first observations (passive)

Both appeared for the first time on 2026-08-09, sent by the USB editor while loading
its home page (captured outbound in the browser tap, replies in
`captures/send-pc-2-*.jsonl`):

```
→ F0 73 26 14 70 04 00 F7
← F0 73 26 14 71 04 "CRUMAR Seven v.1.37 Build date: Thu May 12 15:4…" F7
→ F0 73 26 14 72 0A 03 F7
← F0 73 26 14 73 01 0A "4.0GB" F7
```

- **String index 4 = the firmware version/build string** (matches the home page's
  firmware display).
- **Action `0x0A` = storage query** (the home page / expansion installer shows
  storage; reply payload is `01 0A` + ASCII). So ACTION has at least one harmless
  read use — but the space is documented to also carry factory reset and firmware
  update, so the standing rule is unchanged apart from this one frame: **ACTION is
  observe-only, except `0x0A`, which we may send.**

**Sent actively for the first time on 2026-08-15** (`captures/action-storage-2026-08-15*`),
with Daniel's go-ahead, and answered identically to the passive capture six days
earlier:

```
→ f0 73 26 14 72 0a 03 f7
← f0 73 26 14 73 01 0a 34 2e 30 47 42 f7        payload: 01 0a "4.0GB"
```

The whole reply is 13 bytes and carries **one ASCII value with no label**.

> **UNKNOWN: whether 4.0GB is total, used or free.** The wire does not say, and
> the arithmetic does not settle it — this unit holds seven expansion downloads
> (≈1.51 GB of ZIPs) so the number cannot be *used* without assuming installed
> size far exceeds download size, and cannot be *free* without total capacity
> exceeding the 4 GB the instrument is described as having. TOTAL is the only
> reading needing no extra assumption, which is an argument and not evidence.
> Settling it needs a second instrument, or this one after an install or
> removal: a number that moves is used or free, a number that does not is total.

**Used and free are not separately obtainable**, and **no opcode reports a
per-sound or per-expansion size** — the sound spec (`0x43`) is `id|sampled|name`
and carries no size field.

### Globals (`0x33`)

Semicolon-delimited `key=value`:

```
tun=440;glb=0,1,1,0,0,1,0,1,0;wfp=00000000
```

| Key | Meaning |
|---|---|
| `tun` | Global tuning in Hz (430–450) |
| `glb` | Nine global options, each set individually by index via `0x30` (see below) |
| `wfp` | **Wi-Fi password, plaintext** |

> ### The Seven volunteers its Wi-Fi password, in plaintext, unprompted
>
> `wfp` is the instrument's Wi-Fi password **in the clear**. Nothing asks for
> it: it arrives inside the ordinary globals reply, to anyone on the USB port,
> the moment `0x32` is sent. **This is the instrument's behaviour. No app
> introduced it and no app can turn it off** — it can only decline to keep it.
>
> This one is stated here, at the protocol layer, because that is where someone
> writing a logger, a capture tool or a crash reporter will meet it — after
> which it is too late to find out.
>
> **What this project does, and what anything reading this reply should do:**
>
> - Redact at the PARSE layer, so no caller downstream has to remember. Raw
>   `0x33` frames never leave the parser (`parseGlobals` in `src/seven-midi.js`).
> - **Drop unknown keys from this reply entirely.** The payload is split on
>   `;`, so a password *containing a semicolon* breaks into a second pair —
>   `wfp=pass;word=secret` — and a catch-all that keeps unrecognised fields
>   will store `secret` under a key nobody is watching. This project shipped
>   that bug in 1.0 and fixed it on 2026-08-17. Log the KEY if you like; never
>   the value.
> - Never commit a raw globals dump, and never put one in a bug report.
>
> The wider rule this belongs to: **the app stores no credentials of any kind,
> from any source** — the class, not the field name. Defending the name `wfp`
> is precisely what let the fragment through.

The nine `glb` slots correspond, in order, to the editor's home-page dropdowns. A full
nine-index sweep confirmed that **`0x30 <index>` addresses `glb[index]` 1:1 for all nine
slots** — each index moved exactly its own slot (snapshot then restored), so the set-global
index and the get-globals array position are the same numbering, no permutation.

**All nine names are now pinned (2026-08-12).** Daniel worked down the panel's GLOBAL
OPTIONS page top to bottom, changing one field at a time while a passive `0x32` watcher
sampled the array; each field moved exactly one slot, in page order, and a photograph of
the page taken at the same moment as a wire read gives the label↔value pairs below. The
sweep also exposed each field's full range by cycling it until it wrapped. Every field was
left as found (`glb = [0, 1, 1, 1, 0, 1, 0, 1, 0]` before and after).

| index | label on the panel | values |
| ----- | ------------------ | ------ |
| 0 | Channel | `0`–`15` = "Ch. 1"–"Ch. 16", `16` = "TX OFF" |
| 1 | Alt.Channel | `0`–`15` = "Ch. 1"–"Ch. 16" |
| 2 | Send CC | `0` = "No", `1` = "Yes" |
| 3 | Send PC | `0` = "No", `1` = "Yes" |
| 4 | Midi Soft-Thru | `0` = "OFF", `1` = "ON" |
| 5 | Sustain Pol. | `0` = "N.C.", `1` = "N.O." |
| 6 | Volume Type | `0` = "From Preset", `1` = "Global" |
| 7 | Velocity Curve | `0` = "Softer", `1` = "Soft", `2` = "Normal", `3` = "Hard", `4` = "Harder" |
| 8 | Memory Protect | `0` = "OFF", `1` = "ON" |

**This table is complete.** `orderUnverified` is CLEARED and so is the value-encoding gap:
every field's whole range has been read off the instrument, so the app may write any of the
nine. Two things made that possible without guessing:

- **Every dropdown was photographed open with a checkmark on a value already known from the
  wire.** A tick on a known value pins the rest of that list by position. Reading a list
  without that anchor would only give the labels, not which number produces which.
- **Cycling each field until it wrapped gave its range**, which is how a list can be declared
  complete rather than merely long.

Three findings that would each have shipped a bug:

- **Channels are 0-based.** `0` displays "Ch. 1". An earlier note in this file claimed the
  opposite and concluded the field was 1-based; it is not. A dropdown built on that note
  would have been one channel off on every entry.
- **Send CC and Send PC list their values in REVERSE order.** Both dropdowns put "Yes" above
  "No" while `1` is Yes and `0` is No — pinned by the captured editor writes `30 02 00` (No)
  and `30 02 01` (Yes). Every other field on the page lists 0, 1, 2… downward. Deriving these
  two from list position inverts both switches.
- **Channel has seventeen entries and Alt.Channel sixteen** — "TX OFF" exists only on Channel.
  The sweep alone could not establish this: slot 1 wrapped `15 → 0` inside one 1.2 s sample,
  and the same run caught a `10 → 12` jump, so "shorter list" and "missed step" were
  indistinguishable from the wire. Opening the dropdown was the only thing that separated
  them. **Where a sampler cannot distinguish two explanations, do not pick one.**

One operational note for anything that writes these: **Memory Protect ON prevents the
three-second panel hold from storing**, which is the only way to keep a patch. It is the one
global that can silently disable saving.

The remaining `wfp` rule is unchanged and unconditional: slot names and values may be logged;
the password may not.

### Set one global (`0x30`) — verified

Captured from the editor writing a global (Send CC toggled No, then Yes):

```
F0 73 26 14 30 <index> <value> F7      set global <index> to <value>
F0 73 26 14 31 <index> F7              ack — echoes the index only

out: f0 73 26 14 30 02 00 f7   →  in: f0 73 26 14 31 02 f7
out: f0 73 26 14 30 02 01 f7   →  in: f0 73 26 14 31 02 f7
```

Sets **one** global, not the array. Index and value are single bytes immediately after the
opcode — **no `0x00` pad** (unlike parameter addressing, which is `0x00, idHi, idLo`). Do not
share an address encoder between them. The ack carries only the index.

### Bank 1 does not accept a store — confirmed by the owner

The three-second panel hold stores to Banks 2, 3 and 4 only; **Bank 1 cannot be
written from the panel at all, by design** (Daniel, 2026-08-13, confirming from
his own use of the instrument). It holds the factory presets.

Worth recording because this project has carried the opposite note for weeks:
Bank 1 was described as blocked "by project rule, not a device limitation",
which left the app telling people the Seven would not save there while its own
docs said that was our choice rather than the instrument's. It is the
instrument's.

What follows for the app: refusing to transfer a patch into Bank 1 matches the
hardware rather than merely being cautious, and the line in the save
instructions — "(the Seven will not save to Bank 1)" — is a fact about the
device. Auditioning a sound on a Bank 1 preset stays allowed: that stores
nothing.

## Bulk dump caveat

`F0 73 26 14 12 00 00 F7` streams all specs in batches. Observed behaviour: it works once,
then further identical requests are ignored until some unknown condition resets. **Prefer
enumerating 0–109 with `0x14`** — deterministic and idempotent.

Practical note: send the burst with explicit incrementing timestamps rather than
`setInterval`. Browsers throttle background-tab timers to ~1 Hz, and one request per second
turns a 3-second enumeration into two minutes.

Enumerating all 110 in one burst dropped exactly one response (ID 22). **Verify coverage and
re-request gaps** rather than assuming a complete sweep.

## Findings that contradict the manual

The July 2021 manual documents v1.22. On v1.37:

- **`acp_dpxl` "Duplex Scale"** (ID 55) exists and is editable. Not in the manual.
- **`pha_mx` "Phaser Mix"** (ID 85) exists. Not in the manual.
- **Amp EQ is exposed** — `amp_bs`, `amp_md`, `amp_tr` (IDs 92–94). The manual only implied
  each amp model had a passive 3-way EQ.
- **Two new globals** — Midi Soft-Thru and Velocity Curve (Softer/Soft/Normal/Hard/Harder).
- **GSP-01 has 8 parameters, not 10.** Keys run `rom_p00`–`rom_p05`, then `rom_p08`,
  `rom_p09`. The manual's LFO Rate and LFO Depth (presumably `p06`/`p07`) are **absent from
  the ID space entirely** — not conditional, just gone.
- The Acoustic Grand's "Fundamental Level" is not present; `acp_rnlv` is labelled
  "Release Level" rather than the manual's "Release Noise Level".
- FX1/FX2 use **"Speed"**, not the manual's "Rate".

## Open items

1. ~~`flag` (8th spec field)~~ **CLOSED (by read, no writes) — and now documented, not just
   inferred.** `flag` is **not** always `0`: it is `1` for the 22 fixed-panel-CC parameters and
   `0` for the rest. `flag=1` = fixed CC, `flag=0` = user-assignable. The manual's fixed-CC
   table lists exactly the same 22 parameters, so observation and manufacturer documentation
   agree. See the `0x15` spec table above; per-parameter values in schema.
2. ~~`pdl_exp` CC values~~ **RESOLVED.** `pdl_exp` params have `flag=0` (user-assignable) while
   holding live CC assignments (`exp_fn`=1, `exp_mn`=0, `exp_mx`=1). That is an assignable slot
   with a current assignment, not an inconsistency — no contradiction with the `-1` seen on
   unassigned params. `ccUnverified` dropped from these three in the schema.
3. ~~`0x46` (set sound) unobserved~~ **CLOSED (2026-08-09).** Captured from the editor's
   SELECT PIANO page for modeled and sampled sounds — see the set-sound section above.
   **Every named opcode has now been observed on the wire.** ~~`0x70`/`0x72` unobserved~~ **OBSERVED
   2026-08-09, passively** — read-type uses captured from the editor's home-page load
   (string index 4 = firmware string; ACTION 0x0A = storage query; see the new section
   above). ACTION's write-type payloads (factory reset, firmware update) remain
   unobserved and off-limits by rule. Earlier negative evidence from patch browsing
   (`captures/editor-tap-2026-08-09-notes.md`) still stands: browsing traffic is pure
   `0x22` sweeps.
4. ~~Whether the device pushes unsolicited notifications~~ **PARTIALLY RESOLVED
   (2026-08-09).** Preset recalls push an unsolicited `0x45` + a 22-CC panel dump (see the
   `0x45` section). Whether panel *encoder moves* push anything beyond their ordinary CC is
   still unverified. **A three-second STORE pushes nothing of its own — CLOSED
   2026-08-12** (`captures/store-hold-2026-08-12-notes.md`): a hold emits the same
   `0x45` + 22-CC burst + `Cn <slot>` as an ordinary tap, with the same ~55 ms
   `0x45`→PC gap. There is no store notification and no frame-level difference.
   What DOES differ is the burst's contents: the broadcast following a store carries
   **what was just written** (verified — the hold's burst carried the previously
   recalled preset's sound id and all 22 CC values out of a slot that had held a
   different patch). So a store is detectable only by comparing a slot's burst before
   and after, never by a marker. Compare those CCs as opaque bytes — open item 8's
   scaling law is still unverified.
5. Whether `.bin` preset export shares this layout. Untested.
5a. **A backup reads the EDIT BUFFER, so it records whatever is loaded — not
   necessarily what the slot holds.** The run recalls each slot and reads the
   110 values back, which is the same buffer an audition writes into. On
   2026-08-12 a run recorded Bank 2 Preset 4 as a bare Clavi Piano while the
   instrument still held Shapes Clav: an audition was loaded when the run
   reached that slot. The instrument was right and the backup was wrong, which
   is the worse way round. The app now ends any live session and lets its
   recall land before starting a run; anything else driving the buffer during a
   backup (the manufacturer's editor, a second copy of this app) would corrupt
   a record the same way, and nothing on the wire would say so.
5b. **`dly_mf` / `dly_ml` accept writes but were reported to change nothing
   audible (2026-08-12).** With FX2 in Delay mode, the owner adjusted Max
   Feedback (id 86) and Max Level (id 87) and heard no change. A direct check
   ruled the app out: each was read, written to 100, echoed 100 and read back
   100 on a fresh `0x22`, then restored — the instrument takes and holds the
   value. `dly_sp` (Stereo Spread, id 88) in the same group behaves the same on
   the wire and IS audible. So the two are conditional on something not yet
   identified. Candidates worth a session, none of them evidence yet: another
   parameter gating them, a mod/expression assignment they cap rather than set
   (the "Max" in both names), or a firmware quirk. Do not label them inert in
   the UI until the condition is demonstrated — the app currently shows them as
   ordinary controls, which is what the device reports them to be.

   **Re-checked 2026-08-12, second run.** Same result on a different patch and
   different starting values: `dly_mf` read 113, was written to 20, echoed 20,
   read back 20 on a fresh `0x22`, and restored. `dly_ml` read 127, same round
   trip. FX2 was on and in Delay mode at the time (`fx2_sw` 1, `fx2_md` 3,
   `fx2_dp` 47, `fx2_sp` 72). The write path is not in question.

   The run also turned up a **display discrepancy worth chasing separately**:
   the app's panel showed Speed, Max Feedback and Max Level all as 0 while the
   instrument reported 72, 113 and 127. Depth and Stereo Spread matched
   exactly, so it is not the whole section. If the panel is showing 0 for a
   parameter the device holds at 113, "adjusting it does nothing" has a second
   possible cause that has nothing to do with the delay: dragging from a value
   that was never there. Establish which panel state produced that before
   attributing any of it to the instrument.
6. The `0x45` recall frame's second byte: single ASCII char equal to the first decimal
   digit of the sound ID in all 23 captured frames — rendering quirk or something else?
   Also unexplained: the doubled `B0 01` pair closing every recall burst.
7. ~~`veq_vol` override suspicion~~ **RESOLVED (2026-08-09,
   `captures/vol-attribution-*` / `vol-recall-test-*`).** With the expression pedal parked
   at 127 and the volume knob parked at 0, a PC recall read back the preset's own stored
   value (116) at t+150ms, t+1s and t+3s — **no controller overrides a recall**. The
   earlier 127 was a later pedal write, not a recall race: physical controllers write
   into the edit buffer when *moved* (knob = CC 7; expression pedal = CC 11 on the wire
   regardless of its assigned function — the pedal→volume mapping is internal). Backup
   reads that follow the recall promptly are trustworthy for all 110 params.
8. Recall-burst CC values for sub-127-max params look scaled to 0–127 (e.g. `fx1_md`,
   max 3, broadcast as 0x54): scaling law unverified — do not decode those CCs as raw
   parameter values until pinned.
