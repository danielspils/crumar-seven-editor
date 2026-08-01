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
captures/    raw MIDI logs — empty for now, kept for future recordings
schema/      seven-<firmware>.json — version-gated parameter maps
tools/       capture-hook.js, probe.js — capture & probing utilities
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
sounds, globals. `0x20` set-parameter and `0x30` set-global are verified. Of the
prober's four open items three are closed (flag semantics, glb index addressing,
pedal CC); the one left is **enum labels** for `fx1_md`, `fx2_md`, `pha_st`,
`amp_mo` — cosmetic, and it needs a human reading labels off the editor. Other gaps
stay flagged `UNKNOWN` in place (see the open-items list in `docs/protocol.md`).

A runnable Electron shell exists (`npm start`): panel strip (inlined SVG with
addressable ids, LEDs lit from state), connection row (hardcoded disconnected),
four-bank library list with modeled/sampled and missing-sound badges, and a
two-column detail view (engine group + effects chain, switch-driven dimming,
default-muted values, FX2-conditional sub-params). **Everything renders from
`fixtures/sample-library.json` — there is no MIDI in the app**; when real MIDI
arrives, only `src/preload.js` changes. Dev note: Electron must be ≥ a current
major — macOS XProtect flags outdated Electron binaries as malware and trashes
them (this bit us on v31; fixed on v43).

**Next step: design the patch file format** — the app's own format, not the
instrument's `.bin`. All four features (backup, transfer, editing, visibility)
route through it, so it gets designed before any of them are built. No hardware
needed. Not started.
