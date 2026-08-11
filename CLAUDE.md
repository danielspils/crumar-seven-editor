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
docs/        manual-notes.md (stale v1.22 manual), protocol.md (v1.37 spec)
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
- **Parameter "defaults" in the UI are a heuristic, not device truth.** The schema
  stores no per-parameter default (the `0x15` `value` field was current state, not
  factory state). The UI's muted-at-default display uses `min(64, max)` from
  `src/defaults.js` — the single place to change when real factory defaults are
  captured from the device. Capturing them is an open item.

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
2. **Live editing core** (added ahead of Transfer, agreed 2026-08-09): detail
   controls become interactive while connected — each drag/toggle sends its
   `0x20`, with read-back, a dirty marker, and "Save to library". This closes
   the loop: edit live → save → audition → panel-hold to store.
3. **Task 10 — Sound selection UI**, fed by the live sound table.
4. **Task 9 — Transfer**: walk a setlist's slots, loading each and prompting
   the three-second panel hold. Bank 1 blocked outright.
5. **A/B compare and undo** — edit-buffer snapshots; the two things the
   manufacturer's editor lacks.

**Storing is always a physical three-second panel hold** — no store opcode
exists. The UI says so plainly rather than pretending to work around it.
