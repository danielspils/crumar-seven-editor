# Future features

Things worth building that are not scheduled. An item lands here when it has
been thought through far enough to be worth writing down but is not being built
now — including the alternatives already rejected, so nobody re-proposes them.

The authoritative record of what SHIPPED is GitHub Releases plus `CLAUDE.md`.
Nothing on this page is built.

## Expansion descriptions in the Sounds modal

Crumar's expansion names are internal branding — "Venice Grand C5" tells a user
nothing about what it is. Each expansion's README PDF names the actual
instrument sampled, plus sample count, velocity layers and whether samples are
looped.

Add a one-line `description` per entry in data/expansions.json, written in my
own words from the PDFs, e.g. "Yamaha CP70B electric grand, 316 samples,
unlooped." Shows in place, works offline, nothing redistributed, no dependency
on GSi's site staying where it is.

Two constraints when we do it:

- Never infer a make or model from the code name. If a PDF doesn't state the
  manufacturer, leave it out. Guessing "D-274" is a Steinway is wrong on
  accuracy and on trademark.
- I only have three of the ten READMEs on disk (C5, CFX, K8). The other seven
  are free re-downloads and would need fetching first.

Rejected alternatives, so nobody re-proposes them: bundling the PDFs
(redistributes GSi's documents, adds MBs to every build, goes stale silently),
and linking to the PDFs directly (they aren't hosted — they exist only inside
the download zips). Linking to GSi's per-expansion pages is a possible
secondary, but unverified: we don't know all ten have pages.
