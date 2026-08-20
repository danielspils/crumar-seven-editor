# User feedback

Reports from people using This Seven Goes to Eleven. One entry per report, newest
last. Three parts each:

- **What it confirms** — something now verified on hardware that isn't mine. This
  is the part I can't get any other way and it's the easiest to skim past.
- **What it asks for** — the request, and underneath it the actual need. They are
  rarely the same thing.
- **Status** — what happened.

Most of these are things I could not have found myself. The demo patches needed an
empty library I don't have; the expansion double-listing needed an uncatalogued
expansion I can't own by definition. Other people's instruments are the only place
these exist.

---

## 2026-08-17 — first user report (Crumar Seven owner)

> Backup works, but presets on computer don't seem to work — I have to switch back
> to bank 1. The app referenced a "Steinway D Berlin" sample I couldn't find to
> download.

**Confirms:** backup works on someone else's instrument. First independent
confirmation of the core feature.

**Asks for:** nothing — a bug report.

**Root cause:** v1.0.0 seeded 32 demo patches into any empty library. Two named
sounds no Seven has ever had; eight more named expansions a given user may not own.
The Patches list suppressed the "not installed" badge entirely, so a patch he
couldn't play looked normal.

**Status:** fixed in 1.1.0. Untouched demo patches removed on update, to the Trash,
exact matches only, with a one-time notice. Badge restored. Shipping demo content
at all was the bug.

---

## 2026-08-18 — Rich Olivieri (Facebook, Crumar Seven User Group)

> Downloaded the update and worked well!
>
> I like that you can name the patches, really helps organizing and not having to
> remember what's in each bank and preset
>
> I'm wondering if you can create some iOS companion app that can show what's in
> each bank for reference. I wouldn't plan having the usb cable attached to my
> laptop at a gig. But would be good to setup the 7 beforehand.

**Confirms two things, both previously unproven:**

1. The 1.1.0 auto-update ran on a machine that isn't mine. Until this, the update
   path had only ever been observed on my own Mac — and it's the one piece of the
   app that can't be tested by running it locally.
2. Patch naming is what users value most so far. Both reports to date are about the
   library, not about editing.

**Asks for:** an iOS companion app showing what's in each bank.

**What he actually needs:** the bank and preset map available at the gig, away from
the computer. He says setup happens beforehand and the cable won't be attached — so
it's a READ-ONLY VIEWER. No MIDI, no connection, no live data. Which makes an iOS
app one possible answer and not the cheapest.

**Status:** shipped in 1.2.0 as Copy setlist and Email setlist — two icons on a
setlist that put a plain-text version on the clipboard or into a mail draft. Paste
into Notes, which syncs to the phone; or email it to yourself. Solves the stated
need without a second platform. A richer HTML "gig sheet" with a swipeable
single-patch view is designed and parked.

---

## 2026-08-19 — Rich Olivieri (Facebook, Crumar Seven User Group)

> Ok nice I see. Another issue. Sorry for the picture of the screen. But it's
> saying sounds not installed but they are.

**Confirms:** a bug I could not have found on my own hardware. It requires owning
an expansion my catalogue doesn't know about — and I catalogue everything I own, so
by construction I can never be in that state.

**Asks for:** nothing — a bug report, with a photo of his screen.

**Root cause:** not a name mismatch. `data/expansions.json` carried `sounds: null`
for three entries — Venice Grand C5, Venice Grand CFX, Venice Upright K8 — because
I didn't own them and had nothing to read the instrument's names off. With no name
to compare, each appeared twice: once as "Unverified" from the catalogue side, once
as "Installed, not in the catalogue" from the device side. Both rows individually
true, describing the same sound. The header also counted the unverified entries as
available, offering him sounds he already owned.

**Status:** fixed in 1.2.1. I bought and installed all three, read the names off my
own instrument, and filled them in. The available count no longer treats "we don't
know" as "you don't have it" — which the module's own header had said all along.

**What it produced beyond the fix:** the free README PDF that ships with each
expansion carries the instrument's exact sound name in its page footer. Predicted
all three names from footers before installing and was right character for
character. So every future Crumar expansion can be catalogued without buying it,
installing it, or waiting for an owner. That's the permanent fix; the three lines
of data were just today's.

Also learned: installing expansions RENUMBERS the instrument's sound ids. Ids
aren't stable within one unit over time, not just between units.
