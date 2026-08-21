'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { ago } = require('../src/library-view.js');

// Every case here is a LOCAL wall-clock moment, because that is what a person
// reading "from today" means. `now` is injectable so the tests do not depend
// on when they run.
const at = (y, m, d, hh = 12, mm = 0) => new Date(y, m - 1, d, hh, mm);
// A stamp as the library stores it: a full instant, not a calendar date.
const stamp = (y, m, d, hh = 12, mm = 0) => at(y, m, d, hh, mm).toISOString();

test('the same calendar day is today, whatever the hour', () => {
  const now = at(2026, 8, 14, 7, 10);
  assert.equal(ago(stamp(2026, 8, 14, 7, 0), now), 'today');
  assert.equal(ago(stamp(2026, 8, 14, 0, 1), now), 'today');
});

// The bug this was written for: verified at lunchtime yesterday still read
// "today" at breakfast, because the gap was under 24 hours.
test('yesterday is a day ago even when fewer than 24 hours have passed', () => {
  const now = at(2026, 8, 14, 7, 10);
  assert.equal(ago(stamp(2026, 8, 13, 12, 4), now), 'yesterday');
  assert.equal(ago(stamp(2026, 8, 13, 23, 59), now), 'yesterday');
});

test('and the same slip does not shift the older ones', () => {
  const now = at(2026, 8, 14, 7, 10);
  // Tuesday 9:11pm read as "2 days ago" on Friday morning; it is three dates back.
  assert.equal(ago(stamp(2026, 8, 11, 21, 11), now), '3 days ago');
  assert.equal(ago(stamp(2026, 8, 12, 12, 0), now), '2 days ago');
});

test('a date-only string is read as that local day', () => {
  const now = at(2026, 8, 14, 7, 10);
  assert.equal(ago('2026-08-14', now), 'today');
  assert.equal(ago('2026-08-13', now), 'yesterday');
});

test('the bigger units still round the way they did', () => {
  const now = at(2026, 8, 14, 7, 10);
  assert.equal(ago(stamp(2026, 8, 1), now), '13 days ago');
  assert.equal(ago(stamp(2026, 7, 24), now), '3 weeks ago');
  assert.equal(ago(stamp(2026, 5, 14), now), '3 months ago');
  assert.equal(ago(stamp(2025, 8, 14), now), '1 year ago');
});

test('a future stamp is not negative days', () => {
  const now = at(2026, 8, 14, 7, 10);
  assert.equal(ago(stamp(2026, 8, 15), now), 'today', 'a clock skew reads as now, never as -1');
});

test('an unreadable stamp says nothing rather than guessing', () => {
  assert.equal(ago('not a date', at(2026, 8, 14)), '');
  assert.equal(ago(null, at(2026, 8, 14)), '');
});
