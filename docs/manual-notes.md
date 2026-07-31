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
