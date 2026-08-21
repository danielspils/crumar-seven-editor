'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { startDayRollover, msUntilNextMidnight, SLACK_MS } = require('../src/day-rollover.js');

// A controllable clock and timer, so a whole week passes in no time at all and
// nothing here depends on the machine's own date.
function fakeHost(startAt) {
  const state = { now: new Date(startAt), pending: null, nextId: 1, cleared: [] };
  return {
    state,
    now: () => new Date(state.now),
    setTimer: (fn, ms) => {
      state.pending = { id: state.nextId, fn, at: state.now.getTime() + ms };
      return state.nextId++;
    },
    clearTimer: (id) => { state.cleared.push(id); if (state.pending && state.pending.id === id) state.pending = null; },
    // Run the armed timer, advancing the clock to its deadline.
    fire() {
      const t = state.pending;
      if (!t) throw new Error('nothing armed');
      state.pending = null;
      state.now = new Date(t.at);
      t.fn();
    },
  };
}

test('the callback fires at the next local midnight, plus slack', () => {
  const host = fakeHost('2026-08-21T14:32:10');
  let fired = 0;
  startDayRollover({ onRollover: () => { fired++; }, now: host.now, setTimer: host.setTimer, clearTimer: host.clearTimer });

  const armedFor = new Date(host.state.pending.at);
  assert.strictEqual(armedFor.getDate(), 22, 'lands on the next day');
  assert.strictEqual(armedFor.getHours(), 0);
  assert.strictEqual(armedFor.getMinutes(), 0);
  assert.strictEqual(armedFor.getSeconds(), SLACK_MS / 1000,
    'a little past midnight, so it cannot land on 23:59:59.998 and recompute the OLD day');

  assert.strictEqual(fired, 0, 'nothing fires on arming');
  host.fire();
  assert.strictEqual(fired, 1);
});

test('IT RE-ARMS EVEN WHEN THE CALLBACK THROWS, every time', () => {
  // THE WHOLE POINT OF THE MODULE. The re-arm used to come after the callback,
  // so one exception in the render ended day tracking for the rest of the
  // session — silently, and the label went back to being the stale thing this
  // was written to fix. A test that only exercised the happy path would have
  // been green through all of it.
  const host = fakeHost('2026-08-21T09:00:00');
  let calls = 0;
  startDayRollover({
    onRollover: () => { calls++; throw new Error('render blew up'); },
    now: host.now,
    setTimer: host.setTimer,
    clearTimer: host.clearTimer,
  });

  for (let day = 0; day < 7; day++) {
    assert.ok(host.state.pending, `a timer is armed for day ${day}`);
    // The throw is NOT swallowed — it reaches the host, as a renderer error
    // should. What must survive is the schedule.
    assert.throws(() => host.fire(), /render blew up/);
    assert.ok(host.state.pending,
      `still armed after the callback threw on day ${day} — the chain must not end`);
  }
  assert.strictEqual(calls, 7, 'a week of midnights, every one of them attempted');
});

test('exactly one timer is armed at a time', () => {
  // Two would double every subsequent tick, and the growth is invisible until
  // an app has been open for days.
  const host = fakeHost('2026-08-21T23:00:00');
  startDayRollover({ onRollover: () => {}, now: host.now, setTimer: host.setTimer, clearTimer: host.clearTimer });
  const first = host.state.pending.id;
  host.fire();
  assert.ok(host.state.pending, 're-armed');
  assert.notStrictEqual(host.state.pending.id, first, 'and it is a new timer, not the old one');
  host.fire();
  assert.strictEqual(host.state.nextId, 4, 'three armed across two fires — one each, never two');
});

test('stop() cancels the pending timer and nothing re-arms after it', () => {
  const host = fakeHost('2026-08-21T12:00:00');
  let fired = 0;
  const h = startDayRollover({ onRollover: () => { fired++; }, now: host.now, setTimer: host.setTimer, clearTimer: host.clearTimer });
  const id = host.state.pending.id;
  h.stop();
  assert.deepStrictEqual(host.state.cleared, [id], 'the pending timer is cleared');
  assert.strictEqual(host.state.pending, null);
  assert.strictEqual(fired, 0);
});

test('a DST-length day is still one day, because the date does the arithmetic', () => {
  // US spring forward, 2027-03-14: that local day is 23 hours long. Adding a
  // fixed 86400000 would arm for 01:00 on the 15th and drift from then on.
  const host = fakeHost('2027-03-13T12:00:00');
  startDayRollover({ onRollover: () => {}, now: host.now, setTimer: host.setTimer, clearTimer: host.clearTimer });
  const armed = new Date(host.state.pending.at);
  assert.strictEqual(armed.getDate(), 14);
  assert.strictEqual(armed.getHours(), 0, 'midnight local, whatever the day’s length');
});

test('msUntilNextMidnight is always positive, including one second before midnight', () => {
  // A zero or negative delay would spin: fire, recompute, fire again.
  const ms = msUntilNextMidnight(new Date('2026-08-21T23:59:59'));
  assert.ok(ms > 0, `positive (${ms}ms)`);
  assert.ok(ms <= 1000 + SLACK_MS, `and small (${ms}ms)`);
});
