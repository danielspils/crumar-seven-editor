# Project scope

Running notes on what's in and out of scope, and what must be resolved before
building on it. See CLAUDE.md for the four features (backup, transfer, editing,
visibility) and the hard project rules.

## Open questions

1. **Enum labels are still unverified (cosmetic).** The `values` arrays for
   `fx1_md`, `fx2_md`, `pha_st`, `amp_mo` come from the manual, corroborated by
   the panel silkscreen, but the index→label mapping has never been confirmed
   against the device. Probe exists:
   `node tools/probe.js open-items enums --enable-writes` — needs a human at
   the instrument reading labels. A partial run was interrupted; no results
   were recorded.
2. **The glb index→name mapping is pinned only for indices 2 (Send CC) and
   8 (Memory Protect).** `0x30 <index>` → `glb[index]` addressing is verified
   1:1 for all nine, but the other seven names are assumed from the editor's
   DOM order (`orderUnverified` stays in the schema). Per-field value encoding
   is also unresolved (not uniformly 0-based).
3. **The volume knob has a blue Local Off state. Whether Local Off is readable
   or settable over SysEx is unknown.** (Hardware behaviour per the manual:
   a slow push — held at least 100ms — toggles Local Off; the keyboard stops
   playing the internal engine but keeps sending MIDI out, and the knob turns
   blue.)
4. **Factory parameter defaults have never been captured.** The schema has no
   per-parameter default; the UI's muted-at-default display uses the
   `min(64, max)` heuristic in `src/defaults.js` (the single place to change
   when real defaults are captured from the device).

## Closed (see docs/protocol.md open-items list for detail)

- `flag` semantics — closed by read, confirmed by the manual's fixed-CC table
  (the same 22 parameters).
- `glb` index addressing — closed by the nine-index sweep (1:1, restore
  byte-identical).
- `pdl_exp` CC anomaly — resolved: assignable slots holding live assignments
  (`flag=0`), not an inconsistency.

## Patch format notes

- The expression pedal assignment is stored with each preset (confirmed by the
  manual), so **`pdl_exp` belongs in the saved patch**.
- Store the sound **name**, never the bare sound ID (IDs are not portable
  across units with different expansions); resolve on import and warn when the
  target lacks the sound.
