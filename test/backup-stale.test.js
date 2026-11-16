'use strict';

// WHEN THE APP OFFERS TO BACK UP.
//
// A full read of 32 slots is 45-50 seconds, so the app offers it rather than
// doing it. The threshold is two weeks, Daniel's call on 16 Nov 2026, and it
// is a NAMED value rather than a literal in a condition — the number is a
// decision about tolerable drift, and one buried in an `if` is one nobody can
// find to change.

const test = require('node:test');
const assert = require('node:assert');
const { backupIsStale, BACKUP_STALE_DAYS } = require('../src/ots-freshness.js');

// Local midnight, n calendar days back — the same frame backupIsStale counts
// in, so these cases mean what they say regardless of the hour the suite runs.
const daysAgo = (n, from = new Date()) => {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test('the threshold is two weeks, and it is a named value', () => {
  assert.strictEqual(BACKUP_STALE_DAYS, 14);
});

test('it fires AT the threshold, not after it', () => {
  // The boundary is the whole question: "older than two weeks" read as
  // strictly-greater would leave the fourteenth day silent, which is the one
  // day somebody would notice it was supposed to say something.
  assert.strictEqual(backupIsStale({ asOf: daysAgo(13) }), false, '13 days: not yet');
  assert.strictEqual(backupIsStale({ asOf: daysAgo(14) }), true, '14 days: offer');
  assert.strictEqual(backupIsStale({ asOf: daysAgo(15) }), true, '15 days: offer');
});

test('a recent backup is never stale', () => {
  for (const n of [0, 1, 2, 7, 13]) {
    assert.strictEqual(backupIsStale({ asOf: daysAgo(n) }), false, `${n} days ago`);
  }
});

test('never backed up is not stale — there is nothing to be old', () => {
  // That case has its own empty state telling the player to connect and back
  // up. An offer on top of it would be the app saying the same thing twice in
  // one launch.
  assert.strictEqual(backupIsStale({ asOf: null }), false);
  assert.strictEqual(backupIsStale({ asOf: '' }), false);
  assert.strictEqual(backupIsStale({}), false);
  assert.strictEqual(backupIsStale(), false);
});

test('an unreadable stamp offers nothing rather than something wrong', () => {
  // `new Date(null)` is the EPOCH, not an invalid date — the bug that once
  // rendered "57 years ago" from a missing stamp. A date that cannot be read
  // must not become an offer.
  assert.strictEqual(backupIsStale({ asOf: 'not a date' }), false);
  assert.strictEqual(backupIsStale({ asOf: '0000-00-00' }), false);
});

test('it counts CALENDAR days, the way a person does', () => {
  // Must agree with library-view's ago(), because the offer's sentence is
  // built from ago() and gated by this. A stamp from late on one day and a
  // check early on another is two days to a person and under 24 hours to a
  // subtraction — if they disagreed, a backup could read "2 weeks ago" in a
  // dialog that was not stale enough to have produced it.
  const now = new Date(2026, 10, 16, 9, 0);      // 16 Nov, 09:00
  assert.strictEqual(backupIsStale({ asOf: '2026-11-02', now }), true,
    '2 Nov to 16 Nov is 14 calendar days');
  assert.strictEqual(backupIsStale({ asOf: '2026-11-03', now }), false,
    '3 Nov to 16 Nov is 13');
});

test('the threshold can be overridden per call, and defaults to the named one', () => {
  // The override exists for tests and for anything that later wants to ask a
  // different question; the DEFAULT is the decision.
  assert.strictEqual(backupIsStale({ asOf: daysAgo(3), days: 2 }), true);
  assert.strictEqual(backupIsStale({ asOf: daysAgo(3), days: 30 }), false);
  assert.strictEqual(
    backupIsStale({ asOf: daysAgo(BACKUP_STALE_DAYS) }),
    backupIsStale({ asOf: daysAgo(BACKUP_STALE_DAYS), days: BACKUP_STALE_DAYS })
  );
});
