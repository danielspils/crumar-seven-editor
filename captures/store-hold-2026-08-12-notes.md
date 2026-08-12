# Does a three-second store announce itself? — 2026-08-12

Capture: `store-hold-2026-08-12T05-34-58.jsonl` (passive, `tools/listen.js`).
FW 1.37. Send PC global ON. Panel sitting on Bank 3.

## What was done at the instrument

1. **Short press** of preset 5 — an ordinary recall.
2. ~4s pause.
3. **Three-second hold** of preset 6 — a store of whatever the short press had
   just put in the edit buffer.

Two different buttons deliberately: if press and hold emit the same frames, the
only thing separating them in the log is the slot number.

## The answer: a store emits NOTHING of its own

Both actions produced the identical shape — the same shape any recall produces:

```
F0 73 26 14 45 <sound> F7      unsolicited current-sound broadcast
B0 07 64 … B0 21 40            the 22 fixed panel CCs
B0 01 46  B0 01 68             the doubled B0 01 pair that closes every burst
C0 <slot>                       ~55 ms after the 0x45
```

- press → `C0 14` (slot 20 = Bank 3 preset 5)
- hold  → `C0 15` (slot 21 = Bank 3 preset 6)

No extra frame, no flag byte, no distinguishing gap: the PC follows the `0x45`
by ~55 ms in **both** cases. **There is no store notification, and a store
cannot be told from a tap by the frames alone.**

## But the burst CONTENTS give it away

The two bursts were **byte-identical** — same sound id (`03 33`) and all 22 CC
values equal:

```
slot 20  sound 03 33 | 07 64 0C 30 0D 4A … 21 40
slot 21  sound 03 33 | 07 64 0C 30 0D 4A … 21 40   ← identical
```

Slot 21 held **Venice Upright U1** before this (per the 2026-08-11 backup);
slot 20 holds **Clavi Piano**. So the burst that followed the hold carried slot
20's content out of slot 21 — the store wrote the edit buffer into preset 6,
and the broadcast that follows a store describes **what was just written**, not
what the preset held before.

That is the discriminator, and it needs no extra reads:

- **Tap** → the burst carries the preset's OLD content.
- **Hold** → the burst carries what the app just loaded.

Since the transfer runner already recalls each target slot before loading it, it
holds a "before" burst for free. A post-hold burst that DIFFERS from the before
burst is a write. Identical bursts mean either a tap, or a store of content that
already matched — and in the second case the outcome is right either way.

Caveat kept in view: open item 8 says sub-127-max CCs look scaled by an
unverified law, so these values are compared burst-to-burst as opaque bytes and
never decoded into parameter values. The `0x45` sound id is exact.

## Cost of the test

Bank 3 preset 6 now holds Clavi Piano instead of Venice Upright U1. Recoverable
— `bank-3-preset-6-venice-upright-u1.sevenlib.json` is in the library from the
2026-08-11 backup.
