# Probe — sound-table addressing + 0x40 bulk dump, 2026-08-09

One-off read probes sent while building the app's MIDI layer (device connected,
FW 1.37). Read opcodes only. Raw exchanges reproduced verbatim.

## `0x40` (max sound) triggers a full self-description dump

On a quiet bus, a bare max-sound request answered with far more than a count:

```
→ f0 73 26 14 40 f7
← f0 73 26 14 41 18 32 f7                          24 sounds (binary 0x18 + ASCII '2')
← f0 73 26 14 43 00 30 7c 30 7c 54 69 6e 65 ... f7  "0|0|Tine Piano"
   … all 24 sound specs in id order …
← f0 73 26 14 11 00 00 6e f7                        max param id (110)
← f0 73 26 14 15 00 30 7c ... 0a f7                 "0|pno_rho|rho_tp|Type|-1|8|8|0\n"
   … the full 110-parameter spec stream …
```

The `0x41` reply mirrors the `0x45` shape: binary count, then one ASCII char
equal to the first decimal digit of the count. The `0x15` frames in the dump
carry a trailing `0x0a` (newline) before `F7` — individual `0x15` replies don't.
This dump is how the manufacturer's editor syncs on page load (earlier captures
showed the same streams and we attributed them to individual editor requests;
they are one `0x40`).

## `0x42` (sound spec) addressing: pad + SINGLE binary id byte

Not the two-byte param addressing. Pinned by elimination:

```
→ f0 73 26 14 42 00 15 f7            pad + 0x15 (21)
← f0 73 26 14 43 15 32 31 7c 31 7c 56 65 6e 69 63 65 20 47 72 61 6e 64 f7
                                      binary id echo + "21|1|Venice Grand"
→ f0 73 26 14 42 00 08 f7            pad + 8
← f0 73 26 14 43 08 38 7c 31 7c 47 53 69 20 47 72 61 6e 64 20 44 f7
→ f0 73 26 14 42 00 18 f7            pad + 24 — OUT OF RANGE
← f0 73 26 14 43 18 32 34 7c 30 7c f7  id echoed, EMPTY name: "24|0|"
```

Misframings, for the record:

```
→ f0 73 26 14 42 00 00 17 f7   param-style (pad+hi+lo, id 23) → returned id 0
                                (byte after the pad is the id; extras ignored)
→ f0 73 26 14 42 15 f7          no pad → empty reply f0 73 26 14 43 f7
```

Termination rule for enumeration: request ids from 0 upward until the echoed
spec has an empty name.

## `0x23` value reply: FOUR fields, and the 4th is not max

```
← f0 73 26 14 23 00 "1|rho_atk|127|127"    when rho_atk was 127
← f0 73 26 14 23 00 "1|rho_atk|64|64"      when rho_atk was 64
```

`id|key|value|<4th>` — the 4th field mirrored the value both times (`rho_atk`
max is 127, so 64 rules out max). Meaning unpinned; the app ignores it.

## Shared-bus behavior (macOS)

While the manufacturer's web editor held the same port in Chrome, every device
reply it triggered also arrived at our open input — CoreMIDI delivers input to
all clients. Any reply matcher keyed on opcode alone can be satisfied by
another client's traffic; the app's MIDI layer validates the echoed id/index
wherever a reply carries one.
