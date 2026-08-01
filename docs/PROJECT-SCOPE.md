# Project scope

Running notes on what's in and out of scope, and what must be resolved before
building on it. See CLAUDE.md for the four features (backup, transfer, editing,
visibility) and the hard project rules.

## Open questions

1. **The volume knob has a blue Local Off state. Whether Local Off is readable
   or settable over SysEx is unknown.** (Hardware behaviour per the manual:
   a slow push — held at least 100ms — toggles Local Off; the keyboard stops
   playing the internal engine but keeps sending MIDI out, and the knob turns
   blue.)

## Patch format notes

- The expression pedal assignment is stored with each preset (confirmed by the
  manual), so **`pdl_exp` belongs in the saved patch**.
