# VOID SESSION — sweep-trigger, 2026-08-14

**This capture answers nothing. Do not read a result out of it.** Kept because
Rule 5 says raw bytes are never deleted, and because what went wrong is worth
knowing.

Raw: `sweep-trigger-2026-08-14-2026-08-14T20-13-39.jsonl`, 814 messages from
`tools/listen.js`, device→host only, 20:13:39 → 20:20:07.

## What it was for

The 14 Aug editor tap (`editor-tap-set-sound-2026-08-14.json`) contains two
110-parameter `0x22` bursts, each sitting just after a sound change **and** just
after navigating to EDIT PIANO. Outbound frames cannot separate those two
causes. The test was to change the sound **without leaving the edit page**, with
a listener running so the device's side was captured too — the half the tap
lacks.

## Why it is void

The sound change never reached the instrument. Clavi was clicked on SELECT
PIANO; ten seconds passed with no `0x22` burst; the Seven had not switched.
A burst that never happened proves nothing when the write that was supposed to
cause it never landed.

## The actual finding: Chrome's WebMIDI output wedged, input kept working

The asymmetry is the interesting part, and it was thorough:

- Panel preset changes reached the editor normally — **input fine**.
- The editor's home page read firmware 1.37, build date and 4.0 GB storage off
  the device — **reads fine**.
- Editor sound changes did nothing on the instrument — **writes gone**.
- A hand-rolled `navigator.requestMIDIAccess` → `out.open()` → `send()` of
  `f0 73 26 14 46 03 f7` reported the connection **open**, threw nothing, and
  did nothing. A plain Program Change did nothing either. So the failure is
  silent: no exception, no closed port, no error to catch.

Not cleared by, in order: quitting the Electron app; stopping the listener;
reloading the tab; unplugging and replugging USB; quitting Chrome entirely;
power-cycling the Seven; power-cycling the Seven with Chrome closed.

**Not the hardware.** *This Seven Goes to Eleven*, on `@julusian/midi`, worked
in both directions on the same cable and the same instrument immediately
afterwards. The app's own MIDI stack was never affected.

## What is in the file anyway

Everything the instrument said while this was going on — which is real device
traffic, just not an answer to the question:

```
535 × 0x23   parameter value replies
125 × 0x43   sound spec replies
120 × B0     CC (panel)
 12 × 0x45   current-sound broadcasts
  7 × 0x47   sound name replies
  5 × 0x33   globals replies      (wfp masked at write time, Rule 6)
  5 × 0x71   string replies
  5 × C0     program change
```

The `0x45`/`0x47` traffic is the editor and the panel talking, not the failed
writes: nothing the browser sent got through.

## A hazard worth naming

The browser hook was armed **twice** in this session, so
`MIDIOutput.prototype.send` was wrapped twice and every outbound frame would
have been logged twice. Nothing was exported, so no capture is affected — but a
doubled hook is easy to create (re-paste the snippet into a tab that already has
it) and hard to spot afterwards, since a doubled log looks like a device that
repeats itself. Re-arming is now called out in `tools/capture-hook.js`.

## Carry forward

1. **The sweep-trigger question is still open.** Re-running it needs a browser
   that can actually write. Try a different Chrome profile, or another
   WebMIDI-capable browser, before suspecting the instrument.
2. **The capture method itself is exposed.** Protocol work here leans on Chrome
   driving the editor while a listener watches. If Chrome's WebMIDI output can
   fail silently and stay failed across every reset short of a different
   browser, that method is not dependable on its own. Recorded in
   `docs/protocol.md` beside the browser-hook instructions.
