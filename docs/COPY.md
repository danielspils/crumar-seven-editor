# Every word the app says

An inventory of user-facing text, for reading in one pass and marking up.
Nothing here is a proposal — it is what the app says today.

**Line numbers are as of 2026-08-16** and will drift; the strings are the
reliable index. Anything a person can read is included: buttons, headings,
subheads, tooltips, toasts, dialog bodies, empty states, and the lines a run
prints as it goes.

**⚑ marks text you cannot easily reach** — it needs a failure, a second
instrument, a corrupted file, or a state that only occurs mid-operation. Those
are the ones that go wrong unseen.

Device-supplied text is **excluded**: parameter names, sound names, engine
labels and global option values all come off the instrument (`0x15`, `0x42`,
the panel photographs) and are not ours to write.

---

## 0. The boot loader

The Seven logo warming up over the whole window while the instrument is read,
on a launch with a Seven attached. It says **nothing at all on a normal boot**
and that is the point: the warm-up already shows the app is busy, and a
caption repeating it for three seconds is noise in a moment nobody is reading.

| String | Where | When |
|---|---|---|
| `Reading the instrument…` | app.js, `showBootLoader` | ⚑ **Conditional.** Only if the read is still running **4000ms** after the loader appears |

**The threshold is measured, not chosen.** Six cold boots with the Seven
attached read 2634, 2642, 2958, 2967, 2975 and 3007ms, so the slow end of a
healthy launch is just over three seconds. 4000ms sits about a third above
that: far enough that a normal boot never trips it — including on a unit with
more expansions, since the sound table is read per id and grows with them, or
a machine under load — and close enough that somebody looking at a
wrong-looking screen is told within a second or so of starting to wonder.
A cable half in or an instrument switched off is what it is for.

It **fades in** over 420ms rather than appearing. By the time it shows,
something is already wrong; a line flicking into existence reads as another
fault.

It is cleared the moment the instrument answers, so a read resolving at 3.9s
is never followed at 4.0s by a line saying it is still waiting.

**REMOVED 16 Nov 2026 (Daniel):** the settled line, which read
`Crumar Seven · 27 sounds`. The toolbar already says
`Pronto · CRUMAR SEVEN 1.37`, better and permanently, so the loader was
repeating it for a fraction of a second before the flight took it away.
Nothing replaces it. `test/ui/scenarios/boot-loader.js` asserts the silence by
sampling throughout the boot rather than at the end — a line that appears for
a moment and goes is invisible to an end-state check.
`boot-status-late.js` covers the conditional path.

## 0b. The stale-backup offer

Once per session, after the app is up, if the last backup is older than
**`BACKUP_STALE_DAYS` (14)** in `src/ots-freshness.js`.

> `Your last backup was 2 weeks ago. Back up the Seven now?`
>
> `[ Continue ]` `[ Back up now ]`

**Daniel's wording, 16 Nov 2026.**

**THE AGE IS LIVE, and at the threshold it reads "2 weeks ago" — never
"14 days ago".** The sentence is built with `SevenLibraryView.ago()`, the same
helper every dated row uses, which switches from days to weeks at exactly 14.
So the first version of this sentence anyone can ever see says "2 weeks ago".
Daniel's "14 days ago" was the example, not the output. Using days here would
have meant a second relative-time helper disagreeing with the line under the
slot list.

It also cannot say **"1 days ago"** — `ago()` answers `yesterday` at one day —
though that case is unreachable anyway at a fourteen-day threshold.

**"Back up" is the VERB, two words. "backup" is the NOUN, one.** Corrected
16 Nov 2026 from "Backup the Seven now", Daniel's call. The button has always
had the verb right, so the app is consistent with itself.
**Do not revert this.**

**THE BUTTON IS `Back up Seven`** (Daniel, 18 Nov 2026). It read `Back up
instrument` until then, which wrapped onto two lines in the freshness line it
now sits in — though the wrap was fixed structurally as well (`flex: none` on
a flex item that was being squeezed by the Bank 1 note beside it), so this is
the shorter label and not a workaround for the wrap.

**`Cancel backup` and `Cancelling…` are UNCHANGED.** They are what the same
button reads while a run is in flight, and only the resting label moved.

**"Continue", not "Not now" or "Skip"** — declining is not a deferral, it is
carrying on with what you opened the app to do. There is deliberately **no
"don't ask again" box**: the once-per-session rule already keeps that promise,
and a checkbox would be a second mechanism for it.

**It is the deny slot, not the cancel one.** `cancelLabel` draws no button —
it names the corner ✕ (`modal.js`, `shell()`). `denyLabel` is what renders a
second button, so the two-button layout needs it. Both resolve `false`.
`cancelLabel` carries the same word so the ✕ means the same thing.

Covered by `test/ui/scenarios/backup-offer.js` (it appears, says the agreed
sentence with a live age, has exactly two buttons, dismisses in one click and
does not return) and `backup-offer-fresh.js` (a recent backup is not mentioned
at all). The threshold itself is pinned in `test/backup-stale.test.js`.

## 1. Connection row

The strip under the panel. One line, left, plus buttons.

| String | Where | When |
|---|---|---|
| `No instrument connected` | app.js:2951 | Nothing plugged in, or after an unplug |
| `Connecting…` | app.js (showStatus) | Between clicking Connect and the first phase |
| `Pronto · Crumar Seven` + firmware version | app.js:2660 | Connected. The full firmware string is the tooltip |
| `Checking the connection…` | app.js:3169 | Liveness probe and globals, first ~100ms of a connect |
| `Reading sounds…` | app.js:3167 | The `0x42` sweep, ~0.5s |
| `Reading parameters… 47 of 110` | app.js:3168 | The `0x14` sweep, ~2.2s, counts every fifth id |
| `The Seven was unplugged.` | app.js:3135 | The port disappears while connected |
| `Couldn't talk to the Seven. Unplug the USB cable, plug it back in, and try again.` | seven-midi.js:119 | ⚑ Liveness probe fails twice — the wedge case |
| `No Crumar Seven found. Is the USB cable connected?` | seven-midi.js:309 | Connect with no matching MIDI port |
| `Connect` / `Disconnect` | index.html | Button label, follows state |
| `Back up Seven` | index.html, reset in app.js | Button, always present, DISABLED when not connected |
| `Settings` | index.html | Button, always present |

### The write gate ⚑

Shown only when the instrument's parameter table disagrees with the schema.
Unreachable on a matching Seven — `SEVEN_FORCE_MISMATCH=1.22` is the only way
to see it (CLAUDE.md).

- `This Seven is running firmware 1.22. This app was built against 1.37, and this instrument reports 104 parameters where the app knows 110.` — param-compat.js:167
- Fallback with no readable firmware string: `This instrument reports 104 parameters where the app knows 110.` — param-compat.js:153
- Fallback when the table could not be read at all: `The instrument's parameter table could not be read (no answer for parameter 22).` — param-compat.js:117
- Name mismatch clause: `It calls parameter 37 "pno_dec" where the app expects "pno_atk", and 2 more names differ.` — param-compat.js:186
- Consequence, always: `Backup and browsing still work, and you can still change sounds on the instrument. Sending patches, live edits and transfer are switched off, because the app hasn't been verified against this firmware.` — param-compat.js:193
- Ask, always: `A report gives me what I'd need to add support for it.` — param-compat.js:197
- Button: `Report this instrument` → after saving: `Report saved` — app.js:3003

---

## 2. Backup

### Before it runs

- Dialog title: `Backing up 32 presets` — main.js:479
- `4 banks x 8 buttons = 32 presets` — main.js:481
- `It takes about 60 seconds.` — main.js:484
- `Any unsaved edits will be lost.` — main.js:485
- Confirm: `Back Up` — main.js:486

The dialog also states where the instrument is left, composed in main.js from
the panel's last known preset.

### While it runs

- `Backing up… starting` — app.js:3092
- `Backing up… 7/32 — Bank 1 · Preset 7 · Tine Piano · 12s` — app.js:3174
- Button becomes: `Cancel backup` — app.js:3090

### When it finishes

- `Backup completato!` — app.js:3050 (success)
- `Backup cancelled` — app.js:3050 (cancelled)
- `32 presets backed up<br>to your computer` — app.js:3052
- `Backed up 32/32 in 48s — 28 unchanged, 4 new · returned to Bank 2 · Preset 3` — app.js:3040
- `Backup cancelled at 13/32 — 13 unchanged, 0 new · returned to Bank 1 · Preset 1` — app.js:3039 ⚑ needs a cancel mid-run

### Failure ⚑

- `no recall broadcast within 1500ms` — backup-runner.js:80. Surfaces in the connection row as `Backup stopped after 5/32 — …`. Reached when a slot does not answer; seen once on 2026-08-16 seconds after a panel hold.
- `param 63 unreadable after 3 attempts (timeout waiting for 0x23)` — backup-runner.js:191 ⚑
- `[backup] could not stamp bank-1-preset-3.sevenlib.json: …` — backup-runner.js:208 ⚑ console only

### What a run writes

- Setlist names: `Bank 1 setlist (2026-08-16)`, or `Bank 1 setlist (2026-08-16, failed)` when the run stopped — backup-runner.js:250
- Patch names, when no library patch lends one: `Bank 3 Preset 5 — Clavi Piano` — backup-runner.js:170

---

## 3. Send to Seven

One label for the action everywhere: the detail link, the context menu, both
bank choosers, both walk dialogs.

### Choosing where

- Dialog title: `Send to Seven` — app.js:262 (one patch), app.js:2035 (a setlist)
- `Select which bank to send` — app.js:264
- `Bank 1 is for factory presets` — app.js:272 (note under a dimmed Bank 1)
- `Bank 3 — which preset?` — app.js:277 (single patch only)
- `This preset is replaced, and only once you hold its button on the Seven.` — app.js:278

### The setlist confirmation

- Title `Send to Seven`, then: `8 presets` ↓ `Crumar Seven's Bank 3` — app.js:2092
- `You will manually transfer each sound, replacing the current sounds.` — app.js:2098
- `(Backup your current bank tones before they say ciao!)` — app.js:2100
- `Send PC is off on your Seven. The transfer switches it on so the app can follow along, and switches it back when it's done.` — app.js:2106 ⚑ only when Send PC is off
- Confirm: `Send to Bank 3` — app.js:2109

### The walk

- Title: `Send to Seven` — app.js:865
- `(you can hear it now)` — app.js:899
- `Hold for 3 seconds.` — app.js:871
- `Your Seven lights will run indicating the sound is saved.` — app.js:876
- Confirm: `Held it — next` — app.js:877, Deny: `Stop`
- Runner instruction, per slot: `Hold preset 6 on the Seven for three seconds.` — transfer-runner.js:379
- Skipped slot: `Preset 6 already holds this patch.` — transfer-runner.js:357

### The summary

- `Sent to Seven` / `Send stopped` — app.js:1021
- `6 of 8 presets stored` — app.js:989
- `Bank 3 already matched — nothing needed storing` — app.js:989, when every slot was already correct
- `Preset 3, 4 already held their patches, so nothing was sent.` — app.js:996
- `Preset 7 was loaded but you did not confirm the hold, so it is still in the edit buffer rather than saved on the instrument.` — app.js:1000 ⚑ needs a stop mid-walk
- Report note, held back from the screen: `Presets are listed as stored because you confirmed the hold — the Seven does not report stores.` — transfer-runner.js:546

### Refusals ⚑

Most need a blocked plan, a missing file, or a sound this instrument lacks.

- `Cannot send this setlist` / `This instrument is missing sounds` — app.js:2074
- The Bank 1 lock sentence — transfer-runner.js, three refusals. See **One sentence for Bank 1** below; it is one shared string and is not written here.
- `There is no bank 5.` / `There is no preset 9.` — transfer-runner.js:108, :257
- `The Seven is not connected.` — transfer-runner.js:111 and five other layers
- `That setlist no longer exists.` — transfer-runner.js:114
- `empty — this preset is left alone` — transfer-runner.js:123 (per-slot plan line)
- `this instrument has no "Venice Grand CFX"` — transfer-runner.js:130
- `the patch file is missing from the library` — transfer-runner.js:136
- `will be replaced, one at a time, as you hold each preset button.` — transfer-runner.js:158
- `The Seven did not answer the recall for preset 4, so nothing was loaded for it. Check the cable and try again.` — transfer-runner.js:324
- `A transfer is already running` / `No transfer is running` — transfer-runner.js:173, :306
- `Cannot send that patch` / `That patch could not be sent.` — app.js:286
- `Cannot send that sound` / `That sound could not be sent to this preset.` — app.js:239
- `This instrument has no sound called "Venice Grand CFX". It may need a sample expansion this unit does not have.` — patch-sender.js:82
- `pno_atk (parameter 1) would not take a value after 3 attempts (…)` — patch-sender.js:109 ⚑
- Toasts: `Connect the Seven to send a patch to it` — app.js:256; `Connect the Seven to send a setlist to it` — app.js:2031

---

## 4. Library

### Tabs and search

- `Backups` · `Patches` · `Setlists` — library-view.js:967
- Search placeholder: `Search name or sound…` — library-view.js:996
- Header: `ON THIS COMPUTER — 35`, `48 files`, `Open Library Folder`
- Freshness line: `as of last backup · yesterday` — ots-freshness.js, `asOfLabel`.
  **THE DATE CAME OFF 17 NOV 2026 (Daniel).** It read `as of last backup ·
  16 Nov (yesterday)` — one fact stated twice, with the reader left to check
  that the two halves agree. The line answers HOW OLD; the age answers that
  outright, the date only if you already know today's. The date is not lost:
  every run is listed by date on the Backups tab, where a date is something
  you act on rather than a caption's second opinion of its own age.
  App.js's same-day special case (`age === 'today'` → print the age alone)
  went with it, having become a copy of what the general rule now returns.
- `not yet backed up` — app.js:1518, before any backup exists
- Setlist row count: `3 patches`. **`· 5 empty` CAME OFF 17 NOV 2026
  (Daniel)** — library-view.js. A setlist is always eight slots, so the
  empties are 8 minus the number stated immediately before them: the same
  fact twice. The clause that was there suppressed it at 8 of 8 for exactly
  that reason, and the reason applies the whole way down.

### Empty states

- `No patches match the search.` — library-view.js:287
- `Patches you save or import live here. Ones read off the Seven live under Backups.` — library-view.js:288 ⚑ only with an empty library
- `No backups yet. "Back up Seven" reads all 32 presets and writes down what the Seven held.` — library-view.js ⚑
- `No setlists yet. A setlist is a bank's worth of patches — 8 slots — staged for a gig or a transfer.` — library-view.js:674 ⚑
- `No patches match "venice".` — library-view.js:815 (picker)
- `No instrument matches "venice".` — library-view.js:707 (picker, Instruments)
- `Not backed up` — app.js:1234, a bank slot with no record
- `Connect to a Crumar Seven and click the "Back up Seven" button.` — app.js
- `Select a patch` — app.js:1281

### Badges and row tooltips

- Bank 1 tab lock (icon only, no label) — app.js; its tooltip is the shared Bank 1 sentence, see **One sentence for Bank 1** below. It replaces the `Crumar preset` badge, which sat on all eight Bank 1 rows and no others.
- `⚠ Not installed` — renderer.js:640, tooltip `Sound not installed on this instrument`
- `(!)` on a setlist slot — library-view.js:887, same meaning
- `Model` / `Sample` — renderer.js:631
- Backup row tooltip: `Backed up 12 Aug — older than the rest of this bank` — renderer.js:621 ⚑ needs a bank backed up across two runs
- `Created here` — library-view.js:271
- Ages: `1 day ago`, `3 days ago` — library-view.js:65

### Backups tab

- Row: `16 Aug Backup` + `32 presets`, or `5 presets · failed`
- `32+` ⚑ — library-view.js:582, only when two runs are grouped as one; opens:
  - `More patches than the Seven has` — app.js:1797
  - `This backup shows 37 patches, but the Seven only has 32 slots.` — app.js:1799
  - `Two backups ran the same day and one stopped partway, so the app grouped them as one. Nothing is lost — your patches are fine.` — app.js:1800
  - `Run another backup and you'll get a clean 32.` — app.js:1802
- Run header: `16 Aug · failed` — library-view.js:547
- `‹ Backups` — library-view.js:527
- `Send to Seven →` on each bank inside a run — library-view.js:534
- Delete tooltip: `Delete the 16 Aug backup (the patches stay in the library)` — library-view.js:586

### Setlists

- `＋ Create new setlist` — library-view.js:672
- Slot controls: `Assign` — library-view.js:855; `Remove from slot 3 (the patch stays in the library)` — :857; `Put the patch back in slot 3` — :869 ⚑ appears only after a clear
- `Empty` on an unfilled slot
- `Missing file: gone.sevenlib.json` ⚑ — library-view.js:913, tooltip `Referenced file is not in the library folder`
- `(missing)` — library-view.js:917 ⚑
- `Send to Seven →` — library-view.js:959
- Delete tooltip: `Delete "Long Winters" (the patches stay in the library)` — library-view.js:659

### The picker

- Modes: `Patches` · `Instruments` — library-view.js:825
- Placeholders: `Search instruments…` / `Search name or sound…` — library-view.js:829
- `Choosing an instrument sets the sound only — every parameter keeps its current setting, which is what the Seven itself does when the sound changes.` — library-view.js:728
- Tile tooltip: `Venice Grand D-274 — selects this sound and leaves the settings alone` — library-view.js:719

### Making a patch from a sound

- `New patch from Venice Grand D-274` — app.js:1390
- `The only reading of this sound in your library.` — app.js:1394
- `3 readings of this sound are in your library.` — app.js:1395
- `Every reading of Venice Grand D-274 in your library.` — app.js:1405
- `Create patch` — app.js:1396
- ⚑ No capture at all: `No capture of this sound in your library` — app.js:1425; `104 values come from Bank 1, the factory bank. …not values read from your instrument.` — app.js:1427; `Backing up a preset that uses this sound would give it real values.` — app.js:1430; confirm `Create anyway` — app.js:1431
- `Could not create a patch from Venice Grand D-274` — app.js:1440 ⚑
- `Could not read the library for Venice Grand D-274` — app.js:1382 ⚑

### Deleting

- `Delete patch` — app.js:1953, with a body assembled from up to five clauses:
  - `is used in Long Winters and 2 setlists` — app.js:1922
  - `shows in Bank 3 · Preset 5` — app.js:1923
  - `Those setlist slots will show as missing.` — app.js:1927
  - `Those bank slots go back to reading "Not backed up".` — app.js:1930
  - `Those backups will no longer be complete records of their days.` — app.js:1937
  - `The preset on the Seven itself is unaffected.` — app.js:1946
  - `The file moves to the Trash.` — app.js:1952
- `Delete this backup?` — app.js:1980; `This removes the record of what the Seven held that day — 4 banks. The patches themselves stay in your library.` — app.js:1981; confirm `Delete backup` — app.js:1984
- Setlist delete, composed in main.js: `Delete the backup record of Bank 3 from 12 August 2026?` — main.js:146, or `Delete the setlist "Long Winters"?`; body `Only the setlist is deleted — the patches it references stay in the library.` — main.js:153; confirm `Delete backup record` / `Delete setlist` — main.js:154

### Undo toasts

Each reads `Undid: <label>`, and the labels are:

`rename to "Rhodes"` (app.js:1842) · `new setlist "Gig"` (:1858) · `rename setlist to "Gig"` (:1869) · `delete setlist "Gig"` (:2012) · `fill slot 3` (:2178) · `clear slot 3` (:2189) · `move slot 5 to 2` (:2257) · `reorder patches` (:2203) · `sort patches by recency` (:2215) · `reorder setlists` (:2224) · `sort setlists by recency` (:2249)

- `Nothing to undo` — app.js:179

---

## 5. Sounds

One modal, from Settings → `Sounds on this Seven` (app.js:2736).

- Title, connected: `Sounds on this Seven — 24 installed · 3 available` — app.js:2778
- Title, offline: `Sounds — the published list. Connect to see what's installed.` — app.js:2779
- Group heads: `Modeled (8)` · `Included samples (8)` · `Expansions (10)`
- `Permanent Crumar models — can't be deleted.` — app.js:2645
- `Permanent Crumar samples — can't be deleted.` — app.js:2650
- `Available from Crumar — can be added and removed.` — app.js:2671
- Pills: `Installed` · `Not installed` (app.js:2589) · `Unverified` · `Partly installed` (app.js:2591) ⚑ needs half a multi-sound download
- `Installed, not in the catalogue` — app.js:2665 ⚑ needs a sound the catalogue does not list
- Unverified tooltip: `Nobody has told this app what sounds this expansion adds, so it cannot say whether you have it` — app.js:2613
- `Connect your Seven to see which sounds are installed.` — app.js:2683, offline only
- `To install an expansion, visit crumar.it` — app.js:2692
- Footer: `Read 16 Aug, 5:48 PM · fingerprint 741ecb059575ba38`
- ⚑ Console: `[seven] Sounds modal asked to open while already open — focusing the existing one` — app.js:2764

---

## 6. Settings

- Row: `Sounds on this Seven` with the instrument's sound count
- Offline: `Connect to a Seven via USB to access global settings.` — app.js:2914
- `Tuning` + `440 Hz`
- Nine global rows use the instrument's own names and values (Channel, Send PC, Memory Protect …) — seven-midi.js:93–100. Not ours.
- ⚑ `The Seven refused that change` — app.js:2836, :2851, when a global write is rejected
- ⚑ `glb 5 (Sustain Pol.) has values this project has not seen named — refusing to write it` — seven-midi.js:827
- ⚑ `glb 3 (Send PC) has no value 4 — refusing to write it` — seven-midi.js:834

---

## 7. The detail panel

- `Save to Computer` · `Send to Seven` · `Duplicate and edit` — audition.js:86–98
- `Sound saved to computer!` — audition.js:652, with `Go to your new patch` — audition.js:662
- `Save "Rhodes"` / `Overwrite this patch, or keep it and save your changes as a copy?` / `Overwrite patch` / `Save a copy` — audition.js:582–585
- `This patch` — audition.js:644 (fallback name)
- `Choose this patch's sound` / `The settings stay as they are — only which instrument the patch names changes.` / `Give it the Clavi Piano sound` — app.js:338–350
- `Sound is now Clavi Piano` — app.js:364
- `Duplicate to edit` — the control on a preset row inside a backup run
  (library-view.js), tooltip `Duplicate “<name>” to edit`. Its prompt matches:
  title `Duplicate to edit`, confirm `Duplicate` (app.js).
  **DUPLICATE is the app's verb for this act.** "Copy" is not a second word
  for it anywhere in the interface (Daniel, 2026-08-17).
- `Duplicate and edit` dialog: `This is a Crumar factory preset, captured from Bank 1. Every patch generated from this model is built from it, so it is kept as it is.` + `Your changes on a copy instead?` — app.js:310–312
- `Make your changes` — app.js:600
- Section heads: `Master Volume / EQ`, `Amp Simulator`, `Synth Pad`, `Expression Pedal` — renderer.js:89–95
- `OFF` / `ON` on each effects section — renderer.js:591
- `not used` + `This control only does something when the loaded sample is a piano. The Seven still stores a value for it.` — renderer.js:394
- `Reversed: min is above max, which reverses the pedal action (manual)` — renderer.js:344 ⚑
- Warning banners:
  - `⚠ This sound is not installed on this instrument — the patch needs "Venice Grand CFX".` — renderer.js:508 ⚑ needs a patch for a sound you lack
  - `⚠ All four filter switches are off — the Clavinet produces no sound in this state.` — renderer.js:530
  - `FX1 is set to Pedal Wha-Wha — the wha takes priority and this assignment is ignored.` — renderer.js:575
- `Select a preset in Bank 2, 3 or 4 to try another instrument` — renderer.js:485
- Sound carousel step buttons, `aria-label` and `title`: `Previous` / `Next` — renderer.js ⚑ **only rendered below 1032px**, where the peek faces are hidden because no spread both clears the Save patch button and leaves a recognisable peek. Above that width the peeks are the control and these do not exist on screen, so reaching them needs a display narrower than 1280 (`minWidth: Math.min(1280, work.width)`) or `SEVEN_WINDOW_WIDTH`. Bare `Previous`/`Next` is Daniel's call, 15 Nov 2026 — the surrounding heading already names what is being stepped through.
- Toasts: `Connect the Seven to edit sounds` (audition.js:384) · `Connect the Seven to try another instrument` (app.js:686) · `Choose a preset to try an instrument on it` (app.js:693) · `Connect the Seven to choose a sound for a preset` (app.js:227)
- `Choosing an instrument sends it to this preset and plays it. Save Patch keeps it on your computer; holding the button on the Seven keeps it in this preset.` — app.js ⚑ reworded 14 Nov 2026: the hold is no longer the only way to keep a sound, so the sentence no longer says it is (out/save-what-you-hear.md §4)

### Losing edits ⚑

- `Leave without saving?` + `…but they will not be saved to this computer.` + `Leave Without Saving` — audition.js:517–521
- `Left audition mode. Those edits were not saved to the library.` — audition.js:529
- `The Seven recalled a different preset — your unsaved edits are gone.` — audition.js:332
- `The Seven recalled a preset, so audition mode ended.` — audition.js:333
- `The Seven disconnected. These edits are still here — save them to keep them.` — audition.js:109
- `Save or discard your edits before previewing another patch` — audition.js:772
- `Could not make a copy` — audition.js:593, app.js:319

### The save flow — read and approved by Daniel, 14 Nov 2026

Added by out/save-what-you-hear.md. The two row sentences are the whole
defence against the two choices being mistaken for each other, which is the
problem this flow exists to solve, so they are the ones worth arguing about.

**Three strings changed in that read, and all three were caught by laying the
set out together rather than by reading any one of them:**

- `Slot` → `Preset`, with a `·` for the slash. The save flow was the only place
  in the app saying "Slot" — nine others, and the instrument's own panel, say
  Preset — and one save walked the player past both words: Slot in the modal
  and the hold screen, Preset in the library row it lands in. It came from the
  spec, which has been corrected rather than followed (§3).
- `Hold the button on the Seven to confirm` → `Holding the button on the Seven
  for three seconds is what saves it`. "Confirm" reads as the app having saved
  and the player approving. The row exists because the opposite is true.
- The failed-borrow line lost `Send CC`. It is a global on the instrument's
  menu and the name of a borrow the app does quietly; in a save dialog it is a
  sentence nobody can act on.

EVERY ROW IS A DESTINATION. Two in ON THE SEVEN, three in Patches — the third
is the question that used to be a second dialog behind "save to computer"
(folded in by Daniel, 14 Nov 2026). The rows are in this order on screen.

- Dialog title: `Save patch` · from navigating away: `You have unsaved changes` — audition.js
- Row — update, **Patches only**: `Update “Reed Piano”` + `Writes these values into the patch you have open` — save-plan.js
  - an unnamed patch: `Update this patch` ⚑ needs a patch saved without a name
  - absent for a bank slot (no file behind it), a backup record, and a Bank 1 donor
- Row — the Seven: `Overwrite Bank 3 · Preset 5` + `Holding the button on the Seven for three seconds is what saves it` — save-plan.js
  - with no Send PC, the preset cannot be named honestly: `Overwrite the preset on your Seven`
  - **absent entirely when the Seven is sitting on a Bank 1 preset**, since that
    bank cannot be stored to (hardware, 2026-08-13). A hardware run offered
    `Overwrite Bank 1 · Preset 1` before this was caught, which would have sent
    the player to hold a button the instrument refuses.
### Two lines for Bank 1, one per job

> `Crumar reserves Bank 1 for its 8 models — they cannot be overwritten.`
> `Bank 1 is reserved for Crumar models`

**Daniel's wording.** The first is 16 Nov 2026 — his 16 Aug 2026 tab-lock
tooltip with "can not" corrected to "cannot". The second is 17 Nov 2026, for
the line under Bank 1's rows.

**THE SECOND ONE HAS NO FULL STOP, deliberately** (Daniel, 17 Nov). It is a
10px uppercase LABEL sitting beside `as of last backup · yesterday`, which has
no stop either, and a period in a line of small caps reads as a speck. The
refusal keeps its stop: that one appears in dialog bodies and tooltips, where
it genuinely is prose. The stop is absent from the **literal**, not hidden by
CSS — `text-transform` cannot remove a character — so the test that pins the
wording pins the absence too.

**AND NO LOCK GLYPH BESIDE IT** (Daniel, 17 Nov). It carried the Bank 1 tab's
own `LOCK` for one revision, on the argument that the tab and the line should
say one thing with one drawing. They still do: the **tab** has the lock, the
line has the words. Two padlocks on screen at once — one in the tab strip, one
directly under the rows it describes — is the same fact drawn twice, and a lock
beside a line that only DESCRIBES the bank pushes it back towards reading as a
refusal, which is the distinction below.

**TWO SENTENCES IS NOT A RELAPSE INTO THE TWO-PHRASINGS PROBLEM BELOW**, and
the difference is which question each answers:

- `BANK1_LOCKED` is a **refusal** — *why did that not work* — and appears at
  the moment somebody runs into the rule. It names the consequence.
- `BANK1_FOOT` is a **description** — *what is this bank* — and sits under
  Bank 1's eight rows whether or not anybody tried anything. Putting the
  refusal there would tell every player looking at the factory presets that
  they cannot overwrite something they were not attempting to overwrite,
  which is how a warning becomes furniture.

What the 16 Nov commit ended was two phrasings in **two files**, drifting with
nobody owning either. Both of these are literals in `src/save-plan.js` and
every surface reads them from there:

| where | sentence | what shows it |
|---|---|---|
| the Bank 1 tab's lock | refusal | tooltip — `app.js`, `BANK1_LOCK_TIP` |
| the save dialog | refusal | the note in the Seven row's place — `save-plan.js` |
| the transfer runner | refusal | three refusals — `transfer-runner.js` |
| the line under Bank 1's rows | description | `app.js`, `updateBank1Note` → `#bank1-note` |

**IT MOVED ONCE, ON THE DAY IT LANDED.** For its first revision it was in
`#foot-seven` — the bottom of the whole pane, two elements below the list, in
12px green sentence case (`.foot-slot`, `color: var(--action-text)`). Three
things wrong with that and one of them structural: it is a footnote about
**those eight rows**, exactly like the freshness caveat, so it belongs in the
same line under the same list. It is now a second span in `#fresh-line`
wearing `class="fresh"` — which is how "it looks the same as the freshness
line" is made true rather than copied: font, size, weight, tracking, colour
and the uppercasing all come from that one rule. **The green is gone** because
`DESIGN.md` reserves `--action-text` for things that DO something, and this
line does nothing.

Measured on all four banks: `#bank1-note` and `#bank-asof` both land at right
385, top 569, 10px/700, 0.7px tracking, uppercase, `rgb(157,148,132)`.

`#foot-seven` is **once again an element with no consumer**, and that is
deliberate rather than forgotten — its own comment in `index.html` reserves it
for "Save this bank as a setlist". The JS const that pointed at it is gone, so
nothing reads as wired that is not.

Which bank counts as the factory's is asked of `ots-freshness.js` rather than
tested against a literal 1, so the one place that knows stays the one place
that knows.

**It replaced TWO phrasings of one fact**, which is why the entry is written
this way. `save-plan.js` said "Bank 1 holds the factory presets and cannot be
written to." while `app.js` kept its own copy of the tooltip. An inventory
carrying both implies there are two rules; there is one, and it is the
instrument's rather than the app's — the sentence says *Crumar* reserves the
bank, so the app is reporting behaviour rather than announcing a policy.

`test/bank1-locked.test.js` pins both: the refusal's exact wording including
the em dash and the numeral, that each is a literal in `save-plan.js` alone,
that no older phrasing survives anywhere in `src/`, that each surface reads
the shared constant, and that the foot sentence stays a DESCRIPTION — it
fails if it ever acquires "cannot" or "overwrit", which is the line between
the two jobs stated as an assertion rather than as prose.

Mutation-checked, 3 for 3 (17 Nov 2026): a second copy of the sentence — even
the CORRECT sentence — fails two; collapsing `BANK1_FOOT` into `BANK1_LOCKED`
fails two; and taking away `#foot-seven`'s consumer fails the surfaces test,
which is the guard that stops it going back to being declared and unused.

- Note — in the Seven row's place on Bank 1, showing the sentence above:
  - **SETTLED 2026-11-15 (Daniel).** This was OPEN: the row was removed and
    nothing said why, so a player who pressed Save while on Bank 1 saw only
    "Save to computer" and was not told where the Seven had gone.
  - **The wording is REUSED, not written.** Daniel had already written this
    sentence three times — transfer-runner.js held three copies of the literal
    — and his reason for reusing it was that a fourth phrasing would have been
    a fourth thing to keep in sync.
  - Placed where the row would have been, so it reads as the reason there are
    fewer options rather than as a warning about something the player did.
  - A NOTE, not a row: no border, no hover, no cursor, nothing clickable, and
    deliberately not red or amber. It is a fact about the instrument, not a
    problem with the save, so it wears the same muted ink as the row subtitles.
- Row — the computer: `Save to computer` — save-plan.js
  - alone: `Adds it to your Patches library. The Seven is untouched`
  - with the update row above it: `Keeps this patch and saves these values as a separate one`
    (the contrast is the point: both write to the computer, and the difference
    is which file)
- Ways out: `Cancel` · from navigating away: `Discard changes and leave` + `Stay here` — audition.js
- Hold screen: `Hold it on the Seven` + `Bank 3 · Preset 5` + `Also save a copy to Patches` + `If you walk away without holding the button, the sound is still on your computer.` — audition.js
- Failed read: `Nothing was saved — <reason>` / `Nothing was saved — the Seven could not be read.` — audition.js
- Failed Send CC borrow, **in the save dialog** now rather than as a toast on entering the view (§5b): `Knob moves on the Seven may not have shown on screen. Saving reads the instrument either way.` — audition.js ⚑ needs a refused glb[2] write; REPLACES the toast. It does not name Send CC: see the note at the top of this section
- A refused update (cannot be reached while the row is correctly absent): `That one is a record of what the instrument held — save a copy instead` — audition.js ⚑ unreachable while canUpdate() is correct
- Library row, under a patch saved off a preset: `from Bank 3 · Preset 5` — library-view.js
  - in a setlist slot row it follows the age: `Created 2 hours ago · from Bank 3 · Preset 5`
  - the flat Patches row shows the slot ALONE, since that row carries no date
    (2026-08-16). Reopening that cell for this one thing is Daniel's call of
    14 Nov and worth his second look.

**Retired by the fold-in:** the second dialog's `Save “Reed Piano”` /
`Write these values into “Reed Piano”, or keep it and save them as a separate
patch.` / `Save as a separate patch` / `Overwrite “Reed Piano”`. Its lessons
live on — the target is still named, and the destructive choice still does not
hold Return, because the new dialog has no affirmative button at all.

---

## 8. Menus and windows

- Window title: `Crumar Seven Editor` — main.js:629
- View menu: `Show raw values` (:578) · `Expand all sections` (:607) · `Collapse all sections` (:608) · `Capture Window…` (:596)
- Library row context menu: `Rename` · `Duplicate` · `Send to Seven…` (:80) · `Export…` · `Delete`
- Setlist context menu: `Rename` · `Delete…`
- Export dialog: `Export patch`, file type `Seven library` — main.js:55
- Report dialog: `Save instrument report` — main.js:205 ⚑ gate-closed only

---

## 9. Errors from the layers below ⚑

These reach the screen as toasts or dialog bodies, usually verbatim. All need
a fault to see.

**Store** — `File is not readable` · `No such patch in file` · `No such setlist` · `Bad slot` · `Bad path` · `Untitled setlist` · `Unknown sound: Venice Grand CFX` · `Changing the sound would edit a Crumar factory preset in place (bank-1-preset-1-tine-piano.sevenlib.json). Duplicate it and edit the copy — generated patches are seeded from this file.` (library-store.js:593) · `Only a capture from this instrument can fill in "Venice Grand C5", and 110 of its 110 parameters have none. Back up the slot that uses this sound first.` (:828)

**MIDI** — `not connected` · `port closed` · `timeout waiting for 0x23` · `timeout waiting for globals` · `param id out of range: 118` · `sound id out of range: 30` · `the instrument reported 900 parameters, which cannot be right` (seven-midi.js:706) · `no answer for parameters 22, 51` (:768)

**Console only** — `[library] patch-order.json unreadable: …` · `[library] setlists.json unreadable: …` · `[library] setlist "Gig": non-string slot 3 treated as empty` · `[library] dropping malformed setlist entry: …` · `[seven] backup run 2026-08-16 counted 37 presets — more than the 32 the instrument has, so two runs have been grouped as one` · `[seven] SEVEN_FORCE_MISMATCH=1.22: write gate forced CLOSED. The parameter table read from the instrument is untouched.`

---

## 10. The hard-to-reach list

Everything marked ⚑ above, gathered — this is the copy most likely to be
wrong, because nobody has read it in place.

1. **The write gate** — the banner, its three fallbacks, the report button. Only with `SEVEN_FORCE_MISMATCH`.
2. **Backup failure** — the abort message and its partial setlist naming. Seen once, by accident.
3. **Transfer refusals** — every blocked-plan line, the missing-sound and missing-file cases, the recall failure.
4. **Mid-walk stop** — the loaded-but-not-confirmed sentence.
5. **Empty states** — three of them need an empty library, which no existing user has.
6. **Generating from a sound with no capture** — the factory-values warning and `Create anyway`.
7. **A missing patch file** — in a setlist slot, and in the delete-consequences dialog.
8. **`32+`** and its modal — needs two runs merged, which the run-id fix now prevents.
9. **`Partly installed`** and **`Installed, not in the catalogue`** — need a half-installed download, or a sound Crumar does not list.
10. **Losing edits** — four different sentences for four ways to lose them; all need an interrupted edit.
11. **Global write refusals** — need the instrument to reject a change.
12. **Every error in section 9.**
