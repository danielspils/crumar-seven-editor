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
| `flag` | Always `0` in every observed response — purpose UNKNOWN |

Values are plain 0–max in a single byte. **No MSB/LSB split anywhere.** Writes clamp at max
rather than wrapping.

### Sound spec (`0x43`)

```
<id>|<sampled>|<name>
0|0|Tine Piano
8|1|GSi Grand D
```

`sampled` is `0` for a modeled engine, `1` for a GSP-01 sample set. Sound count depends on
installed expansions — this unit reports 24 (8 modeled + 16 sampled).

### Current sound (`0x45`) — returns the active sound ID.

### Globals (`0x33`)

Semicolon-delimited `key=value`:

```
tun=440;glb=0,1,1,0,0,1,0,1,0;wfp=00000000
```

| Key | Meaning |
|---|---|
| `tun` | Global tuning in Hz (430–450) |
| `glb` | Nine option indices |
| `wfp` | **Wi-Fi password, plaintext** |

> **`wfp` returns the instrument's Wi-Fi password in the clear.** Redact it from any log,
> capture file, or crash report your app produces. Do not commit a raw globals dump.

The nine `glb` slots correspond, in order, to the editor's home-page dropdowns: Channel,
Alt. Channel, Send CC, Send PC, Midi Soft-Thru, Sustain Polarity, Volume Type, Velocity
Curve, Memory Protect. **This ordering is inferred from DOM order and is UNVERIFIED** —
confirm by changing one setting and diffing the array before relying on it.

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

1. `flag` (8th spec field) is `0` for all 110 parameters. Purpose UNKNOWN.
2. `pdl_exp` CC values look wrong: `exp_fn` reports cc `1`, `exp_mn` cc `0`, `exp_mx` cc `1`.
   Every other unassigned parameter reports `-1`. Either these are genuinely assigned to
   CC 0/1 or the field means something else for this group. UNVERIFIED.
3. `0x46` (set sound), `0x30` (set global), `0x70`/`0x72` (string, action) are named but their
   payload formats are unobserved — all involve writes, so test deliberately.
4. Whether the device pushes unsolicited notifications when panel encoders move, and on which
   opcode. UNVERIFIED — the panel does emit ordinary MIDI CC, observed during capture.
5. Whether `.bin` preset export shares this layout. Untested.
