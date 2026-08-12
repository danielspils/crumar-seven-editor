# Design notes

UI principles for the editor. Add to this file as they accumulate.

## Visual vocabulary

One meaning per treatment — don't reuse these for anything else:

- **Underline** = selection (bank tabs: text-width amber underline + raised
  background; the library's selected patch uses the red left-edge marker).
- **Lighter background bar** = section header (also the hover state that says
  the row is clickable).
- **Chevron** = collapsible; it rotates as the section opens.
- **Filled pill** = active (ON, green tint); **outlined pill** = inactive (OFF).
- **Muted text** = value at its default; **primary text** = value differs.
  Binary parameters (schema max = 1) are **excluded from at-default muting**
  and render as non-interactive ON/OFF pills (the header pill component) at
  full contrast: the `min(64, max)` heuristic in `src/defaults.js` calls 1 the
  "default" for a max=1 parameter, which made an engaged switch look untouched
  (e.g. Filter Soft/Medium ON but muted). This is a symptom of the defaults
  heuristic — revisit once real factory defaults are captured from the device.
- **Dimmed section/group** = bypassed (driven by the switch param only — never
  inferred from a value being zero), or inapplicable (clavi group when the
  Clavi engine isn't selected).
- **Tonal inversion on a preset button** = selected: the face's two tones swap
  (inset panel goes lighter, face goes near-black) and the LED lights. The
  physical preset buttons are black plastic with an LED — the face doesn't
  illuminate — so the subtle inversion is a **closer rendering of the real
  button** than the old red fill, which wrongly implied an illuminated face.
  The panel strip aims to render the hardware faithfully rather than
  substitute its own signalling. The BANK button never inverts: a bank is
  always current, so there is no selection for it to indicate — its four LEDs
  carry which bank is active.

## Type ladder

Five sizes, all of them already in use before they were written down here. A
new surface picks from this list rather than inventing a size — 11px and 14px
crept in that way and read as "off" without anyone being able to say why.

| Size | Weight | Treatment | What it is |
|---|---|---|---|
| 17px | 700 | — | The name of the thing this view is about: the engine's sound name, the source and destination of a transfer. One per view. |
| 15px | 700 | — | Dialog titles, where the title IS the subject. |
| 13px | 400 | — | Body copy. The document default (`body { font: 13px/1.45 }`). |
| 12px | 700 | uppercase, `.12em` tracking, dim | **Region header.** "ON THE SEVEN", "SOUND ENGINE", "TRANSFER". Labels the thing below it and stays out of the way. |
| 10px | 700 | uppercase, `.05–.1em` tracking, dim | Micro-labels: badges, chips, counts, the AUDITION MODE chip. |

**A header never competes with what it introduces.** The transfer modal first
set "Transfer" at 15/700 — the same size as the setlist name beneath it — and
read as two titles arguing. Region-header treatment fixed it: the label went
small and dim, and the two names it introduces went to 17. Same rule the main
window already follows, where "SOUND ENGINE" sits quietly above a 17px sound
name.

## Colour system

Colours are BORROWED FROM THE INSTRUMENT, never invented. The panel artwork is
drawn from photographs of the Seven, so its palette is the instrument's own —
and anything the app needs a colour for should come from there rather than
from a designer's preference.

| Role | Variable | Source | Used for |
|---|---|---|---|
| Action | `--action` | the panel's DEPTH/RATE legend green (`#4fb96a`) | filled buttons that DO something: Start Audition, Save to Library, the AUDITION MODE chip, the live bar's edge |
| Destructive | `--accent` | panel LED red | the selected-row edge, and any confirm that destroys something |
| Navigation | `--amber` | the panel's amber legends | which tab or segment is selected, focus rings, an open rename field |
| Modeled | `--modeled` | panel blue legend | the Modeled badge, outlined |
| Sampled | `--sampled` | panel green legend, darker | the Sampled badge, outlined |

Two rules keep those from colliding:

**Filled means action; outlined means state.** A filled green button does
something when pressed. An outlined green badge is a label. The Sampled badge
and the Save to Library button are both green and never read as the same kind
of thing, because one is a filled control and the other is an outline.

**Amber is for where you ARE, not for what to press.** The active bank tab, the
active segment, a focus ring, a field being edited. It was doing double duty as
the action colour, which is why the audition buttons read as louder than
anything else on screen (Daniel, 2026-08-11: "pretty out there").

### Both palettes, always

Every variable is defined in BOTH `:root` (dark) and `:root[data-theme="light"]`,
and `test/css-hazards.test.js` fails the build if one is missing. A colour that
exists in one theme is invisible in the other until someone switches, which is
exactly how the dropdown chevron stayed unreadable in light mode for weeks.

The same test forbids a hardcoded colour inside a `data:` URI outside the
palettes: an SVG in a data URI cannot inherit `currentColor`, so its stroke has
to be written in — safe only where each theme supplies its own.

### What is NOT themed

The panel strip and its controls (the Clavinet-style tabs, the knobs, the
pressed caps) keep their physical colours in both themes. They are a picture of
a machine that does not change colour when the room lights do.

## Parameter rendering taxonomy

How a parameter renders is decided from **schema data** (`max`, `values`,
`bipolar`, `pairMax`) — never from hardcoded key lists:

| Shape | Schema signature | Examples |
|---|---|---|
| Continuous bar | max > 15 | most 0–127 params |
| Centre-origin bar | `bipolar: true` (centre = neutral, per manual) | Hammer Offset, Stretch Tuning, Lid Position, String Detuning |
| ON/OFF rocker tab | max = 1, no values | the four Clavi filters |
| Two-way choice rocker tab | max = 1 + two values | Pickup A\|B, C\|D, Decay Type |
| Labelled enum dropdown | values, max > 1 | fx1_md, fx2_md, pha_st, amp_mo, exp_fn |
| Numbered selector | 2 ≤ max ≤ 15, no values | rho_tp, dx7_tp ("9 of 9") |
| Range pair | `pairMax` on the min param | exp_mn + exp_mx |

Rocker tabs draw as Clavinet-D6 hardware, rotated to horizontal: cream caps in
a dark recessed frame (consecutive tab rows fuse into one frame, as on the
instrument), the pressed side lower and darker, the raised side catching the
highlight. Toggles carry one label and read pressed = on. Choices carry both
labels and tip toward the active side — neither side is "off". Not the green
status pills; that vocabulary stays with section headers. Value→side mapping
(0 = first/left) is assumed, unverified (docs/PROJECT-SCOPE.md).

**Display order follows the hardware where the hardware has an order**: the
Clavi rows render BRILLIANT, TREBLE, MEDIUM, SOFT, C/D, A/B like the
instrument's tabs and our panel legends (the reverse of schema ID order).
Everything else keeps schema order. Display only — patch serialization stays
keyed by schema key.

Semantics carried by the renderer:

- **veq_byp is EQ *Bypass* — inverted**: 1 means bypassed, i.e. EQ OFF. The
  section pill, section dimming, and the two EQ knobs' lit state all read
  through the inversion.
- **Inert parameters say so** instead of pretending to apply: rom_p05 Piano
  Harp dims unless the loaded sample is a piano; the Expression Pedal section
  dims with an explanation while FX1 runs Pedal Wha-Wha (the wha takes
  priority over the pedal assignment, per the manual).
- **All four Clavi filters at 0 = no sound** from the instrument — surfaced as
  a warning banner on the patch, not left as a silent state.
- The range pair renders as one track with both handles; **min above max
  reverses the pedal action** (manual) and shows an amber min→max readout.

All of these controls are non-interactive for now.

## Navigation and collapse

- Effect sections **start collapsed** — the header row (chevron, name, summary,
  pill) is the chain's resting view. Clicking a knob on the strip or a section
  header **toggles** the section.
- **Clicking a knob navigates only. It never changes a value.**
- Opening scrolls the section into view if needed and briefly tints it;
  closing gets no highlight. Expand/collapse is view state — never written to
  patch data.

## Effects section order

Section order follows the manufacturer's manual (chapter 20). Crumar does not
document the Seven's actual audio signal path anywhere; the routing is unknown.

Related, from the same manual: the PAD is documented as a virtual analog synth
that plays on top of any piano sound — a parallel layer, not an insert effect.
The phaser and delay parameter groups are documented as sub-sections of FX2,
which is how the UI already nests them (phaser at mode 1, delay at mode 3).

## Device state is device-reported — never optimistic

Controls that represent instrument state (the section ON/OFF pills, and later
knobs, LEDs, and anything else mirroring the hardware) always render **what the
device reports, never what the user clicked**.

The interaction contract is:

1. click → send the write (e.g. set-parameter `0x20` for a switch ID),
2. await the device's reply,
3. render the control from the value in the reply.

Optimistic UI is wrong here: a write can fail, and a pill showing "on" while the
reverb is actually off is worse than a pill that didn't move. When no instrument
is connected, a control explains ("No instrument connected.") instead of
pretending — it never flips to reflect local UI state.

## Three knob/section cues — keep them distinct

- **Lit knob** = its effect is **on** (patch data). Interim scheme: amber cap
  fill (#ffd9a0) + amber outline (#ff9d2e) + darkened pointer. The eventual
  target is the RGB value-encoding scheme below.
- **Accent ring on a knob** = its section is **expanded** (view state,
  persistent while open). Outer ring ONLY — never the face — so it stays
  distinct from the lit cue; both can apply to one knob at once.

  The outer ring appears ONLY on the focused knob (plus a dimmer hover ring
  for discoverability); at rest a knob is just its face and pointer. This is a
  **deliberate departure from the instrument**, which has a visible ring around
  every knob — fidelity traded for a legible focus state, since a static ring,
  the focus ring, and hover all competed for the same annulus.
- **Brief accent tint on a section** = you **just opened** it (transient,
  fades ~1.2s).

Never reuse one of these colours/treatments for another meaning — and the
library's selected-patch red edge marker is a fourth, unrelated cue that stays
in the list only. Closing a section gets no highlight at all.

## Panel says RATE, parameter list says Speed — both correct

The instrument's silkscreen prints **RATE** on both FX sections, but the device
reports the `fx1_sp`/`fx2_sp` parameter label as **"Speed"** (a documented
firmware-vs-silkscreen discrepancy — see protocol.md "Findings that contradict
the manual"). The panel strip renders the silkscreen; the effects-chain rows
render the device label. Do not "fix" either to match the other.

## Volume knob — Local Off state (blue)

On the instrument, a **slow push** on the volume knob (held at least **100ms**)
toggles **Local Off** — the keyboard stops playing the internal engine but keeps
sending MIDI out — and the knob turns **blue**. It does not go dark, and it is
not a mute. A **quick push** (pushed and released immediately) switches which
parameter the knob is displaying; that quick/slow distinction applies to the
panel knobs generally (slow toggles the effect on/off, quick switches the
displayed parameter).

Whether Local Off is readable or settable over SysEx is unknown (see
docs/PROJECT-SCOPE.md, open questions). Until resolved, the strip's `led-volume`
renders lit (Local On); when it lands, it follows the device-reported rule above
like every other device-state control.

## Deferred fidelity

- **TODO — BANK button pending state.** On the instrument, pressing BANK does
  not switch bank immediately: the bank LED starts **blinking** and the
  instrument waits. The bank is only committed when a preset button is pressed
  **within three seconds**; if nothing is pressed, the previous bank is
  restored and the LED stops blinking. Our panel currently advances the bank
  immediately on press. Model the real pending behaviour once the app is
  actually recalling presets on the instrument — until then the mismatch would
  mislead about what the hardware is doing.

## Knob lighting — eventual target (RGB, value-encoding)

The hardware knobs are RGB and encode **value**, not just on/off (manual, FW
1.2, Sep 2020): colour runs **green at low values toward red at high values**,
and knobs turn off entirely at some values. Exceptions: **Reverb Decay** uses
**blue→red**, and **FX1/FX2 Rate** show a **pulsing blue that blinks in sync
with the effect's LFO**.

**Implemented** for the knobs' default displayed parameters: `updateKnobLit`
maps value→hue (green 120° at 0 sweeping to red 0° at max) onto the glass
knobs' glow material; switch-off/bypassed knobs stay dark, matching the
"off entirely" behaviour. The two exceptions belong to push-toggled ALTERNATE
parameters (Decay, Rate) that the strip doesn't render — implement blue→red
and the LFO-synced pulse if alternate knob views ever land.

## Planned

*(This section was created for the note below; the Library-tab note it was
meant to sit under does not exist in this file yet.)*

**LIBRARY STRUCTURE — leaning, not decided.** The patch is the atom; a bank is
a view. Storing bank-shaped collections as the primitive creates awkward
cases: a patch captured without a slot, gaps in a partial setlist, wanting 3
patches out of 8.

Proposed instead: the Library is a flat pool of patches, sortable and
taggable, with a separate lightweight "setlist" concept — a name plus an
ordered list of up to 8 patch references. Setlists are what get pushed to a
bank. A patch may belong to several setlists or none. ("Setlist", not
"bank": the word bank belongs to the hardware's four banks, and the core
transfer action must read "push setlist to bank", never "push bank to
bank".)

This matches the two real uses: collecting is flat (patches accumulate over
time with no slots involved), transferring is bank-shaped (filling 8 slots on
a specific unit).

The .sevenlib.json format already supports either — patches is a flat array
and `origin` is optional history, not location. Setlists live in an
additive manifest (setlists.json), no format break.

**DECIDE AFTER the first real backup and transfer against hardware.** The
workflow will make the answer obvious, and guessing now risks building the
wrong primitive.
