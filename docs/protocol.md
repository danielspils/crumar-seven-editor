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

**What is established:** these six mirror the panel, and nothing announces them — so the
app can only follow them by polling.

**OPEN — does a software write to these six change the SOUND?** Unknown. The value
changes and holds; whether the audio path honours it or reads the physical switch
directly has not been tested. The first report from the instrument's owner was that the
software controls "don't work", but at that moment the UI had a separate defect (clicking
the lit half of a choice tab sent the value already in place, so some clicks sent
nothing), which makes that report unreliable evidence about the audio.

A decisive test exists and needs a listener: the manual states that with all four filter
tabs off the Clavinet produces NO SOUND. Setting `zd6_br/tr/md/sf` to 0 over SysEx while
the tabs are physically on either silences the instrument — proving the write reaches the
audio path — or does not, proving it doesn't. Silence is unambiguous; no timbre
judgement required.

### Set sound (`0x46`) → confirmation `0x45` + name reply `0x47` — verified

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
- **Action `0x0A` = available-storage query** (the home page / expansion installer
  shows storage; reply payload is `01 0A` + ASCII). So ACTION has at least one
  harmless read use — but the space is documented to also carry factory reset and
  firmware update, so the standing rule is unchanged: **we observe ACTION passively
  and never send it.**

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

> **`wfp` returns the instrument's Wi-Fi password in the clear.** Redact it from any log,
> capture file, or crash report your app produces. Do not commit a raw globals dump.

The nine `glb` slots correspond, in order, to the editor's home-page dropdowns: Channel,
Alt. Channel, Send CC, Send PC, Midi Soft-Thru, Sustain Polarity, Volume Type, Velocity
Curve, Memory Protect. A full nine-index sweep confirmed that **`0x30 <index>` addresses
`glb[index]` 1:1 for all nine slots** — each index moved exactly its own slot (snapshot then
restored), so the set-global index and the get-globals array position are the same numbering, no
permutation. The **name↔index mapping is still UNVERIFIED as a whole**; only two names are pinned
against the display: **index 2 = Send CC** (captured `0x30` frame) and **index 8 = Memory
Protect** (toggling it OFF→ON moved slot 8, nothing else). Both match the assumed DOM order. Keep
`orderUnverified` until all nine names are pinned against the panel.

`glb` values are **not uniformly 0-based dropdown indices** — the encoding is per-field and
partly unknown. Slot 1 reads `1` while Alt. Channel displays "Ch. 1", so that field is offset or
1-based. Record raw values; do not assume value == displayed position.

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
   still unverified.
5. Whether `.bin` preset export shares this layout. Untested.
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
