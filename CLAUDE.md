# Crumar Seven Editor

Cross-platform desktop editor for the **Crumar Seven**, a physical-modeling stage
piano. The Seven exposes its full parameter set over class-compliant USB-MIDI
SysEx. There is **no published protocol spec** — this project reverse-engineers
the protocol from captured traffic.

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

### 2. Protocol facts come ONLY from `captures/`

Every claim about a SysEx frame must be traceable to a specific file in
`captures/`. **Never infer, assume, or extrapolate a frame.** If a byte's
meaning is not demonstrated by a capture, it is `UNKNOWN` — mark it `UNKNOWN`
and say so explicitly. "Probably", "likely by analogy", and "the manual implies"
are not evidence. No capture, no fact.

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

---

## Layout

```
docs/        parameter-reference.md, protocol.md (decoded/human-facing docs)
captures/    raw MIDI logs — the only source of protocol truth
schema/      seven-<firmware>.json — version-gated parameter maps
tools/       capture-hook.js, probe.js — capture & probing utilities
src/         application code (none yet)
```

## Status

Scaffolding stage. No protocol or UI code written yet. `captures/` is empty, so
per Rule 2 **every byte of the protocol is currently `UNKNOWN`.**
