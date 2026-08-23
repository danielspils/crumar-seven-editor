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

- **Sound IDs are not portable, and they are not stable either.** A patch using
  "Venice Grand CB1898" is sound ID 18 on one unit; a Seven with different
  expansions has a different list entirely. **And the same unit renumbers
  itself**: installing Venice Grand C5 on 2026-08-20 moved CB1898 from 18 to 19
  and Venice Upright U1/Felt from [22, 23] to [25, 26], because the table is
  alphabetical and an insert shifts everything after it. So an id is not even a
  durable reference to a sound on the instrument you read it from — a backup
  taken this morning names ids that this afternoon's install has already
  reassigned. The patch format therefore stores the sound **name** and resolves
  it on import, **warning when the target instrument lacks it**. Never persist a
  bare sound ID as a patch's identity (see `soundsNote` in the schema).
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

### 6. This app stores no credentials, of any kind, from any source

Not "redact `wfp`". **The class, not the field name.** A password, a key, a
token or a passphrase does not get written to a file, a log, a capture, an
error report or a crash handler, whatever it is called and wherever it came
from. A raw globals dump is never committed to this public repo.

The rule was "always redact `wfp`" until 2026-08-17, and that is exactly what
the semicolon bug walked past. The `0x33` reply is split on `;`, so a Wi-Fi
password *containing* a semicolon broke into a second pair — `wfp=pass;word=secret`
— and the parser's catch-all kept `secret` under a key nobody was watching,
into a snapshot on disk. Every named-field defence was working perfectly. The
field name was never the thing worth defending.

What follows from the class rule:

- **Unknown keys in a `0x33` reply are dropped, not kept** — the value is
  discarded and only the KEY is logged, because a fragment of a password is
  exactly what an unrecognised value might be (`parseGlobals`).
- **A secret that is already on disk gets cleaned up**, not just prevented
  going forward (`src/globals-cleanup.js`).
- **Redaction lives in code**, at the parse layer, so nothing downstream has
  to remember. `.gitignore` is only a backstop.
- When in doubt, mask it. A masked field can be un-masked in the next build; a
  leaked one is in somebody's bug report forever.

**The instrument volunteers this.** The Seven returns its Wi-Fi password, in
the clear, in the ordinary globals reply — unprompted, to anyone on the USB
port. The app never asks for it, never keeps it, and never displays it. That
is the instrument's behaviour, not something this app introduced, and it is
documented in `docs/protocol.md` because someone reading the protocol layer
needs to know before they write a logger.

---

## Layout

```
docs/        DEVICE.md (manufacturer docs, not evidence), protocol.md (v1.37 spec),
             FEEDBACK.md — one entry per user report, with what it CONFIRMS on
             hardware that is not ours kept separate from what it ASKS FOR
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

## Cataloguing an expansion you do not own

`data/expansions.json` needs the names the INSTRUMENT reports for each sample
set. Those names are what matching runs on, and getting one wrong lists a sound
twice — once as "Installed, not in the catalogue" and once as "Unverified" —
which is what a real user hit in 2026-08-19 for the three sets Daniel had not
installed.

**The expansions are FREE DOWNLOADS from Crumar, not purchases.** Each README
says so in its own first line ("This free wavetable expansion for the Crumar
Seven"). "Available" in the Sounds header means a set this instrument does not
have, not a shopping list.

**So never describe one as bought, purchased, sold or paid for** — in UI copy,
comments, docs or release notes. A future session reads those as fact and
repeats them to users, which misrepresents Crumar. Say downloaded, installed,
or owned. ("Available" is accurate and stays.)

**The name is in the README PDF's page footer.** Every package ships one, and
every page of it carries:

```
Crumar Seven – <DEVICE NAME> - Page N/2
```

The text is stored as subset-font glyph ids, so it needs decoding through the
PDF's ToUnicode CMap — `strings` and Preview's copy-paste both give nothing
useful.

**Two sources that look right and are wrong. Never use either:**

- **The download title on Crumar's page.** It says "Electric Grand 70BXL"; the
  instrument says "Electric Grand 70B XL". It says "Venice upright U1/Felt";
  the instrument says "Venice Upright U1 Felt".
- **The filename.** `VeniceGrandC5.7ex` is unspaced and is not what anything
  displays.

**The `.7ex` payload is opaque.** Encrypted or compressed, high entropy from
byte 0, no header or magic. A search of all 196 MB of one package found zero
occurrences of its own name in ASCII or UTF-16. Do not go looking again.

**One package can supply several sounds**, so a catalogue entry holds a LIST.
`Venice Upright U1/Felt` is the only multi-sound download known — it gives
"Venice Upright U1 Felt" and "Venice Upright U1" — and every other README
describes a single piano.

**Hit rate: 4 for 4, AND THAT IS THE WHOLE SAMPLE** (2026-08-20). Venice Grand
CB1898 was the control, its footer matching a name already known from the
instrument. The other three — Venice Grand C5, Venice Grand CFX, Venice Upright
K8 — were predicted from their footers in writing BEFORE installation and then
confirmed exactly, character for character, against the sound table.

**All four are expansions Daniel owns. The method is unvalidated on any set
nobody here has — which is the only kind it exists for.**

**THE 70BXL CASE IS UNCONFIRMED, and it is the one most likely to break the
method.** Nobody here owns it, so its footer has never been compared against a
device reading, and it cannot be until somebody who has it reports one. It is
also the set with the worst naming record: three published spellings
("Electric Grand 70BXL" on Crumar's download page, "Electric Grand 70 BXL" on
GSi's, "Electric Grand 70B XL" on the instrument).

What IS settled about it is the naming, and only that: **"70BXL" means a
Yamaha CP-70B at full size.** The CP-80 is the 88-note version of the same
instrument and is sonically identical, so XL is a cabinet distinction rather
than a sound one. That resolves what the name refers to. **It does not resolve
the footer-versus-device question**, which is the thing the method actually
claims — whether the string in the PDF footer is character-for-character what
the instrument reports.

So: four checked, one reasoned about. Do not restate this as "generally
reliable". A reader six months from now needs to be able to tell which cases
were verified against hardware and which were inferred, and that distinction is
the only reason this paragraph exists.

**The instrument still outranks the footer.** Where someone owns the expansion,
read the names off their unit and record that as the source; the footer is for
sets nobody here has. The three added on 2026-08-20 are device-sourced for
exactly this reason, even though the footers had already predicted them.

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
the renderer** — `getLibrary` is gone from preload — and as of 2026-08-17 they
do not seed a library either: a new library is EMPTY (see "1.0 shipped demo
patches"). Dev note: Electron must be ≥ a
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

**There is one panel drawing** (2026-08-22). `src/panel-mini.js` was a second
SVG, built in JS with its own coordinates and its own flatter caps, and it
spent eleven days missing the BANK button because nothing compared the two
copies. Both the destination chooser and the transfer walk's hold screen now
come out of `assets/seven-panel.svg` through `src/modal-panel.js`, cropped by
viewBox and prefixed so 65 ids can live in the same document as the dashboard's.
A control added to the instrument's drawing appears on every view of it without
anyone remembering to. Its 100-line `playSave` — an animation of the store,
with its own CSS — went with it, having never had a caller: the same
zero-consumer shape as the Notes strip, found by the same one-line grep.

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
**The app asks the instrument whether it knows it** (2026-08-14). Connect reads
the device's OWN parameter table — `0x10` for the count, then `0x14` per id —
and compares count, ids and keys against `schema/seven-1.37.json`. It does not
compare the firmware string: a version number is a proxy, and this instrument
describes itself, which is how the schema was built in the first place. A match
proceeds silently. A mismatch, or a table that could not be read completely,
**blocks every write addressed by a schema parameter id** (`0x20`: audition,
live edits, transfer, factory-defaults seeding) at the seam in
`setParamValue`, and says exactly what differs — "this instrument reports 104
parameters; the app knows 110". Reads stay fully open, and so do writes
addressed by an identity the DEVICE gave us (`0x46` by resolved name, Program
Change). The rule is whose ID space a write uses, not reads versus writes:
reading a wrong id yields a wrong number in a file we can re-read; writing one
alters a stranger's instrument on an assumption we never checked
(`src/param-compat.js`). Backup now takes its parameter count and key order
from that table rather than a hardcoded 110.

When the gate is closed, the banner offers **"Report this instrument"**
(`src/instrument-report.js`): it saves the device's own description — the
firmware string, the sound table, and the WHOLE `0x15` parameter line for
every id (`id | group | key | label | cc | max | value | flag`) — reveals the
file, and opens the app repo's issue page. Every field is kept because the
point of the report is to be enough to write `schema/seven-<firmware>.json`
for a firmware nobody here has, and group/cc/flag are half of a schema entry;
`value` is the value at read time, never a factory default. **What the report
diagnoses is stated inside it**: a FIRMWARE whose parameter set differs from
this build's schema — not the instrument's OS, and not which expansions are
installed, since expansions change the SOUND table and sounds are already
resolved against the connected unit's own list. It takes no globals argument
at all, so Rule 6 cannot be violated by forgetting to mask something.

**Sample expansions** (`data/expansions.json` + `src/expansions.js`): a
read-only modal listing what EXISTS (Crumar's published catalogue — titles,
dates, ZIP download sizes, labelled as such) against what is INSTALLED (the
connected unit's sound table, which wins). Three groups on the device's id
ranges: modeled 0–7, included samples 8–15, expansions 16+. Matching is by the
names the DEVICE reports, not the download titles — the page says "Electric
Grand 70BXL", the instrument says "Electric Grand 70B XL". Expansions nobody
here owns carry `sounds: null` and read UNVERIFIED, never missing. Storage is
one verbatim line, since ACTION `0x0A` returns a figure it does not label.
Offline it opens with the catalogue and no installed/missing state at all.
**Verified against the instrument 2026-08-15**: 8 modeled, 8 included, 7
installed, 3 unverified, nothing unaccounted for, storage read as "4.0GB" over
the wire.

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

## 1.0.0 shipped (2026-08-17)

Public, signed, notarized, auto-updating:
**github.com/danielspils/crumar-seven-editor/releases/tag/v1.0.0**, linked from
thissevengoestoeleven.com. First outside downloads arrived the same day.

**Packaging** (`electron-builder.yml`, in YAML so every non-obvious line can
carry a comment). macOS universal dmg + zip, Windows NSIS x64. Four things
that cost time and are written down where they bit:

- **Windows signing does NOT use `azureSignOptions`.** electron-builder's
  built-in Azure path runs `Install-Module` inside a captured-pipe PowerShell
  and deadlocks on GitHub runners — three JP Patches runs died that way.
  `scripts/win-sign.js` calls `Invoke-TrustedSigning` directly. `publisherName`
  lives INSIDE `signtoolOptions` in electron-builder 26.
- **The DMG needs its own signature, notarization and staple.** 1.0.0's first
  attempt shipped a perfect app inside a disk image Gatekeeper rejected
  outright. `scripts/staple-dmg.js` does it and then ASKS Gatekeeper, failing
  the build if the answer is no — reading `spctl`'s verdict from **stderr**,
  which is where it writes.
- **Universal + native module.** macOS flags any x86_64-only Mach-O in the
  bundle. `@julusian/midi` ships single-arch copies under `bin/` and
  `prebuilds/` that NOTHING loads (`pkg-prebuilds` resolves build/Release
  first), so they are excluded in `mac.files`. `x64ArchFiles` is a trap: it
  makes the build pass by shipping exactly what macOS objects to.
- **One release per version, enforced.** Both platform jobs build with
  `--publish never` and upload artifacts; a final job creates ONE release from
  both after checking latest.yml, latest-mac.yml, the dmg, the mac zip and the
  exe are all present. Two concurrent publishers raced and produced FOUR
  drafts on one tag before this shape.

`files` is derived from what the app reads at runtime, not assumed —
`fixtures/sample-library.json` is the trap, since main.js reads it and a build
without it installs and then fails on first launch.

**The app is named "This Seven Goes to Eleven"** — `productName` in
package.json, which moves the userData folder. `migrateLegacyLibrary()` copies
an existing library across on first run, copy never move (verified on the real
62-file library).

**Auto-update** is JP's UX: silent launch check, background download, one
dialog when ready, silent apply on quit if declined, background failures
swallowed. Help ▸ Check for Updates is the only path that ever speaks.

**The icon** is the panel's own encoder: `#knob-glass` and `#pwr-icon` lifted
from `assets/seven-panel.svg`, lit green by app.js's own `updateKnobLit()`
values at hue 120, with SEVEN and 11 in the panel's label face converted to
outlines. TWO drawings — below 128px the words are dropped and the tile goes
to the knob, because at 32px lettering is grey noise. Rebuild with
`python3 tools/build-icons.py`. A double hyphen inside an XML comment is
illegal and made the whole SVG fail to decode as an image; the comments there
say so.

## 1.0 shipped demo patches, and that was the worst bug of the day

A new library arrived holding 32 fixture patches and a five-slot "Stage
Setlist (demo)". **Measured against the real transfer runner**: a new owner who
had backed up nothing could send "Sunset Rhodes" to Bank 2 Preset 1 — one
sound change, 110 parameter writes — and be told by the app to hold the preset
for three seconds, storing fiction over a preset they had no copy of. Two of
the 32 named sounds no Seven has ever had ("Steinway D Berlin", "Fazioli
F308"), and **the first user report of 1.0.0** was somebody hunting Crumar's
site for a download that cannot exist.

Three changes came out of it:

1. **Nothing is seeded.** A new library is empty and lands on the Backups
   tab's own empty state, which already said what to do. `SEVEN_SEED_DEMO=1`
   brings the fixtures back for screenshots.
2. **`src/demo-cleanup.js` removes them on update**, once per install, for
   everyone — told, not asked, with a one-time notice carrying the REAL count.
   Only EXACT matches against the shipped fixture go: edit a value, rename it,
   or put it in a setlist of your own and it stays. Removal goes through the
   Trash. A library that cannot be read is left alone.
3. **The flat Patches list warns again.** It suppressed the whole badge to be
   rid of the Model/Sample pill and took "⚠ Not installed" with it — so a
   patch this instrument cannot play looked ordinary, and selecting it
   appeared to do nothing. That is precisely what the user reported.

## Interrupted writes (2026-08-17)

Every write in `library-store.js` goes through `writeAtomic` — temp file,
fsync, rename. A plain `writeFileSync` truncates first, and `setlists.json`
holds EVERY setlist in one file: truncated, it read back as zero setlists
where there had been one, silently. Patch files survived only because they are
one file each. `patch-order.json` had the same shape.

## Two conventions for a refused write, and which one is the target (2026-08-18)

A main-process handler that either does the thing or doesn't answers in one of
two shapes, and the app currently uses both. **The target is THROWING**, via
`throwIfRefused` in `src/ipc-result.js`, applied at the preload seam.

The reason is not taste. `{ ok: false, error }` is a union whose success half
is a bare value — `rename` answers with a filename — so **the failure half is
a perfectly truthy result that reads as success**, and every caller that
forgets to check proceeds on it. Four of the five name-carrying call sites
forgot. The one that cost something was the undo of a rename: the store
refused, the renderer stored `{ ok: false, … }` as if it were a filename, the
undo closure returned normally, and the toast said **"Undid: rename to …"**
while nothing had happened. A thrown error is the only shape a caller cannot
ignore by accident — forget it and the action stops loudly.

- **`library.rename` throws.** So does anything added from here.
- **`library.duplicate` still returns the union** and is the next to move. Its
  one refusable call site checks, but says nothing when refused — a refused
  duplicate is indistinguishable from a cancelled one.
- **`library.generateFromSound` returns `{ ok: true, … }` / `{ ok: false, error }`**
  and is the one place that handles its own union correctly (`app.js`, checks
  `made.ok`, toasts `made.error`). It should migrate when it is next touched,
  and it is not urgent precisely because it is handled. **The thing to avoid is
  a THIRD shape**, not the second one sitting there correctly used.
- **A CANCELLATION IS NOT A REFUSAL.** `{ ok: false, cancelled: true }` is a
  file dialog saying somebody pressed Cancel. `throwIfRefused` passes it
  through — an error in front of a person who chose not to do something is
  worse than no message at all.

**`contextBridge` strips custom properties off a thrown Error.** Measured, not
assumed: `err.code` arrives `undefined` in the renderer with no own keys at
all, even though the seam sets it. Only `message` survives. So the message has
to carry the meaning — a renderer cannot branch on an error code from the main
process, and code that looks like it does is dead. The store's own sentence
("There's already a patch called “Alpha”.") is what the user ends up reading,
which is a reason to write those sentences for a person rather than for a log.

## A feature that was never wired up, and looked shipped for ten days (2026-08-20)

The Notes strip — a one-line pointer at the newest post on the website — did not
appear when a post went live. The reason was not the feed, the cache, or the
parse. **Nothing in the renderer ever called it.**

`ipcMain.handle('notes:latest')` and `sevenAPI.notes.latest` both existed and
both worked; running the handler's own regexes against the live feed returned
the right title and URL. There was simply no consumer, and there never had
been — `git log --all -S "sevenAPI.notes" -- src/app.js` is empty, so no
renderer half was lost in a merge. It was absent from the v1.3.0 tag too.

**Two things made it invisible for ten days:**

1. **The plumbing arrived as a side-carry.** It went in on 2026-08-10 in
   `8c40831` — *"Modeled reads blue, Sampled green"* — a commit about badge
   colours that also touched `main.js`, `preload.js` and `index.html`. Nobody
   returns to a badge commit to check whether its unrelated passenger got
   connected. **A capability added inside a commit about something else is a
   capability nobody remembers to finish.** Land plumbing in its own commit,
   with its consumer, or not yet.
2. **THE TELL IS A PRELOAD SURFACE WITH ZERO CALLERS.** `sevenAPI.notes.latest`
   was exposed, documented, and called from nowhere — and that is greppable in
   one line. Anything on `sevenAPI` that nothing calls is either dead or
   unfinished, and both are worth knowing:

   ```
   grep -c "sevenAPI\.<name>" src/*.js       # 0 means nobody is using it
   ```

**And the failure looked exactly like the idle state.** The strip is absent most
days because there is usually no new post, so "broken" and "nothing to say" were
one observable — the same shape as the Buttondown subscribe form and the
download report. Seven distinct paths all returned a bare `{ ok: false }`.

Every one of them now returns its own reason and logs it in the main process
(`[notes] no strip: …`) — never to the user, who opened the app to back up
presets and should not learn that a blog was unreachable. The parse lives in
`src/notes-feed.js` and the seen-state in `src/notes-seen.js`, both pure with
injected paths, so `npm test` can reach every refusal.

`SEVEN_RESET_NOTES` and `SEVEN_NOTES_DEBUG` are permanent, for the same reason
`SEVEN_RESET_DONATIONS` is: the state is one-directional, so without them the
feature can be seen exactly once per published post and no change to it could
be verified.

## A test that SKIPS on failure is worse than no test (2026-08-20)

The first version of `test/ui/scenarios/notes-strip.js` skipped whenever the
feed returned `{ ok: false }`. That meant **a 404, or a feed whose shape had
changed, would have gone green** — rebuilding precisely the property that let
the original bug hide, inside the test written to catch it. A skip reads as
"fine, not applicable" and nobody looks again.

Now only genuine unreachability skips:

```js
if (!latest.ok && /^feed unreachable/.test(latest.reason)) { note(); return; }
if (!latest.ok) { check(false, latest.reason); }   // everything else FAILS
```

**The general rule: a scenario may skip only for a precondition it cannot
control — no instrument attached, no network — and never for a result the
feature is responsible for.** When writing the skip, say which of the two it is.

**A DECLARATION THAT TURNS AN ASSERTION INTO SCENERY IS A DELETED TEST WEARING
SETUP'S CLOTHES.** Setup and sabotage look identical in a diff — both are a line
near the top of a test that changes the world it runs in — and only one of them
leaves the assertions meaning anything. The example that produced the rule:
`notes-strip.js` ends by asserting a dismissal was recorded, and
`SEVEN_NOTES_DEBUG` suspends exactly that check, so declaring it would have left
a green test asserting nothing at all. The runner REFUSES that flag by name
rather than trusting anyone to notice (`FORBIDDEN_ENV` in `test/ui/run.js`).
Before adding any setup line, ask which assertions it disarms.

**And a precondition a scenario CAN control, it arranges itself** (2026-08-21).
`notes-strip.js` dismisses the post it tests — the half most worth asserting,
since an unrecorded dismissal means the strip returns forever — and dismissal
is permanent. So it consumed the state it needed, passed exactly once, and
every run afterwards failed with "already dismissed · run with
SEVEN_RESET_NOTES=1". Correct, loud, and useless: CI never reads a failure and
re-runs, and neither does a person in a hurry.

A scenario now declares its launch state in its own source, and the runner
applies it:

```js
// @env SEVEN_RESET_NOTES=1
```

`SEVEN_`-prefixed names only, never inherited from the runner's own
environment — the state must be CHOSEN by the scenario and visible to anyone
reading it, not whatever the desk happens to have set. **`SEVEN_NOTES_DEBUG` is
refused by name**, because it suspends the seen check that scenario ends by
asserting: a declaration that turns a real assertion into scenery is a deleted
test wearing setup's clothes. A bad declaration fails that scenario alone
rather than crashing the run.

Related: prove a test fails for the reason you think. Deleting the consumer
reproduced the original bug and the scenario named it exactly ("the feed offered
X and nothing rendered — is the renderer half wired up?"). And an end-to-end
test cannot reach shapes the real world never serves: the mutation deleting the
title guard PASSED against the live feed, because the site always has titles.
That case only exists in `test/notes-feed.test.js`.

## A wrong conclusion recorded as settled (2026-08-20)

The arrow keys broke twice in two releases, and the second break was defended
by a comment written during the first fix.

The question is "which region do the arrows drive". It was answered by
`lastTouched`, a flag set when something was SELECTED — and both bugs were
states that set no selection. Each fix added a clause. 1.3.0's clause was never
true (opening a backup run is not selecting). 1.4.0's never reset (once a patch
had been clicked, left/right were swallowed for as long as the library stayed
open, and up/down kept driving the library's selection — AUDITIONING a
different patch on the instrument on every press — while the list on screen
never moved).

**A remembered flag cannot answer "where am I working now", because nothing
that happens on screen updates it.** Ownership of an input event is now derived
at press time from `document.activeElement.closest('#library, #bank-region')`
(`focusedRegion` in app.js). Focus is read from the DOM when the key is
pressed, and clicking anywhere else changes it — no clause to forget.

REGION level, not row: the lists re-render on every refresh, which destroys
focus on a child, so a row-level answer goes ambiguous immediately after each
refresh. The container survives its children being replaced. And a CLOSED
library owns nothing, also derived — `#library-head` is inside `#library`, so
the click that collapses the tray leaves focus in a region with nothing on
screen to drive.

`lastTouched` still exists and is still correct for the detail panel: both
regions hold a selection at once, the panel must show one, and "the thing you
last chose" genuinely is not derivable from the screen. **It must never again
decide who owns an input event**, and its declaration says so.

**The part worth more than the fix.** During the first fix, a measurement
established that with the library open the only reachable thing in
`#bank-region` is the collapsed strip, and that clicking it closes the library.
The measurement was right. The conclusion drawn from it — "so no gesture
reaches the bank region while a library list is live" — was wrong: a backup run
left open BEHIND the closed tray still answered both arrow axes. That
conclusion was written into a test file as settled, and a listener was deleted
on the strength of it.

**A wrong conclusion recorded as settled is worse than no comment, because it
stops the next person from looking.** A comment may record what was MEASURED
freely. When it records what was INFERRED from the measurement, say so, and say
what would falsify it.

Two scenarios now, because the two ways back to On the Seven are two different
DOM states: `arrow-ownership.js` closes the library, `arrow-ownership-open.js`
leaves a backup run open behind it and reproduces Daniel's gesture from the
release. The first passed green through the whole of the second bug.

## CURRENT STATE MUST NOT STAND IN FOR RECORDED FACT (2026-08-21)

A rule, not a note — it is the single root of every bug found in the sweep of
2026-08-20/21, and of the user reports that started it.

**The schema is not the instrument. Today's connection is not the connection a
file was made on. When something cannot be known, record its ABSENCE rather
than filling the gap with what happens to be in front of you.**

Where it had already gone wrong, in order of how permanent the damage was:

- **A copy rebuilt its provenance from the current connection.** Duplicating a
  patch while disconnected replaced the originating instrument with the
  schema's, producing a file whose own `soundList` lacked the sound the patch is
  made of. Measured: a Venice Grand CFX patch became a copy that resolved its
  own sound as `unavailable`.
- **A patch made offline named a phantom instrument** — the schema's 24 sounds
  and firmware `"1.37"` recorded as the unit it came from, when there was no
  unit. On an owner with expansions it is flatly false; their Seven reports 27.
- **A copy inherited the original's creation date**, so a patch made seconds ago
  read "Created 40 days ago". The correct value was in the same file one level
  up the whole time.
- **"⚠ Not installed" offline** compared a patch's sound against the SCHEMA and
  told a user his own installed expansion was missing (Rich Olivieri,
  2026-08-20). `src/expansions.js` had already got this right — offline it
  reports `status: 'unknown'` for every row and claims nothing — and **the
  lesson did not travel** to `library-store.js`, `library-view.js` or
  `renderer.js`, which are the modules that must now follow it.

Two corollaries worth stating separately, because each was violated on its own:

- **`source.soundList` answers "what did the instrument this was made on
  have" — never "is this installed".** It is not a fallback for a missing
  device: it describes a different instrument at a different time, and using it
  to assert something about the unit in front of the user is the same error one
  step removed. Do not rediscover this as a clever idea.
- **A claim about hardware needs hardware.** "Installed", "missing", "not
  installed" and "available" are all claims about an instrument. Offline the
  app states what it knows about the FILE and says nothing about any
  instrument — with ONE line per region explaining why, never a marker per row,
  because the uncertainty is a property of the view and not of each patch.

**Its mirror is the section below — A RECORDED FACT MUST NOT STAND IN FOR
CURRENT STATE. Read both; the next bug of this family can arrive from either
side.**

**The general tell: a fallback whose fallback value is "whatever is loaded right
now".** `a || b` where `b` is current state is almost always this bug. It reads
as robustness and behaves as fabrication — and when it is written to a file, no
later code can tell it from a real reading.

## A RECORDED FACT MUST NOT STAND IN FOR CURRENT STATE (2026-08-21)

**The counterpart to the rule above, and the same failure running the other
way.** That one fills a gap in the record with whatever is loaded right now.
This one answers a question about right now with something written down once.
Both produce a confident statement nobody checked; they differ only in which
direction the staleness points. **Read them together** — a value is wrong here
either because it was copied when it should have been asked, or asked when it
should have been kept.

**First instance: `APP_TAG`.** `src/library-store.js` carried the literal
`'crumar-seven-editor 0.0.0'`, written into `source.app` of every patch file the
app has ever created. It was ACCURATE on 2026-08-09, the day it was typed —
package.json really did say `0.0.0` then — and it froze while everything else
moved. **All 54 files in Daniel's library record `0.0.0`**, so "which version
wrote this" is unanswerable for anything made before 2026-08-21, and no
migration can recover it.

Note what was NOT wrong: package.json has been the single source all along.
electron-builder stamps its `${version}`, CI's release guard compares the git
tag against it, and `app.getVersion()` reads it — verified against the SHIPPED
1.4.0 artifact rather than a stale local build (Info.plist and the asar's own
`package.json` both `1.4.0`). Nothing was missing. One copy had simply stopped
tracking.

**Second instance: "17 uncovered click-router branches."** That number came out
of an audit, was written down, and was then carried across weeks — into plans,
into a QA tier, into this file's own next-steps — as a current fact that nobody
re-derived. Re-measured on 2026-08-21 from the source: **53 distinct
selector-branches inside click listeners, of which 6 are uncovered by any
suite.** Three that had been counted as uncovered were already covered by
`library-view-picker.test.js` and `library-view-search.test.js` — the automatic
suite, at that. Where 17 came from cannot be reconstructed, so it is retired
rather than corrected.

This one is the rule applied to OUR OWN PROCESS rather than to code. A count is
a measurement, and a measurement has a date. Quoting one without re-taking it is
the same act as reading a cached value where a live read belongs — and it is
harder to catch, because a number in a plan has no test that can fail. **When a
figure is carried forward, say when it was measured; when it is used to decide
work, re-measure it first.**

**The tell is a literal, or a cached value, standing where a live read belongs.**
A version, a count, a date, a device's own answer. Ask whether the thing can
change while the app runs — if it can, storing it is a decision that needs a
reason written beside it.

Two things that follow, both learned the hard way here:

- **A test asserting the literal is the bug wearing a badge.**
  `assert(tag === 'crumar-seven-editor 1.4.0')` passes today and rots at 1.4.1.
  Assert that the value MATCHES THE SOURCE, whatever the source currently says.
- **When the default and the injection resolve to the same place, a test can
  pass while the wiring is gone.** `library-store.js` defaults to
  `require('../package.json').version` and `main.js` injects
  `app.getVersion()` — identical in dev, and different in exactly the case that
  matters. So a second test asserts the WIRING by reading `main.js` as text
  (it cannot be required — it pulls in Electron; same approach as
  `css-hazards.test.js`). Mutation-checked: delete the injection and it fails.

## AN UNDETECTABLE RISK IS NOT A DEMONSTRATED ONE (2026-08-22)

The third rule of this family, and the one that got furthest before anybody
noticed — because it reached USERS rather than a file.

The transfer summary told people: *"Sampled sounds may differ slightly if this
Seven has a different version of the sample set."* It shipped in `a2a12a1`
along with a `docs/DEVICE.md` section stating the same thing as an established
device fact.

The only evidence ever offered, in both places, was this: **there is no version
field anywhere in the protocol** — not in the sound spec, not in the globals,
not in the STRING space. That is a true and useful observation, and it
establishes that the app **could not detect** a version difference. It says
nothing about whether one can exist. **Absence of a version field is equally
consistent with there being no versions at all.**

Nothing else grounded it. No capture, no manual note, no vendor page, no user
report, and nothing in the app ever branched on a version — the string was the
only place the idea existed in running code. Crumar publishes ten downloads
supplying eleven sounds, one version each, and the owner had never heard of a
set being re-issued.

**The sharpest part is that the commit knew better.** Its own message says:
*"NO DETECTION, no per-patch warning, no version guessing — there is no signal
to work from, and a warning built on nothing teaches people to ignore
warnings."* It then shipped a sentence asserting the thing it had no signal
for. **The discipline covered the mechanism and skipped the premise.**

So: when you find you cannot detect something, you have learned about your
own instruments, not about the world. Before writing the hedge, ask what
establishes that the risk is real — and if the answer is "it would be
undetectable if it were", there is nothing to hedge about. A hedge is a claim.
It needs the same evidence any other claim needs.

Its siblings: **CURRENT STATE MUST NOT STAND IN FOR RECORDED FACT** and **A
RECORDED FACT MUST NOT STAND IN FOR CURRENT STATE**. All three are the same
failure — a confident statement nobody checked — and this one is the reminder
that the check applies to prose as much as to code.

## A test that asserts the buggy behaviour DEFENDS it (2026-08-20)

Fourth time this shape has cost something here, so it gets its own heading. A
test that pins down what the code currently does — rather than what it should
do — does not merely fail to catch the bug. **It fights the fix**, because
correcting the code turns the suite red and the next person reads that as
evidence they are wrong.

The instances, in order of what they cost:

- `wfp` redaction: the fake instrument returns `wfp: '[wfp redacted]'` itself,
  so the test asserts a string the fixture hard-codes. Rule 6's primary defence
  can be deleted with the suite green. **Still open.**
- `test/ui/scenarios/notes-strip.js` skipped on `{ ok: false }`, so a 404 would
  have gone green — rebuilding the exact property that let the original bug
  hide, inside the test written to catch it.
- `arrow-ownership.js` closed the library before pressing anything, and so
  tested the one path that worked.
- `test/library-store.test.js:924` asserts `missing === true` while nothing is
  attached, commented "unknown to this build while nothing is attached" — the
  offline "⚠ Not installed" bug stated as an intention. **Open as of
  2026-08-20**: the code and the test have to change together, or the test
  fights the fix.

When writing a test, say which of two things it pins: **behaviour somebody
decided on**, or **behaviour that happens to be there now**. The second kind
needs a reason in the comment or it should not be written.

## Two coordinate conventions, one seam apart (2026-08-20)

`midi.recall(bank, preset)` is **0-BASED** — it sends `bank * 8 + preset` as a
global program number. The transfer runner is **1-BASED** —
`(bank - 1) * 8 + slotIndex`. Both describe "bank and preset" and they are one
IPC call apart.

`recall(3, 1)` therefore lands on **Bank 4, preset 2**, not Bank 3 preset 1.
That happened while verifying a store: the instrument was moved to a slot
nobody asked for, what Daniel played was a different bank entirely, and the
mismatch read as "the restore corrupted my preset" for several minutes. The
store itself had gone to the right place all along.

Before reading a slot back, work out the program number explicitly and say
which convention you are using. A read that lands on the wrong slot does not
fail — it returns somebody else's patch, confidently.

## The instrument does not store patch names (2026-08-20)

The Seven holds 110 parameters and a sound. A NAME exists only in the
`.sevenlib.json` on the computer, which is why the format makes the sound name
authoritative and the patch name provenance.

So "is Bank 3 preset 1 Kitchen Dishes Delay or Tine Piano?" can have no answer
from the hardware, and the question cost real time. Both files existed,
captured from Bank 3 preset 1 and Bank 4 preset 1 — and they differ in **0 of
110 parameters**. One set of values, two names, and nothing playable tells them
apart.

When someone reports a slot holding the wrong patch, compare PARAMETERS, not
names. The runner already does this and says it in one line:
"Preset 1 already holds this patch" is a verified 110-parameter read, and it is
better evidence than any sampling of five values by hand.

## Still open from the QA pass

In Daniel's order, items 3 and 4 of five:

- **`wfp` has no real test.** Test `parseGlobals` against a payload carrying an
  actual password and assert it cannot survive, then fix the fake so it returns
  what a device returns rather than the redacted string.
- **The fixture ignores each parameter's max** (returns 64 for everything), so
  hash and dedupe tests cannot distinguish parameters.
- **Hardware, when the Seven is next plugged in**: the mismatch gate has still
  never met a real mismatched unit (`SEVEN_FORCE_MISMATCH` needs a device,
  since it synthesises the verdict during connect), and unplugging mid-transfer
  and mid-connect is unexercised. Mid-backup IS exercised and is graceful:
  completed slots kept, the run labelled "failed", nothing corrupted.
- **Test-layer gap**, ranked by cost: `seven-midi.js` (894 lines, param table
  only), `main.js` (877, none), `app.js` (3348, a few UI scenarios),
  `audition.js` (877, none), `modal.js`, `preload.js`, `undo.js`. The pattern:
  the further from a pure function, the less coverage — and every bug found by
  hand this week was in that half.

## The website (this-seven-goes-to-eleven)

Download buttons resolve the newest release's actual .dmg/.exe at runtime
(`assets/js/download.js`) — no version is written anywhere; buttons ship
pointing at /releases/latest so they work with JS off. The header's MAC and PC
buttons were never wired at all until 2026-08-17. SVG anchors need
`setAttribute('href')`; assigning `.href` fails silently. A SmartScreen note
sits under the PC button. `/metrics/` reads `docs/metrics/data.json` and counts
INSTALLERS only — latest.yml is the updater checking in. GoatCounter is live at
`thissevengoestoeleven.goatcounter.com`; page views and downloads are never
added together. The daily download-report email works and sends.

**The donation ask is built** (`src/donations.js` + the modal in app.js), per
docs/DONATIONS.md: three triggers, fires on DISMISSAL of a completion summary,
two showings ever at least 7 days apart, then never automatically. "I already
donated" and "Don't ask again" are permanent. Help ▸ Support this app never
counts as a showing. Daniel's revised copy, no numbers in the ask.

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

**How long the suites take, measured 2026-08-21** — because the alternative is
everyone forming a theory:

```
npm test         ~6s     373 pass
npm run test:ui  204s     23 passed, 0 failed, 3 skipped  (Seven CONNECTED)
```

An attached instrument does NOT make the UI suite slow. A run once timed out at
ten minutes and that was recorded in a commit message as "the full suite now
exceeds ten minutes with the instrument attached" — **wrong, and it was one
observation turned into a property.** A device-attached run had completed
earlier in the same session, which was the counter-evidence sitting in the
scrollback. The stall was almost certainly the machine sleeping mid-suite.

**What the wrong belief cost:** a full-suite run was skipped before a commit on
the strength of it, and the suite would have answered in three and a half
minutes. That is the part worth remembering — a made-up cost is paid in the
checks you stop running.

Retimed with any real change to the suite. A number with a date beats a claim,
either way round.

**Only `npm test` runs by itself.** Its glob is `test/*.test.js`, which never
descends into `test/ui/` — so no scenario is in the default suite or in CI,
and a scenario is a guard only while somebody remembers to type the second
command. When a change is covered by both, say which half is automatic; two
tests where one of them only fires on request is one test and a good
intention.

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

**`SEVEN_FORCE_MISMATCH` forces the write gate CLOSED**, which is the only way
to see the mismatch banner and the "Report this instrument" path on an
instrument the app recognises. That path exists solely for someone whose Seven
this project has never met, so it cannot otherwise be reached on this hardware
at all — and it needs re-checking after any change to the banner, the report
builder, or the report IPC.

```
SEVEN_FORCE_MISMATCH=1 npm start        # gate closed; real firmware named
SEVEN_FORCE_MISMATCH=1.22 npm start     # …and the banner says 1.22
SEVEN_FORCE_MISMATCH=nofw npm start     # …with an unreadable firmware string
```

**`SEVEN_NO_REVEAL=1` records where the folder button WOULD have opened,
instead of opening it.** Revealing spawns a real Finder window that a test
cannot un-open, but a flag that merely suppressed the call would give a test
passing because nothing happened — and "nothing happened" is
indistinguishable from "the wrong folder was revealed", which is the only
failure worth catching here. Both branches answer `{ revealed, path }`.
Contract measured before it was used: with the flag, `revealed:false` and
Finder window count 0 → 0; without it, `revealed:true` and 0 → 1, the front
window named after the library folder.

**`contextBridge` DEEP-FREEZES the exposed API.** Measured 2026-08-21:
`sevenAPI` and `sevenAPI.library` both report `Object.isFrozen === true`, and
assigning over a method silently does nothing. **So a UI scenario cannot wrap
an IPC call to observe that it happened** — which is why a click whose handler
discards its result has to be covered in two pieces: the scenario for the
gesture and the destination, and `test/source-wiring.test.js` for the fact that
the button is wired to the call at all. Same reason the error-shape rule exists
(only `message` survives a thrown Error across the bridge): the bridge is a
harder boundary than it looks.

**`SEVEN_NO_DEVICE=1` forces the app OFFLINE**, which until 2026-08-21 was the
one state this project could not test.

```
SEVEN_NO_DEVICE=1 npm start
SEVEN_NO_DEVICE=1 npm run test:ui offline-state
```

**Ten of seventeen scenarios do not call `requireDevice()`, so they run in
whatever state the desk is in — and on the only desk here the Seven is always
plugged in.** Every automated run this repo has ever done was a CONNECTED run.
That is not a gap in one test; it is a whole half of the app that no test had
ever looked at, and it is how three disconnected-state bugs reached a user
inside two days: the expansion double-listing, the 10-versus-11 heading, and
"⚠ Not installed" on a sound the owner has installed.

**A state nobody chooses is a state nobody tests.** `SEVEN_FORCE_MISMATCH`
cannot stand in — it needs a device, since it synthesises its verdict during
connect.

The flag lies at ONE place, `_findPort` in `seven-midi.js`, so `connect()` fails
through the genuine no-port path and everything downstream is the same code a
user without an instrument runs. A flag that synthesised "disconnected" further
up would be testing the flag.

**`SEVEN_UI_SIGNAL=<file>`** lets a UI test wait for a HUMAN step. Several of
this project's tests need one — a three-second panel hold, a listening
judgement — and a fixed sleep is not a test. The script polls
`window.sevenAPI.devSignal()`; whoever is driving writes the file when the
person has done their part. Unset, the call returns null and nothing polls.

**`SEVEN_SEED_DEMO=1`** puts the 32 fixture patches and the demo setlist into
a NEW library folder. Nothing is seeded without it — see "1.0 shipped demo
patches" below for why — so this is how a screenshot or a manual UI session
gets content. Tests call `store.seedDemoLibrary()` instead, which says the
same thing out loud.

**`SEVEN_RESET_DONATIONS=1`** clears the donation prompt's state — shown
count, last shown date, never-ask flag — so the next qualifying trigger is
showing 1 again. It is the only way to see the ask at all after the first two,
and `npm run test:ui donation-ask` needs it. Permanent, for the same reason as the flag below: that state
is one-directional and slow, so without a reset the second showing is seven
days away and "I already donated" is a dead end. Every change to the copy or
the trigger logic needs it (docs/DONATIONS.md).

`SEVEN_FORCE_MISMATCH` synthesises **only the verdict** — six fewer parameters than the instrument
really reported. What was read from the device is left untouched, so a report
saved under the flag still carries this unit's genuine table, and everything
downstream of the verdict is the real code path. Unset, it does nothing;
`npm test` asserts that.

**MUTATION TESTING IS THE RELEASE RITUAL** (2026-08-17). Coverage counts
measure nothing; removing a behaviour and seeing whether the suite notices
measures something. The first sweep ran 13 mutations, 10 caught, 3 missed —
record that count each release. The three misses are what a coverage
percentage would never have shown:

- `wfp` redaction in the 0x33 parser could be deleted with the suite green,
  because the fake instrument returns `wfp: '[wfp redacted]'` ITSELF. The test
  named "the globals snapshot is written with wfp already redacted" asserts a
  string the fixture hard-codes. **Still open** — Rule 6's primary defence has
  no test.
- The row-level "⚠ Not installed" badge could be deleted with the suite green.
  Fixed and covered.
- `FakeSeven.readParamValue` returns 64 for every id regardless of a
  parameter's max, so backup's hash and dedupe tests cannot tell parameters
  apart. **Still open.**

Run one with: break a behaviour, `npm test`, restore. A test that passes with
the thing under test removed is testing nothing.

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

### ESLint with `no-undef` runs on `npm test` (2026-08-22)

**Four undefined-reference bugs shipped in a single day**, all in renderer
files with no unit coverage, all invisible to `node --check` (which parses but
does not resolve) and to both suites:

| what | how it failed |
| ---- | ------------- |
| `renderBanks()` | called, defined nowhere — killed the slot-read repaint AND the row re-render |
| `sendToSeven` | callback never supplied, so the row control clicked into silence |
| `answer` | read outside the block its `const` lives in — threw on every save from Patches |
| `maybeOfferSendPc` | definition deleted by an unrelated commit — threw on every connect, taking the write-gate banner with it |

Three were found by Daniel clicking around. The fourth by a linter, in under a
minute.

**The pattern behind all four, which is why this is a tool and not a habit:**
scripted edits verified by checking that the intended change happened rather
than that nothing else did. `maybeOfferSendPc` was destroyed by a deletion that
sliced a source range and took a passenger; the sweep it was removing was
confirmed gone, and nothing confirmed what else went with it. **A linter is the
only thing in reach that checks the second question automatically.**

```
npm test   ->  npm run lint && node --test "test/*.test.js"
```

A violation FAILS the run, and the unit tests never start.

**WHAT IT GUARANTEES:** a name that does not exist is caught before it ships —
in `src/`, `test/`, `tools/`, `scripts/` and `fixtures/`.

**WHAT IT DOES NOT:**

- **A function that exists and is never CALLED.** That was the Notes strip — a
  complete, working, tested capability with no consumer for ten days — and
  `no-undef` is blind to it by construction. It will happen again. The check
  for that is still manual and still one line:
  `grep -c "sevenAPI\.<name>" src/*.js`.
- **Anything about behaviour.** It resolves names; it does not know what they
  do.
- **Style.** Every other rule is off deliberately. A linter that reformats is a
  linter people turn off, and nothing here should ever make somebody change
  code that already works.

**Globals are ENUMERATED, not suppressed** (`eslint.config.mjs`), by file
group: browser for the renderer, Node for the main process, both for the UMD
modules that are `<script>`-loaded and `require()`d — with the reason written
beside them. A throwaway config for the one-off run produced five false
positives (`self`, `CSS`, `AbortSignal`) purely by omission, and a tool that
cries wolf is one people learn to skim.

`test/source-wiring.test.js` still carries hand-rolled guards for the two
branches that have already broken — the slot read and the connect path. They
are narrower than the linter and catch one thing it cannot: that a specific
consumer still exists.

### Smaller things still open

Kept here because they otherwise live only in a chat that ends.

- **UI STATE LEAKS BETWEEN SCENARIOS, and it cost two days of calling two
  tests "flaky"** (settled 2026-08-22). The runner copies a fresh LIBRARY per
  scenario. It does NOT reset userData — and whether the library tray is open
  is persisted in `localStorage` (`LIB_OPEN_KEY`), which lives there. So a
  scenario that leaves the tray open hands it to every scenario after it, and
  to every run after that.

  With the tray open, "On the Seven" is a collapsed strip: its bank tabs and
  slot rows are genuinely not on screen. `bank-tab-arrows.js` and
  `save-button-contexts.js` both click one, and both failed inside a full run
  while passing alone.

  **Proven both directions rather than argued:** run `arrow-ownership-open.js`
  — which leaves the tray open on purpose — and `bank-tab-arrows.js` fails;
  run `arrow-ownership.js`, which closes it, and the same scenario passes.
  Both now call `ui.closeLibrary()` first and both pass under the adversarial
  ordering.

  **Two wrong answers were given first, and both were shaped like an answer.**
  "Flaky" is a description standing where a cause belongs, and it survived
  because the failures were real, repeatable and inconvenient. Then "a
  first-layout race" — plausible, since a full run makes paint slower — which
  a measurement killed in one step: the element was still unreachable after
  **8000ms**, and no layout takes eight seconds.

  The general rule is the one `@env` already encodes: **a scenario's starting
  state must be CHOSEN, not inherited.** `@env` covers the environment;
  nothing covers persisted UI state, so a scenario that depends on it arranges
  it itself. The remaining hazard is that this is per-scenario discipline — a
  runner that reset userData between scenarios would make it structural, and
  that is worth doing before the next state gets persisted.

- **Connect → open to the active patch.** Connecting leaves you on whatever
  was last selected rather than what the Seven is actually playing. A first
  attempt was reverted (2026-08-13) because it recalled without ending the
  live session first, which discarded edits silently. Any second attempt has
  to end the session before it moves the instrument.
- **~5px jump at the start of the tray swap.** `#split-divider` flips
  `display` and sits outside `#bank-region`, so it steps rather than sliding
  with everything else. Folding it into the region would fix it, at the cost
  of putting a drag handle inside the thing it resizes.
- **`src/main.js` has no tests, and now holds things worth testing.** It is
  the largest file here and carries the auto-updater wiring, the library
  migration, the donation IPC and the menu. Two pieces are worth extracting
  the way `src/donations.js` was — pure logic, injected paths, no Electron —
  so they can be pinned down:
  - **`migrateLegacyLibrary()`** copies a user's whole library across the
    folder rename 1.0.0 made necessary. Verified once by hand (62 files
    across, original untouched) and guarded by nothing since. A later edit
    could turn the copy into a move, or let it overwrite a destination that
    already has files. Highest-consequence untested function in the repo: the
    failure mode is somebody's patches. Worth asserting: an existing
    destination is never touched, a missing source is a no-op, the source
    survives, and a failure cannot stop the app opening.
  - **The updater's silence rules.** Background failures must stay silent and
    only Help ▸ Check for Updates may speak. Today that is four
    `if (!manualUpdateCheck) return` lines nobody checks, and the way it
    breaks is a dialog appearing on a festival stage with no wifi.
- **Nothing asserts WHERE the donation ask fires from.** `test/ui/scenarios/
  donation-ask.js` covers the modal's shape and `test/donations.test.js`
  covers the rules, but neither proves `maybeAsk()` runs after a summary is
  dismissed rather than over it, or that a cancelled run never reaches it.
  Those are three call sites in `src/app.js` and the rule they encode is the
  one most easily lost in a refactor (docs/DONATIONS.md).
- **Connect an unverified expansion row to the unrecognised sounds below it —
  in COPY, not by matching.** When an entry has `sounds: null` the owner sees
  the same sample set twice: once as "Unverified", once as
  "Installed, not in the catalogue". Both statements are true and the app
  cannot join them, because the only link is the title and titles demonstrably
  lie — the 70B XL has three published spellings ("Electric Grand 70BXL" on
  Crumar's download page, "Electric Grand 70 BXL" on GSi's product page,
  "Electric Grand 70B XL" on the instrument). A line on the unverified row
  saying it *may* be one of the unrecognised sounds listed below would connect
  them honestly without claiming a match. Parked deliberately 2026-08-20; do
  not build matching for it.
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
