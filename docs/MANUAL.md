# The Crumar Seven user's manual, digested

**Read this before investigating anything about the instrument.** On 15 Nov 2026
two separate investigations re-derived facts that are stated plainly in the
manual — once about FX2 Delay's parameters, once about what DEPTH does in Delay
mode. Each cost a session with the hardware attached. This file exists so that
does not happen a third time.

## Provenance

| | |
|---|---|
| Source | `https://www.crumar.it/files/Crumar_Seven_Manual_ENG_july2021.pdf` |
| Edition | July 2021 |
| **Firmware documented** | **v1.22** |
| Publisher | V.M. Connection, Roncade (TV), Italy |
| Digested | 15 Nov 2026, read in full, nothing summarised from a summary |

## THE AUTHORITY RULE

**Daniel's unit runs FW 1.37. This manual documents FW 1.22.** Fifteen firmware
revisions separate them, and the manual says each release with new functions
comes with a new manual revision — so where they disagree, assume the firmware
moved and the manual did not.

The order of authority in this project, highest first:

1. **The instrument**, measured on hardware with its date recorded.
2. **`schema/seven-1.37.json`**, which is what the device reports about itself.
3. **This manual**, which is FW 1.22 and may simply be out of date.

`docs/DEVICE.md` is the curated reference and already records several places
where the device's word differs from the manual's. This file is the manual's own
account, kept faithful, so the two can be compared without re-opening a PDF.

Where the manual does not state something, this file says **not stated**. That
is a fact worth recording: it means the answer is not in the manual and must come
from the instrument.

---

# Chapter 20: Effects — the chapter this project needs most

## 20.3 FX2 (p.38)

Choices: Stereo Chorus, Stereo Phaser, Stereo Flanger, Delay.

DEPTH and RATE are common to all four, **"with the exception that when the Delay
is used this is actually the TIME parameter"**.

So in Delay mode the control labelled RATE on the panel — `fx2_sp`, which the
device itself labels **Speed** — is the delay **time**. Three names for one
control: RATE on the panel silkscreen, Speed in the device's schema, TIME in the
manual's prose.

## 20.5 Delay (p.38) — READ THIS BEFORE TOUCHING THE DELAY

Two statements, both verbatim:

> "When the Delay effect is selected, the DEPTH parameter varies both the delay
> feedback and level at the same time."

> "This section allows to establish the maximum amount of feedback and level
> that can be varied by the DEPTH parameter."

What follows from that:

- **DEPTH is the feedback amount in Delay mode.** It is not mislabelled and it is
  not mis-wired. It moves feedback and level together, by design.
- **Max Feedback and Max Level are CEILINGS.** They set how far DEPTH can push
  feedback and level. They are not amounts in their own right.
- **The manual never prints the names "Max Feedback" or "Max Level".** It only
  describes "the maximum amount of feedback and level". Those two labels come
  from the device's schema, not from this document.
- **STEREO SPREAD** separates left and right reflections, "until a ping-pong
  delay effect is obtained".
- Ranges, defaults and units for all four: **not stated**.

**Reachability.** The manual gives **no front-panel or menu route** to the two
maxima or to Stereo Spread. The panel reaches FX2 DEPTH and FX2 RATE only
(knob 7). The MIDI CC map lists FX2 DEPTH (26) and FX2 RATE (27) and **nothing
for feedback, level, spread or Delay TIME**. These are editor-only parameters.

**The open question this does NOT answer.** `dly_mf` and `dly_ml` take, echo and
hold values on hardware but have never been audible — recorded in
`docs/protocol.md` item 5b, tested 12 Aug 2026 twice and 15 Nov 2026 again. The
manual says they should act as ceilings. The instrument, on FW 1.37, does not
appear to honour them. Manual and device disagree, and by the authority rule the
device wins. **Do not label them inert in the UI until the condition is
demonstrated** — that instruction predates this file and still stands.

## 20.1 Master EQ (p.37)

3-band semi-parametric: bass, treble, middle, selectable middle frequency. The
editor has a bypass switch that overrides the EQ. Panel: knob 3 slow push.

## 20.2 FX1 (p.37)

Choices: Mono Tremolo, Stereo Auto-Panner, LFO Wha-Wha, Pedal Wha-Wha. Pedal
Wha-Wha requires an expression pedal. DEPTH and RATE common to all four. When
RATE is displayed on the knob, the blue light blinks in time with the
oscillator — same for FX2.

## 20.4 Phaser (p.38)

Stages: 2, 4, 6 or 8. Plus LFO offset and feedback amount.

## 20.6 Amp simulator (p.38)

Types: TWIN, AC30, JCM, JAZZ CHORUS (chorus excluded), BASS. Each has a passive
3-band EQ and overdrive. Panel knob 6 sets drive; **amp type is editor-only**.

## 20.7 Digital reverb (p.39)

Panel knob 2: LEVEL and DECAY. Editor adds DAMP, DIFFUSION, PRE-DELAY, ROOM SIZE,
HIGH SHELF, LOW SHELF.

*Manual inconsistency:* it describes HIGH SHELF as a high-pass filter and LOW
SHELF as a low-pass filter, which the names do not suggest.

## 20.8 Pad (p.39)

A virtual-analog synth layered under any piano. LEVEL and BLEND. BLEND morphs
from cold and thin at low values to warm, dark and soft at high ones, by moving
the low-pass filter, the oscillator detune and the chorus together. The panel
knob shows BLEND blue (cold) to red (warm).

## 20.9 Expression pedal (p.40)

Assignable FUNCTION, one of: VOLUME, FX1 DEPTH, FX2 DEPTH, FX 1+2 DEPTH, FX1
RATE, FX2 RATE, FX 1+2 RATE, AMP DRIVE (only when the amp simulator is on), PAD
LEVEL, PAD BLEND.

RANGE MIN and RANGE MAX set the travel. **If MIN is greater than MAX the
direction reverses.** The assignment is stored per preset.

When FX1 is Pedal Wha-Wha, the pedal always controls the Wha-Wha and overrides
any assignment.

*Not stated:* whether an FX2 RATE assignment controls TIME in Delay mode.

---

# Chapter 10: The editor and the global settings

## Two ways in (pp. 21–22)

1. **USB-MIDI, Chrome only.** Type-B USB to a computer, Android via OTG, or iPad
   via Camera Connection Kit. Open `https://www.gsidsp.com/Seven`. **The page is
   hosted externally and needs an internet connection.**
2. **The unit's own Wi-Fi hot-spot.** Needs the Crumar Wi-Fi USB adapter in a
   SYSTEM USB port, **inserted while the unit is off**. SSID is `Seven-` plus a
   hexadecimal serial. Default password `00000000`. Browse to
   `HTTP://192.168.1.1`. Range 5–10 m. **One device at a time.** A recessed
   WIFI RESET button on the connection panel restores the default password and
   reboots the unit.

Editor pages: home (global options), SELECT PIANO, EDIT PIANO, EDIT EFFECTS, and
the MIDI Controller Map.

## 10.1 Global options (pp. 23–24)

| Setting | Options | Default | Notes |
|---|---|---|---|
| Tuning | A=430 to A=450 Hz | **440 Hz** | **A reboot is required after a change.** |
| Channel | a MIDI channel, or OFF | not stated | OFF sends and receives nothing — *except* that Local Off still sends |
| Alt. Channel | a MIDI channel | not stated | **Local Off only, send only** |
| Send CC | YES / NO | not stated | YES sends CC whenever a control moves, on the panel **or in the editor** |
| Send PC | YES / NO | not stated | YES sends Program Change on preset recall |
| Sustain Pol. | N.C. / N.O. | not stated | also togglable by holding BANK for 3 s |
| Volume Type | From Presets / Global | **From Presets** | Global makes VOLUME a master that survives preset changes |
| Memory Protect | OFF / ON | **OFF** | ON locks presets against accidental overwrite |

## 10.2 Preset export / import (p.24)

Export writes `Seven_x-y.bin`, x = bank, y = preset. The file may be renamed but
**must keep the .bin extension**. Import loads and activates the preset
immediately but **does not overwrite stored memory until you store it on the
panel**. Storage is USB memory; which port is **not stated**.

## 10.3 Wavetable expansions (p.24)

INSTALL NEW opens a pop-up to choose an expansion file from the USB drive. A
second button uninstalls; its label is **not stated**. The pop-up shows available
storage. Expansions come from Crumar with their own instructions.

**Not stated:** total capacity, how many are installed, or any on-panel report of
installed expansions.

## 10.4 MIDI CC map (p.25)

Fixed CCs for panel-reachable parameters:

| CC | Parameter | CC | Parameter |
|---|---|---|---|
| 7 | VOLUME | 24 | FX2 TOGGLE |
| 12 | EQ BASS | 25 | FX2 SELECT |
| 13 | EQ TREBLE | 26 | FX2 DEPTH |
| 14 | EQ MIDDLE | 27 | FX2 RATE |
| 15 | EQ MID. FREQ. | 28 | AMP TOGGLE |
| 16 | EQ BYPASS | 29 | AMP DRIVE |
| 20 | FX1 TOGGLE | 30 | REVERB TOGGLE |
| 21 | FX1 SELECT | 31 | PAD TOGGLE |
| 22 | FX1 DEPTH | 32 | PAD LEVEL |
| 23 | FX1 RATE | 33 | PAD BLEND |
| | | 91 | REVERB LEVEL |
| | | 92 | REVERB DECAY |

Everything else is unassigned by default and **can be freely assigned to any CC**.
The page lists only assignable parameters.

**Absent from the map:** the expression pedal, the sustain pedal, Local Off,
Clavi tabs, transpose, presets, and **every Delay-mode parameter**.

*Manual inconsistency:* §10.4 says all panel parameters have fixed CC numbers,
but the table omits LOCAL ON-OFF, CLAVI TABS, transpose and presets, which the
manual itself describes as panel functions.

## 10.6 Firmware and factory restore (p.26)

The bottom of the home page shows the firmware version and its exact date, with
links to update firmware and to FACTORY RESTORE. **Factory restore deletes all
user presets**, replaces them with the factory set, and returns global settings
to their defaults. Chapter 21.1 says firmware arrives via a USB thumb drive in a
SYSTEM USB port.

## 10.7 SELECT PIANO (p.27)

The first 8 sounds are real-time synthesis, shown with instrument icons; the rest
are GSP-01 sample sets, shown with waveform icons. The active sound is
highlighted red. **The Seven logo on the panel is fully lit for a modeling sound
and dimmed for a sample.**

---

# Chapter 8: Presets, banks and storing

## 8.1 Presets (p.17)

- **4 banks of 8 = 32 presets.**
- **Bank 1 is factory and read-only**, with a red LED.
- **Banks 2–4 are user**, with yellow LEDs.
- **Recall:** press BANK (its LED blinks), then a preset number.
- **Store:** select a user bank, then **press and hold the preset button for at
  least 3 seconds**, until the LED animation.
- Press BANK and do nothing for 3 seconds and the previous bank is restored.
- **The unit always starts on preset 1-1 at power-on.**

There is no store opcode over MIDI. The 3-second physical hold is the only way to
keep a patch in a slot — which is the fact the whole save flow of this app is
built around.

## 8.2 Effect selection (p.19)

The SEL button picks the effect; its LED shows the choice. Selection works with
the section switched off: the LED shows the current effect for 3 seconds then
goes dark, and pressing SEL again within those 3 seconds advances.

*Manual error:* it says SEL "shifts the selection to the next preset". It means
the next effect.

## 8.3 Transposition (p.19)

Range -12 to +12 semitones. Hold the transpose button and play a note near middle
C. Reset by playing middle C, or by holding the button for 3 seconds until the
LED goes out. **Transposition is zeroed at every power-on.**

## Factory preset table (pp. 17–18)

**Bank 1 — factory, read-only**

| | Name | Engine | Effects |
|---|---|---|---|
| 1-1 | Tine Piano | Tine | none |
| 1-2 | Reed Piano | Reed | amp sim, mono tremolo, reverb |
| 1-3 | Electric Grand Piano | Electric Grand | reverb |
| 1-4 | Clavi Piano | Clavi | reverb |
| 1-5 | DX Digital Piano | DX | reverb — "turn FX2 on for a delay" |
| 1-6 | MKS Digital Piano | MKS | chorus, reverb |
| 1-7 | Vibraphone | Vibraphone | mono tremolo, reverb |
| 1-8 | Acoustic Piano | Acoustic Grand | reverb |

**Bank 2** — 2-1 Downtines · 2-2 Dyno-My-Seven · 2-3 Suitcase · 2-4 FM Wurly ·
2-5 Pink Wurley · 2-6 Funky-Clav · 2-7 Sirius-ly Sampled Clavi Piano ·
2-8 Pop Piano

**Bank 3** — 3-1 Waterpiano · 3-2 Digipop Piano · 3-3 Stranger Wurly ·
3-4 Sampled CP · 3-5 Outta-Clav · 3-6 Seven Guitars · 3-7 Sampled Vibes ·
3-8 Rock Piano

**Bank 4** — 4-1 Deep DigiPiano · 4-2 Wet BabyGrand · 4-3 Sugar DX ·
4-4 FM Raindrops · 4-5 Pop Combo Piano · 4-6 Brass'n'Strings · 4-7 FM Organ ·
4-8 Sampled Piano

*Manual inconsistency:* the text calls this the factory preset table and says
banks 2–4 are user-writable, yet the table lists all four banks.

---

# Chapter 7: The panel knobs

Eight RGB endless encoders. **Colour shows value**: green low, red high.
Blue-red and blue-green pairs appear on knobs carrying a second parameter.

- **Slow push** — hold at least 100 ms, then release — turns a function on or off.
  Slow push is used for on/off deliberately, so effects are not toggled by an
  accidental knock while playing.
- **Quick push** — press and release at once — switches between a knob's two
  parameters.
- **If VOLUME is blue, the unit is in Local Off and will not sound.**

| Knob | Parameter 1 | Parameter 2 | Slow push | Quick push |
|---|---|---|---|---|
| 1 | VOLUME | — | LOCAL ON-OFF (turns blue) | — |
| 2 | REVERB LEVEL | REVERB DECAY | REVERB ON-OFF | switch |
| 3 | EQ BASS | EQ MID | EQ ON-OFF | — |
| 4 | EQ TREBLE | EQ MID FREQ | **EQ RESET** | switch |
| 5 | FX1 DEPTH | FX1 RATE (pulsing blue) | FX1 ON-OFF | switch |
| 6 | DRIVE AMOUNT | — | AMP/DRIVE ON-OFF | — |
| 7 | FX2 DEPTH | FX2 RATE (pulsing blue) | FX2 ON-OFF | switch |
| 8 | PAD LEVEL | PAD BLEND | PAD ON-OFF | switch |

**EQ RESET is named nowhere else in the manual.** What it resets is not stated.

---

# Chapter 9: Extra panel functions

- **9.1 Clavi tabs (p.20).** The button under the transpose section is CLAVI TABS.
  Hold it and the preset buttons become the Clavinet D6's filter and pickup
  switches; its LEDs show the state. **If all filters are off there is no sound.**
- **9.2 Local Off (p.20).** Slow-push VOLUME until it turns blue. The keyboard
  stops driving the internal engine but still sends MIDI. Alt. Channel applies
  while Local Off is active.
- **9.3 Shortcut (p.20).** **Hold BANK for 3 seconds to reverse sustain pedal
  polarity**, the same setting as Sustain Pol. in the editor.

---

# Chapters 11–19: The sound engines

Unless noted, every sound-engine parameter is **editor-only (EDIT PIANO)** and
its range and default are **not stated**. The manual lists no sound-engine
parameter on the panel.

| Engine | Synthesis | Note range | Polyphony | Allocation |
|---|---|---|---|---|
| Tine Electric Piano | physical modeling | A0–C7 | 88, fully polyphonic | modeling |
| Reed Electric Piano | physical modeling | A1–C6 | 64, fully polyphonic | modeling |
| Electric Baby Grand | physical modeling | A0–C7 | 40 + 88 | modeling (hybrid) |
| Clavi E.P. | physical modeling | F1–E6 | 60, fully polyphonic | modeling — **no sustain pedal support** |
| DX Digital E.P. | phase modulation | A0–C7 | 28 | RR + IVS |
| MKS Digital E.P. | hybrid | A0–C7 | 90 | RR + IVS |
| Vibraphone | physical modeling | C2–C6 | 49, fully polyphonic | modeling |
| Acoustic Grand Piano | physical modeling | A0–C7 | 40 + 88 | modeling (hybrid) — **experimental** |
| GSP-01 | sample playback | A0–C7 | 100 | RR + IVS |
| Synth PAD | virtual analog | A0–C7 | 16 | RR + IVS |

Modeling engines share the note range of the real instrument, so **some keys are
silent by design and that is not a fault**. Sample sets stretch across the full
range.

**Allocation terms.** *Modeling*: one voice per note, ribattuto reuses a voice,
"fully polyphonic" means no limit. *RR + IVS*: round robin with intelligent voice
stealing, which always steals the quieter voice. *Hybrid*: used only by the two
grands — some strings always resonate, others only when struck.

### Per-engine parameters, as the manual prints them

- **Ch.11 Tine (p.28)** — Rhodes-type, "not specific to a Mark I, II or V".
  TYPE (one of 9 variations), ATTACK LEVEL, RELEASE LEVEL, HAMMER HARDNESS,
  BITE AND BARK, METALLIC, RESONANCES (sympathetic), PICKUP OFFSET,
  HI-PASS FILTER, PEDAL NOISE LEVEL.
- **Ch.12 Reed (p.29)** — Wurlitzer 200A-type, **dry output only; the amp
  simulator is needed for the speaker sound**. ATTACK LEVEL, RELEASE LEVEL,
  RELEASE TIME, HAMMER HARDNESS, PEDAL NOISE LEVEL, RESONANCES. Its tremolo is
  made with FX1 Mono Tremolo at "about 6,5 Hz".
- **Ch.13 Electric Grand (pp.30–31)** — Yamaha CP80-type. Assumes the EQ knobs
  centred and the brilliance lever high. HAMMER CUTOFF, HAMMER RESONANCE,
  HAMMER OFFSET, HAMMER WIDTH, STRING DAMPING, STRING DETUNING,
  **PICKUP COMPRESSION**, RELEASE LENGTH, STRETCH TUNING,
  SYMPATHETIC RESONANCES, KEY NOISE LEVEL, PEDAL NOISE LEVEL, DYNAMICS.
- **Ch.14 Clavi (p.31)** — Clavinet D6-type. CLAVI TABS is panel-reachable.
  PICKUP A/B, PICKUP C/D, FILTER SOFT, FILTER MEDIUM, FILTER TREBLE,
  FILTER BRILLIANT, DAMPER LEVER. *The text says one parameter is editor-only but
  never says which.*
- **Ch.15 DX (p.32)** — DX7 "E.PIANO 1"-type FM. **One parameter with 9
  variations; its name is not stated.** Variations include organ, brass, bass and
  marimba.
- **Ch.16 MKS (p.32)** — RD-2000 / MKS-20 patch 7. **One parameter setting overall
  decay time; its name is not stated.** The original's stereo BBD chorus is
  reproduced by turning on FX2.
- **Ch.17 Vibraphone (p.33)** — four-octave model. DECAY TYPE (Keyboard = damper
  per note; Mallets = one damper for all bars) and MALLET HARDNESS.
- **Ch.18 Acoustic Grand (pp.34–35)** — 243 strings; the last 17 notes have no
  dampers; duplex-scale soundboard. HAMMER CUTOFF, HAMMER RESONANCE,
  HAMMER OFFSET, HAMMER WIDTH, HAMMER BODY, STRING DAMPING, STRING DETUNING,
  DIRECT SOUND, RELEASE LENGTH, HARP HI-PASS, STRETCH TUNING,
  SYMPATHETIC RESONANCES, KEY NOISE LEVEL, RELEASE NOISE LEVEL,
  PEDAL NOISE LEVEL, FUNDAMENTAL LEVEL, CABINET PRESENCE, CABINET TIMBRE,
  LID POSITION, DYNAMICS. **The manual calls this engine experimental, "not 100%
  realistic" and "not problem free".**
- **Ch.19 GSP-01 sample player (p.36)** — plays **only Crumar and GSi sample
  sets**; no user sample import, no other formats. New sounds arrive as Crumar
  updates. LEVEL, ATTACK, RELEASE, FILTER, VELOCITY, PIANO HARP (piano samples
  only), LFO RATE and LFO DEPTH (only when the sample responds to the modulation
  wheel), REL. SMP. LEVEL and PED. SMP. LEVEL (when present).

---

# MIDI implementation, collected

- **Ports.** USB-MIDI Type-B to a computer; two Type-A SYSTEM host ports for
  class-compliant USB-MIDI devices; DIN5 **MIDI OUT only — there is no DIN MIDI
  IN**.
- **Channel.** One channel for send and receive. Set to OFF, nothing is sent or
  received, except that Local Off still sends.
- **Alt. Channel.** Send only, in Local Off only.
- **Send CC.** YES sends CC when a control moves on the panel *or in the editor*.
- **Send PC.** YES sends Program Change on preset recall.
- **Not stated:** whether the unit receives PC or CC; SysEx of any kind; Soft
  Thru; the sustain pedal's CC; the expression pedal's CC; the default values of
  Channel, Alt. Channel, Send CC, Send PC and Sustain Pol.

**SysEx is not documented at all.** Everything this project knows about the
`0x45` / `0x46` / `0x20` / `0x22` / `0x23` / `0x33` frames came from observing the
instrument, and is recorded in `docs/protocol.md`. The manual cannot confirm or
contradict any of it.

---

# Chapter 21: Connections

LEFT/MONO and RIGHT outputs on 1/4" TRS balanced jacks · two SYSTEM USB Type-A
host ports · OUT LEVEL switch · 1/4" TRS headphones · power switch · recessed
WIFI RESET · AC socket · USB MIDI Type-B · DIN5 MIDI OUT · EXPRESSION (10 kΩ
linear preferred, 50 kΩ works) · SUSTAIN.

**USB host ports** take firmware updates, the Wi-Fi dongle and class-compliant
USB-MIDI devices, recognised automatically. **Power limit 250 mA — not for
charging phones.**

**Accessory tray (p.43).** A knob on the right side unlocks it. Not for liquids,
flammables, or anything smaller than a jack cable.

# Chapter 22: Output level

| Switch | Level | For |
|---|---|---|
| L | -10 dB | consumer gear, unbalanced hi-fi, guitar/bass amps with a HI input |
| M | +4 dB | professional gear; balanced preferred, worth about 6 dB over unbalanced |
| H | ~+10 dB | very old gear with low input impedance or a weak preamp |

**H with normal equipment can raise the noise floor and distort.**

# Chapter 23: Specifications

100–240 V AC · outputs -10 dBu / +4 dBu / High Gain ~+10 dBu · headphones 32 Ω
minimum load · 110.6 × 44.7 × 19.0 cm with cover, 16.2 cm deep without ·
15 kg piano only, 23.5 kg with cover and legs, 3.5 kg legs · box 119.6 × 53.7 ×
27.0 cm, 27 kg.

**Hidden demo:** hold CLAVI TABS, then push VOLUME. Any button stops it.

**Not stated:** power consumption, display type, operating temperature, a MIDI
implementation chart, SysEx.

---

# Reachability summary

**Front panel.** VOLUME, LOCAL ON-OFF, REVERB LEVEL/DECAY/ON-OFF, EQ
BASS/MID/MID FREQ/TREBLE/ON-OFF, EQ RESET, FX1 DEPTH/RATE/ON-OFF/SEL, DRIVE
AMOUNT, AMP ON-OFF, FX2 DEPTH/RATE/ON-OFF/SEL, PAD LEVEL/BLEND/ON-OFF,
transpose, CLAVI TABS and its filter and pickup switches, BANK, the eight preset
buttons, the sustain-polarity shortcut, the demo.

**Editor only.** Every sound-engine parameter · the Delay maxima · STEREO SPREAD ·
phaser stages and feedback · amp type · the reverb extras · expression-pedal
assignment and range · all MIDI and global settings · Wi-Fi password · preset
export and import · expansions · firmware · factory restore.

**Hardware switches only.** WIFI RESET, POWER, OUT LEVEL.

---

# What the manual does NOT answer

Recording these is the point of the file: each one means the answer must come
from the instrument, not from reading again.

- Ranges, defaults and units for nearly every parameter in the machine.
- The units and range of Delay TIME.
- The device's own names for the two Delay maxima.
- The name of the single DX parameter and the single MKS parameter.
- Which Clavi parameter is editor-only.
- What EQ RESET resets.
- SysEx, Soft Thru, PC/CC reception, the sustain and expression CCs.
- Expansion capacity, and how the unit reports installed expansions.
- Default MIDI channel, Alt. Channel, Send CC, Send PC, Sustain Pol.
- The modulation wheel mentioned in ch.19 but described nowhere.

---

# Errors and inconsistencies inside the manual

Noted so that a future reader does not mistake one for a finding.

1. **Engine count.** Ch.1 lists nine engines without the Synth PAD; ch.4 says
   eight synthesizers plus a sample player; the ch.5 table has ten rows including
   the PAD; ch.20.8 treats the PAD as an effect.
2. **Vibraphone polyphony.** Ch.5 says fully polyphonic with no limit; ch.17 says
   no more than four notes at once with mallets.
3. **Note numbers in the ch.5 table are internally impossible.** Clavi gives E6 as
   note 88 while Reed gives C6 as 96; vibraphone gives C2 as 48 while Reed gives
   A1 as 33. Both pairs cannot hold.
4. **Factory preset table** lists all four banks though the text says banks 2–4
   are user memory.
5. **"Next preset"** in §8.2 means next *effect*.
6. **Output level units** differ between ch.22 (dB) and ch.23 (dBu).
7. **HIGH SHELF / LOW SHELF** are described as high-pass and low-pass filters.
8. **§10.4's claim** that all panel parameters have fixed CCs, against a table
   that omits several panel functions.
9. **Ch.14's "one more parameter"** that is editor-only is never named.
10. **Table of contents page numbers** disagree with the page footers for
    chapters 19, 20 and 22.

---

# Firmware version history, 1.0 → 1.37

**Source: `README.txt` inside `Crumar_Seven_Update_v1.37.zip`, downloaded from
Crumar 15 Nov 2026.** This is the only complete record that exists. Crumar's web
site publishes change lists for two versions only; everything else below is
found nowhere online. Keep this file — the zip is not archived anywhere else and
the download link may not outlive the product.

**Daniel's unit runs 1.37. The manual documents 1.22.** Five releases and four
years separate them.

## v1.37 — May 2022 · DANIEL'S FIRMWARE

- Added a global option for turning the **MIDI Soft-Thru** function on or off,
  the function having been added in 1.36.

That is the entire release.

## v1.36 — March 2022

- **Velocity Curve** settings, 5 variations, where "Normal" means no change from
  previous firmware.
- **Phaser MIX parameter** — "for more phasing flavors".
- **MIDI Soft-Thru**, passing everything arriving on USB-MIDI straight to the
  MIDI outputs.
- On some units the install recovers about 260 MB of unused flash.
- Improved recall time for big sampled sounds.
- Fixed a rare glitch when sampled sounds were switched rapidly from the editor.

## v1.35 — December 2021

- "Minor yet required improvements and fixes." Nothing enumerated.

## v1.30 — November 2021 · THE BIG ONE, AND IT IS AFTER THE MANUAL

- Improvements to installing sample expansions, including a check on available
  memory.
- **Improved the Tine Piano, Reed Piano, Acoustic Piano, Electric Grand Piano and
  Vibraphone physical models.**
- **"New improved EQ (replaces the old one) - Beware: some presets may sound
  differently now"** — Crumar's own warning, verbatim.
- Added Preset Import/Export and Expansion Install/Uninstall to the **USB editor**
  at gsidsp.com (they already existed in the Wi-Fi editor).
- **All encoders now respond to rotation acceleration** — 1.5 turns covers the
  full range.
- Optimisations to the internal web server and the control panel.
- Fixed a panel button glitch that occurred while the panel was locked.

The manual is dated **July 2021**. This release is **November 2021**. Five of the
instrument's engines and its entire EQ changed *after* the manual was printed.

## v1.22 — June 2019 · THE VERSION THE MANUAL DOCUMENTS

- Improved the Tine EP engine's low notes.
- Stability, optimisations, minor bug fixes.

## v1.21 — February 2019

- Workaround for Chrome failing to open the editor after an update.

## v1.20 — January 2018

- Further improvements to the Physical Modeling Acoustic Piano.
- Added Install / Uninstall for optional **wavetable expansions**.
- Improved the firmware update process.

## v1.11 — November 2018

- **Memory Protect**, enabled from the editor.
- **Panel Lock** — hold **FX2 SELECT for 3 seconds**. Disables all panel
  interaction **except the volume knob** and turns all lights off. Off by
  default.
- Fixed a problem that could make the instrument reload the first preset.

## v1.10 — October 2018

The release that explains several things this project relies on.

- A global option to **unlink volume from presets** and make it a global setting.
  This is the manual's "Volume Type".
- Export / import presets to USB memory.
- **"MIDI TX Channel selection can now be set on TX OFF"**, disabling everything
  going to the MIDI outputs. Crumar's stated reason: so messages generated during
  Local-ON do not interfere with other connected gear. **MIDI transmission is
  always active when LOCAL is OFF.** This is `glb[0] = 16` in this project's
  globals.
- Improved the Acoustic Piano and Electric Grand models.
- **"Replaced the parameter 'Fundamental Level' with 'Duplex Scale' in the AP
  Editing page."**
- **Pitch bend support for Clavi and DX EP**, recognised from MIDI.
- Fixed instability after changing global tuning.
- Introduced the **wired Online Editor** at gsidsp.com/Seven, described as
  experimental, based on the Web MIDI API, Chrome/Opera/Firefox only, and *not* a
  replacement for the internal Wi-Fi editor.
- Slight improvements to the Tine and Reed models.

## v1.0 — March 2018

First public release.

---

# What the version history changes about the manual

## 1. The manual documents a parameter that was renamed three years earlier

v1.10 (October 2018) **replaced FUNDAMENTAL LEVEL with DUPLEX SCALE** on the
Acoustic Piano page. The July 2021 manual still lists **FUNDAMENTAL LEVEL** in
chapter 18. **Check what `schema/seven-1.37.json` calls it and make sure this app
uses the device's name, not the manual's.**

## 2. The Phaser has a parameter the manual does not mention

**Phaser MIX**, added in 1.36. The manual's §20.4 lists stages, LFO offset and
feedback only. If this app does not expose MIX, it is missing a parameter the
instrument has.

## 3. Soft-Thru postdates the manual entirely

Added as a function in 1.36 and given its on/off global in 1.37. The manual
never mentions it. This project reads it as `glb[4]`, which it learned from the
instrument, not from any document.

## 4. Five engines and the EQ were rebuilt after the manual

v1.30 improved the Tine, Reed, Acoustic, Electric Grand and Vibraphone models and
**replaced the EQ outright**, with Crumar warning that presets may sound
different. Any sonic description in the manual's engine chapters predates that
work.

## 5. Nothing, in any release, ever mentions the Delay

Not feedback, not level, not the maxima, not stereo spread, not delay time. Over
ten releases and four years, the delay section is never touched in a published
note. So the manual's account of the maxima as ceilings is the **only** statement
that exists anywhere, and it describes FW 1.22.

That leaves `docs/protocol.md` item 5b where it was: the instrument takes and
holds `dly_mf` and `dly_ml`, nobody has heard them do anything, and no
documentation explains why. **It is not knowable from reading. Only the
instrument can answer it.**

## 6. Encoder acceleration, since it affects what a panel move means

From 1.30, the panel encoders respond to rotation speed — 1.5 turns covers the
full range. A fast turn moves a parameter much further than a slow one. Worth
knowing when reasoning about what the instrument reports during a panel move.
