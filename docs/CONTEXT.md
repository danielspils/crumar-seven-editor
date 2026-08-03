# Crumar Seven Editor — context handoff

State of the project as of **2 August 2026**, written so a fresh conversation can
pick up without re-deriving anything.

Companion docs in the repo: docs/PROJECT-SCOPE.md (why and what),
docs/protocol.md (SysEx spec), schema/seven-1.37.json (parameter schema),
docs/DESIGN.md (UI conventions), docs/FORMAT.md (patch file format),
CLAUDE.md (working rules for Claude Code), docs/manual-notes.md (stale FW 1.22
manual notes).

## 1. What this is

A cross-platform desktop app (Electron, plain JS, MIT) for the **Crumar Seven**,
a physical-modeling electric piano. Repo at ~/crumar-seven-editor. Built in
Claude Code.

Daniel is a self-employed web developer and composer in Seattle. He also
maintains **JP Patches** (github.com/danielspils/JP-Patches-App), an Electron
librarian for the Roland JX-3P — build config, signing, and the SVG panel
approach carry over.

### Why it exists

Crumar ships two editors, both awkward: a Wi-Fi web app needing an external USB
dongle, and a Chrome-only wired editor at gsidsp.com/Seven that must load over
the internet. Neither backs anything up or moves patches between instruments.
Per Crumar's own knowledge base, assigning a different base sound to a preset
**can only be done from an editor** — there's no front-panel path — so when the
editor is unavailable, a core operation is too.

**No prior art exists.** GitHub, Edisyn, JSynthLib, Patch Base and the forums
were searched in July 2026 — nothing for the Seven, Mojo 61, or GSi Gemini.

### Four goals, in priority order

1. **Backup** — patches survive hardware failure.
2. **Transfer** — load a patch set onto a different Seven (rented, second unit,
   post-repair).
3. **Editing** — a genuinely pleasant editor.
4. **Visibility** — show installed sample expansions; flag patches needing
   absent ones.

Non-goals: firmware work, installing expansions, audio recording, mobile,
parity with Crumar's editor as an end in itself.

**Phasing:** Backup → Visibility → Transfer → Editing. Editing is deliberately
last — largest UI surface, and the only area Crumar's tool already handles.

## 2. Protocol — decoded and hardware-verified

Firmware **1.37, build Thu May 12 15:43:17 2022** — the latest Crumar publishes,
four years stable. Full detail in docs/protocol.md.

**The device is self-describing.** It reports its own parameter list, labels,
ranges, CC assignments and current values as pipe-delimited ASCII. That's why
the protocol phase took an afternoon rather than weeks.

- Frame: F0 73 26 14 \<opcode\> \<payload\> F7. Manufacturer 0x73 0x26, product
  0x14.
- 26 opcodes, request/reply paired n / n+1. Names from the manufacturer's own
  constants.
- **110 parameters**, IDs 0–109. ID 110 is a sentinel returning garbage — never
  enumerate it.
- Parameter addressing: 0x00 \<idHi\> \<idLo\>, two 7-bit bytes, MSB first.
- Values are plain 0–max single bytes. No MSB/LSB split. Writes clamp at max.
- **24 sounds** on this unit (8 modeled + 16 sampled), dependent on installed
  expansions — enumerate at runtime, never hardcode.
- Globals: tun=440;glb=\<9 csv\>;wfp=\<8 chars\>.

### Verified frames

```
F0 73 26 14 14 00 <idHi> <idLo> F7          get one parameter spec
F0 73 26 14 22 00 <idHi> <idLo> F7          get one parameter value
F0 73 26 14 20 00 <idHi> <idLo> <value> F7  set parameter (observed from Crumar's editor)
F0 73 26 14 30 <index> <value> F7           set ONE global by index — NO leading 0x00
F0 73 26 14 31 <index> F7                   ack, echoes index only
```

Note the asymmetry: parameter addressing has a leading 0x00, set-global does
not. Don't share an address encoder between them.

### Security

**The globals reply contains `wfp` — the instrument's Wi-Fi password in
plaintext.** Redact it from all logging, captures and crash reports; never
commit a raw globals dump. .gitignore backstops this; Rule 6 in CLAUDE.md.

### Open items

| # | Item | Status |
|---|---|---|
| 1 | flag meaning | **CLOSED** — 1 = fixed panel CC, 0 = user-assignable. Confirmed by read AND the manual's fixed-CC table (22 parameters, exact match). |
| 2 | glb index addressing | **CLOSED** — 0x30 \<index\> maps 1:1 to glb[index], verified across all nine. |
| 3 | Enum labels for fx1_md, fx2_md, pha_st, amp_mo | Open, cosmetic. Corroborated by panel silkscreen; index→label mapping unconfirmed. |
| 4 | pdl_exp CC anomaly | **CLOSED** — assignable slots holding current assignments. |
| — | glb index→NAME mapping | Only index 2 (Send CC) and 8 (Memory Protect) pinned. The other seven assumed from DOM order — keep orderUnverified. Values are per-field, NOT uniformly 0-based. |

### Lessons worth not relearning

- **An identity write cannot validate a write path.** If the device silently
  ignores a malformed frame, the re-read is byte-identical — indistinguishable
  from success. This produced a false "framing validated" before the real 0x30
  frame was captured from Crumar's editor. Verification requires an actual
  value change plus read-back.
- The bulk dump (0x12) works once then ignores repeats. Enumerate 0–109 with
  0x14.
- Send bursts with explicit incrementing timestamps, not setInterval — browsers
  throttle background-tab timers to ~1 Hz.
- A fast burst drops the occasional response. Verify coverage, re-request gaps.
- **Never restore a global to a literal.** Restore each index to its captured
  pre-run value. Daniel toggles Memory Protect deliberately; a hardcoded
  restore silently fights him.

## 3. Hard constraints

**Storing a preset requires a physical three-second button hold.** Crumar's own
editor can't store remotely either. Editing over USB *is* live — 0x20 changes
parameters immediately and audibly. Only *persisting* to a slot needs the
panel. The UI must say so plainly.

**Sound IDs are not portable.** "Venice Grand CB1898" is ID 18 here; another
Seven with different expansions has a different list. The patch format stores
the sound **name** and resolves on import.

**Reading and writing are asymmetric.** Backup can be fully automated; restore
is a guided sequence, not a progress bar.

## 4. Instrument facts (from the official manual)

- **4 banks × 8 presets = 32.** Bank 1 factory read-only; banks 2–4 user.
- Recall: press BANK, then a preset number. Save: hold a preset ~3s until the
  LED animation.
- Pressing BANK does **not** switch immediately — the LED blinks and waits; the
  bank commits only when a preset is pressed within 3s, else it reverts.
  (Deferred in our UI, see §5.)
- The Seven always starts at preset 1-1 on power-up.
- Knob pushes: **slow** (≥100ms) toggles an effect; **quick** switches which
  parameter the knob displays.
- Knobs are **RGB encoders that encode value** — green low → red high, off
  entirely at some values. Reverb Decay is blue→red. FX Rate pulses blue in
  sync with the effect's LFO.
- Volume slow push = **Local Off** (knob turns blue), NOT mute.
- Transposition zeroes at every power-on — device state, not patch data.
- Expression pedal assignment IS stored per preset, so pdl_exp belongs in the
  patch file.
- Clavi tabs are the six zd6_* parameters, within the 110.
- **If all four Clavi filters are off, the instrument produces no sound.**
- Preset buttons are plain black plastic with an LED — the face does not
  illuminate.

### Firmware vs manual discrepancies (schema wins)

The manual documents FW 1.22. On 1.37: Duplex Scale (id 55) and Phaser Mix
(id 85) exist undocumented; amp EQ is individually addressable (ids 92–94);
two globals were added (Midi Soft-Thru, Velocity Curve); the sample player has
8 parameters, not 10 — the manual's LFO Rate/Depth are absent from the ID space
entirely.

One deliberate mismatch: the panel silkscreen says **RATE**; the device reports
the parameter label as **Speed**. Both correct for their source — don't "fix"
it.

## 5. Current build state

Electron shell running on fixture data. **No MIDI in the app yet** —
@julusian/midi is used only by the CLI prober.

- src/preload.js is the ONLY file that knows data comes from
  fixtures/sample-library.json. The renderer is pure and unit-tested. Swapping
  in real device reads changes that one file.
- tools/probe.js — CLI prober. Commands: list, info, enumerate, get, globals,
  open-items [flag|glb|enums|pedal|all]. Never stores a preset, never writes
  bank 1, gates writes behind --enable-writes, restores globals on
  exit/error/SIGINT.
- enumerate returns 110/110 coverage against hardware. Read path proven.
- assets/seven-panel.svg — the panel strip, inlined into the DOM (not an
  \<img\>) so LEDs and knobs bind. Every LED and knob carries an id.
- src/defaults.js — **heuristic, not device truth.** Real factory defaults were
  never captured; the schema's value field was current-state at interrogation
  time. The "differs from default" cue compares against min(64, max) until
  real defaults exist.
- Electron pinned to **43** — older majors get flagged by macOS XProtect and
  the binary silently vanishes. Worth checking JP Patches' pin for the same
  issue.
- @julusian/midi is a native module: needs electron-rebuild / install-app-deps
  for packaging. Runs in dev, fails in the packaged bundle. Resolve before
  release.

### Patch file format — built (2 Aug 2026)

Implemented as a data layer only: `docs/FORMAT.md` (spec) and `src/format/`
(serialize / parse / validate / resolve), with a 10-test suite (`npm test`,
Node's built-in runner) and a committed roundtrip fixture
(fixtures/library-roundtrip.json). No MIDI, not yet wired into the renderer.
The settled design decisions, all implemented:

One container format, .sevenlib.json, where a single patch is a bundle
containing one patch. Params keyed by schema key, never by ID or array
position. Sound NAME authoritative on import, ID diagnostic only. Per-patch
source provenance so a library can hold patches from more than one instrument.
Serializer throws if a wfp key appears at any depth. Parse never mutates —
out-of-range values are preserved and reported; clamping belongs at send time.
Data layer only — no MIDI.

### UI conventions (see docs/DESIGN.md)

- Underline = selection (bank tabs). Lighter background bar = section header.
  Chevron = collapsible. Filled pill = active status. Muted text = value at
  default. Dimmed = bypassed.
- Amber cap = effect ON (patch data). Accent outer ring = section expanded
  (view state). The outer ring shows only on the focused knob — a deliberate
  departure; the instrument rings every knob.
- Effect sections start collapsed. Clicking a knob or header toggles. Clicking
  a knob navigates only — never changes a value.
- **Controls representing device state render what the device reports, never
  what the user clicked.** No optimistic UI.
- Section order follows the manual, chapter 20. Crumar does not document the
  audio signal path.
- Parameter display order follows the hardware where the hardware has an order
  (the Clavi group runs Brilliant, Treble, Medium, Soft, C/D, A/B), otherwise
  schema order.

### Parameter rendering taxonomy

The renderer decides from schema data — max, values, bipolar — never hardcoded
key lists:

- **Continuous bar** — the default, 0–max.
- **Centre-origin bar** — bipolar parameters where the manual describes the
  middle as neutral: Hammer Offset, Stretch Tuning, Lid Position, String
  Detuning.
- **Rocker tab, one label** — the four Clavi filters. Independent toggles; any
  combination valid. Cream Clavinet-style caps in a dark bezel, rotated 90°
  from the instrument.
- **Rocker tab, two labels** — two-way choices with no "off": Pickup A/B
  (neck/bridge), Pickup C/D (single/both), Decay Type (Keyboard/Mallets).
- **Enum dropdown** — three or more options only. Never for a binary choice.
- **Numbered selector** — discrete variations with no known names: rho_tp
  (Type, 9 variations), dx7_tp (Variation, 9). Do not invent names.
- **Range pair** — exp_mn / exp_mx are one range; if min > max the pedal action
  reverses.

Also: veq_byp is inverted (1 = bypassed). Binary parameters are excluded from
at-default muting, since the heuristic makes an engaged switch look untouched.

## 6. Next steps

**Finish the patch file format** (data layer, no hardware).

**Two hardware captures**, using the browser-hook method that produced the 0x30
frame:

1. Does the Seven act on incoming Program Change to recall presets, and do PC
   numbers cover all four banks? Unlocks unattended backup. Needs no thumb
   drive — **do this one first**; its answer determines whether the backup UI
   is automatic or a guided click-through.
2. What does 0x72 ACTION expose? Capture from the editor's EXPORT button.
   Either confirms there's no remote store or overturns it. **Caution: that
   opcode space also contains factory reset and firmware update. Capture and
   read only — never fuzz it.**

**Still unanswered:** does a preset store state beyond the 110 parameters (a
preset name?); does the .bin export layout match SysEx order; how to obtain
real factory defaults without a factory reset (which wipes user presets); the
nine rho_tp / dx7_tp variation names.

## 7. Working style

Daniel iterates by screenshotting the running app and marking up what to
change. He wants instructions written as a **single block to paste into Claude
Code**, inside a code block so it can be copied — not prose commentary. Be
direct, no unsolicited encouragement, concrete next steps only.

The browser-control method that decoded the protocol: open gsidsp.com/Seven in
Chrome with the Seven on USB, patch MIDIOutput.prototype.send and add a
midimessage listener to log frames, then operate the manufacturer's editor and
read what it sends. That's how the real 0x30 frame was obtained after our
hypothesis proved wrong. It works for any remaining unknown.

A note on corrections: several early assumptions turned out wrong — that the
preset buttons illuminate red, that the volume knob's slow push was mute, that
the effects order reflected the signal chain. Each was inferred from photos or
convention rather than checked. When something about the instrument matters,
check the manual or ask Daniel; he owns the thing.
