# .sevenlib.json — the patch file format

One container format for everything: a library of patches. **A single patch is
a bundle containing one patch** — there is no separate single-patch format and
no second parser. Data layer lives in `src/format/`; it has no MIDI and no
device access.

JSON, UTF-8, 2-space indent, trailing newline. Output key order is stable so
files are git-diffable: spec keys first in spec order, unknown keys after in
their original order, `params` keys sorted lexicographically.

## Shape

```json
{
  "format": "crumar-seven-library",
  "formatVersion": 1,
  "created": "2026-08-02T19:00:00Z",
  "source": {
    "app": "crumar-seven-editor 0.0.0",
    "firmware": "1.37",
    "firmwareBuild": "Thu May 12 15:43:17 2022",
    "schema": "seven-1.37.json",
    "soundList": [ { "id": 18, "name": "Venice Grand CB1898" } ]
  },
  "patches": [
    {
      "name": "CB Classic",
      "origin": { "bank": 2, "preset": 3 },
      "sound": { "name": "Venice Grand CB1898", "id": 18 },
      "params": { "acp_body": 64, "acp_cbpr": 70 },
      "source": {},
      "captured": "2026-08-02T18:59:12Z",
      "verified": "2026-08-09T16:20:17Z"
    }
  ]
}
```

## Rules

- **`params` is keyed by schema `key` strings — all 110.** Never serialize by
  ID order or array position: the ID space is firmware-specific; the key is
  the stable identity.
- **`sound.name` is authoritative on import.** `sound.id` is diagnostic only;
  resolution never uses it. Resolution itself lives in `src/patch-sender.js`
  (`resolveSoundId`) and runs against the CONNECTED instrument's own table. A
  `resolveSounds` in this layer, resolving against the stored `source.soundList`
  instead, was removed on 2026-08-21: that list says what the instrument this
  patch was made on had, which is a different question from what the instrument
  in front of the user has (CLAUDE.md, CURRENT STATE MUST NOT STAND IN FOR
  RECORDED FACT). Sound IDs are not portable across instruments with
  different expansions.
- **Provenance is per-patch.** A library can legitimately hold patches from
  more than one instrument — that is the transfer use case. The top-level
  `source` is the library's own provenance; a patch may carry its own `source`
  override, and an absent patch `source` inherits the library's. Resolution
  uses each patch's EFFECTIVE soundList (its own, falling back to the
  library's) — never the top-level one unconditionally.
- **`source.soundList` is the full enumerated list from the originating
  instrument.** It is what makes a missing-expansion warning possible. Write it
  whenever there WAS an originating instrument.
- **With nothing attached, `soundList` and `firmware` are `null`.** They are
  claims about hardware, and offline there is no hardware to make them about.
  They used to fall back to the schema's list and `"1.37"`, which wrote a
  phantom instrument into the file — permanently, and indistinguishable
  afterwards from a real reading. On an owner with expansions it was simply
  false: their Seven reports 27 sounds, not 24. `schema` is still filled in,
  because that names what the BUILD knew and is true either way.
- **A VALUE OUT OF RANGE IS PRESERVED IN THE FILE AND CLAMPED EVERYWHERE ELSE.**
  Parse keeps it verbatim and reports it (`outOfRange`, naming key, value and
  max); the MIDI layer clamps at send time, because the instrument cannot
  represent it. **So a patch SAVED AS NEW from such a file records the clamped
  number, not the original.** The copy is not a faithful copy — it holds what
  the Seven was actually given. Nothing is lost, since the source file is never
  written to and still carries the unplayable value, but the two differ and
  only the original has the number that never played. Pinned by
  `test/patch-sender.test.js` ("reports the CLAMPED values it sent"), which is
  also where drift takes its baseline from (2026-08-21).

- **A COPY INHERITS the provenance of the patch it came from.** It was not made
  on whatever is plugged in now. Rebuilding `source` from current state
  produced copies claiming an instrument that never had the sound the patch is
  made of — measured 2026-08-21, a Venice Grand CFX patch duplicated offline
  became a file whose own `soundList` lacked CFX. `origin.copiedFrom` records
  the file it was copied from, on every copy.
- **`nameFrom` says the name was BORROWED, and from which file.** The Seven
  stores no preset names, so a name cannot survive a round trip on the wire: a
  transfer sends a sound and 110 values, and a backup afterwards would relabel
  the slot from its bank, preset and sound. When a backup finds exactly one
  library patch whose contents hash identically to what it just read — a patch
  claiming that same slot never counts, since that is the slot's own history —
  it takes that patch's name and records `{ "file": ..., "name": ... }` here.
  Zero matches or several give the generated name; picking between two names a
  user chose would be a guess. **The name is borrowed; `origin` is not** — it
  still says where these values were captured. Edit a parameter on the panel
  and the hash stops matching, so the next backup reverts to a generated name:
  it isn't that patch any more.
- **`patch.name` is a file-level label, NOT device truth.** The device is not
  known to store a preset name. Do not treat it as round-trippable to the
  instrument.
- **`origin` records provenance explicitly, and is null when unknown.** Three
  shapes: `{ "bank": B, "preset": P }` (captured from an instrument slot —
  backups add `date`, `soundId` and a sound-table fingerprint), `{ "created":
  "<iso>" }` (made by this app: seeding, in-app creation), or `null`. Import
  must never assume it, and the UI must never infer "created" — a patch with
  an absent or unrecognised origin displays as imported.
- **`captured` and `verified` are different questions.** `captured` is when
  these VALUES were first read off an instrument. `verified` is when an
  instrument last confirmed the slot still holds them — written by a backup
  run for every slot it reads, including slots whose contents were unchanged
  (those get a new `verified` and keep their original `captured`). The UI
  shows `verified` where it shows one date, because "how fresh is this?" is
  the question a backup answers. Both are optional; absent means unknown.
- **Globals never go in this file.** The serializer throws if a key named
  `wfp` appears anywhere in the object graph being written (the globals reply
  carries the instrument's Wi-Fi password under that key — CLAUDE.md Rule 6).
- **Unknown keys round-trip verbatim** at the top level and per patch, so a
  formatVersion 2 file opened by a version 1 build loses nothing on re-save.
- **Parse never mutates.** An out-of-range value is preserved verbatim and
  reported as a warning naming the key, the value and the schema max.
  Clamping happens at send time in the MIDI layer, never here — otherwise
  opening and re-saving a file from a future firmware silently destroys data.

## Completeness assumption — UNVERIFIED

This format **assumes the 110 parameters plus the sound constitute a complete
preset**. That is **unverified**: whether the instrument stores anything
further in a preset (a preset name, for instance) is an open question
(docs/PROJECT-SCOPE.md). `formatVersion` exists to cover extending the format
if it turns out to store more.

## API (src/format/)

| Function | Contract |
|---|---|
| `serializeLibrary(library)` | → JSON string. Deterministic order; throws on any `wfp` key at any depth. |
| `parseLibrary(text, {schema})` | → `{ library, report }`. Never throws on recoverable problems; invalid JSON yields `library: null` with the error in the report. Never mutates. |
| `validateLibrary(library, schema)` | → `{ errors, warnings, missingParams, outOfRange, unknownKeys }`. Returns data, prints nothing. Wrong `format` string / non-integer `formatVersion` are errors; out-of-range values and missing param keys are warnings. |
