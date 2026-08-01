# Project scope

Running notes on what's in and out of scope, and what must be resolved before
building on it. See CLAUDE.md for the four features (backup, transfer, editing,
visibility) and the hard project rules.

## Open questions

1. **Is mute a stored parameter, a global, or transient device state?** It has
   no obvious home in the 110 — `veq_vol` is the volume value, not a mute flag.
   Determine before the panel binds it to anything. (Hardware behaviour:
   press-and-hold on the volume knob mutes and darkens its light; press-and-hold
   again unmutes.)
