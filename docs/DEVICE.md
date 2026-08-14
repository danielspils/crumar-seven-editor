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

## 1. Sound engines

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

## 2. Modeled sound parameters

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

Reproduces patch 7 "E.PIANO 1" of the Roland MKS-20 / RD-2000.
**One parameter only**, overall decay time. The original's BBD stereo
chorus is reproduced by turning FX2 on.

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
fundamental level (first harmonic against the rest of the harmonic
content); cabinet presence and cabinet timbre; lid position (low = closed,
centre = half open, high = removed).

**App consequence:** this is the group that overflows a fixed-height
panel. DX and MKS have one parameter each, Vibraphone two — so the sound
engine panel must handle a range from 1 to ~20 rows.

---

## 3. Sampled sounds (GSP-01)

All sampled sounds share a single parameter group. The player accepts only
Crumar/GSi sample sets — no user samples, no standard formats.

Ten parameters, **five of which are conditional**:

| Parameter | Applies |
|---|---|
| Level | Always — volume of the sample set |
| Attack | Always — relative to the set's built-in attack |
| Release | Always — relative to the set's built-in release |
| Filter | Always — low-pass response |
| Velocity | Always — MIDI velocity response |
| Piano Harp | **Only for piano samples** — resonance level; does nothing otherwise |
| LFO Rate | **Only if the set supports the mod wheel** |
| LFO Depth | **Only if the set supports the mod wheel** |
| Rel. Smp. Level | **Only if the set has a release sample** |
| Ped. Smp. Level | **Only if the set has a pedal noise sample** |

### Why parameters appear dead

The group must cover every sample set the engine can load, so an
individual set only implements the components it contains. A parameter
addressing a missing component has little or no audible effect.

Nothing on the device reports which parameters are live for the loaded
sound. The schema cannot express it.

Verified three ways: observed in this app; reproduced in Crumar's own
editor at gsidsp.com/Seven (ruling out our send path); confirmed by the
manual above.

Note that four parameters here have "level" in the name and three of those
are conditional. Reports that "the level control does nothing" are usually
one of the three.

**App consequence:** do not hide, grey out, or flag parameters as inert.
"Little effect" is not "no effect", the boundary is sample-specific, and
establishing it requires listening to all 24 sounds. State the general
fact once in help text instead.

---

## 4. Effects

Signal chain elements, each independently switchable.

**EQ** — three-band semi-parametric: bass, treble, middle, selectable mid
frequency, plus a bypass that overrides equalisation entirely.

**FX1** — one of: Mono Tremolo, Stereo Auto-Panner, LFO Wha-Wha, Pedal
Wha-Wha. Shared DEPTH and RATE. Pedal Wha-Wha requires an expression pedal
and **overrides any other expression pedal assignment**.

**FX2** — one of: Stereo Chorus, Stereo Phaser, Stereo Flanger, Delay.
Shared DEPTH and RATE, except that RATE becomes TIME for Delay.
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

## 5. Expression pedal

Assignable to: master volume, FX1 depth, FX2 depth, FX1+2 depth, FX1 rate,
FX2 rate, FX1+2 rate, amp drive (only when the amp simulator is on), pad
level, pad blend.

Range min and max are settable; **if min exceeds max the action reverses**.

The assignment is **stored per preset**, so it travels with a patch.

Pedal Wha-Wha on FX1 takes priority over any assignment here.

**Observed on hardware:** the pedal always transmits CC 11 regardless of
its assigned function.

---

## 6. Globals

Editor home page. These are instrument-wide, not per-preset.

| Setting | Values | Notes |
|---|---|---|
| Tuning | A=430–450 Hz | Default 440. **Requires reboot to take effect** |
| Channel | 1–16 or OFF | OFF disables MIDI send/receive except in local-off |
| Alt. Channel | 1–16 | Send only, local-off mode only |
| Send CC | Yes / No | Emit CC when a control moves |
| Send PC | Yes / No | Emit PC on preset recall. **Observed as glb index 3** |
| Sustain Pol. | N.C. / N.O. | Also togglable by holding BANK 3 seconds |
| Volume Type | From Presets / Global | Global makes the volume knob ignore preset values |
| Memory Protect | Off / On | **On blocks preset overwriting entirely** |

### Memory Protect is a transfer blocker

With Memory Protect on, the three-second hold will not store. Nothing in
the protocol announces this. A transfer walk that doesn't check it will
guide the user through eight holds that all silently fail.

**App requirement:** read Memory Protect during pre-flight and refuse to
start a transfer while it is on, naming the setting and where to change it.

### Wi-Fi password

Stored in the globals reply as `wfp`, in plaintext. Default `00000000`,
user-settable up to 8 characters, resettable via a recessed button behind
the Wi-Fi Reset hole.

**Must be redacted in the parse layer** — never reaching a log, IPC
message, renderer state, crash report, or disk.

---

## 7. Fixed MIDI CC map

These 22 are hard-assigned and cannot be remapped. All other parameters
are unassigned by default and freely assignable via the editor's MIDI
Controller Map page.

| CC | Parameter | | CC | Parameter |
|---|---|---|---|---|
| 7 | Volume | | 25 | FX2 select |
| 12 | EQ bass | | 26 | FX2 depth |
| 13 | EQ treble | | 27 | FX2 rate |
| 14 | EQ middle | | 28 | Amp toggle |
| 15 | EQ mid frequency | | 29 | Amp drive |
| 16 | EQ bypass | | 30 | Reverb toggle |
| 20 | FX1 toggle | | 31 | Pad toggle |
| 21 | FX1 select | | 32 | Pad level |
| 22 | FX1 depth | | 33 | Pad blend |
| 23 | FX1 rate | | 91 | Reverb level |
| 24 | FX2 toggle | | 92 | Reverb decay |

These are the 22 values carried in the unsolicited `0x45` recall
broadcast. The correspondence is exact and worth preserving as a
cross-check.

Note CC 11 (expression) is transmitted by the pedal but is not in this
table.

---

## 8. Factory presets

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

**App consequence:** 1-1 carries no effects at all while the other seven
Bank 1 presets do. A patch generated by seeding from Bank 1 will therefore
arrive with an FX chain for every model except Tine. That is correct
behaviour, not a defect.

---

## 9. Panel behaviour

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
| 5 | FX1 depth | FX1 rate | FX1 on/off | Switch parameter |
| 6 | Drive amount | — | Amp/drive on/off | — |
| 7 | FX2 depth | FX2 rate | FX2 on/off | Switch parameter |
| 8 | Pad level | Pad blend | Pad on/off | Switch parameter |

The two manuals disagree on knobs 3 and 4: the Sep 2020 edition gives the
quick push to knob 3, the Jul 2021 edition to knob 4. The table above
follows the newer manual. Untested on hardware — verify before relying on
it for the panel SVG.

When a knob displays FX rate, its blue light pulses in sync with the
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

---

## 10. Sample expansions

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

---

## 11. Editor access

Two editors, documented as such from the Jul 2021 manual onward. The Sep
2020 edition described only the Wi-Fi one.

**USB editor** — `https://www.gsidsp.com/Seven`, over the Type-B USB MIDI
port. Crumar specifies Chrome and warns other browsers may not work
(WebMIDI). No export function at all.

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
  this app uses.

## 12. Preset export/import (Wi-Fi editor only)

The instrument's own Wi-Fi editor at `192.168.1.1` exports a single preset
to USB as `Seven_x-y.bin`, where x is bank and y is preset. Files may be
renamed but must keep the `.bin` extension.

Import activates the preset immediately in the edit buffer but **does not
store it** — storing still requires selecting a bank and holding a preset
button until the LED animation.

This is per-preset, not per-bank, which is consistent with the protocol
finding that nothing addresses a preset slot directly.

The gsidsp.com USB editor has no export function at all.

Only one device may be connected to the Wi-Fi editor at a time.
