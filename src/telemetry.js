'use strict';

// WHETHER TO CHECK IN TODAY. Nothing here talks to the network — this decides,
// main.js sends (see PING_URL there), and keeping the decision separate is what
// makes the rules testable without an endpoint or a clock.
//
// WHAT THE APP SENDS, and it is the whole payload: platform and version. No
// identifier, and none derived — there is deliberately no way to link two
// pings to the same install. The count IS the number, because each install
// checks in at most once a calendar day, so a day's ping count is the
// active-install count. Identity is never needed to get it.
//
// THE ONCE-A-DAY RULE LIVES HERE, not in the Worker. The Worker cannot verify
// it and does not try: verifying it would mean remembering who asked, which is
// the thing being avoided.
//
// ON BY DEFAULT, off in one click — Help ▸ Send anonymous daily ping. That is
// JP Patches' shape, and this app matches it deliberately so the two projects'
// figures mean the same thing. It is also the decision most worth being able
// to point at later, so: the app tells you, in the release notes and on
// thissevengoestoeleven.com/privacy, and the switch is one menu away.
//
// A CALENDAR DAY IN LOCAL TIME, not 24 hours. Somebody who opens the app each
// morning should count once a day, not slide later and later until two
// launches land in one day and none in the next.

const fs = require('fs');
const path = require('path');

const EMPTY = { enabled: true, lastPing: null };

// The version has to look like a version before it becomes a key in somebody's
// KV store and a path in GoatCounter. Same expression the Worker validates
// with, on purpose: a payload this rejects is one the Worker would reject too,
// and finding that out here costs no request.
const VERSION_RE = /^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$/;

const dayOf = (ms) => {
  const d = new Date(ms);
  // Local, not UTC — see the note above.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// A DEVELOPMENT BUILD MUST NOT PING THE REAL RELAY. Found the day the ping
// went in: the metrics page read "Versions running: 2" and the second one was
// 1.5.3 — a version nobody had, because `npm start` and the UI suite launch the
// same app against the same endpoint, and any scenario alive past ten seconds
// checks in. Daniel's own development was inflating Daniel's own figures, and
// the version breakdown — the half the release note promises — was naming
// builds that had never shipped.
//
// It reports the reason rather than returning a quiet false, so a genuinely
// missing ping in production can never be mistaken for this.
const DEV_OVERRIDE = 'SEVEN_PING_DEV';

class Telemetry {
  // `now` is injectable so the once-a-day rule can be tested without waiting.
  //
  // `packaged` DEFAULTS TO TRUE on purpose. The two ways to get it wrong are
  // not equal: a caller that forgets the option pings from dev — visible, one
  // stray row, fixable. Defaulting the other way means a forgotten option
  // silently stops telemetry in the shipped app, which looks exactly like
  // nobody using it. The default is the recoverable mistake, and a
  // source-wiring test asserts main.js really passes `app.isPackaged` — the
  // APP_TAG lesson: when the default and the injection agree in dev, only a
  // test that reads the wiring can tell they are still connected.
  constructor(dir, { now = () => Date.now(), packaged = true, env = process.env } = {}) {
    this.file = path.join(dir, 'telemetry.json');
    this.now = now;
    this.packaged = packaged;
    this.env = env;
  }

  read() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return {
        // ABSENT MEANS ON. A missing file is a fresh install, not somebody who
        // opted out — but a present `false` must survive, so this cannot be a
        // plain `||`.
        enabled: raw.enabled === false ? false : true,
        lastPing: typeof raw.lastPing === 'string' ? raw.lastPing : null,
      };
    } catch {
      // No file, unreadable file, half-written file: all mean "never pinged,
      // never opted out". Never throwing matters more than the state — a
      // usage ping must not be able to stop the app opening.
      return { ...EMPTY };
    }
  }

  write(state) {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, `${JSON.stringify(state, null, 2)}\n`);
    } catch {
      // A preference that cannot be saved is worse than one that is not
      // saved loudly: the app carries on either way.
    }
  }

  enabled() { return this.read().enabled; }

  // The menu toggle. Turning it OFF also forgets when we last pinged, so
  // turning it back on months later does not skip a day on the strength of a
  // stale date.
  setEnabled(on) {
    const state = this.read();
    this.write(on ? { ...state, enabled: true } : { enabled: false, lastPing: null });
    return this.enabled();
  }

  // The whole decision, in one place and with a REASON — a silent false is
  // indistinguishable from a broken ping, and this app has been bitten by that
  // shape before.
  decide(version) {
    const state = this.read();
    if (!state.enabled) return { ping: false, reason: 'opted out' };
    // SEVEN_PING_DEV=1 is the deliberate way to exercise the real endpoint from
    // a dev build. It must be chosen, never inherited by accident — which is
    // why the check is on an explicit value rather than mere presence.
    if (!this.packaged && this.env[DEV_OVERRIDE] !== '1') {
      return { ping: false, reason: `development build (set ${DEV_OVERRIDE}=1 to ping anyway)` };
    }
    if (!VERSION_RE.test(String(version || ''))) {
      return { ping: false, reason: `version does not look like one: ${version}` };
    }
    const day = dayOf(this.now());
    if (state.lastPing === day) return { ping: false, reason: 'already checked in today' };
    return { ping: true, day };
  }

  // Recorded ONLY on a ping that actually left. A failed send must not consume
  // the day, or an app that is offline every morning never checks in at all.
  recordPing(day) {
    this.write({ ...this.read(), lastPing: day || dayOf(this.now()) });
  }
}

module.exports = { Telemetry, dayOf, VERSION_RE, DEV_OVERRIDE };
