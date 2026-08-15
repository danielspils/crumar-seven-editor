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

## Copy

Name the real costs. "Support development" is abstract and reads as
boilerplate; a checkable number does not.

The actual annual costs, shared across both apps:

| Item | Cost |
|---|---|
| Apple Developer Program | $99/year |
| Azure Artifact Signing | ~$120/year |

**One certificate and one Apple membership cover both apps**, so don't state
the full figure as though each app carried it separately. Either give the
combined total once and say it covers both, or give a per-app share. Not
both, and never the same total twice.

Also say: the app is free and open source and will stay that way.

Draft the wording and get it approved before shipping — this is the only
place in either app where we ask the user for something, and it is the one
screen where tone matters more than function.

---

## State

Persist alongside the other app settings in `userData`:

- shown count
- last shown date
- never-ask flag

**Must survive app updates.** A user who declined twice and then gets asked
again after an update has been told their answer didn't matter.

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
