# Handoff context

Pickup document for a fresh session. Read `CLAUDE.md` first — it holds the hard
project rules; this file is the map of where everything stands.

> Provenance note: this document was authored from the repo state at pause time
> (2026-08-01). A draft CONTEXT.md was referenced but never landed on disk, so
> nothing here comes from that draft — every claim below traces to the repo.

## What this project is

Cross-platform (Electron, macOS + Windows, plain JS) editor for the Crumar
Seven stage piano. Four features, all routed through a yet-to-be-designed patch
file format: **backup**, **transfer**, **editing**, **visibility** (see
CLAUDE.md "What the app is for"). MIT, public repo (not yet published).

## Protocol state (FW 1.37) — docs/protocol.md + schema/seven-1.37.json are the authority

- Frame: `F0 73 26 14 <opcode> … F7`. Request/reply opcodes pair as n/n+1.
- **Verified by observation**: max-param-id, per-param spec (`0x14/0x15`),
  get-value (`0x22/0x23`), **set-parameter `0x20`** (captured),
  **set-global `0x30`** (captured; one global per write, `<index> <value>`,
  no 0x00 pad, ack echoes index), globals `0x32/0x33`, sounds `0x40–0x45`.
- **Unobserved, write-capable — do not send**: `0x46` set-sound, `0x70/0x72`
  string/action.
- ASCII text replies (`0x15`, `0x33`) carry a **leading 0x00 pad** — strip it.
- `flag` field: `1` = fixed panel CC (22 params), `0` = assignable. Confirmed
  by observation AND the manual's fixed-CC table.
- `glb`: `0x30 <index>` maps 1:1 to array position (all nine swept). Index→name
  pinned only for **2 = Send CC** and **8 = Memory Protect**; the other seven
  are assumed from the editor's DOM order (`orderUnverified` stays). Values are
  per-field encoded, not uniformly 0-based.
- **`wfp` in the globals reply is the instrument's Wi-Fi password in plaintext.**
  Redacted in `tools/probe.js` at parse time; never commit a raw globals dump
  (CLAUDE.md Rule 6).
- Bulk dump (`0x12`) works once then wedges — enumerate 0–109 via `0x14` instead,
  verify coverage, re-request gaps.

`tools/probe.js` is the hardware CLI (list/info/enumerate/get/globals plus the
open-items probes). Writes are gated behind `--enable-writes`, always read back,
always restored; preset stores are refused outright.

## Build state

Runnable Electron shell (`npm start`), **no MIDI anywhere** — everything renders
from `fixtures/sample-library.json` (demo data, never evidence). The single
data-source seam is `src/preload.js`; when real MIDI arrives, only that file
changes. `src/renderer.js` is a pure view layer (unit-testable in Node);
`src/app.js` owns UI state; `src/defaults.js` is the shared default heuristic
(min(64, max) — a stand-in until factory defaults are captured).

UI as built: panel strip (inlined SVG, addressable ids, bank/preset LEDs, lit
knobs from switch params, knob↔section navigation, clavi-group dimming unless
the modeled Clavi engine is selected), four-bank library with missing-sound
warnings, two-column detail (engine + effects chain: collapsed-by-default
animated sections, summaries, device-honest ON/OFF pills and enum dropdowns,
View-menu raw values / expand / collapse). Conventions and their reasons live
in `docs/DESIGN.md` — read it before changing any visual state.

Verification pattern used this session: build a throwaway `harness.html` that
inlines fixture+schema+SVG, stubs `window.sevenAPI`, loads the real
defaults/renderer/app.js, serve over `python3 -m http.server`, drive it with
JS in the browser and measure (rects, computed styles) rather than eyeballing.

## Open questions

See `docs/PROJECT-SCOPE.md` (kept current) and the open-items list at the end
of `docs/protocol.md`. Headlines: enum labels for `fx1_md/fx2_md/pha_st/amp_mo`
are still `valuesUnverified` (cosmetic; needs a human at the instrument);
Local Off's SysEx visibility unknown; factory parameter defaults never captured.

## Next steps (agreed, not started)

1. **Design the app's own patch file format** — before building any of the four
   features; all of them route through it. Requirements already fixed: store
   sound NAME not ID (resolve on import, warn if missing), include `pdl_exp`
   (stored per preset, manual-confirmed), version-gate by firmware.
2. Enum-labels probe (`node tools/probe.js open-items enums --enable-writes`)
   next time the instrument is connected.
3. Eventually: real MIDI in `preload.js`; knob RGB value-encoding per the
   manual (DESIGN.md "eventual target").
