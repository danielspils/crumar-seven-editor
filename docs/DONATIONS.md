# Donation Prompt

Shared design for **This Seven Goes to Eleven** and **JP Patches**. Both are
free and MIT-licensed and will stay that way. This describes an ask, not a
paywall.

---

## Principle

Ask once, after the app has demonstrably done something useful. Accept no
for an answer permanently. Never ask for the ability to keep using the app,
because that ability is never in question.

Every rule below follows from that. Where a rule seems inconvenient, the
principle wins.

---

## Destination

`https://ko-fi.com/danielspils` — opened with `shell.openExternal`.

Suggested amount is $10. Ko-fi's own page handles the amount, currency and
payment; the app links out and does nothing else. **No in-app payment
handling of any kind**, no embedded webview, no card fields.

Both apps point at the same page. One consequence worth knowing rather than
solving: Ko-fi won't tell you which app a donation came from.

---

## Triggers

Fire only after a **completed** operation that delivered real value.
Cancelled, failed and partial runs never count.

**This Seven Goes to Eleven**
- First completed backup run
- First completed transfer to the instrument

**JP Patches**
- First completed capture from the JX-3P
- First completed send to the JX-3P

Either trigger can serve either showing — whichever happens first is
showing 1.

### Timing within the trigger

Fire on **dismissal of the completion summary**, never on top of it. The
user waited through the operation to read its result — "28 unchanged, 4
new", or the captured patch names. Covering that with a donation ask
squanders the goodwill the operation just earned.

### Existing users

Both apps already have users. On update, an existing user's next qualifying
operation is showing 1. Don't try to grandfather anyone out — someone
who has used the app for a year is exactly who the ask is for.

---

## Showing rules

**Two automatic showings, ever. Then never again.**

**Showing 1** — buttons at equal visual weight:

```
[ Donate ]   [ Remind me later ]   [ I already donated ]
```

*I already donated* sets the never-ask flag permanently. Honour system:
there's no receipt callback, and asking someone who has already given is the
worst outcome available. Make it as easy to click as Donate.

**Showing 2** — the next qualifying trigger after a *Remind me later*:

```
[ Donate ]   [ Don't ask again ]   [ I already donated ]
```

*Don't ask again* carries the same visual weight as Donate. Not a grey
link, not small text, not tucked in a corner.

**Minimum 7 days between showings.** Two backups in one afternoon must not
produce both. If the next qualifying trigger arrives inside 7 days, skip it
silently and wait for one after.

**Never automatically again** once any of these happen: *Don't ask again*,
*I already donated*, or showing 2 completing in any way.

**Always available**: a "Support this app" item in the Help menu, so anyone
who changes their mind can find it. It never counts as a showing.

---

## Copy — settled

**This Seven Goes to Eleven**, verbatim. Daniel's words, 2026-08-16. Not to be
edited, tightened or "improved" without him:

> This Seven Goes to Eleven is free.
>
> Code signing and hosting run about $220 a year. If 7/11 is useful to you,
> $10 helps cover the cost.
>
> Thanks from Seattle! — Daniel

Why it reads the way it does, so a later edit does not undo the reasoning:
the cost is a checkable number rather than "support development"; $220 is the
combined annual figure for both apps (Apple $99, Azure ~$120) stated **once**,
not per app; and the ask names an amount without preselecting or requiring it.

JP Patches needs its own version of these three lines — the first sentence
names the app, and the same total must not be claimed twice.

| Item | Cost |
|---|---|
| Apple Developer Program | $99/year |
| Azure Artifact Signing | ~$120/year |

---

## State

Persist alongside the other app settings in `userData`:

- shown count
- last shown date
- never-ask flag

**Must survive app updates.** A user who declined twice and then gets asked
again after an update has been told their answer didn't matter.

### Existing users start from zero

The state file starts **empty**, and nothing that happened before the feature
existed counts. Daniel has run dozens of backups; none of them are showings.
The next completed backup, transfer or Sample Library open after the feature
ships is **showing 1**, for him and for every user who already has the app
(Daniel, 2026-08-16).

This falls out of an empty state file rather than needing a rule — but it has
to be deliberate, because the alternative (counting history) would silently
skip straight to showing 2, or past it.

### `SEVEN_RESET_DONATIONS` — development only, permanent

Clears the donation state: shown count, last shown date, never-ask flag. It
exists for the same reason `SEVEN_FORCE_MISMATCH` does — the state is
one-directional and slow, so without a reset the second showing is seven days
away and the never-ask flag is a dead end. Every change to this copy or to the
trigger logic needs it.

```
SEVEN_RESET_DONATIONS=1 npm start
```

Documented in CLAUDE.md beside the other development flags. Not temporary, and
not something to remove once the feature "works" — it is how anyone verifies
the second showing at all.

Note for JP Patches: the Mac build auto-updates and the PC build does not.
The state must be robust to both paths.

---

## Never

- Show on launch, on a timer, or on a launch count
- Show more than twice automatically
- Gate, degrade, delay, or nag any feature behind the donation
- Preselect anything other than the suggested amount
- Show during an operation, or over its result
- Reset the never-ask flag for any reason, including a major version bump

---

## Download page — not the app

A plain visible line under the download button:

> Free and open source. Donations cover code signing and hosting.

with the Ko-fi link. **Present, not asked.** No prompt, no modal, nothing to
dismiss.

The reasoning: nobody donates for software they haven't run, and the
installer step is where Windows SmartScreen and macOS Gatekeeper warnings
already land. That step needs to stay as frictionless as it can be. A line
of text catches anyone who would have given unprompted and costs nothing.
