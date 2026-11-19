# Saving an edited patch — agreed design

Settled with Daniel in chat, 14 Nov 2026. Wireframe of the same flow is in
`out/save-patch-wireframe.html` — open it before writing code; it is the
agreement, this file is the reasoning.

Earlier drafts of this file are superseded. Anything they said about auto-
backups, two on-screen buttons, or saving the old patch is OUT. See §6.

## 1. The problem

He edits a patch, likes it, and goes looking for a way to save it. There is no
such button in the software, and he forgets that. He navigates away hunting
for one and the edits are gone. He lost two patches this way on 13 Nov.

`Save as new patch` exists but he cannot tell in the moment what it means
against "save to the Seven". His words: "They're hard to wrap my head around
in the moment. I found that yesterday with the existing 'save as a new patch'.
What does that mean? I know now but only because I'm working on the software."

That is the design constraint. **The two confusable labels must never appear on
screen at the same time.** They appear together only inside the modal, where
they sit next to each other and explain themselves by contrast.

## 2. WYHIWYG — the rule this is built on

**What You Hear Is What You Get.** If it changed, it counts. No exception
list, no parameter the app decides does not matter.

This settles the volume question: the Seven stores master volume per preset
(that is what the Volume Type global selects, and From Preset is the default),
so a volume change genuinely is part of the patch.

## 3. What gets built

### One button on screen

`Save patch`. It replaces `Save as new patch` in the ON THE SEVEN view.

- **Outlined** when nothing has changed.
- **Solid** when the patch has changes.
- **Clickable in both states.** Outlined is not disabled. Saving an untouched
  slot to the library is a real thing to want and is possible today
  (`audition.js:98` — always available on purpose); do not remove it.

### One modal

Opens from the button, and on navigating away from a changed patch.

    SAVE PATCH?

    Overwrite Bank 3 · Preset 5      holding the button for three seconds is what saves it
    Save to computer                 adds it to Patches. The Seven is untouched

    [Cancel]     — or, from navigate-away: [Discard changes and leave]

With nothing changed there is no slot to overwrite, so **the first row is
absent** and only `Save to computer` is offered.

**This section said "Slot" throughout until 14 Nov 2026, and the spec was
wrong, not the app.** The instrument prints PRESET on its own panel and nine
other places in the app say it; writing "Slot" here put the one dissenting word
into the save flow, where the modal and the hold screen would have disagreed
with the library row the save lands in. Corrected to `Bank 3 · Preset 5`, with
a `·` rather than a slash for the same reason.

Name the real bank and preset in the first row. The hold overwrites whichever
preset the Seven is sitting on; an unnamed preset is an instruction to overwrite
something unknown. If the preset is not knowable at that moment, say so in the
report rather than printing a guess.

### Overwrite → the hold tutorial

The first row **is not a save button and must not read like one.** The app
cannot write a slot on the Seven. Only the three-second hold does. The row can
only tell him to hold and show him how — which is what he asked for: "hey
dude, you have to save this on the damn Seven ... let me show you how!"

That is why the hold is named in the row itself, not hidden behind the click.

The tutorial screen is REUSE: `src/app.js` around 1322-1379, "Hold for 3
seconds." above the pressed-button animation. Do not write a second one.

On that screen, one control:

    [x] Also save a copy to Patches
        If you walk away without holding the button, the sound is still
        on your computer.

**Ticked by default.** That default is the whole protection — unticked it is a
step he will skip in exactly the moment he needs it. He can untick it.

The copy goes into the normal Patches library, not a separate store. Carry
`origin` with the bank and preset (`library-store.js` already has this
provenance machinery and `origin.bank`), so these copies display as coming
from Bank 3 · Preset 5 rather than appearing unexplained in a curated library.

### Save to computer → the existing Patches dialog

No new UI. Reach today's save-as-new-patch dialog from the modal.

It does NOT offer to also write the slot. If he picked the computer, he did
not want the slot — his call, and it is right.

## 4. What a save reads

Both paths read the full edit buffer off the instrument first and write THAT,
not the app's in-memory copy. Measured around 1.3s, fine for a deliberate save.

Daniel, explicitly: "IF, by chance, I've also made changes on the physical
Seven (that the software won't know about) I am 100% fine saving the patch that
is in the buffer memory ... because that is what I'm hearing."

With no Seven connected there is nothing to read, so the save writes what the
app has — and must SAY so. A save that quietly means two different things
depending on a cable is the shape of bug this project keeps finding.

**1.3 seconds needs a spinner**, and the modal itself must open instantly. The
read happens after he picks an option, never on the navigate-away path.

**The read list comes from the device, not the schema.** `midi.paramTable` is
read off the instrument at connect, deliberately (`backup-runner.js:117`). If a
unit reports FEWER parameters than the schema carries, those keys are simply
absent from the buffer read. Save must NAME them rather than quietly writing
the app's stale value into them. Units do differ — that is why the fingerprint
and `compareParamTables` exist.

## 5. What marks a patch changed

**Everything counts. There is no exclusion list.** Settled by Daniel,
14 Nov 2026, and it is WYHIWYG applied to the trigger as well as the save.

Compare against the baseline — `audition.js` already has `liveEdit.baseline`
and `changedKeys()`, and `drift.js` already does the comparison. Use them
rather than inventing a second mechanism. A comparison also means a knob swept
away and back is not a change, which a touched-set would get wrong.

Not drift against a FILE. ON THE SEVEN has no file behind a slot, so a
file-drift signal can never fire in the place he actually lost work.

### The findings file recommended an exception list. Overruled.

`out/save-what-you-hear-findings.md` §5 recommends firing only on `pno_*`
drift and ignoring drift confined to `efx_*` / `pdl_*`, on the grounds that the
followed parameters are all performance controls.

Two reasons it does not stand:

1. It would also ignore effects edits made IN THE SOFTWARE. Turn up reverb on
   the computer and walk away and the change is real, wanted, and silently
   dropped from the trigger.
2. The premise is narrower than it looked. The app follows every panel control
   that changes the sound — 24 by CC, 6 polled (the Clavi tabs). The 80 it does
   not follow have no control on the instrument at all (`docs/DEVICE.md` §12).
   So there is no class of physical change the app misses, and nothing for an
   exception list to protect against except the nuisance of the button going
   solid when a knob is nudged mid-song.

The cost of "everything counts" is that nuisance. The cost of the alternative
is the app deciding which of the things he hears do not count. He has chosen
the nuisance, twice.

## 5b. Send CC — borrow it on, put it back on exit

Settled by Daniel, 14 Nov 2026.

`glb[2]` is **Send CC**: "emit CC when a control moves". Off, the panel sends
nothing and the app cannot follow a knob, so the button would stay outlined
while he turns one. Nothing is lost either way — the save reads the whole buffer.

- Borrow it on entering ON THE SEVEN. Restore it on LEAVING THE TAB, not on app
  quit, because the one USB port moves between this app and his JUNO-X rig.
- A crash or a yanked cable goes through the marker that already exists:
  `seven-midi.js:400` repairs a stranded Send PC borrow on the next connect
  (`_restorePendingMarker`). Use the same mechanism. Do not add a second one.
- If the borrow fails, say so once in the save modal and carry on. A failed
  borrow never blocks a save.

**Do not build more than this.** A stranded Send CC means his knobs send CC into
the JUNO-X until he recalls a scene or power-cycles it. CC moves live state only
and writes nothing to the X's memory, so it is temporary and harmless. Daniel,
14 Nov: "low risk item that we shouldn't over-design for." No warning system, no
reconciliation UI, no second marker.

## 6. Deliberately out of scope

**Saving the old patch before an overwrite.** A bank-slot recall broadcasts only
22 panel CCs, not all 110, so `liveEdit.baseline` is partial for a bank slot.
Writing it out as "the patch that was in 3:5" would file an incomplete patch as
a complete one. Making it real needs a full read on every recall — about 1.3s
of silence each time he browses. Full device backup already covers the case.
Daniel: "I'm fine with leaving this out."

**A separate auto-backup store.** Replaced by the tick box. One place for saved
patches, nothing written that he did not see.

**Watching the sound engines.** The app follows only `efx_*` from the panel.
Engine parameters have no front-panel control at all, so they cannot change
without the manufacturer's browser editor running alongside this app. See
`docs/DEVICE.md` §12. Do not build machinery to watch them.

**The `exp_fn` / `exp_mx` CC collision.** Both are assigned CC 1 and `ccMap` is
keyed by CC number, so `exp_fn` is overwritten and never followed. A real
pre-existing defect, found by the findings run, and NOT part of this task — it
needs its own fix. Do not patch it here and do not let it block.

**Do NOT count parameters while writing this.** The `pdl_exp` group's CC data is
wrong — same DEVICE.md section — and any "N of 110" figure inherits it.

## 7. One read loop, not three

Superseded by `out/save-what-you-hear-findings.md` §4, which is right and is
accepted as written.

The two existing loops are not the same loop. `backup-runner.js:185-194`
collects every id and throws if one is unreadable. `transfer-runner.js:815-847`
compares and early-exits at the first parameter that differs — on a slot that
differs at parameter 2 it reads 2, not 110. Forcing them into one loop would
cost the transfer ~1.3s on every slot it was about to reject anyway: worst case
40 seconds added to a 32-slot transfer.

The duplication is the RETRY, not the loop. So:

- extract `readParamWithRetry(id)` — the actual duplicated four lines
- add `readBuffer()` on top of it — the full collect loop
- `backup-runner` and the new Save both call `readBuffer()`
- `transfer-runner` calls `readParamWithRetry` and keeps its early exit

## 8. Guards

Each of these mutation-proven:

- Fails if the modal does not open on navigating away from a changed patch.
- Fails if it opens on navigating away from an unchanged one.
- Fails if the overwrite row is present with nothing changed.
- Fails if the overwrite row is absent when there are changes.
- Fails if the tick box defaults to unticked.
- Fails if a save writes the app's copy while connected. Make the fake return a
  buffer that DIFFERS from the app's state and assert the saved file carries the
  instrument's values. A fixture where the two agree cannot catch this.
- **Fails if answering the guard leaves a dialog on screen** (added 14 Nov
  2026, after it did). The guard exists so he can leave safely; answering it
  with "Save to computer" put a copy on disk and then asked again, because the
  save's own arrival at the new file is a library selection and that door asks
  too. Two assertions: nothing is behind the "Saved to Patches" confirmation
  when it is dismissed, and the navigation the guard was holding up goes
  through. The dirty flag is NOT cleared to achieve either — saving to the
  computer does not store anything on the Seven, so the drift is correct.
- **Fails if a save writes a PARTIAL buffer read.** Daniel unplugs the USB
  constantly — the cable moves between this app and his JUNO-X rig — so losing
  the instrument part-way through the 1.3s read is a normal event, not an edge
  case. A patch file holding 60 fresh values and 50 stale ones, saved under a
  name, is worse than no file: nothing afterwards can tell it from a real one.
  The read either completes or the save fails and says why. Make the fake drop
  the connection mid-read and assert NO file was written.

## 9. Report back

- What marks a patch changed, and how you tested it.
- Whether the slot is knowable at modal time.
- The measured cost of the buffer read on his machine, not the estimate above.
- Anything in §3 the existing code made awkward, before working around it.
