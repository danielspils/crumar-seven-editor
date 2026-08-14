# Crumar Seven Editor

Cross-platform desktop editor for the **Crumar Seven**, a physical-modeling stage
piano. The Seven exposes its full parameter set over class-compliant USB-MIDI
SysEx. There is **no published protocol spec** — this project reverse-engineered
the protocol by interrogating the device directly. The instrument turned out to
be self-describing (ASCII payloads), so it describes its own parameter set.

Cross-platform desktop app (Electron, macOS + Windows). Plain JavaScript.
MIT-licensed and public.

---

## What the app is for

Crumar's own editor works but is bare-bones. This project exists to give the Seven
better UX around four things the stock editor doesn't do well:

- **Backup** — patches survive hardware failure. Today the only path is a thumb
  drive and 24 manual exports.
- **Transfer** — load your patches onto a *different* Seven (e.g. a rented
  instrument on tour).
- **Editing** — a genuinely pleasant editor. Crumar's is one page at a time, with
  no A/B comparison and no undo.
- **Visibility** — show which sample expansions are installed, and flag when a
  patch needs one the unit lacks.

Two hardware realities shape all four features:

- **Sound IDs are not portable.** A patch using "Venice Grand CB1898" is sound ID
  18 on one unit; a Seven with different expansions has a different list entirely.
  The patch format therefore stores the sound **name** and resolves it on import,
  **warning when the target instrument lacks it**. Never persist a bare sound ID as
  a patch's identity (see `soundsNote` in the schema).
- **Storing a preset needs a physical three-second button hold.** The app can load
  a patch into the edit buffer over USB, but the user finishes the save on the
  panel. The UI must **say this plainly** rather than pretend to work around it.

---

## Hard project rules

These are non-negotiable. They exist because we are documenting an undocumented
protocol on hardware whose behavior we can only observe, not look up. Violating
them silently corrupts the ground truth this whole project is built on.

### 1. Target firmware is v1.37 (2022-05-16)

v1.37 is the current release. The newest published **manual documents v1.22**.
Treat **all documentation as stale and unverified** — the manual, forum posts,
web-editor labels, everything. Documentation may suggest what to look for in a
capture; it may never stand in for one.

### 2. Protocol facts come from the device: `docs/protocol.md` and `schema/seven-1.37.json`

Both files were derived from **live device interrogation on FW 1.37** — a
stronger source than inference from captures, because the instrument describes
itself. They are the authority on the protocol and the parameter map.

`captures/` stays for future recordings but is **legitimately empty and is no
longer a precondition** for a protocol fact.

The spirit of the rule is unchanged: **anything not demonstrated by the device
is marked `UNKNOWN` and never guessed.** "Probably", "likely by analogy", and
"the manual implies" are not evidence. Both files already use this convention —
`valuesUnverified`, `ccUnverified`, `orderUnverified` flags, plus an open-items
list in `docs/protocol.md`. Preserve those flags; clear one only when the device
demonstrates the answer, and never invent a fact to fill a gap.

### 3. No code from the manufacturer's web editor

**Never copy code from gsidsp.com** (the manufacturer's web editor) or any other
proprietary source. Protocol *observations* — what bytes go over the wire — are
fine to record. Their *implementation* is not ours to take. This repo is
MIT-licensed and public, and must stay clean.

### 4. Every schema entry is version-gated

Assume the parameter map **will differ across firmware versions**, even though
v1.37 has been stable for four years. Every entry in `schema/` is tagged with the
firmware version it was observed under. Never assume a v1.37 observation holds for
any other version, or vice versa.

### 5. Raw hex is never deleted or replaced by a decoded interpretation

Raw captured bytes are immutable ground truth. **A decoded/interpreted view never
overwrites the raw hex** — decoded views live *alongside* the raw bytes, never in
place of them. If a decode is later found wrong, the raw bytes are still there to
re-decode. Preserve the raw, always.

### 6. The globals reply leaks a plaintext secret — redact `wfp`, never commit it

The globals reply (`0x33`) includes **`wfp`, the instrument's Wi-Fi password in
plaintext**. Any logger, capture writer, error reporter, or crash handler **must
redact `wfp`**, and a **raw globals dump must never be committed** to this public
repo. Redaction lives in code; `.gitignore` is only a backstop. When in doubt,
mask it.

---

## Layout

```
docs/        DEVICE.md (manufacturer docs, not evidence), protocol.md (v1.37 spec)
captures/    raw MIDI logs (ground truth, committed) — pc-recall/pc-receive sessions
schema/      seven-<firmware>.json — version-gated parameter maps
tools/       capture-hook.js, probe.js, listen.js (passive wfp-redacting recorder)
assets/      seven-panel.svg — panel artwork, inlined into the DOM for id access
fixtures/    generate.js + sample-library.json — DEMO data only, never evidence
src/         Electron app: main.js, preload.js (the data-source swap point),
             index.html, app.js, renderer.js (pure view), defaults.js
```

Two fences on the new code, in the spirit of Rule 2:

- **`fixtures/` is never evidence.** `sample-library.json` is generated demo data
  (regenerate with `npm run fixtures`); nothing in it demonstrates anything about
  the device.
- **Parameter defaults now come from the device, per sound** (2026-08-13). The
  schema still stores no default (the `0x15` `value` field was current state, not
  factory state), but **Bank 1 cannot be stored to**, so its eight presets are
  what shipped — the only readable factory numbers on the instrument.
  `tools/extract-factory-defaults.js` derives `schema/factory-defaults-1.37.json`
  from the newest complete Bank 1 backup (eight sounds, 110 params each, every
  modeled engine). Two rules hold: **coverage is partial and stays that way** —
  for a sound Bank 1 lacks, `defaultFor` returns `null` and the row renders
  normally rather than claiming to be stock — and **a factory preset is not a
  neutral default**; these are the positions the factory chose per sound, which
  answers "did I change this?" and nothing more. The old `min(64, max)` guess
  survives only as `seedValue` for `fixtures/`, and is not a default.

## Status

The protocol is **known**: `docs/protocol.md` and `schema/seven-1.37.json` document
FW 1.37 from live interrogation — frame format, 26 opcodes, 110 parameters, 24
sounds, globals. `0x20` set-parameter and `0x30` set-global are verified. **All
four of the prober's open items are closed** — the last (enum labels) fell on
2026-08-09: the `0x23` reply's 4th field is the device's own display string, so
a value sweep harvested every enum/switch label from the instrument itself
(`captures/enum-label-sweep-2026-08-09-notes.md`; labels now in the schema with
no `valuesUnverified` flags left, including corrections — the Clavi pickup
switches were inverted). Other gaps stay flagged `UNKNOWN` in place (see the
open-items list in `docs/protocol.md`).

The app runs against the real instrument (`npm start`). Two labelled regions:
"On the Seven" — four bank tabs whose slots render the newest **backup** patch
claiming each slot (never fixtures), headed by an honesty label ("as of last
backup · <date>") because the Seven has no read-slot opcode; un-backed-up slots
say so plainly. "On this computer" — the on-disk library with setlists. Plus
the panel strip (inlined SVG, addressable ids), a live connection row, and a
two-column detail view (engine group + effects chain, switch-driven dimming,
default-muted values, FX2-conditional sub-params). **Fixtures no longer reach
the renderer** — `getLibrary` is gone from preload; fixture data only seeds a
first-run demo library in the main process. Dev note: Electron must be ≥ a
current major — macOS XProtect flags outdated Electron binaries as malware and
trashes them (this bit us on v31; fixed on v43).

Panel-strip artwork is drawn from hardware photos (2026-08-09): translucent
fluted knobs lit from beneath, glowing with the instrument's **value-encoding**
(green at low → red at high; DESIGN.md), buttons with raised bottom caps and
pyramid-slanted sides, chrome frame, and a brushed-aluminum connection row
edged in keybed-felt red. Two SVG traps are documented in the file itself: CSS
comments inside `<style>` must not contain angle brackets (markup parsing
truncates the stylesheet), and class rules can't cross a `use`-element shadow
boundary — knob state rides on custom properties and inline styles instead.

**The patch file format is built and in use** (docs/FORMAT.md + src/format/,
tested via `npm test`) — .sevenlib.json, one container for everything, params
keyed by schema key, sound NAME authoritative, per-patch provenance, wfp
serializer guard, non-mutating parse. Every backup patch is one of these files.

**The hardware session of 2026-08-09 closed nearly every protocol question**:
the Seven recalls on incoming Program Change (0-based global slots, all four
banks); every recall broadcasts an unsolicited `0x45` + the 22 fixed panel CCs;
the edit buffer follows the recall (read-back verified) — **backup can be
fully unattended**. With the Send PC global ON (glb index 3, pinned by a
captured write), panel recalls also emit `Cn <slot>` — slot-identified
hardware following. `0x70` STRING and `0x72` ACTION were observed passively
(string 4 = firmware string; ACTION 0x0A = storage query); ACTION's write
space stays observe-only, always. The USB editor's own sync is plain 0x22
sweeps — our backup read pattern is the reference behavior. See protocol.md;
raw evidence in `captures/`; recorder is `tools/listen.js`, browser tap in
`tools/capture-hook.js`. **`0x46` set-sound was captured 2026-08-09 — every
named opcode has now been observed**: one binary byte, confirmed by `0x45` +
a `0x47` name reply, no CC burst, and engine params survive the change
(read-back verified) — Transfer/audition can send sound-then-params.
**Real MIDI is in the app** (`src/seven-midi.js`, main process; renderer talks
through the `sevenAPI.midi` seam in preload): mandatory STRING-4 liveness probe
(500ms, one reopen retry, hard fail — the wedge defence), wfp redacted in the
parse layer (raw `0x33` frames never leave `_onMessage`), glb-3 pending-restore
marker written to userData BEFORE any Send PC change (restored on disconnect
and on next connect after a dead session), persistent `0x45`/`0x47`/PC
listener, per-connection sound table (24 sounds, fingerprint + date) read via
per-id `0x42` enumeration. Reply matchers validate echoed ids — macOS delivers
device replies to every client on the port, so opcode-only matching can be
satisfied by the manufacturer editor's traffic. Live-tested end-to-end
(connect 380ms; Connect/Disconnect wired in the connection row).
**Backup works end-to-end** (`src/backup-runner.js`): confirm-every-run
dialog stating where the instrument is left; PC 0..31 each gated on the
unsolicited `0x45` (1500ms timeout aborts the whole run — never skip a slot);
110 verified `0x22` reads per slot with two re-requests for dropped replies
(the device drops the odd reply under a fast burst); dedupe by
hash(sound+params) per slot; four dated setlists (same-day re-run replaces,
cancel/abort labels them "(partial)"); record-only globals snapshot
(`globals-YYYY-MM-DD.json`, wfp redacted upstream); working Cancel that
finishes the slot in flight; prior-slot restore when Send PC is on (the
device echoes received PCs, so the runner knows the prior slot). First real
run: **32/32 in 48s** (~3,600 round trips); re-run 47s, "32 unchanged, 0
new"; cancel verified at 13/32. **Expansion visibility is done** (the
Visibility goal): the connection row's "24 sounds" chip opens the connected
unit's own sound table — modeled and GSP-01 sampled columns with unit-specific
ids, plus the table fingerprint and read time that backups reference.
Daniel's own 32 presets are backed up and the seeded demo patches were
trashed — the library is real data only.

## How to check your work

Two suites and a way to drive the real app. **Use them before reporting
anything as working** — most of the mistakes this project has produced were
confident reasoning about code that a ten-second measurement would have
contradicted.

```
npm test          # unit suites (node:test)
npm run test:ui   # scenarios in test/ui/scenarios/, driving a real window
npm start         # the app; keep an instance running while working
```

**`SEVEN_UI_TEST=<file.js> npm start` runs a script inside the running
renderer and prints what it found.** This is the important one. It is how a
layout question gets an answer instead of an opinion:

```js
// /tmp/probe.js — then: SEVEN_UI_TEST=/tmp/probe.js npm start
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };
  await ui.openLibrary();
  const bar = document.querySelector('.params .param .param-bar');
  ui.note('bar left ' + Math.round(bar.getBoundingClientRect().left));
})()
```

`ui` gives you `$`, `$$`, `sleep`, `note`, `check`, `waitFor`, `waitEl`,
`click`, `openLibrary`, `selectBankPreset`, `requireDevice` (see
`test/ui/harness.js`). The window is real, so `getBoundingClientRect`,
`getComputedStyle`, `getAnimations` and friends all work.

Some habits that this project earned the hard way:

- **Measure, don't eyeball.** "It lines up" is worth nothing; "626 = 626" is
  evidence. Alignment, animation timing, and anything about a scroll or a
  fade all have numbers you can read.
- **Reproduce before fixing.** A fix for a bug you never observed usually
  fixes something that was not broken, and hides the one that was.
- **A failing check is not automatically the code's fault.** A bad regex or a
  wrong test fixture has faked both a pass and a failure here.
- **Say what you verified.** Distinguish "measured", "tested", and "believe".

## Next

Two of the four goals are live (Backup, Visibility). The remaining arc is
**editing and sending**, in this order — every protocol primitive it needs is
already verified, so this is app work, not reverse-engineering:

1. ~~**Task 8 — Audition.**~~ **DONE.** `src/patch-sender.js` sends a patch to
   the edit buffer: sound first (`0x46`), then every parameter (`0x20`), each
   write verified against the `0x23` the device echoes back. The sound is
   resolved by NAME against the connected unit's own table and the send is
   REFUSED if that unit lacks it — a guessed id would load the wrong sound
   silently. Values are clamped to the schema max, dropped replies retried
   three times, and a value the device wouldn't take is reported rather than
   ignored. A patch with no params is legal: that's the "sound only" case.
   Nothing is stored — the UI says the panel hold is the only way to keep it.
   Covered by `test/patch-sender.test.js` against a fake instrument (9 tests).
2. ~~**Live editing core**~~ **DONE.** Detail controls are interactive while a
   patch is LIVE — and a patch is live only after an Audition, because that is
   the one moment the app knows the edit buffer holds what is on screen.
   Editing anything else would change whatever the Seven happens to be
   playing. Each bar drag, tab press, segment click and dropdown change sends
   one `0x20` and stores the value the device ECHOED, so the panel shows what
   the instrument did rather than what was asked. Drags coalesce (one write in
   flight, latest value queued). Disconnecting ends the session but never
   discards unsaved edits: the bar stays with a Save button. "Save to library"
   writes the working copy back to the patch file and moves both `captured`
   and `verified` to now — those values came back from the instrument itself.
   Verified on hardware 2026-08-11: `rho_atk` 64 → 32 echoed, 41 live rows,
   0 after disconnect.
3. ~~**Task 10 — Sound selection UI**~~ **DONE.** The instrument picture is a
   carousel: turn it, and the sound engine's heading follows the centre —
   muted while it is only a candidate, solid once the instrument holds it.
   Choosing sends `0x46` and drops straight into playing it. It NEVER
   rewrites a file; five of Daniel's backup records were silently renamed by
   what he thought was auditioning (2026-08-12), and a file is edited by
   asking to edit it.
4. ~~**Task 9 — Transfer**~~ **DONE.** Walks a setlist's slots, pre-selecting
   the bank so a three-second hold cannot land in the wrong one, and
   auto-advancing: a store announces nothing of its own, but the recall burst
   after it carries what was just written, so a changed fingerprint is the
   store. Bank 1 blocked outright — and that matches the hardware: the Seven does not accept a store into Bank 1 at all (owner-confirmed 2026-08-13). Auditioning a sound there is still allowed, since it stores nothing.
5. **A/B compare and undo** — edit-buffer snapshots; the two things the
   manufacturer's editor lacks. Undo exists for library acts; the edit-buffer
   half is what's left.

### Smaller things still open

Kept here because they otherwise live only in a chat that ends.

- **Connect → open to the active patch.** Connecting leaves you on whatever
  was last selected rather than what the Seven is actually playing. A first
  attempt was reverted (2026-08-13) because it recalled without ending the
  live session first, which discarded edits silently. Any second attempt has
  to end the session before it moves the instrument.
- **~5px jump at the start of the tray swap.** `#split-divider` flips
  `display` and sits outside `#bank-region`, so it steps rather than sliding
  with everything else. Folding it into the region would fix it, at the cost
  of putting a drag handle inside the thing it resizes.
- **Do the sample player's parameters do anything?** Whether "Piano Harp",
  "Rel. Smp. Level" and "Ped. Smp. Level" bite on a given sample set is
  unknown, and the v1.22 manual does not cover it (Rule 1). A sweep of each
  of the eight `pno_rom` parameters to its extremes, reading back the `0x23`
  echo, would at least separate "the write is refused" from "it takes and
  you cannot hear it" — which is a real answer either way, and the only kind
  this project accepts.

### There are no modes (settled 2026-08-12)

Audition mode is gone as a concept, not renamed. A patch is live the moment it
is selected, because selecting it loads it — so the controls are always live
and there is no state to explain. What replaced the mode is one rule about
consequences: **navigating away discards.** No prompt, no rescue, and the
library file is left exactly as it was; in exchange the instrument goes back to
playing whatever is on screen. The only visible state is a dot and a Save
button once something has actually changed.

Daniel lived with it and confirmed it (2026-08-12). Two softenings were
deliberately deferred and stay deferred until they bite: a warning before
discarding, and a "Load sound" button for library patches.

**Storing is always a physical three-second panel hold** — no store opcode
exists. The UI says so plainly rather than pretending to work around it.
