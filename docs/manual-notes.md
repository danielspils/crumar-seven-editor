# Manual notes (v1.22)

Derived from the **July 2021 owner's manual, which documents firmware v1.22** —
the newest manual published. This device runs **v1.37**. Per Rule 1, everything
here is **stale and unverified**.

## What this file is good for

The manual still describes things the SysEx interrogation does not:

- **Conditional behaviour** — how parameters interact, what a control does at its
  extremes, mode-dependent meanings.
- **Preset structure** — banks, how presets are organised and recalled.
- **Connection facts** — ports, MIDI setup, Wi-Fi/editor pairing, power.

## What this file is NOT authoritative on

**The parameter set.** The manual predates v1.37 and is wrong about the
parameters. When the manual and the device disagree, **`schema/seven-1.37.json`
wins, always.** `docs/protocol.md` is the authority on the wire protocol.

## Where the v1.22 manual is wrong about v1.37

The device demonstrates parameters the manual omits, and the manual lists
parameters the device does not have. Authoritative detail is in
`docs/protocol.md` ("Findings that contradict the manual") and the schema; the
summary:

### Manual is missing (present on the device)

- **Duplex Scale** — `acp_dpxl`, ID 55.
- **Phaser Mix** — `pha_mx`, ID 85.
- **The amp's individual EQ bands** — `amp_bs` / `amp_md` / `amp_tr`, IDs 92–94.
  The manual only implied a passive 3-way EQ per amp model.
- **Two globals** — Midi Soft-Thru and Velocity Curve.

### Manual lists parameters that do not exist

- **Two sample-player LFO parameters** (LFO Rate and LFO Depth, presumably the
  missing `rom_p06` / `rom_p07`) are **absent from the ID space entirely** on the
  GSP-01 — not conditional, just gone. The sample player has 8 parameters, not 10.

### Other drift

- Acoustic Grand "Fundamental Level" is not present; `acp_rnlv` reads "Release
  Level", not the manual's "Release Noise Level".
- FX1/FX2 use "Speed", not the manual's "Rate".

> If you add manual excerpts to this file later, keep them clearly labelled as
> v1.22 and never let them override the schema. Don't paste anything you can't
> attribute to the manual.

---

## Additions from a full read of the Sep 2020 manual (FW 1.2) + Crumar KB — 2026-08-09

Read end-to-end from `crumar.it/files/Crumar_Seven_Manual_ENG.pdf` (44 pp, "Last
update: Sep 2020 – FW v.1.2" — an OLDER revision than the v1.22 notes above)
plus the Crumar help-desk knowledge base. Same stale/unverified status.

### TWO different editors — do not conflate them

- **Wi-Fi editor** (manual ch. 10): served BY THE INSTRUMENT over its own
  hotspot (`Seven-xxxxxxxx`, default password 00000000 → the `wfp` global) at
  `http://192.168.1.1`. Speaks HTTP to the built-in web server. Home page has
  the instrument-local operations: global options, **PRESETS EXPORT / IMPORT**,
  wavetable expansion install/uninstall, Wi-Fi password, firmware update and
  factory restore links. One client connection at a time.
- **USB editor** (gsidsp.com, KB art. 21): GSi's browser app over the USB
  cable, Chrome-only, **WebMIDI + SysEx** — the thing our captures tap. Its UI
  mirrors the editing pages but NOT the instrument-local operations above; it
  has no preset export (confirmed live on the page, 2026-08-09).

### Preset export/import (manual §10.2) — never touches MIDI

Wi-Fi editor buttons write/read **`Seven_x-y.bin` on the USB thumb drive in
the instrument's SYSTEM USB port** (FAT32). Import loads the edit buffer and
activates immediately but stores nothing until the physical 3-second preset
hold. Consistent with the edit-buffer model in protocol.md.

### Globals semantics the interrogation can't see (§10.1)

- **Send PC**: "select YES to send Program Change messages whenever a new
  preset is recalled." Ties directly to the 2026-08-09 captures: no PC was
  observed on recall — consistent with this global being OFF on this unit. If
  ON, a panel recall would carry the SLOT identity that the `0x45` broadcast
  lacks. Candidate glb index untested.
- **Volume Type**: "From Presets" (volume follows each recalled preset) vs
  "Global" (knob is a global volume; recalls don't change it). This unit
  behaves as From Presets (recall loaded the stored 116 — see protocol.md open
  item 7). A unit set to Global would answer backups differently on `veq_vol`.
- **Channel OFF** disables send AND receive entirely (except Local-off
  sending) — a unit set this way would ignore our PC-driven recalls.

### Smaller corroborations and curios

- §10.4 fixed-CC table (FW 1.2) lists exactly the 22 CCs the device broadcast
  on recall in the 2026-08-09 captures — three sources now agree (device flag
  read, v1.22 manual, v1.2 manual).
- Factory bank 1 = the 8 modeled engines in ID order (matches the controlled
  capture: presets 1–4 → sounds 0–3). Banks 2–4 ship with factory content but
  are user-overwritable; bank 1 is read-only.
- Sampled sets may support the **mod wheel** (LFO rate/depth params) — a
  possible lead on the unexplained doubled `B0 01` closing every recall burst.
- **Two USB ports, different jobs.** The computer-facing port is silkscreened
  **USB MIDI IN-OUT** and is a **USB Type-B** socket (the tall squarish
  "printer" connector) — so a modern Mac needs a C-to-B cable, an older one
  A-to-B. That is the port this app uses. Confirmed from a photo of the rear
  panel, 2026-08-10; the manual doesn't say.
- USB host port (SYSTEM USB) also accepts class-compliant USB-MIDI devices as
  INPUTS to the Seven (controllers, pedalboards).
- Easter eggs: music demo = hold CLAVI TABS + push VOLUME (manual p.44);
  **dark mode** = hold FX2 SELECT (KB art. 54). Recovery mode exists for
  failed boots (KB art. 40). KB art. 25 discusses "strange behaviours" on
  bank 1 preset 8 (modeled grand) — unfetched, pointer only.
