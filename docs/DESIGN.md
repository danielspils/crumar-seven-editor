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
