# This Seven Goes to Eleven

A desktop editor, backup library, and setlist tool for the Crumar Seven, a physical-modelling stage piano. Back up all 32 presets to your computer, load patches to the Seven, create setlists of patches for gigs, and edit sounds with a user-friendly dashboard of all the instrument's parameters. Donation-supported software for macOS and Windows.

**Download:** [latest release for macOS and Windows](https://github.com/danielspils/crumar-seven-editor/releases/latest)

The marketing website: [thissevengoestoeleven.com](https://thissevengoestoeleven.com/).

## The instrument, briefly

The Crumar Seven is an Italian-designed stage piano built on physical modelling and samples. It has 4 banks of 8 presets, and it speaks class-compliant USB-MIDI SysEx. Two things about it shape everything in this repo:

1. **Storing a preset needs a physical three-second button hold.** There is no store command in the protocol. The app can load a patch into the instrument's edit buffer over USB, but a person has to finish the save on the panel. The UI guides the user through this process.

2. **Sound IDs are not stable, even on one instrument.** The sound table is alphabetical, so installing an expansion renumbers the list of available models & samples. Patches therefore store the sound's name and resolve it against the connected Seven synth.

## The protocol is reverse-engineered

I asked Claude to write this text (I'm not a dev), so this is the last sentence I'm editing. Take it away, Claude!

There is no published spec. The newest manual documents firmware v1.22; the instrument runs v1.37, and they disagree.

What made this tractable is that the Seven describes itself: ask it for its parameter table and it answers with ASCII — id, group, key, label, CC, max, current value. So the reference in this repo was read off the device rather than inferred from captures.

* `docs/protocol.md` — frame format, opcodes, what each one does
* `schema/seven-1.37.json` — the parameter map, 110 entries, tagged with the firmware they were observed under
* `captures/` — raw MIDI logs, kept as-is; a decoded view never replaces the bytes it came from

Anything the device has not demonstrated is marked UNKNOWN rather than guessed, and the schema carries `valuesUnverified` / `ccUnverified` flags for the gaps that remain. The manual can suggest what to look for in a capture. It does not count as evidence.

## Shape of the app

Electron, plain JavaScript, no framework and no build step for the app code.

```
src/main.js            main process — IPC handlers, menus, auto-update, the daily ping
src/preload.js         the contextBridge seam: window.sevenAPI, and the only way across
src/seven-midi.js      all MIDI. Connect, read/write parameters, the sound table
src/app.js             renderer logic — selection, the panel, the carousel, live editing
src/renderer.js        pure view: given state, draw it
src/library-store.js   patches and setlists on disk, atomic writes
src/patch-sender.js    one patch into the edit buffer, verified write by write
src/backup-runner.js   all 32 presets off the instrument
src/transfer-runner.js a setlist onto a bank, one slot at a time
```

`src/app.js` is over 4,000 lines and is the biggest thing here by a distance. It is the file to be careful in.

Main and renderer talk only through `preload.js`. The renderer never touches MIDI or the filesystem directly. Worth knowing: contextBridge deep-freezes what it exposes, and it strips custom properties off a thrown Error — only `message` survives the crossing, so error messages have to carry their own meaning.

## How a patch makes the round trip

**Off the instrument:** the runner sends a Program Change per slot, waits for the unsolicited broadcast that confirms the recall, then reads all 110 parameters back with verification and re-requests any reply the device dropped. A full backup is 32 slots and roughly 3,600 round trips; the first real run took 48 seconds.

**Onto disk:** one `.sevenlib.json` per patch — parameters keyed by schema key, the sound stored by name, provenance recorded per patch. The format is `docs/FORMAT.md`.

**Back to the instrument:** resolve the sound by name against the connected unit, send it, then every parameter, each write checked against the value the device echoes back. Then a person holds the button for three seconds.

## Running it

```
npm install
npm start          # the app
npm test           # unit suite + lint
npm run test:ui    # scenarios in a real Electron window
```

Building needs signing credentials; `npm run dist:mac:unsigned` produces an unsigned macOS build without them.

Electron must stay reasonably current: macOS XProtect flags outdated Electron binaries as malware and deletes them. That happened here on v31.

## Tests, and what they actually cover

Two suites that do different jobs. These numbers are approximate; run them yourself rather than trusting a number in a README.

`npm test` — ESLint (with `no-undef`, which has caught four shipped undefined-reference bugs) plus roughly 450 tests, run with Node's own test runner. These are the pure-logic modules: the patch format, the library store, the transfer planner, the drift calculation, the parameter compatibility gate. Seconds to run. This is what CI runs.

`npm run test:ui` — around 40 scenarios driving a real Electron window with real DOM measurement. This is where layout, focus, modals and the panel are checked, because a lot of what breaks here is only visible on screen. Around three and a half minutes with an instrument attached.

There is also `SEVEN_UI_TEST=<file> npm start`, which runs an arbitrary script inside the running renderer and prints what it found — how most layout questions get an answer instead of an opinion.

## Known gaps, stated plainly

* About a quarter of the scenarios need a Crumar Seven plugged in. Without one they skip, and say which precondition they are missing. A green run on a machine with no instrument has tested less than it looks like.
* The UI suite has never run on Windows. No CI job runs it at all — CI runs `npm test` on Ubuntu, and the scenarios have only ever been run by hand on one Mac. An arrow-key navigation bug reached a release candidate this way.
* `src/main.js` has no unit tests. It is the second-largest file and holds the auto-updater and the library migration. Some of it is covered indirectly by tests that read it as text and assert its wiring.
* A scenario may skip only for a precondition it cannot control — no instrument, no network — and never for a result the feature is responsible for. A test that skips on failure is worse than no test.

## What CLAUDE.md is

Most of this app was written by Claude Code, with Daniel directing. `CLAUDE.md` is the file that agent reads first, and it is worth explaining because it is not a style guide.

It is a map and a trap list: the hard project rules (raw captures are never deleted, no code from the manufacturer's web editor, nothing that could be a credential is ever written to disk), plus a long list of specific mistakes that were made here and what they cost. A wrong conclusion recorded as settled. A test that asserted the buggy behaviour and so defended it. A fixture that could not express the thing it was supposedly testing. A version string that was accurate the day it was typed and then froze.

Each entry exists because something broke, and it is written to stop the same mistake being made again rather than to describe good intentions. It is long because the list is long.

The entries are also the honest record of how this was built. If you want to know whether the code can be trusted, that file is a better guide than this one.

## Layout

```
src/          the app
schema/       version-gated parameter maps, read off the device
docs/         protocol.md, FORMAT.md, DEVICE.md, DESIGN.md, release notes
captures/     raw MIDI logs — ground truth, committed, never edited
test/         unit suites
test/ui/      scenarios + the harness that drives a real window
tools/        probes and recorders for talking to the instrument directly
```

## Licence

MIT. The protocol observations in `docs/` and `captures/` are recordings of what the instrument does; no manufacturer code is used anywhere in this repo.
