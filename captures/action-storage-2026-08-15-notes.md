# ACTION 0x0A storage query — first ACTIVE read, 2026-08-15

FW 1.37, Daniel's instrument, USB. Raw:
`action-storage-2026-08-15.jsonl`.

Until now `0x0A` had only been seen passively, sent by the manufacturer's editor
while loading its home page (2026-08-09). This is the same frame sent by us, on
purpose, and answered identically.

```
→ f0 73 26 14 72 0a 03 f7
← f0 73 26 14 73 01 0a 34 2e 30 47 42 f7        payload: 01 0a "4.0GB"
```

## What it establishes

- The query is **reproducible on demand** and safe: one frame in, one frame out,
  no side effects observed on the instrument.
- The reply is **13 bytes and carries exactly one ASCII value**, `4.0GB`. There
  is no second number, no delimiter, no label, no units field beyond the "GB" in
  the string itself.
- The value is **identical to the 2026-08-09 observation**, six days and no
  expansion changes apart.

## What it does NOT establish

- **Whether 4.0GB is total, used or free. UNKNOWN.** The wire says nothing, and
  the arithmetic does not settle it either: this unit has seven expansion
  downloads installed (≈1.51 GB of ZIPs, by the catalogue on crumar.it). If the
  number were USED, it disagrees with that unless installed size is far larger
  than download size. If it were FREE, total capacity would have to be ≥5.5 GB
  on an instrument whose storage is described as 4 GB. TOTAL is the only reading
  that is consistent without an extra assumption — which is an argument, not
  evidence, and it is recorded as such.
- **Used or free space is not separately obtainable.** One number is all the
  reply carries, and no other opcode is known to report storage.
- **There is no per-sound or per-expansion size anywhere.** The sound spec
  (`0x43`) returns `id|sampled|name` and nothing more; no opcode reports the
  size of an installed sample set.

## Deliberately not done

No sweep of neighbouring ACTION codes. `0x0A` is the only ACTION payload whose
meaning is known; the space also carries factory reset and firmware update, and
probing a neighbour to see what it does is how you find out what the reset code
is. The standing rule stands: **ACTION is observe-only apart from this one
verified read.**

## How to settle the total/used/free question

Only a second instrument can: a Seven with a different number of expansions
installed, or this one after installing or removing a set. If the number moves,
it is used or free; if it does not, it is total. An instrument report submitted
by another owner would also answer it, since it carries the sound table and
could carry this string.
