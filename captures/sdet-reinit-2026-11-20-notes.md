# String Detuning drag → the Seven recalls on its own — 2026-11-20

Four raw captures, all from `tools/listen.js` (passive; it opens no output
port and cannot send). Rule 1: these files are ground truth and are never
deleted or replaced by a decoded view.

```
sdet-reinit-1-2026-11-20T16-22-19.jsonl   3797 rows   one load, one FAILURE
sdet-reinit-2-2026-11-20T16-36-28.jsonl    496 rows   one load, one FAILURE
sdet-control-2026-11-20T16-37-22.jsonl    1699 rows   CONTROL — four loads, no failure
sdet-reinit-3-2026-11-20T16-44-29.jsonl    491 rows   one load, one FAILURE, +95s TAIL
```

**READ THE CORRECTION BELOW BEFORE THE SECTION IT CORRECTS.** The first write-up
of this file said the failure emits the documented recall signature. It does
not, and the two events are distinguishable on the wire. The full analysis of
all five runs lives in `docs/next-1.5.7.md` item 20.

Inbound only. **Outbound was not captured and capturing it would mean editing
the send path**, which was not done during a live investigation —
`tools/capture-hook.js` patches `MIDIOutput.prototype.send` in a BROWSER and
taps the manufacturer's gsidsp.com editor; this app sends from the Electron
main process through `@julusian/midi`, which that hook cannot see.

---

## What the Seven emitted at the moment of failure

Identical in both repro captures, byte for byte:

```
be 5b 32 … be 01 7f          24 CCs: 07 0c 0d 0e 0f 10 14 15 16 17 18 19
                             1a 1b 1c 1d 1e 5b 5c 1f 20 21 01 01
ce 02                        PROGRAM CHANGE, channel 15, program 2
f0 73 26 14 45 02 32 f7      0x45 RECALL broadcast, sound 02
f0 73 26 14 47 02 "Electric G…"   0x47 name reply
f0 … 23 00 30|rho_tp|8 …     0x23 parameter replies
```

~~**THAT IS THE DOCUMENTED RECALL SIGNATURE**, not a novel frame~~ — **WRONG,
CORRECTED 20 Nov 2026 by the fifth capture.** The `0x45` and `0x47` frames in
the block above belong to the patch LOADS earlier in the same captures, 11 and
9 seconds before the failure; I read two events as one. **What actually follows
the failure's `ce 02` is an unsolicited `0x71` STRING reply at index `0x7f`
carrying the firmware banner, 20-21ms later, with NO second `0x45` and NO
`0x47`** — three for three in the failures, zero in the control's four loads.
The corrected signature, the `0x7f` index, and why the 24-CC burst must not be
decoded as state are all in `docs/next-1.5.7.md` item 20.

The CC burst itself is as described — 22 fixed panel CCs plus the doubled
`B0 01` pair that `docs/protocol.md` open item 6 already lists as unexplained —
and **all ten bursts across the five captures are byte-identical**, so its
VALUES are fixed too and carry no state.

**So the instrument reinitialised itself AND ANNOUNCED IT.** Of the three
outcomes this capture was meant to discriminate between — the Seven announcing
a recall, the Seven emitting nothing, or the Seven's replies stopping dead —
it is unambiguously the first. The replies do not stop: `0x23` frames continue
through and after the event.

**THE APP AGREES, INDEPENDENTLY.** It showed "The Seven recalled a different
preset — your unsaved edits are gone", which `app.js` says only on a
`program-change` it did not originate. Wire and app concur.

---

## NOT EVERY `ce 02` IS THE FAILURE

**AND SINCE THE FIFTH CAPTURE, THE TWO KINDS CAN BE TOLD APART ON THE WIRE** —
a load is followed by a second `0x45` and a `0x47` name reply, a failure by the
`0x71 7f` firmware banner and neither of those. The open question at the end of
this section is therefore no longer "indistinguishable", though it is still
unexplained. See `docs/next-1.5.7.md` item 20.

Both repros contain two. In `sdet-reinit-2` the FIRST, at 16:36:50, is the
patch being loaded — immediately after it the Seven reported a working patch:

```
veq_byp = 0  "Bypass OFF"      fx1_sw = 1 "ON"   fx1_md = 0 "Mono Tremolo"
veq_vol = 110                  fx2_sw = 1 "ON"   fx2_md = 3 "Delay"
amp_sw  = 0  "OFF"             rev_sw = 1 "ON"   pad_sw = 0 "OFF"
```

The SECOND, at 16:36:59.996, is the failure. **The same program number
produced a working patch the first time and the reported breakage the second,
and that is not yet explained.**

---

## The control, and it is the most useful of the three

Daniel swept String Detuning AND Hammer Offset "the same-ish amount" and
nothing broke.

```
16:38:11 .. 16:38:23   four recalls — BEFORE any sweeping (loading patches)
16:38:59 .. 16:39:04   egp_sdet   64 writes in three bursts   no recall
16:39:17 .. 16:39:25   egp_hoff  134 writes in six bursts     no recall
```

Against the repros:

| capture | parameter | writes | window | bursts | result |
|---|---|---|---|---|---|
| reinit-1 | `egp_sdet` | 156 | ~7s | 7, unbroken | **recall** |
| reinit-2 | `egp_sdet` | 109 | ~4s | 4, unbroken | **recall** |
| control | `egp_sdet` | 64 | ~5s | 3, ~1s gaps | none |
| control | `egp_hoff` | 134 | ~8s | 6, with gaps | none |

**A LONG SWEEP IS NOT SUFFICIENT, and the count alone does not separate them**
— the control wrote MORE to `egp_hoff` (134) than repro 2 wrote to `egp_sdet`
(109) and nothing happened. What differs in these four runs is that the repro
sweeps are continuous and the control's come in bursts with roughly a second
between them. **That is an observation about four runs, not a mechanism**, and
no threshold should be read out of it.

`egp_sdet` is also not special on its own: the control swept it without
breaking anything.

Writes arrive at roughly one per 20ms, about 50 a second, in every capture.

---

## WHAT THESE CAPTURES DO NOT SHOW

**The post-failure state on the wire.** The listener was stopped too soon in
both repros — `sdet-reinit-1` ends with two `egp_sdet = 9` frames 100ms after
the recall and nothing more. So the app's screenshot is the only record of
what the buffer held afterwards, and the wire's version is missing.

That matters because it is exactly what would separate "recalled a stored
preset" from "initialised the buffer": the first `ce 02` in reinit-2 loaded a
patch with FX1 and FX2 ON, so if the second loaded everything OFF from the
same program number, a plain recall does not account for it.

~~**NEXT CAPTURE: keep listening for 10-15 seconds after it breaks**, then read
the switch parameters out of the tail.~~ **DONE — `sdet-reinit-3`, held open 95
seconds past the break, and IT DID NOT CLOSE THIS GAP.** The switch parameters
are not in the tail, because nothing asks for them: the 1Hz `0x23` traffic is
the APP's own `startPanelPoll` (`src/audition.js:472`), which stops when the
foreign program-change ends the live session. The capture holds exactly one
`0x23` group after the break — the six `zd6_*` keys plus `egp_sdet = 64`,
confirming Daniel's "returned to center default" — and then no `0x23` at all
for 95 seconds.

**The instrument did NOT go quiet** — note traffic continues throughout,
including notes played 35s and 95s after the break. The missing switch values
would need a read issued AFTER the break, which the passive listener cannot do.
See `docs/next-1.5.7.md` item 20 for what that implies and what was
deliberately not done about it.

Also absent: `egp_dyna` was swept 50 times in `sdet-reinit-1` at 16:24:45-47
and the next recall came 24 seconds later, at 16:25:11. Too far apart to
attribute and recorded only so nobody re-derives it as a lead.
