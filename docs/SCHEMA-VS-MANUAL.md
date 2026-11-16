# The schema against the manual

A line-by-line comparison of `schema/seven-1.37.json` — what the instrument
reports about itself — against `docs/MANUAL.md`, the official manual digested
in full (ENG, July 2021, **FW v1.22**).

**Taken 15 Nov 2026. Neither file was changed to resolve anything here.**

## Why this file exists

The two describe the same instrument four years and fifteen firmware revisions
apart. Knowing *where* they disagree is worth more than either alone: a
disagreement is either a firmware change, a stale document, or a gap in this
app — and those need different responses.

**The order of authority is unchanged:** the instrument, then the schema (what
the device says about itself), then the manual. Where they differ, assume the
firmware moved. The version history in `MANUAL.md`, taken from the v1.37
README, turns several of the differences below from puzzles into dated facts.

---

## 1. The CC map matches exactly

All **22** fixed CCs in the manual's §10.4 exist in the schema with matching
semantics. Nothing in the manual's map lacks a schema parameter.

| CC | manual | schema | | CC | manual | schema |
|---|---|---|---|---|---|---|
| 7 | VOLUME | `veq_vol` | | 26 | FX2 DEPTH | `fx2_dp` |
| 12 | EQ BASS | `veq_bas` | | 27 | FX2 RATE | `fx2_sp` |
| 13 | EQ TREBLE | `veq_trb` | | 28 | AMP TOGGLE | `amp_sw` |
| 14 | EQ MIDDLE | `veq_mid` | | 29 | AMP DRIVE | `amp_dr` |
| 15 | EQ MID. FREQ. | `veq_mdf` | | 30 | REVERB TOGGLE | `rev_sw` |
| 16 | EQ BYPASS | `veq_byp` | | 31 | PAD TOGGLE | `pad_sw` |
| 20 | FX1 TOGGLE | `fx1_sw` | | 32 | PAD LEVEL | `pad_lv` |
| 21 | FX1 SELECT | `fx1_md` | | 33 | PAD BLEND | `pad_bl` |
| 22 | FX1 DEPTH | `fx1_dp` | | 91 | REVERB LEVEL | `rev_lv` |
| 23 | FX1 RATE | `fx1_sp` | | 92 | REVERB DECAY | `rev_dc` |
| 24 | FX2 TOGGLE | `fx2_sw` | | | | |
| 25 | FX2 SELECT | `fx2_md` | | | | |

**The `flag` field is what marks them.** `flag=1` covers exactly 22
parameters, and they are exactly these 22. That correspondence is not stated
anywhere in the schema and is worth knowing: **`flag=1` means "has a fixed
factory CC"**, and `cc` is meaningful only for those.

## 2. The three CC values that mean nothing — RESOLVED 15 Nov 2026

The schema has **25** parameters with `cc >= 0`. The three beyond the manual's
map:

| | | |
|---|---|---|
| `exp_fn` (107) "Function" | cc **1** | |
| `exp_mn` (108) "Range min." | cc **0** | |
| `exp_mx` (109) "Range max." | cc **1** | duplicate of `exp_fn` |

**This is not a CC collision. The field is meaningless for ids 107–109.** Four
independent tells, none of which needed the hardware:

1. **`-1` is the sentinel everywhere else.** 85 of the 88 `flag=0` parameters
   report `cc: -1`. These three are the only exceptions in the whole table.
2. **`flag=1` is exactly the manual's 22**, and all three of these are
   `flag=0`. So they are not fixed-CC parameters by the schema's own marker.
3. **0 and 1 are Bank Select MSB and Modulation Wheel** — implausible as
   factory assignments for a pedal's function and range.
4. **The manual lists the expression pedal as ABSENT from the CC map**
   (§10.4), and says everything not in the map is unassigned by default.

**This CORRECTS a previous conclusion.** `docs/protocol.md` open item 2 marked
it *RESOLVED* with the explanation that these are "an assignable slot with a
current assignment". That does not survive tell 1: if `-1` means unassigned
for assignable parameters, then 85 assignable parameters are unassigned and
exactly three carry assignments — two of them the same CC. The old reading was
reasonable when written and is wrong.

**What the app should do differently.** `src/main.js` builds `ccMap` from
`p.cc >= 0`, so these three are in it, and `map[p.cc] = p.key` means CC 1
resolves to `exp_mx` (the later id overwrites `exp_fn`). Consequence: an
incoming **CC 1 from any controller's mod wheel**, or **CC 0 Bank Select** from
anything on the port, is treated as a panel move and triggers a SysEx read-back
of a pedal parameter. Harmless today — the read returns the true value, so
nothing is corrupted — but it is a wrong mapping that fires real traffic on
unrelated messages, and `onPanelCc` is the path that keeps the panel in step.
**The fix is to build the map from `p.flag === 1` rather than `p.cc >= 0`**, or
to exclude `pdl_exp` explicitly. Not done here; reported only.

`tools/probe.js` carries this as its own open item 4 and can be closed with it.

## 3. Parameters the manual describes that the schema lacks

**Only two, and the gap is evidence rather than a hole.** Chapter 19 lists ten
GSP-01 sample-player parameters; the schema has eight.

Missing: **LFO RATE** and **LFO DEPTH**.

The schema's keys run `rom_p00`…`rom_p05`, then jump to `rom_p08`, `rom_p09`.
**`p06` and `p07` are exactly the gap.** The manual says those two appear "only
when the sample responds to the modulation wheel". So the device omits them
from its own table for the loaded sample, and the numbering gap and the
manual's conditional sentence corroborate each other precisely.

Nothing to fix. Worth remembering if a future sample set makes them appear:
the parameter count would change, and `src/param-compat.js` gates writes on
exactly that.

## 4. Parameters the schema has that the manual does not describe

| | |
|---|---|
| `pha_mx` (85) "Phaser Mix" | §20.4 lists stages, LFO offset and feedback only |

**Explained by the firmware history: Phaser MIX arrived in v1.36 (March
2022)**, eight months after the July 2021 manual. Not a documentation error —
the manual was simply printed first.

**The app DOES expose it.** Measured 15 Nov 2026 with the Seven attached
(`test/ui/scenarios/fx2-delay-rows.js`): with FX2 in Phaser mode the detail
view renders Stages, Offset, Feedback and **Phaser Mix** (`pha_mx`, id 85,
reading 100). No gap.

## 5. Names that differ

| schema | manual | verdict |
|---|---|---|
| `acp_dpxl` (55) "Duplex Scale" | FUNDAMENTAL LEVEL | **RESOLVED — the app is already right.** v1.10 (Oct 2018) "replaced the parameter 'Fundamental Level' with 'Duplex Scale' in the AP Editing page". The 2021 manual still prints the old name. Same ordinal slot in both lists. |
| `acp_rnlv` (53) "Release Level" | RELEASE NOISE LEVEL | The schema's own KEY is `rnlv` — release *noise* level — so the device's label looks truncated rather than different. Cosmetic; the app shows the device's word. |
| `egp_pucm` "Pickup Compress" | PICKUP COMPRESSION | abbreviation |
| `amp_mo` "AC" / "RJC" | AC30 / JAZZ CHORUS | abbreviation |
| `fx2_sp` "Speed" | TIME in Delay; RATE on the panel | **Three names for one control.** The panel silkscreen says RATE, the device says Speed, the manual's prose says TIME when FX2 is in Delay. Already recorded in `docs/DEVICE.md`. |

## 6. Three questions the manual leaves open that the schema answers

`MANUAL.md` lists these under "What the manual does NOT answer". The device
answers all three:

- **The DX parameter's name.** `dx7_tp` "Variation", with its nine values
  named: KP1 PM EPiano, Brass, Marimba, Organ, E.Bass, Wurlish, Crystal,
  Suitcase, Original EP.
- **The MKS parameter's name.** `mks_dec` "Decay Time".
- **Which Clavi parameter is editor-only.** `zd6_lv` "Damper Lever". CLAVI TABS
  reaches the four filters and two pickups from the panel; the Damper Lever is
  the seventh and the only one it does not.

## 7. Group counts, all matching

| engine | manual | schema |
|---|---|---|
| Tine (`pno_rho`) | 10 | 10 |
| Reed (`pno_wur`) | 6 | 6 |
| Electric Grand (`pno_egp`) | 13 | 13 |
| Clavi (`pno_zd6`) | 7 | 7 |
| DX (`pno_dx7`) | 1 | 1 |
| MKS (`pno_mks`) | 1 | 1 |
| Vibraphone (`pno_vib`) | 2 | 2 |
| Acoustic Grand (`pno_acp`) | 20 | 20 |
| GSP-01 (`pno_rom`) | 10 | 8 — see §3 |

`exp_fn`'s ten function values match §20.9's list exactly, in order.

110 parameters in total.

---

## What this comparison is NOT

It compares a document against a document. **It demonstrates nothing about the
hardware** — every schema value here came from the device's own `0x14`/`0x15`
tables, but that was a reading taken on a date, not a fresh measurement.

Where this file says "resolved", it means the two documents stopped
disagreeing, not that anything was tested. The one claim here that WAS measured
on the instrument is §4's "the app exposes `pha_mx`", and it says so.
