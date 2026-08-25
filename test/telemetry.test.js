'use strict';

// WHETHER THE APP CHECKS IN TODAY — every rule, without a network or a clock.
//
// The decision is separated from the sending precisely so this file can exist:
// an active-install count is only meaningful if each install checks in at most
// once a calendar day, and that rule lives here rather than in the Worker,
// which cannot verify it without remembering who asked.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { Telemetry, dayOf } = require('../src/telemetry.js');

const fresh = (opts) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seven-telemetry-'));
  return { dir, t: new Telemetry(dir, opts) };
};
const at = (iso) => () => new Date(iso).getTime();

test('a fresh install checks in — absent means on', () => {
  const { t } = fresh({ now: at('2026-08-24T09:00:00') });
  assert.strictEqual(t.enabled(), true, 'no file is a new install, not an opt-out');
  assert.strictEqual(t.decide('1.5.2').ping, true);
});

test('once a calendar day, and it says why not', () => {
  const { t } = fresh({ now: at('2026-08-24T09:00:00') });
  const first = t.decide('1.5.2');
  assert.strictEqual(first.ping, true);
  t.recordPing(first.day);

  const again = t.decide('1.5.2');
  assert.strictEqual(again.ping, false);
  assert.match(again.reason, /already checked in today/,
    'a silent false is indistinguishable from a broken ping');
});

test('a CALENDAR day, not 24 hours', () => {
  // Somebody who opens the app each morning should count once a day. On a
  // rolling 24-hour rule, opening at 09:00 then 08:00 the next morning skips a
  // day — and then two launches land in one day later on.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seven-telemetry-'));
  const morning = new Telemetry(dir, { now: at('2026-08-24T09:00:00') });
  morning.recordPing(morning.decide('1.5.2').day);

  const earlierNextDay = new Telemetry(dir, { now: at('2026-08-25T08:00:00') });
  assert.strictEqual(earlierNextDay.decide('1.5.2').ping, true,
    'a new day is a new check-in even 23 hours later');
});

test('opting out is honoured, and survives a reread', () => {
  const { dir, t } = fresh({ now: at('2026-08-24T09:00:00') });
  t.setEnabled(false);
  assert.strictEqual(t.enabled(), false);
  assert.strictEqual(t.decide('1.5.2').ping, false);
  assert.match(t.decide('1.5.2').reason, /opted out/);
  // A PRESENT `false` MUST SURVIVE. Read with a plain `||` it would read as
  // absent, and absent means on — which would turn an opt-out back on.
  assert.strictEqual(new Telemetry(dir).enabled(), false, 'and it is still off in a new process');
});

test('opting back in forgets the old date rather than skipping a day', () => {
  const { dir } = fresh({});
  const t = new Telemetry(dir, { now: at('2026-08-24T09:00:00') });
  t.recordPing(t.decide('1.5.2').day);
  t.setEnabled(false);
  t.setEnabled(true);
  assert.strictEqual(t.decide('1.5.2').ping, true,
    'turning it back on must not be blocked by a stale lastPing');
});

test('a version that is not a version is never sent', () => {
  // It becomes a key in somebody's KV store and a path in GoatCounter. The
  // Worker rejects it too; finding out here costs no request.
  const { t } = fresh({ now: at('2026-08-24T09:00:00') });
  for (const bad of ['', null, undefined, '1.5', 'v1.5.2', '1.5.2-beta', '1.5.2.3', 'nightly']) {
    const d = t.decide(bad);
    assert.strictEqual(d.ping, false, `refused: ${JSON.stringify(bad)}`);
    assert.match(d.reason, /does not look like one/);
  }
  assert.strictEqual(t.decide('1.5.2').ping, true);
  assert.strictEqual(t.decide('10.20.30').ping, true);
});

test('a FAILED send does not consume the day', () => {
  // recordPing is called only when a ping actually left. If a failure marked
  // the day anyway, an app that is offline every morning would never check in.
  const { t } = fresh({ now: at('2026-08-24T09:00:00') });
  assert.strictEqual(t.decide('1.5.2').ping, true);
  // …send fails, nothing recorded…
  assert.strictEqual(t.decide('1.5.2').ping, true, 'still due');
});

test('an unreadable file means never pinged, never opted out — and never throws', () => {
  const { dir, t } = fresh({ now: at('2026-08-24T09:00:00') });
  fs.writeFileSync(path.join(dir, 'telemetry.json'), '{ this is not json');
  assert.doesNotThrow(() => t.read());
  assert.strictEqual(t.enabled(), true);
  assert.strictEqual(t.decide('1.5.2').ping, true);
});

test('an unwritable directory cannot stop the app', () => {
  const t = new Telemetry('/proc/definitely-not-writable', { now: at('2026-08-24T09:00:00') });
  assert.doesNotThrow(() => t.setEnabled(false));
  assert.doesNotThrow(() => t.recordPing('2026-08-24'));
});

test('dayOf is local, so the day boundary is the user\'s midnight', () => {
  const d = new Date(2026, 7, 24, 23, 59, 0);   // local 24 Aug, late evening
  assert.strictEqual(dayOf(d.getTime()), '2026-08-24');
  const nextMorning = new Date(2026, 7, 25, 0, 1, 0);
  assert.strictEqual(dayOf(nextMorning.getTime()), '2026-08-25');
});

// ── A development build must not check in to the production relay ──────
//
// These exist because it already happened: a stray 1.5.3 reached the live
// relay from `npm start` and the UI suite, and the metrics page reported a
// version nobody had. The count was wrong in the one direction that matters —
// upward, in the author's favour, from the author's own machine.

test('a dev build does not ping, and says so rather than going quiet', () => {
  const { t } = fresh({ now: at('2026-08-25T09:00:00'), packaged: false, env: {} });
  const d = t.decide('1.5.3');
  assert.strictEqual(d.ping, false);
  assert.match(d.reason, /development build/,
    'a quiet false here would be indistinguishable from a broken ping in production');
});

test('a dev build that declines does NOT consume the day', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seven-telemetry-'));
  const dev = new Telemetry(dir, { now: at('2026-08-25T09:00:00'), packaged: false, env: {} });
  assert.strictEqual(dev.decide('1.5.3').ping, false);
  // Same folder, same day, packaged this time: the shipped app must still
  // check in. A dev run that wrote lastPing would silence the real one.
  const shipped = new Telemetry(dir, { now: at('2026-08-25T09:00:00'), packaged: true, env: {} });
  assert.strictEqual(shipped.decide('1.5.3').ping, true);
});

test('SEVEN_PING_DEV=1 is the deliberate way through, and only that value', () => {
  const mk = (env) => fresh({ now: at('2026-08-25T09:00:00'), packaged: false, env }).t;
  assert.strictEqual(mk({ SEVEN_PING_DEV: '1' }).decide('1.5.3').ping, true);
  // Presence is not consent: a stray empty or truthy-looking value must not
  // open the real endpoint.
  for (const v of ['', '0', 'true', 'yes']) {
    assert.strictEqual(mk({ SEVEN_PING_DEV: v }).decide('1.5.3').ping, false, `SEVEN_PING_DEV=${v}`);
  }
});

test('OPTING OUT still wins over the dev override', () => {
  const { t } = fresh({ now: at('2026-08-25T09:00:00'), packaged: false, env: { SEVEN_PING_DEV: '1' } });
  t.setEnabled(false);
  assert.strictEqual(t.decide('1.5.3').ping, false);
  assert.match(t.decide('1.5.3').reason, /opted out/,
    'a debugging flag must never override a person saying no');
});

test('a PACKAGED build is unaffected by the flag being absent', () => {
  const { t } = fresh({ now: at('2026-08-25T09:00:00'), packaged: true, env: {} });
  assert.strictEqual(t.decide('1.5.3').ping, true);
});
