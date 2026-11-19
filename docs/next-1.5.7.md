# Queued for 1.5.7

## THE RUN TO 1.5.7 — ordered, 16 Nov 2026

**Every decision below is made. Nothing here is waiting on Daniel.** He worked
through them one at a time on 16 Nov; the answers are recorded inline so nobody
re-opens them.

Work top to bottom. Items 1–9 are independent of each other — if one stalls,
move on and say so. Items 10 onward are sequential and 11 must not start until
1–9 are done, or the walk happens twice.

### 1. The carousel clearance regression — **DONE (`fafcf92`)**

> **THE CAUSE STATED BELOW IS WRONG, and it was mine.** I attributed it to
> `b8f78ee` from commit ORDER without checking the geometry. `b8f78ee` is
> innocent: the resting model it was supposed to have broken still holds to a
> tenth of a pixel at four swept widths.
>
> **What actually broke it:** the stylesheet's own note already said the bound
> belongs to the HOVER size — "anything wider escapes on hover before it
> escapes at rest" — and both thresholds were nonetheless derived from the
> RESTING peek. Hovering takes the face from scale .74 to .82, so it grows
> 10.24px and its left edge moves 5.12px further left, which at the measured
> 0.64px per px is exactly 8px of window width.
>
> **So both thresholds moved up by 8:** the tuck starts at **1088** (was
> 1080) and the peeks go below **1032** (was 1024). Swept with
> `test/ui/scenarios/carousel-ceiling.js`, which applies the hover transform
> inline because CSS `:hover` cannot be driven by a synthetic event — 1032
> gives 8.29px against 7.65px at 1031; 1088 gives 8.28px against 7.65px at
> 1087. `b8f78ee` untouched.
>
> **IT TOOK A STRAY MOUSE TO FIND.** The full-suite run had the pointer parked
> on that peek, so `carousel-narrow.js` measured 3.2px where it passes at
> 8.29px standalone. A test that only fails when a hand is in the right place
> is not a guard, which is why the static guard now carries the hover term and
> reads BOTH scales out of the stylesheet. Mutation-proved three ways; the one
> that matters is that removing the term leaves the guard green on the exact
> geometry that shipped the bug.
>
> **What the static guard cannot do, said in its own comment:** it knows about
> Save patch, because that is what the ceiling was swept against. Checking
> every interactive element in column 1 is the scenario's half, and only at its
> own width.

`b8f78ee` moved the Save patch button after the narrow-width carousel work was
tuned against its old position. At 1024px the left peek clears it by **3.2px**
against the **8px** bar. `carousel-narrow.js` is red on it.

**DECIDED:** the carousel gives way, not the button. Daniel approved that
tightening and it stays. **Raise the no-peek threshold** to wherever 8px is met
again, re-derived by sweeping the real geometry the way 1067 and then 1080 were
found. Not a round number, not tuned by eye. Below it, nothing changes — the
peeks do not render and the two chevrons turn the wheel.

**And make the class unshippable:** a static guard that fails if ANY width in
the supported range has a peek clearing an interactive element in column 1 by
less than 8px. The spacing fix and the carousel rule were each correct and
nothing compared them. A scenario catches one width; the guard must catch all.

### 2. B7 — a stale slider writes its pointer position

**DECIDED: read on pointerdown.** Grab a slider, read that one parameter from
the instrument (~13ms measured), set the slider to the true value, drag from
there.

Not a relative drag. That fixes the symptom and adds a new lie — the handle at
0 while the device holds 113, so dragging to the far right stops meaning 127. A
control that looks absolute and behaves relative. Reading fixes the cause and
corrects the display as well as the write.

**If the read fails or times out, let the drag proceed on today's behaviour.** A
rare wrong value beats a control that sometimes does not work because MIDI
hiccuped. One parameter, at the moment it is grabbed — not on hover, not on view
entry, not the whole panel.

### 3. B10 — **CLOSED 16 Nov 2026 by the walk below. Nothing was changed for it.**

> **THE WALK.** Every path the renderer can use to write to the instrument,
> taken from the preload seam rather than from memory, with what each one
> carries:
>
> | path | what it carries | verdict |
> |---|---|---|
> | `midi.recall` — slot click, bank-tab arrows, panel button, session end | one Program Change, `0xCn` + program | no parameter value exists on this path |
> | `midi.auditionSound` | `0x46` and `params: {}` | no parameter value |
> | `midi.audition(file, idx)` — preview | the FILE's values, clamped, read in main | the app owns the file |
> | `transfer.startSlot` / `next` / `confirm` | the FILE's values | the app owns the file |
> | `transfer.selectBank` | a Program Change | no value |
> | `midi.setParam` — bar drag | the pointer's absolute position | **item 2**: the grab now reads the parameter first, so the aim is taken from an honest display |
> | `midi.setParam` — `[data-set]`, select | the control's own `data-set` / option value | an absolute literal, never derived |
> | `midi.setParam` — state pill | `current === 1 ? 0 : 1` — derived from the belief | safe, see below |
> | `midi.setParam` — undo | `before`, a remembered value | safe, see below |
> | `midi.setGlobal` | a global | one named exception, see below |
>
> **THE STATE PILL IS SAFE, AND THE REASON IS NOT "IT IS SMALL".** It derives
> the value it writes from `liveEdit.params[key]` — the belief — which looks
> exactly like the thing B10 is about. It is safe because the pill SHOWS that
> belief, so the player's intent is defined relative to what they can see:
> they click to get the opposite of what is on screen, and that is precisely
> what is sent. Worked both ways round: belief OFF / device ON, the player
> wants ON and 1 is sent; belief ON / device OFF, they want OFF and 0 is sent.
> Either way they get what they asked for. A stale belief costs them a click
> that changes nothing on the instrument, and the pill then shows the truth.
> That is a binary ABSOLUTE write, which is exactly what the bar was not.
>
> **THE UNDO WRITES A REMEMBERED VALUE, and the question is whether that
> memory can be wrong.** `before` is `liveEdit.params[key]` captured just
> before the edit. For it to be wrong, the instrument must have moved that
> parameter without telling the app. Measured against the schema — 110
> parameters, `scratchpad/b10-walk.js`:
>
> ```
> bars, now read at the grab (item 2)      90
> flag=1, announced by CC and read back    22
> Clavi tabs, polled every second           6
> NOT a bar, NOT announced, NOT polled      6
>   rho_tp(0)  dx7_tp(36)  vib_type(38)  pha_st(82)  amp_mo(91)  exp_fn(107)
> ```
>
> **All six of those are editor-only**, by the manual's own summary (§ "Editor
> only": *"Every sound-engine parameter · the Delay maxima · STEREO SPREAD ·
> phaser stages and feedback · amp type · the reverb extras · expression-pedal
> assignment and range…"*), which covers the three engine types, the phaser
> stages, the amp model and the pedal function. §20.6 says it again in its own
> words: *"amp type is editor-only"*. So the instrument offers no route to
> change them and the app is their only writer — the memory cannot go stale.
>
> **THE MANUAL IS THIRD IN THE ORDER OF AUTHORITY and it is FW 1.22 against a
> 1.37 unit**, so this is the weakest link in the chain. Nothing on the device
> contradicts it: none of the six carries a CC (`exp_fn`'s cc 1 is meaningless
> at `flag=0`, which B8 settled), and B9's hardware session independently
> found the amp TYPE arriving from the file while the switch did not follow.
> **What would falsify it is a menu route nobody has looked for** — if one of
> those six turns out to be reachable from the instrument, the undo of an edit
> to it can write a value the instrument never held.
>
> **ONE NAMED EXCEPTION, deliberate and not a defect.** `restoreSendPc` /
> `_returnGlobal` write a REMEMBERED global when the app gives back something
> it borrowed. If the player changed that global on the instrument while it
> was on loan, the restore overrides their change. It is a global rather than
> a patch value, it is the documented point of the marker, and
> `setGlobalOption` — a choice the player made — deliberately writes no marker
> at all. Recorded here so the walk is complete, not as work.
>
> **So B10's own mechanism is gone.** The gesture it was about — re-selecting
> a patch to refresh a wrong display — sends a Program Change for a bank slot
> and the file's own values for a library patch. Neither is a belief.

### 3 (original). B10 — establish, do not fix

It was measured before three things landed that may have dissolved it:
selecting a Seven slot sends a Program Change only; selecting a library patch
sends values the app legitimately owns; `9e19d4a` forgets a slot after an
overwrite attempt.

**Walk every path that writes to the instrument and name any that can carry a
value the app is no longer sure of.** Include item 2's own fix in that walk. If
none remains, mark B10 CLOSED with what closed it. If one remains, describe it
and stop.

### 4. Bank 1 never needs re-reading

Bank 1 is factory and cannot be stored to, so it cannot go stale. Four parts:

- **The freshness line comes off Bank 1.** "AS OF LAST BACKUP · NOV 14" is
  always false there. Banks 2–4 keep it. Check what renders when Bank 1 has
  never been backed up — "not backed up" is a different claim and only the
  second one is wrong.
- **Bank 1 rows never fade.** They load active and stay active.
- ~~**The long read skips Bank 1**~~ — **DROPPED 16 Nov 2026, Daniel's call.**
- ~~**Cache it against the firmware version string**~~ — **DROPPED with it.**

**Why they were dropped, so this is not picked up again.** The prize was about
12 seconds off a 48-second backup. The cost was two things neither of us saw
from the outside:

1. **The progress grid lights by COUNT, not by slot.** `paintBackup` does
   `led.classList.toggle('on', i < saved || i === current)` with
   `current = ev.n - 1`. Skip eight slots and the feed emits n = 1…24, so the
   grid lights buttons 0–23 — banks 1, 2 and 3 — while the instrument is
   actually reading banks 2, 3 and 4. The bank lamp and the lit numeral follow
   the same number. **The picture would be confidently wrong for the whole
   run**, which is worse than the failure CLAUDE.md already warns about ("dark
   never means done"). Fixing it means the progress event carries the real slot
   index and `paintBackup` lights by slot — a change to a hardware-verified,
   Daniel-approved view.

2. **CLAUDE.md already forbids it, for a reason.** "BANK 1 IS BACKED UP LIKE ANY
   OTHER, and should stay that way... Skip the bank in the backup and that
   file's source dries up" — `extract-factory-defaults.js` derives from the
   newest Bank 1 setlist.

Parts 1 and 2 shipped (`2c16b05`) and they are the halves anyone sees: Bank 1
does not claim to be stale, and its rows never fade. **Bank 1 stays in the
backup.**

### 5. B5 — the two dead Delay controls: LEAVE THEM — **DONE 16 Nov 2026, written up in `docs/protocol.md` 5b**

> No code changed, which was the decision. 5b now carries the whole case in
> one place: the three sessions of silence and what kind of evidence they are
> (reports of not hearing something, the only kind available for an audible
> effect); that the write path is not in question; that there is no id offset
> and no mis-wired row; §20.5's ceilings wording; that the manual is FW 1.22
> against a 1.37 unit; and that **no release note in ten releases and four
> years has ever mentioned the delay**, which makes §20.5 the only statement
> about these two that exists anywhere.
>
> **Daniel's reasoning for not dimming is recorded with it**, because it is
> the part that would otherwise be re-litigated: the panel already dims
> something, nobody established what that dimming means, a second reason
> would make the first ambiguous — and Stereo Spread, which demonstrably
> works, is dimmed too. A treatment that already contains a counter-example
> cannot be given a new meaning.
>
> **One thing changed underneath this item while it was being written.** B7
> is fixed, so "dragging from a value that was never there" is no longer a
> possible explanation for the silence. A fourth report would now be better
> evidence than the first three were — 5b says so.

### 5 (original). B5 — the two dead Delay controls: LEAVE THEM

**DECIDED 16 Nov: no change.** `dly_mf` and `dly_ml` stay as ordinary controls.

Daniel considered dimming them and dropped it: that panel already dims
something and nobody established what the existing dimming means, so a second
reason to dim would make the first ambiguous — and Stereo Spread, which *does*
work, is dimmed too.

**What to do instead is write it down once, properly**, so this is not reopened
a fourth time: all three sessions' evidence (12 Aug twice, 15 Nov), the manual's
§20.5 wording that they are ceilings Depth moves within, that the manual is
FW 1.22 and the unit is 1.37, and that no release note in ten versions has ever
mentioned the delay. The standing instruction in `protocol.md` 5b stands: do not
label them inert until the condition is demonstrated.

### 6. The parameter count — it is 22 of 110 — **DONE 16 Nov 2026**

> `docs/DEVICE.md` §12 now states it, with the flag rule as the reason, and
> the refusal to state it is gone.
>
> **The old text was right about the symptom and wrong about the remedy.** It
> said "fix the group, then count". The group never needed fixing: `cc` is
> meaningful only at `flag === 1`, so the three nonsense pedal values were
> never part of the map and never had to be. They are not a corruption to
> repair — they are a field nobody should have been reading.
>
> **What is still true, and is a different complaint:** those three `cc`
> values really are nonsense and `exp_fn` really cannot be assigned without
> software. Worth knowing when reading the schema by eye; not a reason to
> refuse a count. That half is kept.
>
> 110 parameters · 22 with a real CC · 88 editor-only. Stated with its date
> and a pointer to how to re-derive it, because a count is a measurement.

### 6 (original). The parameter count — it is 22 of 110

`docs/DEVICE.md` §12 says no count can be trusted because the three `pdl_exp`
entries carry nonsense CC values. **B8 settled that:** `cc` is meaningful only
when `flag === 1`, and flag=1 covers exactly 22 parameters — the same 22 the
manual lists.

Update DEVICE.md: the count is **22 of 110**, with the flag rule as the reason,
and remove the warning that a count cannot be stated.

### 7. `migrateLegacyLibrary` has no tests

**The highest-consequence untested function in the repo.** It is a data
migration: it runs once, on a real library, and a mistake is found after it has
already happened. `main.js` has no tests at all.

Not a release blocker. It is the largest latent risk either list holds.

### 8. B6 — the engine column collapses at 800px — **FIXED 16 Nov 2026**

> **The columns stack below 1031px.** Measured rather than guessed, and the
> measurement changed what the fix had to be.
>
> **What is actually wrong.** The chain column holds a fixed 294px and the
> engine column is `minmax(0, 1fr)`, so it takes what is left and keeps
> shrinking — **139px at 800**. Its contents do not shrink with it: a 128px
> carousel with step buttons hanging 22px outside each side, the picker, Save
> patch. The content spans 246.5px and runs **107.5px past its own column's
> right edge**, under the chain column, which paints over it. 17 presses did
> not land.
>
> **IT IS NOT FIXABLE BY FINDING A WIDTH WHERE BOTH FIT**, which is what I
> tried first. Swept: 800 over by 107.5px · 950 over by 11.5px · **968 still
> over by 2px with twelve presses blocked** — the picker alone is wider than
> the column it sits in. The two requirements cross, exactly as the carousel's
> spread and its clearance do.
>
> **So it stacks, at a band that already exists.** 1031 is the carousel's
> no-peek boundary, derived by sweeping for its own reason. Reusing it means
> ONE narrow layout rather than two overlapping ones, and no second invented
> number to keep in step. Above it there is room from the first pixel: the
> engine column measured 287.5px at 1032 against 248.5px of content.
>
> At 800 the overflow is now 2px and every in-view control is reachable.
> Mutation-checked: disable the rule and the scenario fails naming
> `car-step` covered by `.fx-section`.
>
> **The media query is written AFTER the rule it overrides.** Same selector,
> same specificity, so source order decides — above it, it would have lost
> silently. That is the trap `css-hazards.test.js` exists for and has caught
> twice in one day.
>
> **And one of my own assertions was wrong for the fixed layout.** Stacked
> content is taller than the window, and `elementFromPoint` returns null
> outside the viewport — so 54 controls read as "covered by nothing", which
> is a SCROLL POSITION and not an occlusion. The scenario now tests only what
> is in view and counts what it skipped, so a run where everything was
> off-screen cannot pass by testing nothing.

### 8 (original). B6 — the engine column collapses at 800px

Pre-existing, unrelated to the carousel, measured on 16 Nov with the carousel
rule disabled to prove it. `.engine-head-text` over Save patch, the effects
column over the picker. Unreachable on Daniel's display — `minWidth` is
`Math.min(1280, work.width)` — but live on a narrower panel.

### 9. Merge the two punch lists — **DONE 16 Nov 2026**

> **THERE ARE TWO LISTS AND NOW EACH NAMES THE OTHER.** `CLAUDE.md`'s
> "Smaller things still open" opens by saying so, and says which list a thing
> belongs on: that one is for standing facts about the repo that outlive a
> release, this one is for the work of ONE release and dies with it. An item
> that is both goes here **and keeps a line there saying so**.
>
> **THE ITEM THAT PROVES THE POINT IS BELOW.** The search count was logged
> FOR 1.5.7 and was not in this file at all.
>
> **CLAUDE.md's stale entry is struck, not deleted.** `.top-tab`'s font
> shorthand said "NOT fixed — Daniel's call" for a day after `022e615` fixed
> it. **Both things that rested on the broken 13.333px were already
> re-derived in that commit**, and the answer was not what the entry
> predicted: the 33.5px baseline offset did NOT have to change — the word tab
> went 400 13.333px → 700 17px/18.7px and its baseline moved **0.2px**,
> because the nav row's baseline is set by the LOGO's fixed 28.2px drawing
> rather than by type. The bank tabs now land as the mock drew them, 14/700
> against a real 17/700. `one-header-line.js` went green on the new numbers
> untouched. **So nothing was left to re-derive** — only to stop saying it
> was outstanding.
>
> `.claude/settings.json` was committed in `8278e46`, with a CLAUDE.md
> section on why a rule only matches a BARE command.

---

## THE DEV-BUILD QUEUE — collected 16 Nov 2026, written down the same day

**Nine items from Daniel using the development build off `four-tab-nav-wip`.**
They were collected in conversation and existed nowhere else until this
section; that is the difference between a punch list and a memory.

Two of them (10, 11) were in flight when the rest arrived. A was established
on hardware before anything was changed.

### 10. The missing-file setlist row says too much, in two voices — **OPEN**

Today it renders `Missing file: shapes-clav-3-2.sevenlib.json` **plus** a
`(missing)` sound-tag **plus** two tooltips saying the same thing differently.

- **Drop the `(missing)` badge.** The row already says "Missing file" in
  `var(--warn)`; the badge is the second voice and most of what crowds the
  right-hand end.
- **Strip `.sevenlib.json` from the DISPLAYED text** — fifteen characters
  identical on every one of these rows.
- **The row's `title` becomes the FULL filename**, extension included. That
  is then the only place the exact name exists, so it has to stay reachable.
- **Truncate the stem IN THE MIDDLE**, never at the end. `shapes-clav-3-2`
  and `shapes-clav-4-2` share a prefix, so end-truncation renders both as
  "shapes-clav…" and the row stops identifying which file it lost.
  `text-overflow: ellipsis` cannot do this.

**DO NOT STORE OR DERIVE A PATCH NAME.** A setlist slot holds a filename and
nothing else, so once the file is gone the name is genuinely gone. Deriving
one from the slug guesses, and guesses wrong: `shapes-clav-3-2` is "Shapes
Clav 3" with a dedupe suffix, not "Shapes Clav 2". No setlist format change.

### 11. `.slot-controls` paint over the row's own text — **OPEN**

`.lib-slot .slot-controls` is `position: absolute; right: 6px`, so the trash
and Select draw on top of whatever is in `.patch-sound`. It strikes through
"Tine Piano" on an ordinary patch row. **Every row type, not only missing
ones.**

Requirement: the controls must never overlap row content, AND the row must
not move, reflow or change height when they appear — which is presumably why
they were taken out of flow in the first place.

Constraints: `.lib-slot` is `grid-template-columns: 24px 1fr auto auto`
carrying six children, so it already wraps; `.lib-slot-empty .slot-controls`
is permanently visible by design; `:focus-within` must keep them reachable.

**Measured so far:** an empty row resolves to `24px 323px 0px 0px` and the
controls take **no grid cell at all**. A setlist with missing files has not
been reached yet — finish that before choosing between reserving a column and
yielding `.patch-sound` on hover.

### A. The FX chain shows what the app believes, not what the Seven runs — **ESTABLISHED `f6e88fa`, NOT FIXED**

Reproduced on hardware in the no-selection state: 3 of 6 switches disagree,
the instrument running FX1, AMP and REVERB while the panel draws them OFF.

**With a patch selected the chain carries correctly** — confirmed on hardware.
The defect is the no-selection state only, where `liveParams()` returns null,
`keptChain` spreads to `{}` and the working copy comes from the file.

**The `ok`-is-false theory is dead:** 39 live rows exist after the choice, so
`beginLiveForTarget()` succeeded. **And the disagreement is already there
before the carousel is touched** — the pane never reads the instrument in
that state, so the sound change is only when somebody looks.

Decided: **read the whole chain, not the six switches** — a block honest that
it is running and wrong about what it is running is a worse lie than a
visibly stale one. Measured **493ms for 39 parameters**, below the schema's
507ms. **Fires once per session**, confirmed: a session does open on the
choice, so a second choice has a snapshot.

### B. Backups are keyed per day and should be keyed per run — **OPEN**

Two backups five minutes apart produce one entry. `backup-runner.js` writes
`Bank N setlist (<dateStr>)` and `createOrReplaceSetlist` replaces any
setlist of that name, so a re-run overwrites the first run's setlists.

**The hole:** patch files use `uniqueFile()` so nothing is deleted — but a
slot that CHANGED between two same-day runs leaves the first run's version on
disk referenced by no setlist, and the Backups tab is built entirely from
setlists matching `BACKUP_NAME`. Not a deletion; invisible.

**Rule 1 is not negotiable:** nothing already on disk may become unreachable.
`BACKUP_NAME` must keep matching every format already written, including the
bare-date and `, partial` / `, failed` forms. Widen the regex, never replace
it, and keep the date-fallback grouping for setlists predating `runId`.

**Then report** whether orphaned backup records already exist in the live
library, and how many. **Report only — delete and merge nothing.**

### C. A finished backup lands on the Backups tab and the row arrives — **OPEN, depends on B**

Switch to the Backups tab on completion; already being there is not a special
case. Port JUNO-Xtra's `arriveBackupRows()` behaviour, not its file: a Set of
row identities already shown, a new row animating opacity 0→1 with
brightness 1.7 → 1.35 at 45% → 1, 360ms ease-out, 22ms stagger, reduced
motion skipping it, and the first fill animating everything because the Set
starts empty.

**A BRIGHTNESS FLARE, not a fade up from dim** — this app already uses
opacity to mean "stale" on the Seven rows and the two must not converge.

### D. "Back up instrument" moves to the foot of the Seven list — **OPEN**

Out of the toolbar, beside the freshness line. **A move, not a copy.**
Accepted cost: not reachable from Patches, Setlists or Backups, which is
correct — backing up is a Seven-tab activity and that line is the only thing
in the app that says a backup is overdue. Keep every disabled/connected state
and the in-progress label swap. The toolbar keeps Disconnect and Settings.

### E. The freshness line drops the counts — **OPEN**

"9 OF 32 AS OF 3:53PM - 23 AS OF LAST BACKUP" is too much and summarises what
the per-row fade already shows. Reduce it to the backup caveat.

**ONE CASE SURVIVES:** when `verified >= total` the line returns "as of
<when>" with no caveat, because nothing on screen is stale. **Keep that
branch exactly** — a backup date there would state the opposite of the truth.
Only the mixed branch goes. Update the unit tests rather than working around
them, and keep the after-midnight handling.

### F. The app paints its DISCONNECTED state for a second before the loader — **OPEN**

Not a blank or half-drawn window: for over a second the app shows "No
instrument connected", a Connect button, empty lists, "Select a patch" and no
nav logo — **while the Seven is plugged in and already being read. The first
thing the app says on launch is false.**

**Decided: the loader starts VISIBLE and the app paints behind it.** It
covers the window, so showing it by default hides the false state too — one
change for both halves. Cost: an offline launch shows it briefly before it
stands down, which is acceptable — "connecting" when offline is honest, "No
instrument connected" when you are not is not.

Still to establish: whether the main process can answer the connect question
before the window loads, so an offline launch does not linger; and whether
the BrowserWindow is deferred to `ready-to-show` (`backgroundColor` is set,
no `show: false` found) — the two would compound.

### G. Four left edges — **MEASURE AND REPORT, CHANGE NOTHING**

Reported as "back to being cramped" at a narrow width, and separately as a
Banks-tray alignment problem. The four edges:

- the bank tabs row (Bank 1–4) under the Seven tab
- the numbered `.lib-slot` rows beneath them
- `.lib-setlist-head`
- `.lib-bar-detail` and the back button's **border**

The last three were aligned deliberately on 6px on 15 Nov. **The bank tabs
were never part of that alignment and are the likely culprit.** Give the four
numbers at a narrow width and at 1147. Whether 6px is the right gutter at all
is Daniel's call, not a fix.

---

### 9a. THE SEARCH COUNT NEVER REFRESHES WHILE YOU TYPE — **OPEN, and it was logged for this release**

**Carried over from `CLAUDE.md`'s "Smaller things still open" on 16 Nov 2026,
which is where it had been living alone.** Daniel logged it for 1.5.7 on
15 Nov and it never reached this file — the single clearest thing the audit
was looking for.

The count ("3 of 12") is drawn into `.lib-bar` by `renderBody`, and it only
appears WHILE a search is narrowing something, which was the point of it
(`2f727c5`). But **typing does not call `render()`**: the input handler
repaints `.lib-list` alone, deliberately, because a full render replaces the
field being typed in and takes the caret with it. The bar is never touched,
so the one number whose whole job is to answer "how much did that hide?" is
stale from the keystroke before, or absent.

It is also why **`countLabel()` reads a render behind**: it is evaluated as
an ARGUMENT to `renderBody`, so it reports the hits the PREVIOUS render left
on `state`.

**Both halves want fixing together, and the fix has to keep the caret.**
Deliberately NOT done in the four-tab branch, which is visual-only, because
it lives in the shared search paint path.

### 9 (original). Merge the two punch lists

`CLAUDE.md`'s "Smaller things still open" is a second list this file never
referenced, and that is the root cause of the 16 Nov audit. One must point at
the other, in writing. Also fix CLAUDE.md's stale entry saying `.top-tab`'s font
shorthand is unfixed — `022e615` fixed it — and re-derive anything that rested
on the broken 13.333px.

Commit `.claude/settings.json` if that has not happened.

---

### 10–16: PAUSED 16 Nov 2026 — the dev build comes first

**Daniel: "No walk through today. I know there will be many bugs and many small
changes. I want to do that on the dev build."**

So the shipping sequence below does not start when items 1–9 finish. **It waits
for the dogfooding to settle.** After item 9, the run is done and the next
thing is Daniel using the development build off `four-tab-nav-wip` and
reporting what he finds.

**Nothing below is cancelled** — it is the right sequence and it is still the
way out. It is waiting for a branch that has stopped changing. Merging ~70
commits to main and then finding ten things in a day's use would mean fixing
them on main, which is the thing main is for avoiding.

**TERMINOLOGY, so these stop getting confused.** The app names the first one
itself, in its own ping line:

- **development build** — `npm start` on the branch. Code running from source.
  This is what Daniel is using.
- **installed build** — the packaged `.app`, still 1.5.6. Not being updated yet.

Avoid "local build": it means either one.

### 10–16: the shipping sequence, for when the branch settles

10. **Walk the commits with Daniel.** Nothing above may be outstanding.
11. **Merge the nav branch to main.**
12. **Bump `package.json` to 1.5.7.** It still says 1.5.6.
13. **The full hardware pass.** The scope asks for it explicitly — "not the spot
    check 1.5.6 got" — and it has never happened.
14. **Mutation testing**, the release ritual.
15. **Build, sign, notarize.** Expect prompts: `gh release` and the keychain
    lookups came off the approved list on 16 Nov, deliberately.
16. **Release.**

---

## SCOPE — **SUPERSEDED 16 Nov 2026. Read the next paragraph before the list.**

> **1.5.7 CARRIES FOUR THINGS, AND SETLISTS IS NOT ONE OF THEM.** Daniel, 16
> Nov: "Let's leave setlists out of 1.5.7 unless I have a eureka moment." The
> release is **the save flow, the four-tab navigation, the boot loader and the
> On-the-Seven freshness work.** The three-feature list below is kept for the
> setlist reasoning it carries, which is still good when setlists come back —
> but as a statement of scope it is wrong, and it sat 660 lines above the
> paragraph that overruled it. See "SETLISTS ARE OUT OF 1.5.7" near the end.
>
> **STILL OPEN inside the surviving scope:** the full hardware pass before
> tagging, below, has not been done. `package.json` also still says **1.5.6**.

## SCOPE, set by Daniel 14 Nov 2026 — the setlist reasoning, kept

1.5.7 carries THREE features, not one. He asked for a punch list and then
confirmed "save as setlist DOES ship with 1.5.7". No deadline: "a couple of
days ... maybe next week. No hurry."

  1. The save-patch flow            branch save-what-you-hear, in flight
  2. The navigation redesign        four tabs, the design language, arrivals
  3. Save a bank as a setlist       the capture, new in this release

Two of the three touch the code that changes what the Seven holds after a power
cycle, so this wants the full hardware pass before tagging, not the spot check
1.5.6 got.

### SETLISTS — SETTLED 14 Nov 2026. There is no naming problem.

It looked like two objects needing two names. It is one object.

**A setlist is a named list of eight patches.** Where those patches came from —
built from the library, or read off the Seven — is PROVENANCE, not identity.
That is already how this codebase separates things that look alike: `source`
says which instrument a patch came from, `origin` says which bank and preset,
`nameFrom` says which file lent a name. Same move.

So: one object, one tab, one word, and nothing to explain to anyone upgrading.

Daniel saw it: "we have two paths to setlists. Capturing a bank; or building a
setlist from the ground up." They are not rivals — they run in opposite
directions. BUILD goes computer to instrument; you are planning a show from
patches you have. CAPTURE goes instrument to computer; you changed things by
hand and the file is catching up. Usually the second follows the first.

Which gives a setlist a useful history for free: when it was built, when it was
last read off the instrument. That is the file saying whether it still matches
the hardware.

### The four pieces, as Daniel set them

**1. Save bank as setlist, landing in the Setlists tab.** With the arrival glow
— the new row comes in selected, so the glow is its own red selection edge
settling.

**2. Convert existing setlists to the new format.** A slot holds a file
reference today (`library-store.js` ~351: `slots: [...files, null, null, null]`)
and those patches already carry their full 110 values, so converting means
resolving the eight pointers and inlining what they hold. No instrument needed.

Three things it must be honest about:

- **A converted setlist was never read off the instrument.** It is what he meant
  to put there, not what was there. The file records which. The project's own
  rule: current state does not stand in for recorded fact.
- **Empty slots stay empty.** The demo setlist is five filled and three null,
  and a bank can have blanks too, so the format allows it.
- **A slot pointing at a deleted patch** cannot resolve. That slot says so
  rather than the setlist quietly coming back seven songs long.

**KEEP THE PRE-CONVERSION FILE.** This rewrites everyone's setlists. This app
never destroys: demo patches went to the Trash rather than unlink, every write
is atomic, and the last migration (`sets.json` -> `setlists.json`,
`library-store.js:221`) wrote the new file and left the old one in place. Do the
same. A few kilobytes is the difference between a bad migration being an
annoyance and being a loss.

**3. Keep the existing create-setlist pipeline, restyled.** Daniel, 14 Nov:
"Let's keep the existing 'create setlist' pipeline with stylistic updates from
our latest design refresh. But we may move this into a modal later. For now,
let's lock down what we have."

It already exists and was nearly rebuilt by mistake: `＋ Create new setlist` is
in `library-view.js:781`, `createSetlist(name)` is in the store and on IPC, and
the slot picker is the "Selecting Slot 1" modal — four days of his own August
decisions, including why Bank 1's factory sounds live on their own tab and why
a tile carries an age. So this is "give the button a home in the new Setlists
tab and restyle it", NOT "design a new modal".

A pick-eight-at-once creation modal is a LATER option, explicitly deferred.

**4. The design language and the redesign** carry it all — see the sections
below.

### The small items below are unchanged and still in

**THIS HEADING PROMISED A LIST AND HAS NEVER HAD ONE** (noticed in the audit of
16 Nov 2026). It is not that the items were lost — they are sections 1 to 5 near
the end of this file — it is that a reader arriving here is told to look below
and finds the bug list instead. Their true states are marked on each.

## WHAT IS IN THE REPO AND NOT ON THIS LIST — audit of 16 Nov 2026

The point of the audit, and the half that matters more than the corrected
headings. These are real and none of them is written down here.

**1. THE SEARCH COUNT NEVER REFRESHES WHILE YOU TYPE — and it was explicitly
logged FOR 1.5.7.** CLAUDE.md records it (Daniel, 15 Nov) and says it was
deliberately NOT fixed in the four-tab branch because the fix is in the shared
search paint path. It is not in this file at all. Typing repaints `.lib-list`
alone — on purpose, because a full render takes the caret with it — so the one
number whose job is "how much did that hide?" is a keystroke stale or absent.
`countLabel()` also reads a render behind, because it is evaluated as an
argument to `renderBody`. Both halves want fixing together, and the fix has to
keep the caret.

**2. `package.json` still says 1.5.6.** No version bump, on a branch carrying
78 commits of the 1.5.7 release.

**3. The branch has never had its full hardware pass.** The scope section at
the top asks for one "before tagging, not the spot check 1.5.6 got", and it has
not happened. The run of 16 Nov is the closest, and it found a real regression
(see 4).

**4. SAVE PATCH MOVING ATE THE CAROUSEL'S OWN CLEARANCE RULE.** `b8f78ee`
("Save patch joins the block it acts on") landed AFTER the narrow-width
carousel work and moved the button. At 1024px the left peek now clears Save
patch by **3.2px** against the 8px bar the rule demands — "a bound met by a
hair is not met", Daniel's own standard. `carousel-narrow.js` catches it. This
is a genuine regression, not a host crash, and it is the one thing the suite
is red on.

**5. Three branches are unmerged and two of them are live work.**
`lists-preview` carries five commits of the list-design preview (14-15 Nov),
including the logo-overlap and chevron-column fixes; `proto-bank-tabs` is from
August and is probably dead. Nothing in this file says what should happen to
either.

**6. CLAUDE.md's "Smaller things still open" is a second punch list that this
one does not reference.** It holds at least: the dim overlay's text sitting on
the parameter rows (queued for 1.5.2 and still there), arrow keys on Windows
(DIAGNOSED, NOT CONFIRMED — and the four-tab redesign plausibly removes the
cause, which is explicitly NOT the same as fixing it), the UI suite having
never run on Windows at all, `main.js` having no tests while holding
`migrateLegacyLibrary` (the highest-consequence untested function in the repo —
the failure mode is somebody's patches), nothing asserting WHERE the donation
ask fires from, the ~5px jump at the start of the tray swap, and "connect →
open to the active patch". **Two lists means the one nobody is reading is the
one that rots.**

**7. CLAUDE.md itself has a stale entry, found by this audit.** It records
`.top-tab`'s invalid font shorthand as "found 2026-11-15, NOT fixed — Daniel's
call". It WAS fixed the same day, on this branch, by `022e615` ("Fix the
invalid font shorthand: the top tabs are 17/700 at last"). The two things that
rested on the broken 13.333px number — the 33.5px baseline offset and the bank
tabs' size — need re-deriving against the real one if that has not been done.

**8. Three things shipped today that this file never mentions:** the
stale-backup boot offer (`44536bc`), the overwrite-forgets-slot behaviour
(`9e19d4a`), and the freshness fade itself (`a15cae0`) — which appears only as
four words inside the setlists-are-out paragraph.

## OPEN BUGS, found by Daniel in the running app 15 Nov 2026

**AUDITED 16 Nov 2026.** Every entry below now carries its state in its
heading: **DONE** with the commit, **OPEN**, **RECORDED-NOT-FIXED** with the
reason, or **SUPERSEDED**. Nothing here should read as open when it is not —
five headings did before this pass, which is CLAUDE.md's "a recorded fact
standing in for current state" happening to the punch list itself.

These were reported in chat and are recorded here so they survive a lost
session. Each one is a thing he SAW, not a thing anyone inferred.

### B7. A stale slider writes its pointer position, and moves the instrument the wrong way — **OPEN**, measured 15 Nov 2026, awaiting Daniel's choice

**This came out of B5 and outranks it. B5 was a labelling question; this
destroys a parameter value.** It touches every control in the app, so nothing
has been changed pending a decision on the options below.

**What happens.** The panel is a CACHED view. When the instrument moves
without the app originating the change, the slider on screen is stale. A drag
then writes the pointer's ABSOLUTE position (`audition.js`, `intentFrom`:
`pct * max`), so a player who sees **0** and aims for **32** moves the device
from **113 to 32** — the opposite direction from what they asked, by 81.

It self-corrects on the write that does the damage: afterwards panel and
device agree, so there is nothing left to find. That is why three sessions on
B5 never caught it.

**MEASURED**, with the Seven attached, by
`test/ui/scenarios/fx2-delay-display.js`:

| phase | fx2_dp(80) | fx2_sp(81) | dly_mf(86) | dly_ml(87) | dly_sp(88) |
|---|---|---|---|---|---|
| on arriving at the patch | 76/76 | 36/36 | 0/0 | 0/0 | 127/127 |
| leaving and returning | 76/76 | 36/36 | 0/0 | 0/0 | 127/127 |
| device moved behind the panel | 76/76 | **36/72** | **0/113** | **0/127** | 127/127 |

(panel/device). Then the drag: pointer at 25% of the track wrote 32 and the
device went 113 → 32. The player saw 0, aimed at 32, and the instrument moved
**−81**.

The app never produces the divergence by itself — arrival and re-arrival agree
on all five. That matches 5b's 2026-08-12 signature exactly: the same three
stale, the same two correct.

**INFERRED, and not the same thing.** How Daniel's instrument actually got
into that state is NOT established. The probe induced it by writing behind the
app's back, which proves the MECHANISM only. The likeliest route is the
physical panel — and for a `cc: -1` parameter that route is unobservable to
the app by construction, so it may never be directly confirmed.

**SCOPE — not the delay section, and not everything either.**
`audition.js:317 onPanelCc` maps an incoming CC to a key through `ccMap`,
which `main.js:552` builds from `p.cc >= 0`. So:

- **25 of 110 parameters have a CC** and ARE followed: the app reads the value
  back over SysEx (coalesced, 80ms) and updates the panel. These self-heal.
- **85 of 110 carry `cc: -1`** and have no entry in the map, so nothing fires.
  There is no signal for the app to follow and it cannot be told at all.
- `onPanelCc` also returns early unless the session `isLive()`.

`fx2_sp` appearing stale in the table above is an ARTIFACT of how the probe
induced it (a write that bypassed the app's own state), not evidence that
CC-mapped parameters go stale from panel moves. Do not read it as such.

**What is NOT established:** whether the instrument emits anything at all when
a `cc: -1` parameter is changed from its own front panel. That needs Daniel at
the keyboard with `tools/listen.js` running — move Max Feedback on the
instrument and see whether a single byte arrives. If something does, the fix
is cheaper than any option below.

**COST OF THE CANDIDATE FIXES, measured 15 Nov 2026**
(`test/ui/scenarios/param-read-cost.js`):

- **one parameter: 13ms median** (min 12.4, max 23.6, mean 14, n=25)
- **whole buffer: 1437ms median** today, 3 runs, against the 1363ms CLAUDE.md
  records on 2026-11-14
- dividing the buffer by 110 gives 13ms, the SAME as a measured single read —
  so the cost is per-parameter almost entirely, and a buffer read is simply
  110 of them. There is no fixed overhead to amortise, which is what makes a
  targeted read cheap and a "just read everything" fix expensive.

| option | cost | what it still misses | what it breaks |
|---|---|---|---|
| A. read on entering the view / regaining focus | 1437ms per entry, or ~13ms × visible rows if scoped to what is on screen | anything that changes WHILE the view is open and focused — which is the actual scenario, a player tweaking the instrument while looking at the app | a 1.4s stall on every focus change if unscoped; alt-tab becomes expensive; adds bursts of read traffic, and CLAUDE.md records one unexplained instrument silence under heavy reads |
| B. read the single parameter on pointerdown | **13ms**, imperceptible, inside the 100ms a press absorbs | only the parameter being touched — every other slider still SHOWS a stale number, though nothing destructive happens | adds an await before the first write; needs a timeout so a slow or failed read cannot swallow the gesture |
| C. make the drag RELATIVE to the device's value | 0ms | the displayed number is still wrong, so the player still misreads the instrument | the deliberate "press anywhere on the track and the value follows the pointer, no handle to hunt for" interaction (`audition.js`), across every control in the app |
| D. poll the visible `cc: -1` rows while live | ~13ms × rows on screen, e.g. 65ms for the five delay rows, repeated | changes between polls; a drag started mid-poll | constant background MIDI traffic, against the same unexplained-silence note |

**RECOMMENDED: B, plus a scoped A.** B alone removes the destructive write for
13ms, which is the part that costs somebody their sound. Scoped A — re-reading
only the rows actually on screen on entry and on focus regain — makes the
DISPLAY honest at a bounded cost instead of a 1.4s stall. Not C: it fixes the
damage but pays for it with a documented interaction and still shows the wrong
number, and a player reading a wrong value is the thing underneath both
complaints.

Daniel decides. Nothing is changed until he has seen this.

### B1 / B1b / B1c. The carousel — **DONE 15 Nov 2026**, and one flaw deliberately kept

> **THE FINAL STATE, and it is a REVERT rather than a fix.** `24b3d6e` put the
> carousel back to the geometry Daniel reported as working, after five commits
> in which only the first addressed anything he had reported and the other four
> were repairs to the repair (CLAUDE.md records the whole sequence as "A
> REPORTED WORKING STATE OUTRANKS A MEASURED IMPROVEMENT"). On top of that
> revert sit three narrow-width commits: `9f1feba` tucks the peeks away from
> Save patch below the width where they collide, `4736551` hides them entirely
> below 1024px where no spread both clears the control and leaves a
> recognisable peek, and `4a3f704` gives that band two chevrons — named
> Previous and Next in `f5eaefb` — because the peeks ARE the control and
> hiding them would otherwise stop the wheel turning.
>
> **THE FLAW THAT WAS KEPT, on purpose and with a price attached:** while the
> wheel is TURNING the right peek runs about 55px past the column, over the
> parameter rows. Daniel priced that against shrinking the resting artwork by a
> quarter and kept the overlap. **Do not fix it.** His words: "It used to work
> great except for a little overlap."
>
> B1b (two resting places) and B1c (the left peek over Save patch) are resolved
> by the same set: the revert removed the two-position behaviour, and the
> narrow-width work removed the Save patch collision. `b8f78ee` separately moved
> Save patch into the block it acts on.
>
> The original reports are kept below, unedited, because the measurements in
> them are what decided the revert.

### B1. The carousel peek faces are spread too wide — NEEDS THE SEVEN

Seen in both themes, 15 Nov. In the Sound Engine column the centre instrument
sits correctly, the LEFT neighbour is cut off by the column edge, and the RIGHT
neighbour is off screen entirely. Daniel: "I can't see my options."

Likely from the carousel work of 15 Nov — the carousel stage commit, the
width-400 commit, or the clip-at-rest / open-while-turning change.

The rule it has to satisfy: the peek faces are an INVITATION TO TURN, so they
must be visible. They may sit outside the carousel's own box — that is
deliberate, and the document-coordinate hover test depends on it — but both
must stay inside the engine column's visible width, symmetrically. Do not fix
it by shrinking the centre image; the centre is the subject. Check at the
window's minimum width as well as the default: a spread tuned at one width and
broken at another is the same bug again.

Only renders with a Seven attached, which is why it has waited.

**FIXED 15 Nov (`23e072f`), and the cause was not the spread.** The stage sits
flush against the column's right edge, so a symmetric spread puts one neighbour
over the meta text and the other past the column edge. It could not be tuned
away: the hero's half-width at scale 1.12 is 104.7px against 93.5px of room, so
every spread narrow enough to fit on the right is hidden behind the hero. A
visible symmetric peek REQUIRES the wheel to move. Measured, not preferred.

### B1b. The wheel has two resting places, and the difference reads as motion

Reported by Daniel 15 Nov, after B1 was fixed. The fix centres the wheel on the
column WHILE AWAKE; at rest it is still flush right. One cause, three symptoms:

1. The hero jumps left the moment the carousel wakes — the subject of the view
   moves when you approach it.
2. After the wheel turns, a SECOND jump follows. Daniel: it "feels like it
   skipped forward yet another image. But it hasn't." He then placed it
   exactly: **it happens when the header text for the model/sample loads.**
   That makes it a reflow, not a rotation — the late-arriving name or badge
   changes the block above and shifts the carousel under it. My first reading,
   that it was the wheel returning to rest, was wrong.
3. The resting hero is not centred under its own column heading.

The fix is one position, not two: centre at rest as well as awake, so only the
peeks appear and disappear. Check whether flush-right was deliberate before
changing it — the report that found it described it as where the stage sits,
not as a decision.

### B1c. The left peek covers the Save patch button

Seen in light mode, 15 Nov. The ghosted upright piano overlaps both
"Bank 1 · Preset 1" and the **Save patch** control. A peek over meta text is
allowed; a peek over a BUTTON is not — it reads as obscuring a control and
invites a click that lands on the wrong thing. Whether a click in the overlap
actually hits the peek rather than the button is unconfirmed and is its own
question.

### B6. The engine column's own layout collapses at 800px — **RECORDED-NOT-FIXED**

**Why it is not fixed:** it needs a display narrower than 1280px to reach at
all (`minWidth: Math.min(1280, work.width)`), nobody has reported it, and the
cause is the two-column grid and the engine heading rather than anything in
flight — so it wants its own look rather than riding in on a carousel commit
(Daniel, 15 Nov). The measurement below is kept because it will not survive
the session otherwise.

Unlike the rest of this section this one was not reported from the running
app: it was measured on 15 Nov while fixing B1c, at a window width Daniel
cannot currently open. Recorded anyway, because it is a real failure and the
measurement will not survive the session otherwise.

At a forced 800px viewport, with the Seven attached and a patch selected:

```
"save-live-btn" at 25%, 50% and 75% across is covered by <div class="engine-head-text">
"picker"        at 50% and 75% across is covered by <div class="fx-section dimmed collapsed">
```

So the Sound Engine heading block lands on top of the **Save patch** button,
and the EFFECTS CHAIN column lands on top of the **Type** picker.
`document.elementFromPoint` returns the covering element at every one of those
points, so these are presses that would not land.

**PROVEN INDEPENDENT of the carousel work that found it.** The obvious
suspicion is the new no-peek rule, and it is wrong: that rule's breakpoint was
temporarily dropped to 1px so no face was hidden, and the same two elements
covered the same two controls at the same width. Nothing about the carousel
causes this — it is the two-column grid and the engine heading, and it wants
its own look rather than riding in on a carousel commit (Daniel, 15 Nov).

**HOW TO REACH IT.** `src/main.js` honours `SEVEN_WINDOW_WIDTH` (development
only) and lowers `minWidth` with it, because a media query cannot be tested by
squeezing `#main`. A scenario declares its width in its own header:

```js
// @env SEVEN_WINDOW_WIDTH=800
```

`test/ui/scenarios/carousel-no-peek.js` sits at 1000px specifically because of
this bug, and its header says so.

**SCOPE, and why it is not urgent.** `minWidth: Math.min(1280, work.width)`
means the window only goes below 1280 on a DISPLAY narrower than that, where
the minimum collapses to the screen width. So this needs a small or scaled
panel — a portrait tablet reporting 800x1280, say. Nobody has reported it.

### B8. ccMap is built from the wrong field — **DONE 16 Nov 2026 (`5f0694f`)**

> **The heading below said RESOLVED DIAGNOSIS and stayed that way after the fix
> landed** — which is the exact shape CLAUDE.md warns about, a rule or a
> diagnosis read as a record that something was done. `5f0694f` builds the map
> from `p.flag === 1`, so CC 1 no longer resolves to `exp_mx` and an incoming
> mod wheel or Bank Select no longer fires a SysEx read of a pedal parameter.
> Covered by `test/cc-map.test.js`, which runs in `npm test`.
>
> **The "Fix: … Not done — reported only" line below is now false.** It is kept
> for the reasoning, not as a state.

`src/main.js:554` builds the CC→parameter map from `p.cc >= 0`. Three
parameters report a `cc` that means nothing: `exp_fn` (107) cc 1, `exp_mn`
(108) cc 0, `exp_mx` (109) cc 1. They are the only exceptions in a table where
`-1` is the sentinel — 85 of 88 `flag=0` parameters use it — and the manual
lists the expression pedal as absent from the CC map entirely.

**`flag` is the real marker.** `flag=1` covers exactly 22 parameters and they
are exactly the manual's 22 fixed CCs.

Because `map[p.cc] = p.key` lets a later id win, **CC 1 currently resolves to
`exp_mx`**. So an incoming CC 1 from any controller's mod wheel, or CC 0 Bank
Select from anything sharing the port, is treated as a panel move and fires a
SysEx read-back of a pedal parameter. Nothing is corrupted — the read returns
the true value — but it is real traffic on unrelated messages.

**Fix: build from `p.flag === 1`.** One line. Not done — reported only. Full
reasoning in `docs/SCHEMA-VS-MANUAL.md` §2 and `docs/protocol.md` open item 2,
which this CORRECTS: that item previously said RESOLVED with a different and
wrong explanation.

### B5. FX2 Delay — the sliders appear mis-wired — **OPEN**, half answered 15 Nov 2026

**What is closed:** the Depth half is not a defect; the manual documents it,
there is no id offset and no mis-wired control. **What is open:** whether Max
Feedback and Max Level bound DEPTH as the manual says. Three sessions, Daniel
cannot hear them do it (12 Aug twice, 15 Nov). Tracked in `docs/protocol.md`
item 5b. **Do not label them inert in the UI** — the device reports them as
ordinary controls.

**The Depth half is not a defect, and the manual says so.** `docs/MANUAL.md`
§20.5, verbatim:

> "When the Delay effect is selected, the DEPTH parameter varies both the
> delay feedback and level at the same time."

> "This section allows to establish the maximum amount of feedback and level
> that can be varied by the DEPTH parameter."

So DEPTH **is** the feedback amount in Delay mode, by design, and Max Feedback
and Max Level are **ceilings on what DEPTH can reach**, not amounts in their
own right. Daniel hearing Depth change the feedback is the instrument working
as documented.

Measured the same day and consistent with that: no id offset anywhere in FX2
(17 writes across four modes, each moved exactly its own id) and no mis-wired
control (every row's label matches its own `data-key`).

**What remains open is a real manual-versus-device disagreement.** The manual
says the maxima bound DEPTH; on FW 1.37 Daniel cannot hear them do it, and
that is now three sessions (12 Aug twice, 15 Nov). The device wins by the
authority rule, and the manual is fifteen firmware revisions stale — but the
expectation is now documented rather than guessed. **Do not label them inert
in the UI**; the device reports them as ordinary controls. Tracked in
`docs/protocol.md` item 5b, which is where the detail lives.

And one thing the manual adds that makes this harder to observe, not easier:
there is **no front-panel or menu route to either maximum and no CC for
them** — §10.4's fixed map has nothing for feedback, level, spread or Delay
TIME. They are editor-only parameters with no controller, which is precisely
the B7 mechanism.

### B5 (original report). FX2 Delay — the sliders appear mis-wired

Reported by Daniel 15 Nov, playing the instrument with the app connected.
**This is a functional defect, not a layout one, and it outranks the visual
queue.**

What he observed, in FX2 with Mode = Delay:

- Moving **Depth** changes what sounds like **feedback**.
- Moving **Max Feedback** does not appear to change feedback at all.

Visible in the same panel at the time: Depth 34, Speed 27, Max Feedback 127,
Max Level 0 (dimmed), Stereo Spread 127 (dimmed).

The shape of it suggests an OFFSET in the FX2 parameter mapping for the Delay
mode specifically — a control writing its neighbour's id — rather than a
single wrong id, since one control acts on another's target and that other
acts on nothing. The dimmed Max Level at 0 and Stereo Spread at 127 are worth
checking as the far end of the same shift.

Not yet established, and not to be assumed: whether the app's mapping is wrong
or the instrument's documented ids are. This project has a recorded history of
the manual disagreeing with the device. The instrument is the authority.

Needs the Seven. Method that settles it without relying on ears: write a known
value to each FX2 Delay parameter in turn, read the buffer back, and compare
which id actually moved.

### B10. Refreshing a wrong display writes the wrong value to the instrument — **CLOSED 16 Nov 2026**

> Closed by the walk in item 3 at the top of this file, which is where the
> reasoning and the measurements live. In short: the gesture this was about —
> re-selecting a patch to refresh a wrong display — sends a **Program Change**
> for a bank slot and the **file's own values** for a library patch, and
> neither is a belief. The two remaining writes that derive from one (the
> state pill and the undo) were each checked and are each safe, for reasons
> that are not "they are small".
>
> **Nothing was changed for it.** The paragraph below describing what was
> measured is still an accurate account of the app as it stood on 16 Nov,
> before item 2 landed.

**Why it is not fixed:** selecting a patch SENDS it, and that is load bearing —
it is what makes a patch live and what "navigating away discards" is the
counterpart to. Changing it is a behaviour change in the path everything else
rests on, and Daniel will want to choose it rather than find it. **With B7,
this is one of the two decisions this file is waiting on.**

**This came out of B9 and outranks it.** B9 is a wrong number on a screen.
This is the gesture a player reaches for when they see one.

**The app's recovery gesture for a wrong display makes the INSTRUMENT wrong
instead.** Re-selecting a patch does not re-read the Seven. It SENDS the app's
belief, so a disagreement is resolved by overwriting the hardware with
whatever the screen was already showing.

**MEASURED** (`test/ui/scenarios/amp-switch-read.js`, Bank 2 / Preset 5, Seven
attached). The device was moved behind the app's back, then the patch
re-selected — the gesture nearest to what Daniel described as refreshing:

```
device amp_sw 1 -> 0 (app not told)      pill stayed "ON"   — it did not follow
after re-selecting the patch             device amp_sw = 1  — the app's value, sent back
```

**What that means for his report.** He saw the amp reading OFF while the
instrument had it ON, and he refreshed. The refresh could not have fixed the
display — and it would have **turned the amp off on his instrument** to match
a screen that was already wrong. He would have been left with a correct
display of a state the app had just created.

Nothing was corrupted on disk: this is the edit buffer, and a slot still needs
a three-second hold. But it is a silent write to the hardware, produced by the
one gesture a player makes when they distrust what they see.

**NOT FIXED, DELIBERATELY.** Selecting a patch sends it, and that is load
bearing: it is what makes a patch live, what the whole audition model rests
on, and what "navigating away discards" is the counterpart to. Changing it so
a re-selection of the ALREADY-SELECTED patch re-reads instead of sends is a
behaviour change in the path everything else depends on, and Daniel will want
to choose it rather than find it.

Worth noting when he does: the app already has the read it would need.
`readBuffer` is 110 parameters at a measured ~1437ms, and a single parameter
is 13ms. A re-selection of the patch already open could re-read without
sending, at a cost already known.

**Related, and the same root:** B7 (a stale panel that a drag then writes
from) and B9 (the amp switch that started this). All three are the panel being
a cached view with no path back from the instrument except CC.

### B9. The amp simulator reads OFF when the Seven has it ON — CLOSED 16 Nov 2026, NOT A DEFECT

Reported by Daniel 16 Nov 2026, with the Seven connected and the app showing
Bank 2 / Preset 5, "Tine Piano", light theme.

**The instrument has the amp simulator ON for this patch. The app shows it
OFF.** He refreshed in the software and it still read OFF.

What else was on screen at the time, because it narrows the fault:

- `FX1 · Stereo Panner · ON` — read correctly. So this is not the whole effects
  column failing.
- `AMP SIMULATOR · TWIN · OFF` — the TYPE came through, the ON/OFF did not.
- `FX2 · Delay · OFF`, `REVERB · Level 109 · Decay 76 · OFF`, `SYNTH PAD ·
  Level 39 · OFF`, `EXPRESSION PEDAL · Volume`.

That the amp's TYPE is right while its switch is wrong is the shape worth
chasing: the section is being read, and one field within it is not.

Not established, and not to be assumed: whether this is a read, a parse or a
render fault; whether it affects only the amp or every section's on/off switch
with the right patch; and whether it is the same mechanism as **B7**. B7 is a
stale cached view, and Daniel says he refreshed — but what "refresh" does in the
app has not been checked against what it would need to do to clear this.

Needs the Seven, and needs that patch. Method: with the amp ON on the
instrument, read the buffer with `0x22` and compare the app's rendered state
against the raw reply field by field for the whole amp section.

#### INVESTIGATED 16 Nov 2026 — it is none of read, parse or render

`test/ui/scenarios/amp-switch-read.js`, Bank 2 / Preset 5, Seven attached.

**Every section switch agrees with the instrument, and so does the whole amp
section.** Device against rendered pill:

```
veq_byp(73) 1 OFF ✓   fx1_sw(74) 1 ON ✓   fx2_sw(78) 0 OFF ✓
amp_sw(89)  1 ON  ✓   rev_sw(95) 0 OFF ✓  pad_sw(104) 0 OFF ✓
amp_dr 3 · amp_mo TWIN · amp_bs 64 · amp_md 64 · amp_tr 64 — all correct
```

So the read is right, the parse is right and the render is right. **The fault
is not in any of the three**, and B9 cannot be reproduced by looking.

**WHY IT COULD NOT BE REPRODUCED, which is itself the finding.** Selecting a
patch SENDS it, so by the time anything is compared the instrument has been
made to match the app. Daniel's report is the opposite order: the instrument
was changed and the app did not follow.

**Induced instead.** With the device moved behind the app's back
(`amp_sw` 1 → 0, nothing told):

```
device amp_sw=0 · pill "ON" -> "ON"      the pill DID NOT FOLLOW
```

**AND "REFRESHING" PUSHES RATHER THAN PULLS.** Re-selecting the patch — the
gesture nearest to what he described — left the pill unchanged and **sent the
app's value back to the instrument**: `device amp_sw` returned to 1.

> So a refresh cannot ever fix a disagreement of this kind. In his case, where
> the app showed OFF and the instrument had it ON, re-selecting would have
> **turned his amp off on the hardware** to match the screen. That is worse
> than the display bug and it is the part to weigh first.

**SHARES B7's FAMILY, BUT NOT ITS FAILING LINK.** The panel is a cached view
that only tracks the instrument through `onPanelCc`. B7's parameters carry
`cc: -1` and can never be followed. `amp_sw` carries **CC 28**, so it should
be — and both preconditions were satisfied during this run: a live session was
open (`onPanelCc` returns early without one) and the instrument's **Send CC is
Yes** (glb index 2).

**WHAT IS STILL UNTESTED, and it is now the only candidate left.** The change
I induced emitted no CC, because the app made it. A real panel move is a
different path. Nobody has ever verified that the amp's panel toggle — a SLOW
PUSH on knob 6 — actually transmits CC 28. The manual lists 28 as AMP TOGGLE
in the fixed map, but the map is a list of assignments, not evidence that a
slow push sends one.

That single question would explain the whole report: the amp's TYPE is
editor-only and came from the file, FX1's ON matched the file by coincidence,
and the switch was stale because nothing ever told the app it moved.

#### MEASURED WITH DANIEL AT THE KEYBOARD, 16 Nov 2026 — every link works

**1. The slow push IS transmitted.** `tools/listen.js`, four slow pushes on
knob 6, four messages and nothing else:

```
be 1c 00    be 1c 7f    be 1c 00    be 1c 7f
```

`be` = Control Change on channel 15, `1c` = 28 = AMP TOGGLE. So the hypothesis
this investigation ended on — that a slow push might not announce itself — is
**dead**. The instrument reports it perfectly.

(The value is 0/127 while `amp_sw` has max 1, which is open item 8 in
protocol.md: sub-127-max parameters broadcast scaled. It does not matter here
— `onPanelCc` never interprets the value, it reads the parameter back.)

**2. The control case rules out a dead listener.** FX1 Depth swept on the same
port in the same session: **115 messages** of `be 16` (CC 22). So "nothing
arrived" could never have been confused with "nothing was listening".

**3. And the app DOES follow it.** `test/ui/scenarios/hands-on-amp-follow-live.js`,
which waits for a human push rather than faking one — the change has to arrive
as a real CC, which the app originating it cannot produce:

```
BEFORE: device amp_sw=0 · pill "OFF" · live session true
AFTER : device amp_sw=1 · pill "ON"
the instrument MOVED · the app FOLLOWED
```

#### So B9 cannot be reproduced, and what is left is the condition

Read, parse, render, transmission and following are all correct. The one
thing separating this run from Daniel's is in `audition.js`:

```js
async function onPanelCc(cc) {
  if (!isLive()) return;
```

**Outside a live session the app cannot follow a panel move at all** — not
because of a fault, but because that is what the line says. Selecting a patch
opens a session, and navigating away ends it, so a patch being LOOKED at
rather than worked on is exactly the state where the panel goes stale.

That fits his report completely: the amp's TYPE is editor-only and came from
the file, FX1's ON matched the file by coincidence, and the switch was stale
because nothing was listening for it at that moment.

**NOT ESTABLISHED, and it cannot be retroactively:** whether a session was
live when he saw it. The diagnosis above is the only remaining mechanism, not
a confirmed account of his screen.

**Where that leaves it.** B9 is not a defect in the amp section. It is the
panel being a cached view whose only path back from the instrument is gated on
a live session — the same root as B7, and the reason **B10** matters more than
either: the gesture for recovering from it writes the stale value to the
hardware.

**Nothing changed.**

#### CLOSED — and what it actually was

**B9 was not a bug in the amp section. It was the app having no path back from
the instrument while nothing was listening, and then saying nothing about it.**
Every link was measured working: the slow push transmits CC 28, the app follows
it, the read, the parse and the render are all correct. What was missing was
not a mechanism but a CONDITION — `onPanelCc` returns early unless the session
`isLive()`, so a patch being LOOKED at rather than worked on is exactly the
state where the panel goes stale and says nothing about being stale.

**DO NOT RE-OPEN IT AS AN AMP BUG.** Three sessions could be spent on the amp
section and find nothing, because there is nothing there. The two entries that
carry the real cost of this root are **B7** (a stale control whose drag then
writes its pointer position to the hardware) and **B10** (the recovery gesture
pushes rather than pulls). Both are still open and both outrank this.

**WHAT THE FRESHNESS WORK CHANGED, precisely.** A bank row the app has not
heard from this session is now drawn faded (`a15cae0`), so the app no longer
presents a backup record as though it were a live reading. That is the honest
answer to the shape of Daniel's complaint — a confident wrong value — and it
is why this closes rather than staying open.

**AND WHAT IT DID NOT.** The fade is on the bank ROWS. It is not on the detail
pane, and the amp pill lives in the detail pane: a section switch showing a
cached value still looks exactly like one showing a live reading. The scope was
deliberate (Daniel, 16 Nov: "let's not over-engineer this"), and it is recorded
here so nobody later reads "the freshness work fixed B9" as meaning the pill
became honest. It did not. The ROW did.

**NOT ESTABLISHED, and it cannot be retroactively:** whether a session was live
when he saw it. The condition above is the only remaining mechanism, not a
confirmed account of his screen — the same distinction CLAUDE.md's "a cause
that was never established, only made impossible" exists to keep.

### THE LIMIT OF "live on the Seven" — a panel store is invisible, and that is accepted

**Recorded so the claim's limit sits next to the claim. DO NOT TRY TO FIX
IT** — Daniel has said plainly he is fine with it, and the point of writing it
down is that nobody spends a session closing it.

The freshness work says a slot drawn at full strength is one the app has heard
from THIS SESSION. That is true for every route the app can see:

- **it recalled the slot itself** — the `0x45` names the sound, and that is
  what fills the reading in the first place
- **it sent the player to overwrite one** — the hold screen names the slot, and
  dismissing it forgets the reading, because the app cannot know whether the
  three-second hold followed (see `runHoldScreen`)

**The route it cannot see: a store the player makes at the panel, without the
app.** Hold the button on the Seven while a slot is marked live and nothing
tells the app. There is no watcher for a panel store — `6f65c90` — so the slot
stays drawn at full strength with values that are no longer what it holds,
until the session ends.

`src/ots-freshness.js` describes the mechanism that WOULD close it: with Send
PC on, a panel store is followed by a recall carrying the slot, and those
frames already reach the renderer with nothing consuming them. It is written
down there as "still to build" and it is not being built. The cost of the gap
is one stale row for one session; the cost of closing it is a second slot-read
path with its own coalescing.

**A near relative, same acceptance.** Sending somebody to overwrite a slot
forgets it — but only when the app can NAME the slot, which needs Send PC on
(`holdSlot()`). With Send PC off the app never knew which preset the hold would
land on, so there is nothing to forget and nothing it could honestly guess. The
overwrite row says "Overwrite the preset on your Seven" in that state, which is
the same honesty one level up.

### Bank 1 never needs re-reading — **OPEN, AND NOW UNBLOCKED** (Daniel, 16 Nov 2026)

**ITS TWO PRECONDITIONS HAVE BOTH LANDED and nobody noticed.** The freshness
work is `a15cae0` and the boot offer is `44536bc`, both committed 16 Nov. This
said "not to be started until both land" and then went on saying it after they
did — which is how a queued item becomes an invisible one.

**Bank 1 is factory and cannot be stored to.** Hardware-confirmed 2026-08-13
and stated in the manual. So a read of it can never go stale, and two things
follow:

1. **Bank 1 slots are never drawn faded.** They load active and stay active.
   There is no "as of last backup" about a bank that cannot be written.
2. **The long read can skip Bank 1.** That is 8 of 32 slots — about 25% off a
   read that runs roughly 45-50 seconds at ~1.5s a slot. Call it 34-38s.

**The one guard that makes it safe: firmware.** A firmware update is the only
event that can change Bank 1. v1.30 (Nov 2021) "improved the Tine Piano, Reed
Piano, Acoustic Piano, Electric Grand Piano and Vibraphone physical models" and
replaced the EQ outright, with Crumar's own warning that "some presets may sound
differently now" — see `docs/MANUAL.md`.

So: cache Bank 1 against the firmware version string, which the app already
reads and already shows in the toolbar. If that string changes, invalidate
Bank 1 once and re-read it. Otherwise never read it again.

Whether a firmware change alters Bank 1's stored PARAMETER VALUES, as against
how those values sound, is not established — the release note describes models
and an EQ, not data. Invalidating on a firmware change is the cautious reading
and costs one read in four years.

### B2. The Discarding Edits gesture — **DONE: verified on hardware 15 Nov 2026**

> `test/ui/scenarios/leave-guard-resolves.js` drives the whole walk on the
> instrument, including the half this entry was written for: clear the tick
> box, press Done, try to leave, and the second attempt shows **Discarding
> Edits** — a dialog that TELLS rather than asks, with one button and no way to
> refuse. It passed in the 15 Nov run and again in the full-suite run of 16 Nov.
> The branch it was blocking (`save-what-you-hear`) is merged into
> `four-tab-nav-wip`.
>
> The heading said NEEDS THE SEVEN for a day after it had been run.

### B2 (original). The Discarding Edits gesture has never been run

Not a defect, an unverified one. The dialog is built and committed on
`save-what-you-hear`; the end-to-end gesture has never been performed. It is
the last thing between that branch and a merge, and the branch is what
everything else merges on top of.

The walk: edit a patch, navigate away so the leave guard appears, choose
Overwrite, UNTICK "Also save a copy to Patches", press Done without holding
anything on the Seven, then try to navigate away again. The second attempt must
show "Discarding Edits" — a dialog that TELLS rather than asks, where every way
out means go. If it asks anything, or refuses to let him leave, it is wrong.

### B3. --text-dim in light mode — **OPEN**: committed PROVISIONAL, Daniel has not seen it running

`#8a8375` on `--bg` measures 3.16:1 against the 4.5 small text needs. It has
been failing since before the palette work; it was not introduced by it. It
carries the row numbers and the unselected tab labels.

`#78715f` clears it at 4.59:1 and holds the hue. Committed 15 Nov as
`20d767b`, marked PROVISIONAL — Daniel has not yet looked at it running, and
the open question is whether the darker ink makes row numbers pull more
attention than they should. The number is not in doubt; the look is.

### B4. The boot connection time — **DONE: measured twice (`a8fc03e`, `7842c8e`)**

> **Two different figures, and the difference is the point.** `a8fc03e` timed
> five RE-connects (disconnect, 900ms settle, connect): min 1765ms, median
> 2072ms, max 2091ms. `7842c8e` then found the loader's curve had been shaped
> against that median — and a COLD boot is **2634–3007ms**, which is a
> different sequence from a re-connect. The curve was reshaped 3.6s → 4.8s on
> the cold figure.
>
> Both are recorded with their dates: the re-connect numbers in CLAUDE.md
> ("THE BOOT CONNECTION TAKES ~2.1 SECONDS"), the cold-boot numbers in
> `7842c8e`'s own message. **Quote the cold-boot figure for anything about a
> launch; quote 2.1s only for a reconnect.** The 1363ms in CLAUDE.md is a
> buffer read and is neither.
>
> The heading below said "has never been measured" for a day after both runs.

### B4 (original). The boot connection time has never been measured

The 1363ms in CLAUDE.md is a buffer read, a different sequence. Nobody has
timed port open → broadcast → reply → globals → sound table. The boot loader's
curve was shaped against a number that does not exist. The loader does not
depend on it — the curve approaches full and never arrives — but the figure
should be recorded with its date the way the buffer read is.

---

## 1. ~~Reword the backup result counts~~ — DONE 14 Nov, by removal

Daniel's answer to the reword below: "Just remove the sentence." The
`(32 unchanged, 0 new)` line is gone from the completion dialog. The split is
still computed and still shown in the connection row, and
`source-wiring.test.js` now pins the dialog's own body rather than matching the
file (the old assertion was satisfied by the `const counts` line and pinned
nothing). Mutation-proven both ways. The draft reasoning is kept below.

### The draft that was overruled

Today it reads:

    32 presets backed up to your computer
    (32 unchanged, 0 new)

Daniel wrote this app and could not read that line (14 Nov 2026): "What does
(32 unchanged, 0 new) refer to? Do we need it?"

**Keep the information.** It is the dedupe result — each slot's 110 values are
hashed, a slot whose values already exist in the library writes NO new file and
only re-stamps the existing record as verified today (`backup-runner.js:195-206`),
and a slot with no match writes a new patch (`created`, same file, ~line 228).
Without the counts, "32 presets backed up" implies 32 new files every run and a
library that doubles weekly.

**Change the words.** A sentence that varies with the result, not two jargon
words in brackets:

    0 new   → "Nothing had changed since your last backup."
    n new   → "3 were new, 29 already saved."

The sentence is built in `src/app.js:4194`.

**It is a user-facing string, so CLAUDE.md's rule applies**: grep the whole repo
for the current text first, and any scenario asserting it is part of what was
touched and runs with the change.

## 2. The save feature — **DONE: merged**

`save-what-you-hear` is merged into `four-tab-nav-wip` (and so are
`live-on-the-seven` and `fx-keep-on-sound-swap`). The spec is still
`out/save-what-you-hear.md`. This entry read as in-flight after the merge.

## 3. exp_fn / exp_mx CC 1 collision — **HALF DONE, and the other half is OPEN**

**The collision is fixed** by `5f0694f` (see B8): `ccMap` is built from
`p.flag === 1`, so neither pedal parameter is in the map and CC 1 no longer
resolves to `exp_mx`. `docs/SCHEMA-VS-MANUAL.md` §2 carries the reasoning.

**STILL OPEN, and it was hiding inside a fixed item:** the second sentence —
"then settle the parameter count, which cannot be trusted until the `pdl_exp`
group is fixed (`docs/DEVICE.md` §12)". Nothing has touched that. An item that
is half closed reads as closed, which is why this is now two paragraphs.

## 4. Pickup Compress (egp_pucm, id 22) on the Yamaha CP80 — **RECORDED-NOT-FIXED: the app is not what is wrong**

Answered on hardware 15 Nov (`a54e611`, `8423781`). Swept 0/64/127 against two
controls from the same group: the device **echoes every value and reads it
back**, exactly like Release Length and Dynamics. So the write is not refused,
the value is stored, and the app does send it — which eliminates every cause
this app could have.

**What remains open is not ours:** whether the parameter is inert on this
firmware, inert on this sound, or audible only under a condition nobody has
identified. Nothing favours any of the three, and the next real evidence has to
come from listening rather than from the protocol. Full detail in CLAUDE.md,
including why the display-string test does NOT discriminate for a 0..127
parameter even though it did for the enum sweep.

## 5. Sweep source-wiring.test.js for whole-file assertions — **DONE 16 Nov 2026**

Five commits (`3d50135`, `093c32c`, `1497ec0`, `a790bc8`, `fc3c119`, `ae92aa4`,
`75691ce` — seven, in the end). **29 assertions narrowed, 2 deleted as covered,
13 left.** The file went from 43 whole-file assertions (30 positive, 13
negative) to 13, all negative — a denial cannot be narrowed without being made
weaker, so those are the floor.

Both examples this entry named are done: the ping menu's `type: 'checkbox'` is
tied to its own item, and the `=== 'secondary'` guard was deleted after
mutation proved `send-choice.test.js` covers the branch by behaviour.

Every narrowing was mutation-checked in the strong form — the real target
broken with a decoy left standing — and one window was proved rather than
argued: `createFromLive({ … {0,200} … fromSlot,` PASSED with `fromSlot` moved
out of the call entirely.

### The original note, kept for its numbers

Found 14 Nov while CODE removed the backup dialog's count line. That line's
guard asserted the template string against the WHOLE FILE and matched the
`const counts = ...` two lines above the dialog — so it was green whether or
not the dialog showed anything, while its comment claimed otherwise.

48 of the file's 130 source-reading assertions are matched against a whole
file rather than a region. Most are harmless: they look for a string that
exists in exactly one place. A handful assert something generic enough to pass
on the wrong line:

- line 454 asserts `type: 'checkbox'` to prove the ping menu item is a
  checkbox. ANY checkbox in main.js satisfies it.
- line 83 asserts `=== 'secondary'`, generic enough to match a branch other
  than the one its comment names.

Narrow those to the call site the comment names, and mutation-prove each the
way the counts guard was: break the thing, watch it fail; restore the WORD but
not the behaviour, watch it still fail.

Cheapest done while CODE is already in that file for the save feature.

---

# SETLISTS ARE OUT OF 1.5.7 — Daniel, 16 Nov 2026

"Let's leave setlists out of 1.5.7 unless I have a eureka moment."

This supersedes the SCOPE section's three-feature list at the top of this file.
1.5.7 ships the save flow, the four-tab navigation, the boot loader and the
On-the-Seven freshness work. No setlist change.

## Why, and it is a better reason than running out of time

Daniel, 16 Nov, thinking it through: **"save bank as setlist" works on the
JUNO-X because its scenes reorder easily. The Seven's banks do not.** Getting a
Seven bank into show order means eight three-second holds on the instrument.
Nobody arranges a bank that way. So capturing one captures an order that was
never chosen.

That splits the feature into two wants the X conflates because on the X they are
the same thing:

- **Preserve what is on the instrument.** The backup already reads all 32 slots.
- **Arrange a show.** The builder already does this, on the computer, where
  reordering is free.

So the Seven's existing model is right and the X's is not the one to copy.

## What is still worth taking from JUNO-Xtra, when this comes back

**Not the capture — the presentation.** The paper sheet, the newest-first
listing, the review pane before a transfer. None of them care how the eight
entries got there: a setlist built by dragging looks as good on that sheet as
one read off the instrument.

And the sheet belongs on the **restore**, not the save. Reading 8 slots is
twelve seconds, too quick for a full-screen sheet. Putting a bank back is eight
three-second holds — minutes — and there the ink landing line by line means
something.

## The idea left on the table

If "save this bank" still wants to exist, **it may not be a setlist at all.** The
app already reads all 32 slots on a backup, so "keep bank 2 from today, call it
Pig Gig" is a label on data already held, not a new object. Nobody has designed
that; it is recorded so the thought is not lost.

---

# WHEN SETLISTS COME BACK — save a bank as a setlist

Not part of 1.5.7. It is a feature, not a fix, and it lands in
`transfer-runner.js`, which its own header calls the most careful thing in the
app — the only feature that changes what the Seven holds after a power cycle.

Full map: out/setlists-from-xtra.md. Mock of the sheet: out/setlist-paper-mock.html.

## What Daniel wants

"I most often want to save a bank on the 7 as a setlist. Just like the X. I
create a bank of sounds and want to save it for later." (14 Nov 2026)

That is a CAPTURE. Today's Seven setlist is a PLAN — eight references to patches
in the library, which the transfer walks. Two different objects.

A capture is cheap: a backup already reads all 32 slots, so a bank is 8 of them,
about 12 seconds, fully automatic. Unlike the JUNO-X there is no drift problem,
because a Seven patch is self-contained — 110 values, no pointers. Only
expansions can break a load, and `transfer-runner` already checks that.

## SETTLED 14 Nov 2026 — one object, one word

It is ONE object with one name. Whether the eight patches were built from the
library or read off the Seven is provenance, not identity. The earlier proposal
on this page — two objects, two names, "settle this before any code" — is dead.
Do not follow it.

## What ports from JUNO-Xtra

The flow, verbatim: a quiet link under the bank on screen; a small dialog asking
only for a name with the honest duration under the button; a sheet that takes
over while it reads; the name box clearing itself afterwards so Friday's bank is
never saved over Saturday's file. The bank on screen is the bank that gets saved
— no picker to get wrong.

`setlist-paper.js` is 129 lines with no dependencies. About 90 lines of CSS
carry the tape, the grain and the dog-eared corner, all inline SVG, no image
files. One font, Permanent Marker, OFL. Change `SLOTS` 16 to 8, rename the font
from 'JunoX Marker', and re-tune the tape against a sheet half as tall.

**The sheet belongs on the RESTORE, not the save.** On the X it earns its place
because reading 16 scenes takes a minute. A Seven bank is 8 slots at ~1.4s —
twelve seconds, too quick for a full-screen sheet. But putting a bank BACK is 8
three-second holds, which is minutes, and there the ink can land per line and
mean it.

---

# AFTER 1.5.7 — four tabs instead of two trays

SUPERSEDED 14 Nov 2026: an earlier draft of this section proposed TWO top-level
tabs (ON THE SEVEN | ON THIS COMPUTER), each with a second level. That shape is
dead — do not build it. It is FOUR tabs. Everything from "What this deletes"
onward still stands.

## The shape

Top level, four tabs:

    Seven | Patches | Setlists | Backups

Under Seven, the bank tabs: Bank 1 (locked) | Bank 2 | Bank 3 | Bank 4, then the
8 slot rows. The other three tabs show their own rows.

The Seven tab is the deliberate exception: it is the logo, and when selected it
LIGHTS rather than taking the amber underline. The three word tabs keep the
underline.

Under the Seven's rows: **Save this bank as a setlist**. That is the JUNO-Xtra
placement and the reason for it carries over — the bank on screen is the bank
that gets saved, so there is no picker to get wrong.

Under Patches: **Open library folder**, which is where it belongs. Daniel's
sketch had it under the Seven; read as a mock artefact, not intent.

## What this deletes

The collapsing trays, the split divider, the persisted split position, and the
one-line bank strip — **and with the strip, the overlap bug found 14 Nov**,
where "— Bank 3" painted on top of the freshness text because three items on
one line were all unshrinkable. Do not fix that bug separately if this lands.

## Why the old model's stated reason no longer holds

`src/index.html` ~717 says the bank region is never fully hidden "so the
instrument<->computer relationship stays on screen, and transfer always has a
visible target."

- The visible target is handled elsewhere now: the transfer names its own
  destination in its own dialog ("Send to Bank 2").
- The relationship half: Daniel, 14 Nov — "No need to see them both at once.
  You can't see them together today." The regions already expand mutually
  exclusively; one is always collapsed to a strip. Nothing is lost.

## Verified before proposing

**No drag crosses the two regions.** All drag-and-drop is inside the library:
reordering setlist slots, and dropping a patch onto the Setlists tab
(`library-view.js` ~1734). So splitting the regions costs no behaviour.

## The design language that came out of it

Agreed 14 Nov 2026 after Daniel: "There's lots of different shading and lines.
We need a design language." The first pass had eight surface tones and five
line weights doing four different jobs.

Four rules. The mock at out/lists-design.html states them in its own CSS and
obeys them throughout:

1. **Two surfaces.** `--bg` is the ground, `--bg-panel` is "chosen". Nothing
   else carries a tone — no raised strips, no tinted footers, no alternating
   rows.
2. **A tint means chosen.** The active tab and the selected row wear the same
   one, so wherever the tint appears, something is selected.
3. **Lines separate rows. Nothing else.** Regions are separated by space and
   type size.
4. **One accent, one job.** Amber marks the active tab. Red marks the current
   slot. Green is the single action on screen.

What this removed: the raised sub-tab strip, the tinted footer, the rule under
the top tabs, the rule above the foot, and the "Not installed" badge's pill —
that one is coloured type now, since a background was a surface doing a job
type could do.

**If these hold up they belong in docs/DESIGN.md**, beside the existing "What
is NOT themed" section, which is already where this app states rules of this
kind.

## The Seven tab is the one deliberate exception

Daniel, 14 Nov: "Could we use the cursive Seven script for that tab only? It
would mimic the Seven script on the hardware. It could glow when selected like
on the hardware." Then: "makes it super clear what's going on."

So the four top tabs are not uniform. Three are Archivo; the Seven tab is the
instrument's logo script and LIGHTS when chosen, the way the logo on the
hardware does. It states rule 2 in the instrument's language rather than the
app's — and that is allowed exactly once, for the tab that IS the machine. If a
second element starts glowing, the rule is gone.

**SUPERSEDED 14 Nov 2026 — do not follow the paragraph below.** Daniel took the
second look it asks for and overruled it: the logo DOES glow in light mode, in
forest green, as a soft spill rather than a neon halo. See "The logo lights in
both themes" later in this file, and DESIGN.md, which record the decision. The
mock implements it at lists-design.html:142.

> ~~**Light mode does not glow.** On paper a neon halo is a lie, so the script
> goes dark green and says "chosen" with ink alone. Weaker than the dark-mode
> version; worth a second look before building.~~

### Horizontal alignment — settled 14 Nov 2026, Daniel

The logo's LETTERS sit on the same baseline as the three word tabs. Not its
bounding box, not the bottom of the S.

The S in the script has a long descending tail. Aligning the SVG's box to the
rule drops that tail onto the baseline and pushes "even" up above the word
tabs, which is what the first build did. Correct is the x-height of "even"
reading level with Patches / Setlists / Backups, with the S hanging below.

This is not a new rule. It is locked change 2 — "the top tabs align on
BASELINES, not boxes" — applied to the logo as well as the words. The script
just makes the box and the baseline disagree far more than a word does.

Implementation note: the baseline offset is a property of the traced artwork,
so it belongs with the logo (a transform or a tuned viewBox), not as a magic
margin at every call site.

### TO DO: the logo needs to become an asset

The mock uses Yellowtail from Google Fonts as a STAND-IN. It is not the Seven's
logo, only its general character.

The real thing should be the actual logo traced once as SVG paths and kept in
`assets/`, for the same reason `modal-panel.js` crops the one panel drawing
instead of redrawing it: two drawings of the same object drift, and the one used
less is the one that is wrong when you look. A font also cannot be made to glow
exactly like a lit logo; paths can.

There is no logo asset in the repo today — `assets/seven-panel.svg` stops at the
control surface.

## Colour, settled 14 Nov 2026

The first dark-mode pass read neon — Daniel: "These light colors are a bit wild
and neon-y." The palette was not the problem. The panel's colours are 3mm LEDs
and small printed legends; the design was using them on whole words at 12px
bold, which is the same hue at many times the ink, three of them at once.

**NEW RULE — full chroma for marks, damped for text.** The 3px selected-row
edge and the 2px active-tab underline keep the panel's own values, because both
are the size an LED actually is. Anything set as WORDS takes a damped variant,
and the hues are tuned to one brightness so none of them jumps.

Two collisions fixed on the way, both against rules DESIGN.md already states:

- **Amber was warning as well as locating.** The doc says amber is "where you
  ARE, not what to press". The Not-installed badge now uses `--warn`
  (`#d9a13b` / `#7d5a10`), which the app already defines.
- **The active tab said "selected" twice** — an amber underline AND amber text.
  "Underline = selection" is the vocabulary; the word is plain now.

Also: `uppercase .12em` is the REGION HEADER treatment, and had leaked onto the
foot actions. They are 12px sentence case.

### The logo lights in both themes

Daniel pushed back on "the glow is dark-mode only" and was right. A lit sign in
daylight still reads as lit — it spills its own colour onto the surface rather
than haloing white. So light mode gets a soft same-hue spill, more SATURATED
than the ground rather than brighter.

**Colour: forest `#1f6b3d`**, chosen from six candidates all sourced from the
panel drawing (magenta `#8e2f8e` from the LOCAL OFF chip, crimson from the LED
red, teal from the panel's `#4fc3d9`, the unlit ochre legend, and plain ink).
The picker is in out/lists-design.html if it is ever reopened.

It changes value by theme where the panel strip deliberately does not. That is
allowed because the panel is a picture of a machine and the logo is a lit SIGN:
emission in the dark, material in daylight. One object, two lights.

**Watch:** forest is also `--action-text` in light. Both descend from the
DEPTH/RATE legend so the shared hue is honest, and a 31px script in the corner
is not confusable with a 12px label in the foot. If a third thing wants this
green, split them then.

## Arrival animations — ported from JUNO-Xtra

Daniel: land on the tab that now holds the thing you made, and watch it arrive.
Three cases: save a setlist, back up the Seven, save a patch.

Two distinct behaviours, both already built in the X and both respecting
reduced motion:

- **One new row**, 1700ms, once. `glowNewSetlist` in the X scrolls it into view
  and animates a wash plus the inset edge, peaking at 18% and settling.
- **A list filling for the first time**, a cascade: each row fades up through a
  brightness bump, 360ms, 22ms apart. Nothing moves — only opacity and
  brightness — so no row jumps.

**One change from the X.** It glows in a pale blue of Roland's. This app needs
no new colour: the thing you just saved arrives SELECTED, so the glow is its
own red selection edge coming up and settling. The row you land on is the row
you are on.

## Six changes after seeing the preview in the app — LOCKED 14 Nov 2026

Daniel, looking at the real window: "there are a lot of neon-like colors
competing on this page." Four coloured things now, where there were seven.

**Two are new design decisions.**

1. **A tamer black.** `--bg` goes `#141416` -> `#1b1b1e`, `--bg-panel`
   `#232326` -> `#2a2a2e`, `--line` `#2e2e33` -> `#33333a`. `#141416` is the
   panel drawing's own ground — correct behind photoreal artwork, too deep
   behind type. The window surround takes the old value so the card still
   reads as resting on something.

2. **The top tabs align on their BASELINES, not their boxes.** "The Seven
   should sit on the same horizontal line as Patches and Setlists." A script
   face has a far deeper descender than a grotesque, so centring the boxes
   floats the word above the line its neighbours sit on. The divider keeps
   `align-self: center`.

**One is Daniel's, and it is the best of the six.**

3. **The underline is reserved for the three WORD tabs. The Seven lights
   instead and takes no underline.** "When the Seven is selected it lights up.
   It does not require the underline." They are different kinds of thing and
   now they say so differently — and it removes one of the two competing
   ambers. This is the same doubling that was taken out of the active tab
   earlier: say it once.

**Three were the preview drifting from the agreed design, now back.**

4. The Seven tab had picked up an underline (`lists-preview.js` ~176, ~224).
5. The selected row's NUMBER was red. Only the 3px edge carries full accent;
   the number is damped. Marks keep chroma, words do not.
6. The bank lock was the emoji `🔒` (~391) and a `BANK n` header sat below a
   tab that already said Bank n (~385).

**On the emoji specifically.** It is the same class of mistake as the dropdown
caret fixed in 1.5.5: a text character that no UI font carries, so every
platform substitutes a different one — and an emoji additionally brings its own
palette into a design that just spent an hour taking colours out. Drawn SVG,
`currentColor`, like every other glyph in this design.

## The logo is now a real asset — out/seven-logo.svg

Traced 14 Nov 2026. 3.6 KB, four subpaths, `viewBox="0 0 1987 688"`,
`fill="currentColor"`. Checked at 31px in all four states (dark lit, dark
unlit, light lit, light unlit) — out/seven-logo-at-size.png.

**Move it to `assets/seven-logo.svg`** as part of the redesign. It is in out/
rather than assets/ on purpose: dropping a new file into a tracked directory
while another branch is being worked is how an unrelated file ends up in
somebody's commit.

### How it must be used

**INLINE IT. Never through `<img>`.** The app already learned this — the
instrument illustrations carry a comment saying an SVG loaded through `<img>`
"is its own document and inherits nothing", which is why they are inlined for
the `--inst-*` tokens to reach them. Same here: `currentColor` is the whole
point, and through an `<img>` it resolves to nothing. One file, both themes,
both states.

**It replaces the Yellowtail webfont entirely.** That route was never available
anyway: `src/index.html:5` is `default-src 'self'; font-src 'self' data:`, so
fonts.gstatic.com is blocked and the preview fell back to Snell Roundhand. Paths
also glow properly, which a font cannot.

### How it was made, in case it is ever redone

Source: the OUTLINE artwork Daniel supplied (1968x670 RGBA, vector-derived).
The other two candidates were worse and it is worth knowing why — a lit photo's
bloom fattens every stroke, and a promo still had the word only ~320px wide,
so the curves rode pixel stairs.

Pipeline: alpha channel as the mask -> crop to the ink -> pad 10px with
transparent -> light Gaussian (1.4) -> threshold -> potrace
(turdsize 60, alphamax 1.0, opticurve, opttolerance 0.9) -> emit at integer
precision.

TWO TRAPS, both of which cost a pass each:

- **potracer traces the ZERO region, not the nonzero one.** Passing the mask
  straight in fills the background and knocks the word out of it. Pass `~mask`.
- **The source is RGBA with a TRANSPARENT ground.** `convert('L')` turns
  transparency into black, so the whole image reads as solid ink and the glyph
  fraction comes out 100%. Alpha is the signal, not luminance.

---

### 12. THE SOUND ENGINE IDENTITY BLOCK — ~~DEFERRED~~ **HALF DONE, 17 Nov 2026**

**THE TEXT HALF IS DONE.** Daniel took it off the shelf the same day:

> The Sound Engine identity block becomes one tight group:
> Tine Piano (Model) / Rhodes piano / [ Save patch ]

`.engine-pos` — the `Bank N · Preset M` line — is gone, with
`view.bankLabel`, `view.patchNumber` and `app.js`'s `bankLabel()` helper,
which had no other caller. Measured before and after (`engine-identity-block.js`):

| | before | after |
|---|---|---|
| `.engine-sub` box | 84.3px | **17.4px** |
| `.save-slot` box | 98.3px | **31.4px** |
| name → sub-line (ink) | — | **6.2px** |
| sub-line → button (ink) | ~73px | **6px** |
| first parameter row | y438.5 | y438.5 — unmoved |

**THE REAL DEFECT WAS NOT THE EXTRA LINE, and a box measurement hid it.**
`.engine-stage` spanned the text rows and is the taller side, so its height
was distributed ACROSS them: `.engine-sub` stretched to its row, its box
running to y328 while the words ended at y261. Box-to-box that read as a 4px
gap and the first version of the scenario passed on it. The eye saw ~73px.
The fix is `grid-template-rows: auto auto auto 1fr` with the stage spanning
2-4 — the three text rows size to content and an empty flexible fourth row
absorbs the picture. **The 1fr row is load-bearing and empty**; remove it and
the stretch returns silently.

**THE PICTURE HALF IS STILL OPEN AND STILL DEFERRED.** Everything below this
line stands.

---

### 12b. The picture still sets the block's height — **OPEN**

Daniel, after raising it three times and not being happy with any answer yet:
"I'm not happy with it so we'll have to figure it out once everything has
settled. I don't want to touch too many things."

**NOT A BUG AND NOT SCOPED.** Deferred deliberately until the nine pane
changes are in and the branch is stable. Recorded so it stops being
re-litigated from memory — it had never been written down, which is why it
came back three times in one day.

What he has asked for, each time in slightly different words:

- **Drop `Bank 1 · Preset 1`** from the middle pane. `.engine-pos`,
  `renderer.js:481`, conditional on `view.bankLabel`.
- **Pull the sub-line ("Rhodes piano") and Save patch up** under the name, so
  the block reads as one group.

**WHY IT KEEPS NOT SATISFYING HIM, and this is the part to solve rather than
re-decide:** the text can tighten freely, but the PARAMETERS below cannot
rise. They run full width under the instrument picture beside the text, and
the picture is the taller side — `.engine-stage` spans rows 2-4 at 134px
against about 109px of text. So removing a line redistributes slack and moves
nothing he can see. `b8f78ee` documented this when it tightened the gap above
Save patch from 14px to 6px.

**The trade, unresolved:** the parameters only move up if the picture gets
smaller — roughly 30-50px off it to gain "a couple of lines". The picture is
what makes that pane read as an instrument rather than a form. Offer him 134,
110 and 90 to look at rather than arguing it, the way the three gutters were
settled.

**One correction already accepted (Claude, 17 Nov):** the earlier objection
that the location line is "the only thing telling you which slot this came
from" is WRONG. The left pane shows the selected row, so the line largely
repeats the selection. That objection should not be raised again.

---

### 13. KNOWN RED: `slot-row-measure.js`, 250px middle truncation — **LEFT RED BY DECISION, 17 Nov 2026**

`npm run test:ui slot-row-measure` fails one assertion. **Daniel's call: leave
it.** This entry exists so nobody spends a session re-deriving that it is
pre-existing, and so nobody "fixes" it by moving the threshold.

**THE FAILING ASSERTION**, at the end of the scenario:

```
squeezed: head w0 (scroll 61), tail w41.2 x79.8..121.1, text box ends 119.3
✗ and the TAIL is still drawn — "av-3-2" — so two files sharing a prefix stay distinguishable
```

It squeezes the pane to **250px** and asks that a middle-truncated missing-file
name still shows its tail inside the text box. The tail's right edge is
**121.1** against a text box ending **119.3**, with a tolerance of 1px — so it
is over by **0.8px**. The head clips correctly; it is only the tail overhanging.

**VERIFIED PRE-EXISTING AT TWO COMMITS**, by checking out each one's
`src/index.html` and re-running:

| commit | what it is | result |
|---|---|---|
| `881590c` | One header height and one row gutter for the whole pane | red, identical numbers |
| `0a49491` | The gutter is two edges, not three | red, identical numbers |

Identical output at both, so it is older than this branch's last three commits
and none of the 17 Nov pane work caused it. It was found while checking that
item 3's description floor had not broken the slot rows — which it HAD, at this
same 250px width, for a different and now-fixed reason (the floor was briefly
on `.lib-slot` and collapsed the name column to zero). The two are not the same
failure: that one was a zero-width name cell, this one is 0.8px of tail
overhang.

**WHY IT IS NOT URGENT.** 250px is below any pane width reachable on Daniel's
display — the scenario sets it directly with `pane.style.width`, which no
gesture in the app can produce. `row-hover-geometry.js` checks the same rows at
360px and 250px and the gap assertions pass at both, so nothing else at that
width is wrong.

**DO NOT WIDEN THE TOLERANCE.** Daniel, 17 Nov: a test that passes because its
threshold moved is worse than one honestly red with a note. The 1px tolerance
is what makes the assertion mean something; 2px would make it pass while saying
nothing about an overhang.

**WHAT TO MEASURE WHEN SOMEBODY DOES TAKE IT ON:** whether the 0.8px is the
`.tm-tail`'s `white-space: pre` holding a character the box cannot fit, or the
flex basis of `.tm-head` (`flex: 1 1 auto`, `min-width: 0`) rounding against
the tail's `flex: 0 0 auto`. Those have different fixes and the scenario prints
both widths already.

---

### 14. KNOWN RED: `backup-detail-controls.js`, the freshness caveat on Bank 1 — **FOUND 17 Nov 2026**

A second pre-existing red, found by the same sweep, and it is a TEST DEFECT
rather than a product bug — the same defect `one-list-on-screen.js` had and
which was fixed in the same session.

**THE FAILING ASSERTION:**

```
freshness: ""
✗ and it says what the view is as of
```

```js
await ui.selectTab('seven');
const asof = ui.$('#bank-asof');
ui.check(/as of|verified|backup/i.test(asof.textContent), 'and it says what the view is as of');
```

**WHY IT CANNOT PASS.** `bankIndex` starts at `0` in `app.js` and is NEVER
PERSISTED, so a freshly launched app always lands on **Bank 1** — and Bank 1's
caveat is deliberately blank, because a factory bank cannot go stale
(`factoryBankLabel({hasRecord: true})` returns `''`, by design and unit-tested).
So the scenario asks the one bank exempt from the rule it is checking.

**VERIFIED PRE-EXISTING AT TWO COMMITS**, by checking out each one's `src/` and
re-running:

| commit | what it is | result |
|---|---|---|
| `142dbb3` | The left pane's words, and one control's shape | red, `freshness: ""` |
| `881590c` | One header height and one row gutter for the whole pane | red, `freshness: ""` |

Identical at both, and `881590c` predates every freshness change (items 4, 6, 7
and 8 all landed in `142dbb3`). So the 17 Nov work neither caused it nor fixed it.

**WHY IT HAS NOT BEEN NOTICED.** Under `test/ui/run.js` it may inherit a bank
selection from an earlier scenario in the same run — userData is not reset
between scenarios, which CLAUDE.md already documents as a hazard ("UI STATE
LEAKS BETWEEN SCENARIOS"). Run alone from a fresh launch it fails. That is the
same shape as the tray-open leak that cost two days of calling two tests flaky.

**THE FIX, when somebody takes it:** select bank 2 first, or ask which of the
two footnotes in `#fresh-line` is SPEAKING — `#bank1-note` or `#bank-asof`.
`one-list-on-screen.js` was repaired exactly that way on 17 Nov and is the
pattern to copy; it also now names the footnote it measured, so the next
failure says which element it was looking at.

**NOT FIXED HERE** because this round's brief was five pane items and this is a
scenario in a different file with its own subject (the backup detail view's
controls). Recorded rather than quietly repaired so the decision is visible.

---

### 15. THE SIDE-PEEK WHEEL IS GONE — **DONE, 18 Nov 2026**

Replaced by a depth stack: the current sound front and centre, the next two
behind it offset up and to the right, scaled and dimmed. Chevrons are the only
hit targets. Prototype measured and approved by Daniel before any of it was
written.

**EVERY PEEK ENTRY ABOVE IS NOW HISTORY.** Items referring to `--peek`, the
1031/1088 thresholds, the clearance ceiling or `carousel-narrow.js` describe
machinery that no longer exists. They are left in place as the record of how
the numbers were derived — the sweep was done on hardware and was never wrong,
its subject is simply gone.

**WHAT WENT WITH IT**, all of it because the wheel drew outside `.engine-stage`:

| removed | what it was |
|---|---|
| `--peek` + two media queries | the spread, 72% with a 44% override, and the band below 1031 that hid every non-hero face |
| the `pointermove` listener | a document-level coordinate test deciding whether the wheel was open — **where the modal click-through came from** |
| `seven-modal-open` handler | existed only to shut the wheel when a dialog arrived over it |
| the face-click branch | clicking a peek advanced, clicking the hero chose; unreachable once the cards took `pointer-events: none` |
| `bankLabel()`-style dead ends | `is-open`, the second turning curve, the hover sizes |
| 5 scenarios | `carousel-peeks`, `carousel-narrow`, `carousel-no-peek`, `carousel-ceiling`, `modal-blocks-carousel` |
| 1 unit test | css-hazards' "no carousel peek can land on Save patch" |

**THE 1031 BREAKPOINT NO LONGER MEANS ANYTHING**, which Daniel's brief asked to
be checked and said either way. It existed because the LEFT peek landed on Save
patch below that width. A stack has no left peek — every card is offset up and
to the RIGHT, inside the cell — so there is nothing to collide and no width at
which to hide anything. The chevrons it used to reveal in that band are now the
control at every width.

**WHAT REPLACES ALL OF IT**: `test/ui/scenarios/carousel-stack.js`, which
measures the painted bounds against `.engine-stage` at two pane widths, checks
that no control beside it is covered, and asks `elementFromPoint` what answers
at each control's centre — the sharpest idea from `carousel-peeks.js`, applied
to every interactive element rather than to Save patch alone.

**IT NEEDS THE INSTRUMENT AND IS THEREFORE UNVERIFIED IN THE WINDOW.** The
carousel renders only when something is connected (`view.canPickSound &&
view.connected`), because offline `soundList` falls back to the SCHEMA's 24
sounds — this build's list, not the player's — and a wheel there would offer
sounds their Seven does not have. That rule predates this change and is right.
The consequence: **the stack's geometry has been asserted statically but not
yet measured on screen.** Run `carousel-stack.js` with the Seven attached
before this is called done.

---

### 16. SLIDER RESET SHORTCUT — **PARKED, 18 Nov 2026**

Daniel asked for a modifier-click on a slider to return it to a known value,
for editing rather than live use. Parked to revisit, not rejected.

**The blocker is evidence, not effort.** `defaultFor` (src/defaults.js)
returns a factory default for the eight Bank 1 sounds ONLY — they come from
Bank 1 because it cannot be overwritten, so they are the one readable source
of factory numbers on an instrument whose protocol has no default opcode. For
the other 19 sounds it returns **null** on purpose. The old heuristic,
`min(64, max)`, claimed a default for all 110 parameters and was wrong on
every switch; it survives as `seedValue` for fixtures and must never be
treated as a default.

So the three candidate targets were:

- **Factory default** — right where it exists, nothing on two thirds of the
  sounds. One gesture, two behaviours depending on what is loaded.
- **Zero** — always defined, always the same gesture, but an extreme rather
  than a neutral on parameters like Mid Freq.
- **Midpoint** — this is the `min(64, max)` guess the app deliberately
  removed. Not an option.

**A fourth, not discussed at length:** the value the patch was saved with,
which the live session already tracks as the drift baseline. Always known and
always meaningful, but it is an undo rather than a reset — Daniel said this
is not a live-performance feature, which was the context that idea came from.

**Modifier, if it is built:** Option-click is the Mac convention for reset to
default (Logic, Ableton, most plugins). Shift-click conventionally means fine
adjustment, so it would fight muscle memory.

---

### 17. THE EFFECTS CHAIN'S PILLS WENT INERT — **OPEN, CAUSE NOT ESTABLISHED, 18 Nov 2026**

**NOT CLOSED AS UNREPRODUCIBLE, AND THE RELOAD WAS NOT A FIX.**

**What was seen**, on the instrument, connected: clicking ON left it ON,
clicking OFF left it OFF, and nothing else appeared — no prompt, no toast, no
refusal. The chain was reading real values off the Seven at the time
(Vol 127, Pedal Wha-Wha, JCM, Level 91 · Decay 32), so the READ path was
fine. `Cmd+R` brought them back with no code change. It followed a long
session that included a full device pass and a push.

**That makes it a STATE bug, not a missing path.** A reload clears module
state and nothing else, so the pane had got into something it could not
leave. It will recur.

**THREE SILENT PATHS FOUND, any of which produces exactly that.** None is
proven to be the one — nothing captured the state while it was happening —
but all three were real and all three are now audible:

| path | what the player saw | cleared by reload? |
|---|---|---|
| `sendEdit`: `if (sendInFlight)` stranded | nothing at all, no toast | yes |
| `sendEdit`: a null reply made `r.ok` throw | nothing, unhandled rejection, **and no re-render** | only if transient |
| `offerAudition`: `offering \|\| auditionInFlight` stranded | nothing, but a sticky "Loading…" toast would show | yes |

Daniel's report says no toast appeared, which argues against the third and
leaves the first two fitting exactly.

**THE MECHANISM THAT CAN STRAND A FLAG IS A PROMISE THAT NEVER SETTLES.** All
three flags are cleared in a `finally`, so an exception cannot do it —
`finally` runs on the way out. A promise that never resolves means `finally`
never runs at all, the flag stays true for the life of the page, and every
later press is folded silently into `pendingSend`. That is the only shape
consistent with "inert, silent, and fixed by a reload".

**What was changed** (`src/audition.js`):

- a null/absent reply from `setParam` is an audible error instead of a throw
  that nobody catches — `handleStatePill` calls `sendEdit` without `await` and
  without `.catch`, so that throw was an unhandled rejection AND skipped
  `renderDetail()`
- `handleStatePill` says so when a write has been in flight more than 4s
  (`sendIsStuck()`), rather than folding the press into `pendingSend`. 4s is
  hundreds of times a normal round trip — ~12ms a parameter, 483ms for the
  whole 39-parameter chain — so it cannot fire on a merely slow instrument
- `offerAudition`'s two silent returns now speak: the stranded-flag one, and
  `!auditionTarget()`

**NOT FIXED BY FLIPPING THE PILL OPTIMISTICALLY.** The pill reflects device
state and never forks; faking it would turn "nothing happened" into "it lied
about what happened", which is worse and harder to see.

**`pill-always-acts.js`** asserts the guarantee: press a pill and either the
device moves or the app says why. **It would NOT have caught this one** — the
report needed a long session, and a scenario launches a fresh app, presses a
pill within seconds and exits. It is here so the next way of breaking the
guarantee is caught when somebody writes it. Mutation-checked: with `sendEdit`
returning early it reproduces the report exactly (`device 0 -> 0 · pill "OFF"
-> "OFF" · said nothing`) and all five checks go red.

---

### 18. SAVE PATCH IS CLIPPED TO ZERO WIDTH IN A NARROW PANE — **OPEN, PRE-EXISTING, found 18 Nov 2026**

Measured by `picture-box-headroom.js` while sizing the picture box, **before
any change in that pass**:

```
SQUEEZED to 520px
  engine column 147px
  save label at rest: CLIPPED (86 into 0)
```

The Save patch button's `clientWidth` is **0** at a 520px pane, holding an 86px
label. Not caused by the picture going to 160 — growing the box while squeezed
moves nothing, because the engine column is already down to 147px — and
present at 128 too.

**DELIBERATELY NOT FIXED in the 160px pass** (Daniel): one thing at a time, and
the measurement that found it should land with the measurement rather than
with a fix that would blur what caused what.

**COULD THE SUITE HAVE CAUGHT IT? No, and the gap is specific.** Only four
scenarios narrow the pane at all — `carousel-caption`, `fx-head-fits`,
`carousel-stack` and the new `picture-box-headroom` — and the first three
narrow it to look at the PICTURE and the FX head. **Nothing squeezed the pane
and then looked at the engine column's text side**, which is where Save patch
lives. `save-slot-spacing.js` and `save-button-contexts.js` both measure that
button, and both only ever see it at the default width.

So the shape of the hole: a region is covered at one width and a width is
covered for one region, and the intersection is nobody's. Worth remembering
before trusting that "the save flow is well covered" — it is, at 747px.

---

### THREE INTERMITTENTS IN ONE DAY — **noted together so the fourth is recognisable**

All three appeared in long-running sessions and were gone when looked at.
Possibly three causes, possibly one. Recorded as a set because that is the
only way the pattern is visible to whoever meets the next one.

| | what happened | state when looked at |
|---|---|---|
| `panel-reach` | read as a regression from one run each way | two further runs green; cause never established |
| `carousel-offline` | intermittent | green on re-run |
| the chain's pills | inert and silent, connected | cleared by `Cmd+R` |

**What they share:** each involves state that accumulates across a session —
a stranded flag, a listener, a cached view — and each was fine from a cold
start. That is the opposite of what the suite tests. Every scenario launches a
fresh app, does one thing in a few seconds and exits, so **nothing in 86
scenarios has ever been given time to accumulate anything.**

**A fourth is worth treating as the same family until shown otherwise**, and
the thing that would actually catch them is a long-session scenario — one app
instance, many operations, assertions at the end — which does not exist and is
a deliberate gap rather than an oversight. Noted, not built.

**Also in this family, different mechanism:** `audition-entry` lost the
instrument mid-pass on 18 Nov, green run alone. The likeliest cause there is
the MIDI port not being free yet, because the runner launches each scenario as
soon as the previous app exits.

