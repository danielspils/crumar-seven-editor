# Crumar Seven Editor

Cross-platform desktop editor for the **Crumar Seven**, a physical-modeling stage
piano. The Seven exposes its full parameter set over class-compliant USB-MIDI
SysEx. There is **no published protocol spec** — this project reverse-engineered
the protocol by interrogating the device directly. The instrument turned out to
be self-describing (ASCII payloads), so it describes its own parameter set.

Cross-platform desktop app (Electron, macOS + Windows). Plain JavaScript.
MIT-licensed and public.

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
src/         application code (none yet)
```

## Status

The protocol is **known**, not unknown: `docs/protocol.md` and
`schema/seven-1.37.json` document FW 1.37 from live interrogation — frame format,
26 opcodes, 110 parameters, 24 sounds, globals. Remaining gaps are tracked as the
open-items list in `docs/protocol.md` and are flagged `UNKNOWN` in place. No UI
code yet; `tools/probe.js` is the current work.
