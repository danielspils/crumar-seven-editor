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
| `Back up instrument` | app.js:3028 | Button, connected only |
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
- `Bank 1 holds the factory presets and cannot be written to.` — transfer-runner.js:105
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
- Bank region header: `On the Seven` + `as of last backup · 16 Aug` — app.js:1517
- `not yet backed up` — app.js:1518, before any backup exists

### Empty states

- `No patches match the search.` — library-view.js:287
- `Patches you save or import live here. Ones read off the Seven live under Backups.` — library-view.js:288 ⚑ only with an empty library
- `No backups yet. "Back up instrument" reads all 32 presets and writes down what the Seven held.` — library-view.js:551 ⚑
- `No setlists yet. A setlist is a bank's worth of patches — 8 slots — staged for a gig or a transfer.` — library-view.js:674 ⚑
- `No patches match "venice".` — library-view.js:815 (picker)
- `No instrument matches "venice".` — library-view.js:707 (picker, Instruments)
- `Not backed up` — app.js:1234, a bank slot with no record
- `Connect to a Crumar Seven and click the "Back up instrument" button.` — app.js:1280
- `Select a patch` — app.js:1281

### Badges and row tooltips

- Bank 1 tab lock (icon only, no label) — app.js, tooltip `Crumar reserves Bank 1 for its 8 models — they can not be overwritten.` Daniel's words, 2026-08-16, verbatim. It replaces the `Crumar preset` badge, which sat on all eight Bank 1 rows and no others.
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
- Toasts: `Connect the Seven to edit sounds` (audition.js:384) · `Connect the Seven to try another instrument` (app.js:686) · `Choose a preset to try an instrument on it` (app.js:693) · `Connect the Seven to choose a sound for a preset` (app.js:227)
- `Choosing an instrument sends it to this preset and plays it. Nothing is kept until you hold the button on the Seven.` — app.js:230

### Losing edits ⚑

- `Leave without saving?` + `…but they will not be saved to this computer.` + `Leave Without Saving` — audition.js:517–521
- `Left audition mode. Those edits were not saved to the library.` — audition.js:529
- `The Seven recalled a different preset — your unsaved edits are gone.` — audition.js:332
- `The Seven recalled a preset, so audition mode ended.` — audition.js:333
- `The Seven disconnected. These edits are still here — save them to keep them.` — audition.js:109
- `Save or discard your edits before previewing another patch` — audition.js:772
- `Could not make a copy` — audition.js:593, app.js:319

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
