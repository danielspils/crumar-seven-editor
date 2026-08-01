# Design notes

UI principles for the editor. Add to this file as they accumulate.

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
- **Brief accent tint on a section** = you **just opened** it (transient,
  fades ~1.2s).

Never reuse one of these colours/treatments for another meaning — and the
library's selected-patch red edge marker is a fourth, unrelated cue that stays
in the list only. Closing a section gets no highlight at all.

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

## Knob lighting — eventual target (RGB, value-encoding)

The hardware knobs are RGB and encode **value**, not just on/off (manual, FW
1.2, Sep 2020): colour runs **green at low values toward red at high values**,
and knobs turn off entirely at some values. Exceptions: **Reverb Decay** uses
**blue→red**, and **FX1/FX2 Rate** show a **pulsing blue that blinks in sync
with the effect's LFO**. This is the eventual target for knob rendering on the
strip — richer and more faithful than a flat on/off treatment. **Not implemented
yet**; the "effect is on" cue below stays reserved until this lands.
