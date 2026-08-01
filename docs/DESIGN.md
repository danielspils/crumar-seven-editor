# Design notes

UI principles for the editor. Add to this file as they accumulate.

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

- **Amber glow on a knob** = the effect is **on** (patch data; not yet
  implemented).
- **Accent ring on a knob** = its section is **expanded** (view state,
  persistent while open).
- **Brief accent tint on a section** = you **just opened** it (transient,
  fades ~1.2s).

Never reuse one of these colours/treatments for another meaning — and the
library's selected-patch red edge marker is a fourth, unrelated cue that stays
in the list only. Closing a section gets no highlight at all.

## Volume knob light — data source unresolved

On the instrument, press-and-hold on the volume knob mutes (its light goes out);
press-and-hold again unmutes (the light returns). The strip's `led-volume`
mirrors that: lit = unmuted, dark = muted.

**The source of mute state is unresolved.** `veq_vol` is the volume *value*, not
a mute flag, and there is no obvious mute parameter among the 110 — mute may be
transient device state that is never stored in a patch. Until that's determined
(see docs/PROJECT-SCOPE.md, open questions), the light renders lit: fixture
patches have no mute field, and inventing one would bake an unverified
assumption into the patch format. When it is resolved, the light follows the
device-reported rule above like every other device-state control.
