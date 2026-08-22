# Crumar Seven — Device Reference

Manufacturer-documented behaviour and parameter semantics, compiled from
Crumar's published materials. **This file is documentation, not evidence.**

## Precedence

1. **Raw captures** in `captures/` — immutable ground truth.
2. **`schema/seven-1.37.json`** — the device's own self-description.
3. **This file** — manufacturer documentation, useful for *meaning*.

Where they disagree, the higher item wins. The published manual describes
FW 1.2 (Sep 2020) and FW 1.22 (Jul 2021); this instrument runs **1.37**
(May 2022), so the manual is three releases stale. Nothing here should be
treated as a protocol fact.

What this file is *for*: the schema tells us a parameter exists, its range,
and its group. It does not tell us what the parameter does, whether it
applies to the currently loaded sound, or how the hardware behaves around
it. That is what's collected here.

## Sources

| Document | Version | URL |
|---|---|---|
| User's Manual (ENG) | Sep 2020, FW 1.2 | `crumar.it/files/Crumar_Seven_Manual_ENG.pdf` |
| User's Manual (ENG) | Jul 2021, FW 1.22 | `crumar.it/files/Crumar_Seven_Manual_ENG_july2021.pdf` |
| Quick Guide | Sep 2020 | `crumar.it/files/Seven_Quick_guide_2020.pdf` |
| Support / downloads | current | `crumar.it/?a=support&b=36` |

Known discrepancies between Crumar's own documents: USB host current is
given as 250 mA in the manual and 300 mA in the quick guide; the expression
pedal is "10K linear preferred, 50K works" in the manual and "10k–20k
linear" in the quick guide. Neither affects this app, but they establish
that Crumar's documentation is not internally consistent.

---

## 1. Where the manual disagrees with this instrument

The most useful page in this file, and the reason the rest of it is
subordinate to the schema. Everything below was found by comparing Crumar's
documents against `schema/seven-1.37.json`, which is the device's own
self-description. Each row cites the key or index it rests on.

### The manual claims things the device disproves

| The manual says | The device says | Evidence |
|---|---|---|
| The sample player has **ten** parameters, including LFO Rate and LFO Depth | **Eight.** Those two do not exist on FW 1.37 | `rom_p06`/`rom_p07` absent from the ID space; the eight present are IDs 60–65, 66–67 |
| Acoustic Grand has a **Fundamental Level** | No parameter carries that label, in any group | nearest by position is `acp_rnlv`, which reads "Release Level" |
| FX1/FX2 share DEPTH and **RATE** | The control is **Speed** | `fx1_sp` (ID 77), `fx2_sp` (ID 81) |
| **Eight** globals, Tuning among them | **Nine** in the `glb` array, and Tuning is not one of them | `globals.keys.glb`, nine slots, addressing verified 1:1 |

The Speed/Rate difference is naming only; the other three change what the app
can rely on being there.

### Errors in Crumar's own documentation

Different in kind from everything else on this page: not a device/manual
mismatch but a plain mistake in the text, settled by facts outside the
instrument. `schema/seven-1.37.json` has nothing to say about either column —
it names sounds, not the machines they model.

| The manual says | What is actually meant | Why |
|---|---|---|
| The MKS engine reproduces patch 7 "E.PIANO 1" of the Roland **MKS-20 / RD-2000** | The **RD-1000** and its rack sibling the **MKS-20** | The RD-2000 is a 2017 stage piano. The sound being described is an eighties one, made by Roland's SA synthesis, which is the RD-1000 and MKS-20 — the manual names the MKS-20 itself, parenthetically, alongside a machine from thirty years later |

Corrected in §3 rather than reproduced there, since repeating a manufacturer's
error inside a description of what the engine models would make this file wrong
in the same way.

### The device has parameters the manual omits

| Parameter | Key | ID | Note |
|---|---|---|---|
| Duplex Scale | `acp_dpxl` | 55 | Acoustic Grand |
| Phaser Mix | `pha_mx` | 85 | FX2 phaser |
| EQ Bass / EQ Mid / EQ Treble | `amp_bs` / `amp_md` / `amp_tr` | 92 / 93 / 94 | The amp simulator's individual bands. The manual implies only "a passive three-way EQ" per model, without saying they are addressable |

### The globals gap

Two of the nine are absent from the manual's list entirely:

| glb | Setting |
|---|---|
| 4 | Midi Soft-Thru |
| 7 | Velocity Curve |

Both were pinned by name on 2026-08-12, one field at a time, while a passive
watcher sampled the `glb` array.

### Tuning: readable, with no known write path

The manual lists Tuning (A=430–450 Hz, reboot required) as a global. The device
reports it as **`tun`** — a sibling of `glb` and `wfp` in the `0x33` reply — not
as a `glb` index. So it can be read, and `0x30` cannot write it, because `0x30`
takes a `glb` index and `tun` has none. Whether another opcode sets it is
untested. See §7.

---

## 2. Sound engines

Nine engines: eight real-time synthesis models plus one sample player.

| Engine | Synthesis | Note range | Polyphony | Allocation |
|---|---|---|---|---|
| Tine E.P. | Physical modeling | A0–C7 (21–108) | 88 | Modeling, fully polyphonic |
| Reed E.P. | Physical modeling | A1–C6 (33–96) | 64 | Modeling, fully polyphonic |
| Electric Baby Grand | Physical modeling | A0–C7 (21–108) | 40 + 88 | Modeling (hybrid) |
| Clavi E.P. | Physical modeling | F1–E6 (29–88) | 60 | Modeling, **no sustain pedal** |
| DX Digital E.P. | Phase modulation | A0–C7 (21–108) | 28 | Round-robin + voice stealing |
| MKS Digital E.P. | Hybrid | A0–C7 (21–108) | 90 | Round-robin + voice stealing |
| Vibraphone | Physical modeling | C2–C6 (48–96) | 49 | Modeling, fully polyphonic |
| Acoustic Grand | Physical modeling | A0–C7 (21–108) | 40 + 88 | Modeling (hybrid) — **experimental** |
| GSP-01 sample player | Sample playback | A0–C7 (21–108) | 100 | Round-robin + voice stealing |
| Synth PAD (overlay) | Virtual analog | A0–C7 (21–108) | 16 | Round-robin + voice stealing |

### Mute notes are not a bug

Modeled engines reproduce the note range of the real instrument. Keys
outside that range produce no sound. This affects Reed (silent below A1
and above C6), Clavi (silent below F1 and above E6), and Vibraphone
(silent outside its four octaves). Sampled counterparts cover the full
keyboard by stretching.

**App consequence:** never report silence outside these ranges as a fault,
and consider showing the active engine's range in the UI.

---

## 3. Modeled sound parameters

Semantics only — names, ranges and IDs come from the schema.

### Tine E.P. (Rhodes)

Nine variations selectable via TYPE. Parameters cover the volume of the
wooden attack noises and the damper noises on release; hammer tip hardness
(higher = snappier attack and more metallic attack component); tine
aggressiveness ("bite and bark", which itself varies by selected
variation); the metallic component of the tone; sympathetic resonance
level; pickup offset relative to the tines, which shifts the balance
between fundamental and overtones; a high-pass filter equivalent to the
original bass-boost control; and sustain pedal noise volume.

### Reed E.P. (Wurlitzer 200A)

Models the dry output jack signal only — the 200A's internal amp and
speakers are **not** modeled. Turn the AMP simulator on to approximate
them. Parameters: attack wood noise level, damper noise level, release
time (longer simulates worn dampers), hammer hardness (affects overall
aggressiveness), pedal noise level, sympathetic resonance level.

The 200A's built-in tremolo is reproduced with FX1 set to Mono Tremolo at
roughly 6.5 Hz. Factory preset 1-2 does exactly this.

### Electric Baby Grand (Yamaha CP80)

Models the jack output with the original's EQ centred and brilliance high.
Parameters: hammer low-pass cutoff and resonance (applied to the hammer
element only, not the whole signal); hammer horizontal offset against the
strings, which alters voicing unpredictably; hammer width (bigger = fuller
and louder, but damps some harmonic content); string damping; string
detuning (adjust in small steps); pickup compression, modelling impedance
loss at high signal levels; release length (residual string vibration
after note-off); stretch tuning, centred on the manufacturer's
recommended table; sympathetic resonance spread; key noise level; pedal
noise level; dynamics (MIDI velocity to note velocity ratio).

### Clavi E.P. (Clavinet D6)

Six switches, all also reachable from the panel by holding CLAVI TABS with
preset buttons 1–6: pickup A/B (neck vs bridge when single; in-phase vs
out-of-phase when both), pickup C/D (single vs both), and four filter
toggles — soft, medium, treble, brilliant. Editor-only: damper lever,
which shortens note duration and reduces brightness and loudness.

**Silence trap:** with all four filters off, the engine produces no sound.
This is documented behaviour, not a fault.

**No sustain pedal support** on this engine.

### DX Digital E.P.

Reproduces the Yamaha DX7 "E.PIANO 1" patch using phase modulation.
**One parameter only**, selecting among nine variations — which include an
organ, a brass section, a bass and a marimba.

### MKS Digital E.P.

Reproduces patch 7 "E.PIANO 1" of the Roland **RD-1000** and its rack sibling
the **MKS-20** — the eighties SA-synthesis pair the engine is named after.
**One parameter only**, overall decay time. The original's BBD stereo
chorus is reproduced by turning FX2 on.

The manual pairs the MKS-20 with the *RD-2000*, a 2017 stage piano that
postdates this sound by three decades. Corrected here and listed in §1.

### Vibraphone

**Two parameters.** Decay type is either Keyboard (each bar decays
independently, piano-style) or Mallets (all bars share one damper, as on a
real vibraphone — and no more than four notes at once, since a player has
four mallets). Mallet hardness controls brightness.

### Acoustic Grand

**Flagged experimental by Crumar** — added in the Jul 2021 manual and not
present in the Sep 2020 edition. Crumar states this engine is still
experimental, should not be considered a key feature of the instrument,
may not sound fully realistic, and is not problem-free; they direct users
wanting a realistic acoustic piano to the sampled instruments instead.
Worth surfacing in the app, since a user comparing it unfavourably against
the sampled grands is hearing exactly what the manufacturer describes.

The largest parameter group — 243 modeled strings, with the top 17 notes
undamped and a duplex scale on the soundboard. Shares much of its
structure with the Electric Baby Grand.

Adds, beyond the Baby Grand set: hammer body (filters the hammer thump);
direct sound (balance between string sound and cabinet sound — lower
values give a nearer sound with slower amplitude loss); harp high-pass
filter; release noise level (dampers muting strings on key release);
cabinet presence and cabinet timbre; lid position (low = closed, centre =
half open, high = removed).

The manual also lists a **Fundamental Level** here. No parameter in
`schema/seven-1.37.json` carries that label, in this group or any other.
`acp_rnlv`, the nearest candidate by position, reads "Release Level".

**App consequence:** this is the group that overflows a fixed-height
panel. DX and MKS have one parameter each, Vibraphone two — so the sound
engine panel must handle a range from 1 to ~20 rows.

---

## 4. Sampled sounds (GSP-01)

All sampled sounds share a single parameter group. The player accepts only
Crumar/GSi sample sets — no user samples, no standard formats.

**Eight parameters, three of which are conditional.** The manual describes ten
with five conditional; two of those do not exist on this firmware — see below.

| Parameter | Schema key | ID | Applies |
|---|---|---|---|
| Level | `rom_p00` | 60 | Always — volume of the sample set |
| Attack | `rom_p01` | 61 | Always — relative to the set's built-in attack |
| Release | `rom_p02` | 62 | Always — relative to the set's built-in release |
| Filter | `rom_p03` | 63 | Always — low-pass response |
| Velocity | `rom_p04` | 64 | Always — MIDI velocity response |
| Piano Harp | `rom_p05` | 65 | **Only for piano samples** — resonance level; does nothing otherwise |
| Rel. Smp. Level | `rom_p08` | 66 | **Only if the set has a release sample** |
| Ped. Smp. Level | `rom_p09` | 67 | **Only if the set has a pedal noise sample** |

### LFO Rate and LFO Depth do not exist in FW 1.37

The manual lists them as the mod-wheel pair. They are **absent from the ID
space entirely** — `rom_p06` and `rom_p07` are not in `schema/seven-1.37.json`,
and the eight that are present run 60–65 and 66–67 with no gap in between that
the device reports. Not conditional, not hidden for the loaded set: gone. This
is a real difference between the manual and the instrument, not a difference
between sample sets.

### An open lead: the doubled `B0 01`

Every recall burst in the 2026-08-09 captures closes with a doubled `B0 01` —
CC 1, the mod wheel — which nothing in the protocol explains. The manual says
some sample sets support the mod wheel, via the LFO pair that does not exist on
this firmware. Whether the two facts are related is untested, and this is the
only lead there is. Recorded so the next person does not start from nothing.

### What we heard — Venice Grand D-274, 2026-08-14

The first observation of our own behind this section. Everything above it is
Crumar's account; this is one sample set, listened to one parameter at a time.

**Method.** The sound loaded bare into the edit buffer, all eight parameters set
to **64** first so only one thing changed at a time, reverb off. Each parameter
driven to 0 and to 127 through the app's own MIDI stack, every write confirmed
by read-back, Daniel playing and reporting between changes. Nothing stored.

| Parameter | Key | Heard |
|---|---|---|
| Level | `rom_p00` | **Works, but it is a trim, not a mute.** 0 is roughly 60% volume and still plainly a piano; 127 is full. This is why a patch reading "Level 0" still sounds |
| Attack | `rom_p01` | **Works, strongly.** 0 speaks immediately, 127 is a very slow swell |
| Release | `rom_p02` | **Works.** 0 cuts off abruptly, 127 rings on |
| Filter | `rom_p03` | **No audible effect**, across two passes (0 → 127 → 0), including held chords in the upper register |
| Velocity | `rom_p04` | **No audible difference** between 0 and 127, playing softest-to-hardest at both. Reported with less certainty than the Filter null |
| Piano Harp | `rom_p05` | **Works, big difference.** Silent low chord held, staccato note struck above: the held strings ring far more at 127 |
| Rel. Smp. Level | `rom_p08` | **No audible difference** on a clean 127 → 0 comparison, staccato notes without pedal. One pass |
| Ped. Smp. Level | `rom_p09` | **Works** — 0 gives no pedal noise, 127 gives plenty. From Daniel's prior experience of this control, NOT from today's A/B, which stopped before this row |

**Filter and Velocity are the surprise.** The manual lists both among the five
that apply to every sample set; on this one neither did anything audible. That
is a contradiction of the documentation, not of the device: the writes were
accepted and echoed (see `docs/protocol.md`, the 2026-08-14 sweep), so the
values arrive and something else decides they do nothing here.

**Piano Harp behaves exactly as documented** — conditional on piano samples,
and this is a piano sample.

**Still open.** Only one sample set has been listened to. The contrast set
(Combo Piano, where the piano-specific parameters should fall silent) was not
reached, `rom_p08` deserves a second pass given how subtle it is, and nothing
here says whether Filter and Velocity are inert on every set or only on this
one. A null on one instrument is not a null on the engine.

### Why parameters appear dead

The group must cover every sample set the engine can load, so an
individual set only implements the components it contains. A parameter
addressing a missing component has little or no audible effect.

Nothing on the device reports which parameters are live for the loaded
sound. The schema cannot express it.

Verified three ways: observed in this app; reproduced in Crumar's own
editor at gsidsp.com/Seven (ruling out our send path); confirmed by the
manual above.

Note that three parameters here have "Level" in the name — `rom_p00`,
`rom_p08`, `rom_p09` — and two of those are conditional. Reports that "the
level control does nothing" are usually one of the two.

**App consequence:** do not hide, grey out, or flag parameters as inert.
"Little effect" is not "no effect", the boundary is sample-specific, and
establishing it requires listening to all 24 sounds. State the general
fact once in help text instead.

---

## 5. Effects

Signal chain elements, each independently switchable.

**EQ** — three-band semi-parametric: bass, treble, middle, selectable mid
frequency, plus a bypass that overrides equalisation entirely.

**FX1** — one of: Mono Tremolo, Stereo Auto-Panner, LFO Wha-Wha, Pedal
Wha-Wha. Shared DEPTH and SPEED. Pedal Wha-Wha requires an expression pedal
and **overrides any other expression pedal assignment**.

*Naming:* the manual calls this control RATE. The device calls it **Speed** —
`fx1_sp` (ID 77) and `fx2_sp` (ID 81) both read "Speed" in
`schema/seven-1.37.json`. This file uses the device's word from here on, so a
reader holding the manual should read its RATE as Speed throughout.

**FX2** — one of: Stereo Chorus, Stereo Phaser, Stereo Flanger, Delay.
Shared DEPTH and SPEED, except that SPEED acts as delay TIME for Delay
(the device labels it `fx2_sp` "Speed" in every mode).
- *Phaser* adds: stage count (2, 4, 6, 8), LFO offset, feedback.
- *Delay* adds: max feedback and max level (DEPTH scales both together),
  and stereo spread, which separates left/right reflections up to a
  ping-pong effect.

**Amp simulator** — five models: Twin, AC30, JCM, Jazz Chorus (without the
chorus), Bass. Each with a passive three-way EQ. The panel knob sets
overdrive amount.

**Reverb** — level and decay on the panel; damp, diffusion, pre-delay,
room size, high shelf and low shelf in the editor.

**Pad** — a virtual analog synth layered under any piano sound, not
strictly an effect. Level and blend, where blend morphs low (cold, thin)
to high (warm, dark, soft) by moving a whole set of internal elements
including low-pass filter, oscillator detuning and chorus.

---

## 6. Expression pedal

Assignable to: master volume, FX1 depth, FX2 depth, FX1+2 depth, FX1 speed,
FX2 speed, FX1+2 speed, amp drive (only when the amp simulator is on), pad
level, pad blend.

Range min and max are settable; **if min exceeds max the action reverses**.

The assignment is **stored per preset**, so it travels with a patch.

Pedal Wha-Wha on FX1 takes priority over any assignment here.

**Observed on hardware:** the pedal always transmits CC 11 regardless of
its assigned function.

---

## 7. Globals

Editor home page. These are instrument-wide, not per-preset.

The device's own nine, in the order it reports them. The `glb` array in the
`0x33` globals reply is what `0x30` addresses by index, and that addressing is
verified 1:1 for all nine slots; the names were pinned on 2026-08-12 by moving
one field at a time while a passive watcher sampled the array
(`schema/seven-1.37.json`, `globals.keys.glb`).

| glb | Setting | Values | Notes |
|---|---|---|---|
| 0 | Channel | 1–16 or OFF | OFF disables MIDI send/receive except in local-off |
| 1 | Alt. Channel | 1–16 | Send only, local-off mode only |
| 2 | Send CC | Yes / No | Emit CC when a control moves |
| 3 | Send PC | Yes / No | Emit PC on preset recall |
| 4 | Midi Soft-Thru | — | **Not in the manual.** Present on the device |
| 5 | Sustain Pol. | N.C. / N.O. | Also togglable by holding BANK 3 seconds |
| 6 | Volume Type | From Presets / Global | Global makes the volume knob ignore preset values |
| 7 | Velocity Curve | — | **Not in the manual.** Present on the device |
| 8 | Memory Protect | Off / On | **On blocks preset overwriting entirely** |

### Storage (ACTION `0x0A`) is FREE SPACE, and cannot be predicted

Measured 2026-08-21 on Daniel's unit. It read `4.0GB` on 2026-08-09 and again
on 2026-08-15, and **`2.5GB`** after three expansions were installed on the
20th — Venice Grand C5, Venice Grand CFX and Venice Upright K8, all three
confirmed present in the sound table (27 sounds).

So the earlier figure was never a capacity that happened to look round: it was
a free reading taken when more was free. **The display was removed in `c052079`
on the grounds that the number looked unreliable — right about the symptom,
wrong about the cause. Free space is supposed to move.**

**THE INSTALLED SIZE CANNOT BE DERIVED FROM THE CATALOGUE.** The three
downloads total **535.31 Mb** (234.08 + 184.97 + 116.26) while the free figure
fell by **~1.5 GB** — roughly three times larger, which is unsurprising for a
`.7ex` package that is compressed (high entropy from byte 0, `docs/protocol.md`).

That is **one measurement on one unit**, not a ratio anyone should rely on. It
is recorded to rule something out rather than to enable something: **nothing may
compute "space needed" from a download size, or reconcile the two numbers.**
They measure different things, and the app shows the instrument's own figure
verbatim, labelled `free` (`src/storage-label.js`).

It is read once inside `_connect()` and refreshed by anything already talking to
the instrument (`refreshStorage`) — never polled, and never on a timer.

### Tuning is not in the glb space — open question

The manual lists Tuning (A=430–450 Hz, default 440, requiring a reboot) among
the globals. The device does report it, but **not as a `glb` index**: the
`0x33` reply carries three keys — `tun`, `glb` and `wfp` — and tuning is the
separate `tun` field. All nine `glb` slots are accounted for above, so tuning
is not one of them.

That means it can be READ but there is no known way to WRITE it: `0x30` takes a
`glb` index, and `tun` has none. Whether another opcode sets it, or whether it
is panel-and-reboot only, is untested. The app shows it as a read-only value
for exactly this reason.

### What our captures corroborate

- **Send PC off explains a silent recall.** The 2026-08-09 captures show no
  Program Change on a panel recall. The manual's description of this global —
  emit PC whenever a preset is recalled — fits exactly, with the global off on
  this unit. Later confirmed by turning it on: `glb` 3, after which panel
  recalls carry `Cn <slot>`, the slot identity the `0x45` broadcast lacks.
- **This unit behaves as "From Presets".** A recall loaded the stored volume of
  116 rather than leaving the knob's position alone (`docs/protocol.md`, open
  item 7). A unit set to Global would answer a backup differently on `veq_vol`,
  so a backup is only comparable across units when this setting matches.
- **Channel OFF would break the app entirely.** It disables send AND receive
  except local-off sending, so a unit set that way would ignore the
  PC-driven recalls the backup runner depends on. Untested here — no capture
  exists of a unit in that state.

### Memory Protect is a transfer blocker

With Memory Protect on, the three-second hold will not store. Nothing in
the protocol announces this. A transfer walk that doesn't check it will
guide the user through eight holds that all silently fail.

**App requirement:** read Memory Protect during pre-flight and refuse to
start a transfer while it is on, naming the setting and where to change it.
It is readable now: `glb` index 8 in the `0x33` reply.

### Wi-Fi password

Stored in the globals reply as `wfp`, in plaintext. Default `00000000`,
user-settable up to 8 characters, resettable via a recessed button behind
the Wi-Fi Reset hole.

**Must be redacted in the parse layer** — never reaching a log, IPC
message, renderer state, crash report, or disk.

---

## 8. Fixed MIDI CC map

These 22 are hard-assigned and cannot be remapped. All other parameters
are unassigned by default and freely assignable via the editor's MIDI
Controller Map page.

| CC | Parameter | | CC | Parameter |
|---|---|---|---|---|
| 7 | Volume | | 25 | FX2 select |
| 12 | EQ bass | | 26 | FX2 depth |
| 13 | EQ treble | | 27 | FX2 speed (`fx2_sp`) |
| 14 | EQ middle | | 28 | Amp toggle |
| 15 | EQ mid frequency | | 29 | Amp drive |
| 16 | EQ bypass | | 30 | Reverb toggle |
| 20 | FX1 toggle | | 31 | Pad toggle |
| 21 | FX1 select | | 32 | Pad level |
| 22 | FX1 depth | | 33 | Pad blend |
| 23 | FX1 speed (`fx1_sp`) | | 91 | Reverb level |
| 24 | FX2 toggle | | 92 | Reverb decay |

These are the 22 values carried in the unsolicited `0x45` recall
broadcast. The correspondence is exact and worth preserving as a
cross-check.

**Three independent sources agree on this list:** the device's own `flag` field
per parameter, the FW 1.22 manual, and the FW 1.2 manual's §10.4 table — and
the 2026-08-09 captures show exactly these 22 CCs in the recall burst. Where
the manual and the device disagree elsewhere, they do not disagree here.

Note CC 11 (expression) is transmitted by the pedal but is not in this
table.

---

## 9. Factory presets

**Bank 1 is hardware write-protected.** Its red LED distinguishes it from
the three user banks (yellow LEDs). Each Bank 1 preset uses one of the
eight modeling engines, labelled above the button. Captures of Bank 1 are
therefore genuine Crumar factory data on any unit.

Banks 2–4 ship with the presets below but are user-writable, so on any
given instrument their contents are unknown until read.

| Slot | Name | Engine | Effects |
|---|---|---|---|
| 1-1 | Tine Piano | Tine | **none** — all defaults, dry |
| 1-2 | Reed Piano | Reed | Amp sim, mono tremolo, reverb |
| 1-3 | Electric Grand Piano | Electric Grand | Reverb |
| 1-4 | Clavi Piano | Clavi | Reverb |
| 1-5 | DX Digital Piano | DX | Reverb |
| 1-6 | MKS Digital Piano | MKS | Chorus, reverb |
| 1-7 | Vibraphone | Vibraphone | Mono tremolo, reverb |
| 1-8 | Acoustic Piano | Acoustic | Reverb |
| 2-1 | Downtines | Tine | Phaser, reverb |
| 2-2 | Dyno-My-Seven | Tine | Chorus, EQ, amp sim, reverb |
| 2-3 | Suitcase | Tine | Amp sim, reverb |
| 2-4 | FM Wurly | DX | Delay, pad, reverb |
| 2-5 | Pink Wurley | Reed | LFO-wha, amp sim, EQ, reverb |
| 2-6 | Funky-Clav | Clavi | LFO-wha, amp sim, reverb |
| 2-7 | Siriusly | Sampled Clavi | Delay, pad, EQ, reverb |
| 2-8 | Pop Piano | Acoustic | Delay, pad, EQ, reverb |
| 3-1 | Waterpiano | Tine | Phaser, amp sim, EQ, reverb |
| 3-2 | Digipop Piano | MKS | Flanger, pad, EQ, reverb |
| 3-3 | Stranger Wurly | Reed | Chorus, amp sim, reverb |
| 3-4 | Sampled CP | Sampled CP | Reverb |
| 3-5 | Outta-Clav | Clavi | Phaser, amp sim, reverb |
| 3-6 | Seven Guitars | Sampled Clavi | Chorus, pad, EQ, reverb |
| 3-7 | Sampled Vibes | Sampled Vibraphone | Mono tremolo, reverb |
| 3-8 | Rock Piano | Acoustic | EQ, reverb |
| 4-1 | Deep Digipiano | DX | Chorus, pad, EQ, reverb |
| 4-2 | Wet Babygrand | Electric Grand | Chorus, amp sim, pad, EQ, reverb |
| 4-3 | Sugar DX | DX | Chorus, pad, EQ, reverb |
| 4-4 | FM Raindrops | DX | Delay, pad, reverb |
| 4-5 | Pop Combo Piano | Combo Piano | Delay, pad, EQ, reverb |
| 4-6 | Brass'n'Strings | DX | Mono tremolo, delay, pad, EQ, reverb |
| 4-7 | FM Organ | DX | Mono tremolo, chorus, EQ, reverb |
| 4-8 | Sampled Piano | GSi Grand D | Reverb |

**Corroborated by capture:** Bank 1 is the eight modeled engines in sound-ID
order. The controlled capture of 2026-08-09 walked presets 1–4 and read sounds
0–3, in step. So a Bank 1 capture on any unit is genuine factory data, which is
what makes `schema/factory-defaults-1.37.json` evidence rather than a guess.

**App consequence:** 1-1 carries no effects at all while the other seven
Bank 1 presets do. A patch generated by seeding from Bank 1 will therefore
arrive with an FX chain for every model except Tine. That is correct
behaviour, not a defect.

---

## 10. Panel behaviour

### Preset recall and store

- Press BANK to cycle banks; its LED blinks while a bank is pending.
- **If no preset is pressed within ~3 seconds, the bank reverts** and the
  LED stops blinking.
- Store: select a user bank, then hold the target preset button for at
  least 3 seconds until an LED animation confirms.
- **The instrument always powers on at preset 1-1.**

### Encoders

Eight RGB encoders, each an input and an output device. Colour encodes
value: green at low, red at high, with intermediate shades. Knobs update
immediately on preset recall.

- **Slow push** (held ≥100 ms) — always toggles an effect on or off. The
  100 ms threshold exists so knobs knocked during playing don't toggle.
- **Quick push** — switches which of two parameters the knob controls.

| # | Parameter 1 | Parameter 2 | Slow push | Quick push |
|---|---|---|---|---|
| 1 | Volume | — | Local on/off | — |
| 2 | Reverb level | Reverb decay | Reverb on/off | Switch parameter |
| 3 | EQ bass | EQ mid | EQ on/off | — |
| 4 | EQ treble | EQ mid freq | EQ reset | Switch parameter |
| 5 | FX1 depth | FX1 speed | FX1 on/off | Switch parameter |
| 6 | Drive amount | — | Amp/drive on/off | — |
| 7 | FX2 depth | FX2 speed | FX2 on/off | Switch parameter |
| 8 | Pad level | Pad blend | Pad on/off | Switch parameter |

The two manuals disagree on knobs 3 and 4: the Sep 2020 edition gives the
quick push to knob 3, the Jul 2021 edition to knob 4. The table above
follows the newer manual. Untested on hardware — verify before relying on
it for the panel SVG.

When a knob displays FX speed, its blue light pulses in sync with the
effect's oscillator.

### Other panel states

- **Volume knob blue = Local Off.** The instrument will not play its
  internal engine. Worth surfacing in the app, since it presents as "no
  sound" with everything else apparently correct.
- **The illuminated Seven logo is brighter on a modeling engine** and dims
  on a sampled one.
- **Preset buttons have an LED but the button face does not illuminate.**
- Transpose: hold the transpose button and play a note near middle C to
  set −12 to +12 semitones. Middle C or a 3-second hold resets. **Always
  zeroed at power-on.**
- Hold BANK for 3 seconds to reverse sustain pedal polarity.
- FX SEL button: first press shows the current effect and times out after
  3 seconds; pressing again within that window advances the selection.
  Works whether or not the FX section is on.

### Service shortcuts and curios

- **Music demo** — hold CLAVI TABS and push VOLUME (manual p.44).
- **Dark mode** — hold FX2 SELECT (Crumar KB article 54).
- **Recovery mode** exists for failed boots (KB article 40).
- KB article 25 discusses "strange behaviours" on Bank 1 Preset 8, the modeled
  grand — unfetched, recorded as a pointer only. Note that Crumar separately
  flags that engine as experimental (§3).

---

## 11. Sample expansions

Ten published expansions, shared between the Seven and the Seventeen.
Installed via the editor's Wavetable Expansions section from a USB drive;
the same page reports available storage.

| Expansion | Released |
|---|---|
| Venice Grand | Jan 2019 |
| Venice Grand Open | Sep 2019 |
| Venice Grand D-274 | Nov 2021 |
| Electric Grand 70BXL | Nov 2021 |
| Venice Grand Breeze | Nov 2021 |
| Venice Grand C5 | Mar 2022 |
| Venice Upright K8 | Sep 2022 |
| Venice Grand CFX | Mar 2023 |
| Venice Upright U1/Felt | Apr 2024 |
| Venice Grand CB1898 | Apr 2024 |

**One download does not equal one sound.** Venice Upright U1/Felt supplies
two entries in the sound list. Any expansion-to-sound mapping must account
for this.

Sound IDs 0–7 are the modeled engines. IDs 8–15 are built-in sampled
sounds, not expansions. IDs 16+ are expansion content, so the tail of the
sound list is what varies between instruments.

**App consequence:** reading the device sound table answers "what is
installed". This table answers "what exists". The difference is a
ready-made Visibility feature.

### Detecting a store: what works, and the three places it is blind

The Seven does not ANNOUNCE a store. A three-second hold emits exactly what a
tap emits — `0x45`, the 22 panel CCs, then the PC — with no marker and no
timing difference (`captures/store-hold-2026-08-12-notes.md`).

**But the burst CONTENTS give it away.** The broadcast following a store carries
what was just WRITTEN; the one following a tap carries what the preset held
before. The transfer runner recalls each destination on its way in, so it holds
a "before" for free — and a burst on that slot whose fingerprint differs is the
app watching the write land (`_watchForStore`).

That is real evidence, and the walk advances on it: the renderer races the
"Held it" button against the instrument's own event, and **the instrument
usually wins**. The report records which, per slot — `confirmed` is every slot
established either way, `verified` the subset the Seven showed us — so the note
can say what is true instead of asserting the weaker basis flatly.

**THREE BLIND SPOTS, established and not theoretical:**

- **Send PC OFF: no detection at all.** The burst is closed by the Program
  Change, so with the global off there is no fingerprint to compare. `_recall`
  resolves `null`, `_watchForStore` returns immediately, and the button is the
  only path.
- **A difference in CC-LESS PARAMETERS ONLY: invisible.** The fingerprint is
  the sound id plus the 22 panel CCs, and most modelled engine controls carry
  no CC — so such a store produces a byte-identical burst. Found the hard way
  on 2026-08-15: a real store the runner could not see.
- **Storing what was already there: nothing changes, so nothing fires.** The
  walk usually skips that case earlier anyway, by reading the slot back in
  full (110 parameters) and finding it already holds the patch.

In all three the outcome is the same and none is a failure: the player presses
the button, and the report says the basis was their word.

### No version field for a sample set — an observation, nothing more

The sound table (`0x42`) returns an **id and a name**. There is **no version
field anywhere in the protocol** — not in the sound spec, not in the globals,
not in the STRING space. That is all this entry claims.

**What used to be here, and why it is gone (2026-08-22).** This section
asserted that two Sevens can report the same sound name while holding different
versions of that sample set, and the app said so to users in the transfer
summary. The only evidence ever offered was the absence above — which
establishes that the app COULD NOT DETECT a version difference, not that one
can exist. **Absence of a version field is equally consistent with there being
no versions at all.**

Nothing in this repo grounded it: no capture, no manual note, no vendor page,
no user report, and no code branching on a version. It entered in a single
commit (`a2a12a1`, 2026-08-15) that introduced the claim, this section and the
UI string together. Crumar publishes ten downloads supplying eleven sounds, one
version each as far as anyone here has seen, and the owner has never heard of a
set being re-issued.

**What would bring it back:** evidence that Crumar has re-issued a sample set
under the same name — a vendor page, a README, a changelog, or two instruments
demonstrably differing on one name. Then the claim is legitimate and belongs
here **with that citation**. It does not come back from memory.

---

## 12. Editor access

Two editors, documented as such from the Jul 2021 manual onward. The Sep
2020 edition described only the Wi-Fi one.

**USB editor** — `https://www.gsidsp.com/Seven`, over the Type-B USB MIDI
port. Crumar specifies Chrome and warns other browsers may not work
(WebMIDI + SysEx). No export function at all — confirmed on the page itself,
2026-08-09. This is the editor whose traffic our captures tap, so its
behaviour is the closest published thing to a reference implementation for
what this app does.

**Wi-Fi editor home page** also carries the instrument-local operations the
USB editor has no route to: global options, preset export/import, wavetable
expansion install and uninstall, the Wi-Fi password, and links for firmware
update and factory restore.

### Scope: this app is USB-only

Everything this app does goes over the Type-B port as class-compliant USB-MIDI
SysEx. The Wi-Fi editor, its dongle, and the preset export/import it owns are
documented here for completeness and are **out of scope** — the app neither
speaks HTTP to the instrument nor reads the `.bin` files that editor writes.
They matter to this project only as context for what an owner can and cannot
do without it.

**Wi-Fi editor** — `http://192.168.1.1`, served by the instrument. Owns
preset export/import.

### The Wi-Fi editor needs a dongle

The 2020 manual described the Wi-Fi as an internal hot-spot. The 2021
manual corrects this: it **requires the Crumar Wi-Fi USB adapter** plugged
into one of the two Type-A System USB ports, and **the adapter must be
inserted while the instrument is powered off**.

So Wi-Fi is optional hardware, not a built-in feature. Any app copy
implying every Seven has a Wi-Fi editor is wrong, and a user without the
dongle has no route to preset export/import at all — which strengthens the
case for this app rather than weakening it.

SSID is `Seven-xxxxxxxx`, where the suffix is a per-unit hexadecimal
serial. Range is roughly 5–10 m. One connection at a time.

### USB ports

- **Two Type-A host ports** (the 2020 manual said one): firmware updates,
  the Wi-Fi dongle, USB thumb drives, and class-compliant USB-MIDI
  controllers, which the Seven recognises automatically. 250 mA max.
- **One Type-B port**: bidirectional class-compliant USB-MIDI to a
  computer. No drivers needed on Windows, macOS or Linux. This is the port
  this app uses. It is silkscreened **USB MIDI IN-OUT** and is a Type-B
  socket — the tall squarish "printer" connector — so a modern Mac needs a
  C-to-B cable and an older one A-to-B. Corroborated by the owner against the
  instrument itself; physical, so the staleness caveat that applies to
  parameters does not bite here.

## 13. Preset export/import (Wi-Fi editor only)

The instrument's own Wi-Fi editor at `192.168.1.1` exports a single preset as
`Seven_x-y.bin`, where x is bank and y is preset, onto a **FAT32 thumb drive in
the instrument's System USB port** — not to the browser doing the asking. Files may be
renamed but must keep the `.bin` extension.

Import activates the preset immediately in the edit buffer but **does not
store it** — storing still requires selecting a bank and holding a preset
button until the LED animation.

This is per-preset, not per-bank, which is consistent with the protocol
finding that nothing addresses a preset slot directly.

The gsidsp.com USB editor has no export function at all.

Only one device may be connected to the Wi-Fi editor at a time.
