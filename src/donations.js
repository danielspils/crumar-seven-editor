'use strict';

// The donation prompt's state, and the rules that decide whether it may be
// shown. docs/DONATIONS.md is the specification; this is where it is enforced.
//
// The whole design follows from one principle: ask once, after the app has
// demonstrably done something useful, and accept no for an answer PERMANENTLY.
// Every rule below is a consequence of that, so relaxing one quietly is how
// this becomes nagware.
//
//   - TWO automatic showings, ever, and at least 7 days apart. A qualifying
//     trigger inside those 7 days is skipped SILENTLY, not queued.
//   - "I already donated" and "Don't ask again" end it for good. So does the
//     second showing, however it is answered.
//   - Nothing that happened before this feature existed counts. The state file
//     starts empty, which is not an accident to be fixed later: Daniel has run
//     dozens of backups, and counting them would skip him straight past both
//     showings (Daniel, 2026-08-16).
//
// This module holds no UI and opens no links. It answers one question — may we
// ask, and which showing is it — and records what the answer was.

const fs = require('fs');
const path = require('path');

const MIN_DAYS_BETWEEN = 7;
const MAX_SHOWINGS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

const EMPTY = { shown: 0, lastShown: null, neverAsk: false };

class Donations {
  // `now` is injectable so the seven-day rule can be tested without waiting a
  // week, which is also why SEVEN_RESET_DONATIONS exists for the app itself.
  constructor(dir, { now = () => Date.now() } = {}) {
    this.file = path.join(dir, 'donations.json');
    this.now = now;
  }

  read() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return {
        shown: Number(raw.shown) || 0,
        lastShown: raw.lastShown || null,
        neverAsk: !!raw.neverAsk,
      };
    } catch {
      // No file, unreadable file, half-written file: all mean "we have never
      // asked". Never throwing matters more than the state — a donation
      // prompt must not be able to stop the app opening.
      return { ...EMPTY };
    }
  }

  write(state) {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, `${JSON.stringify(state, null, 2)}\n`);
    } catch (err) {
      console.warn(`[donations] could not write state: ${err.message}`);
    }
  }

  // Which showing this trigger earns, or 0 for none. Callers pass only
  // COMPLETED operations — a cancelled or failed run is not a trigger, and
  // that judgement belongs to the caller who knows what happened.
  dueShowing() {
    const s = this.read();
    if (s.neverAsk) return 0;
    if (s.shown >= MAX_SHOWINGS) return 0;
    if (s.lastShown) {
      const elapsed = this.now() - Date.parse(s.lastShown);
      // Two backups in one afternoon must not produce both showings. Inside
      // the window the trigger is dropped, not remembered for later.
      if (!(elapsed >= MIN_DAYS_BETWEEN * DAY_MS)) return 0;
    }
    return s.shown + 1;
  }

  // Call when a showing has actually been put on screen.
  recordShown() {
    const s = this.read();
    this.write({
      ...s,
      shown: s.shown + 1,
      lastShown: new Date(this.now()).toISOString(),
    });
  }

  // How it was answered. 'donate' and 'later' leave the door open; the other
  // two close it for good. Donating is deliberately NOT a never-ask: someone
  // who gives once may want the second ask to say thank you, and the seven-day
  // rule plus the two-showing cap already bound it.
  recordAnswer(answer) {
    if (answer !== 'already' && answer !== 'never') return;
    this.write({ ...this.read(), neverAsk: true });
  }

  // SEVEN_RESET_DONATIONS. Permanent development tooling, not a temporary
  // convenience: this state is one-directional and slow, so without a reset
  // the second showing is a week away and "I already donated" is a dead end.
  reset() {
    this.write({ ...EMPTY });
  }
}

module.exports = { Donations, MIN_DAYS_BETWEEN, MAX_SHOWINGS };
