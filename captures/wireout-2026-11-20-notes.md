# The tuning parameters make the Seven stop answering — 2026-11-20

**THE FIRST CAPTURES IN THIS PROJECT THAT INCLUDE OUTBOUND TRAFFIC.** Three
files, two directions, one timeline. They answer the question
`captures/sdet-reinit-2026-11-20-notes.md` could not: what the app sends in the
half second between the last parameter write and the instrument's unsolicited
`0x71` banner.

**The answer is nothing, and in one of the three breaks it could not possibly
have been anything.**

```
wireout-1-2026-11-20T17-57-50.jsonl   1289 rows  INBOUND   17:57:51..18:00:54   1 break
wireout-2-2026-11-20T18-05-19.jsonl    709 rows  INBOUND   18:05:20..18:06:08   2 breaks
wireout-1-out-2026-11-20T18-00-00.jsonl 6344 rows OUTBOUND 17:58:00..18:10:24   spans both
```

The outbound file is one continuous capture across both inbound runs, so merging
it against either gives a single timeline. Rows carry an explicit `Date.now()`
taken at the `sendMessage` call, in the same shape `tools/listen.js` writes.

**The outbound capture came from `src/wire-out.js`, a deliberately temporary
log-only tap on the send path, reverted immediately after these captures were
taken.** It is not in the tree. Its commit and its revert are both in the
history if the shape of it is ever needed again — the hot path was a
`Date.now()` and an array push, measured at 0.29us per call, with formatting and
Rule 6 masking deferred to a flush timer so the send path kept its timing.

**RULE 6, VERIFIED ON THE FILES rather than assumed:** the single `0x33` globals
frame in `wireout-1` reads
`.tun=440;glb=14,1,1,1,0,1,0,1,0;wfp=********;` — masked at the parse layer
before the row was written. The outbound capture contains **no `0x30`
set-global frames at all**, so nothing the app sent could have carried a
password.

---

## IT IS THE PARAMETER. NOT THE RATE, NOT THE VOLUME.

Every parameter-write burst inside the window both captures cover, grouped by
parameter id, measured identically:

| parameter | id | writes | rate | last write answered? | result |
|---|---|---|---|---|---|
| `egp_pucm` Pickup Compress | 22 | **123** | **48/s** | yes | survived |
| `egp_rell` Release Length | 23 | **77** | **51/s** | yes | survived |
| `egp_stun` Stretch Tuning | 24 | 28 | 46/s | yes | — |
| `egp_stun` Stretch Tuning | 24 | 31 | 48/s | **NO** | **BROKE** |
| `egp_stun` Stretch Tuning | 24 | 51 | 48/s | **NO** | **BROKE** |
| `egp_stun` Stretch Tuning | 24 | 30 | 45/s | **NO** | **BROKE** |
| `egp_sdet` String Detuning | 21 | 203 | 40/s | **NO** | **BROKE** |

(The two `egp_stun` rows either side of 18:05:30 are one drag of Daniel's that a
300ms grouping threshold split in two; there are **two** breaks in `wireout-2`,
not three. The burst counts are honest, the break count is two.)

**`egp_pucm` took more writes, at a higher rate, than any burst that broke, and
nothing happened.** So rate is eliminated and volume is eliminated — on
measurement, not assumption. 48/s and 51/s survive on one parameter while 45/s
breaks on another.

**Daniel predicted this before it was measured:** *"It appears to be only String
Detuning and Stretch Detuning which are creating the crash"*, after dragging
parameters "aggressively from the top down" and reaching String Detuning before
anything broke. The capture agrees.

**AND THE SCHEMA SAYS WHY THAT GROUPING IS NOT ARBITRARY.** `egp_sdet` and
`egp_stun` are the only two parameters in `pno_egp` whose labels name tuning —
and the acoustic piano carries the same pair, `acp_sdet` and `acp_stun`. The
other eleven in the group are hammer, damping, pickup, release, dynamics and
noise. **Whether retuning the string model is what costs the instrument its
responsiveness is NOT established here**; what is established is that these two
do it and four neighbours at the same or higher rate do not.

**THIS RETIRES A WRONG READING OF THE EARLIER CONTROL.**
`sdet-reinit-2026-11-20-notes.md` says *"`egp_sdet` is also not special on its
own: the control swept it without breaking anything."* It is special. That
control run simply never produced an unanswered write — 64 writes in bursts
about a second apart, every one echoed.

---

## WHAT THE BREAK ACTUALLY IS

Identical in all three, and the shape is the finding:

```
   ...writes echoed in 12-14ms each, dozens of them...
   OUT  0x20 WRITE id=24 val=46        <- THIS ONE IS NEVER ANSWERED
        ... the instrument says nothing for 444-645ms ...
   IN   f0 73 26 14 45 00 30 f7        0x45 RECALL BROADCAST, sound 0
   IN   be 07 72 ... be 01 7f          24 CCs — the recalled slot's contents
   IN   ce 00                          PROGRAM CHANGE, program 0
   IN   f0 73 26 14 71 7f <banner>     firmware string, index 0x7f
```

| break | parameter | unanswered write at | app's next send | recall at |
|---|---|---|---|---|
| 1 | `egp_sdet` | 17:59:33.130 | +601ms, a `0x22` read | +622ms |
| 2 | `egp_stun` | 18:05:29.857 | +610ms, a `0x20` write | +645ms |
| 3 | `egp_stun` | 18:06:08.314 | **nothing before the recall** | **+444ms** |

**THE 601ms IS OURS, AND IT IS NOT A MYSTERY INTERVAL.**
`src/seven-midi.js:201` sets `timeout = 600`. The app sent nothing in that
window because it was BLOCKED — `_request` serialises everything through one
chain, so a write whose `0x23` never arrives holds the chain until its matcher
times out. The "quiet half second" the investigation was aimed at is the app
waiting, not the app deciding.

**BREAK 3 SETTLES IT.** The recall arrived at +444ms, *before* the 600ms
timeout could fire, so the app had sent absolutely nothing between the
unanswered write and the instrument's announcement. Whatever the Seven is
doing, it is not responding to a frame.

**AND THE APP SENT NO PROGRAM CHANGE.** The app does send `ce 00` when it loads
a patch, and the instrument echoes those ~90ms later, so the two have to be told
apart:

| inbound `ce 00` | matching outbound send |
|---|---|
| 17:58:32.244 | yes — app sent at 17:58:32.154 |
| 17:58:35.099 | yes — app sent at 17:58:35.009 |
| **17:59:33.798** | **none** |
| **18:05:30.549** | **none** |
| **18:06:08.797** | **none** |

No outbound program change exists anywhere near any break. The three that
matter are the instrument's own.

---

## TWO CORRECTIONS TO THE EARLIER WRITE-UP

**1. THE 24-CC BURST IS NOT A CONSTANT, and my correction of 20 Nov that said it
was is itself wrong.** I had found ten byte-identical bursts across five
captures and concluded the values were fixed. **All ten were recalls of the same
program.** These breaks recall program 0 and the burst differs — `cc7` is 114
not 110, `cc12` 64 not 48, `cc15` 42 not 0.

**The burst reports the stored contents of the slot being recalled**, which also
dissolves the contradiction that produced the wrong conclusion: in `reinit-2`
the burst said `fx1_sw 0` while a `0x23` one second later said `fx1_sw 1`,
because the burst is the stored slot and the `0x23` is the edit buffer **after
the app had written the patch into it**. Two different things, correctly
reported, one second apart.

What survives from that entry: CLAUDE.md's "22 fixed panel CCs" means a fixed
SET of CC numbers, and the burst still must not be read as the live edit
buffer.

**2. THE RECALL IS NOT ALWAYS THE CURRENT SLOT.** Every earlier break was
`ce 02`; all three here are `ce 00` — program 0, bank 1 slot 1. Daniel noticed
it independently: *"it switched patches to bank 1, slot 1 ... a first"*. So the
instrument recalls a slot rather than reinitialising the one in hand, and which
slot is not fixed.

---

## RETRACTED, RECORDED ANYWAY

Daniel, mid-session: *"I dragged the string detune without playing ... it did
not crash. As soon as a played and dragged ... it crashed soon after."* Then,
twenty minutes later: *"Ignore that observation about playing + adjusting. I
just made it crash twice without playing at all."*

Kept because the capture agrees with the retraction and because the first
reading is the obvious one to reach for again: the breaking drag in `wireout-1`
carried 3 note-ons, and the two in `wireout-2` carried none.

---

## STILL OPEN

**Why the instrument stops answering.** Nothing here explains it. What is now
fenced off: it is not the app's send rate, not the write volume, not a program
change from the app, not anything the app sends in the gap, and not the app's
own timeout, which is a consequence rather than a cause.

**Whether the post-break switch state can be read at all.** Still not captured.
The app ends its live session on the foreign program change, which stops the
poll, so `fx1_sw`/`fx2_sw`/`rev_sw` are never asked for after a break. That
needs a read issued deliberately after the break, which is a decision about
instrumenting the app rather than something to slip into a capture run.

**NO FIX, NO THROTTLE, NO RATE LIMIT IS PROPOSED** — and the control table
above is the reason a rate limit would have been the wrong answer even if one
had been wanted. `egp_pucm` at 48/s is fine; `egp_stun` at 45/s is not.
