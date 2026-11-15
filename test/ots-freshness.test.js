'use strict';

// WHAT ON THE SEVEN CAN HONESTLY CLAIM.
//
// The region shows what the LAST BACKUP saw, because the Seven has no
// read-slot opcode. But clicking a row already recalls that slot, and the
// recall broadcasts the slot's real SOUND for free — so the app can learn the
// truth about one slot at a time, at no cost in noise beyond the note the
// player asked to hear.
//
// It learns the SOUND and nothing else. The 22-CC fingerprint is not used: its
// documented hole lets parameters with no CC differ while it reads
// "unchanged", and a false "verified" is the failure class this project spent
// a week removing. A 110-parameter read per row is too slow to survive someone
// arrowing down a bank.

const test = require('node:test');
const assert = require('node:assert');
const { slotState, asOfLabel } = require('../src/ots-freshness.js');

test('a slot nobody has visited is unknown, whatever the backup says', () => {
  assert.strictEqual(slotState({ backupSound: 'Tine Piano', verifiedSound: null }), 'unknown');
});

test('a visited slot whose sound matches the backup is confirmed', () => {
  assert.strictEqual(slotState({ backupSound: 'Tine Piano', verifiedSound: 'Tine Piano' }), 'match');
});

test('a visited slot whose sound DIFFERS has changed since the backup', () => {
  assert.strictEqual(slotState({ backupSound: 'Tine Piano', verifiedSound: 'Clavi Piano' }), 'changed');
});

test('a slot with no backup record is not "changed" just because it was read', () => {
  // "Not backed up" means no record at all — a different unknown from "the
  // record is out of date", and the two must not read alike.
  assert.strictEqual(slotState({ backupSound: null, verifiedSound: 'Clavi Piano' }), 'unrecorded');
});

// ---- the header ------------------------------------------------------------

const fmtDate = (d) => `${d.getDate()} Aug`;
const fmtTime = () => '2:32pm';
const ago = () => '2 days ago';
const BACKUP = '2026-08-19T10:00:00Z';
const NOW = new Date('2026-08-21T14:32:00');

test('never refreshed: the backup, with its age', () => {
  assert.strictEqual(
    asOfLabel({ banksAsOf: BACKUP, verified: 0, total: 32, now: NOW, fmtDate, fmtTime, ago }),
    'as of last backup · 19 Aug (2 days ago)');
});

test('every slot read: a clock time', () => {
  assert.strictEqual(
    asOfLabel({ banksAsOf: BACKUP, verified: 32, total: 32, readAt: NOW, now: NOW, fmtDate, fmtTime, ago }),
    'as of 2:32pm');
});

test('some read, some not: both halves counted', () => {
  assert.strictEqual(
    asOfLabel({ banksAsOf: BACKUP, verified: 16, total: 32, readAt: NOW, now: NOW, fmtDate, fmtTime, ago }),
    '16 of 32 as of 2:32pm - 16 as of last backup');
});

test('AFTER MIDNIGHT the clock time carries its date', () => {
  // "as of 2:32pm" is ambiguous the moment the day rolls over, and the app
  // would go on saying it. The day-rollover tick re-renders once a day, which
  // is exactly the cadence this needs.
  const tomorrow = new Date('2026-08-22T09:00:00');
  assert.strictEqual(
    asOfLabel({ banksAsOf: BACKUP, verified: 32, total: 32, readAt: NOW, now: tomorrow, fmtDate, fmtTime, ago }),
    'as of 2:32pm, 21 Aug');
});

test('no backup and nothing read says so plainly', () => {
  assert.strictEqual(
    asOfLabel({ banksAsOf: null, verified: 0, total: 32, now: NOW, fmtDate, fmtTime, ago }),
    'not yet backed up');
});

test('nothing read but a backup exists never claims a time', () => {
  const label = asOfLabel({ banksAsOf: BACKUP, verified: 0, total: 32, readAt: NOW, now: NOW, fmtDate, fmtTime, ago });
  assert.ok(!/pm|am/.test(label), `no clock time when nothing was verified (${label})`);
});

// ---- WHAT ONE ROW SHOWS -------------------------------------------------
//
// "On the Seven" shows the live instrument as far as it is known (Daniel,
// 2026-11-15). These pin the three states and, above all, the rule about what
// the app may CLAIM at each stage of a read.

const { slotView, liveCount } = require('../src/ots-freshness.js');

test('a slot with neither a reading nor a backup is empty, and says nothing', () => {
  const v = slotView({});
  assert.strictEqual(v.state, 'empty');
  assert.strictEqual(v.name, null);
  assert.strictEqual(v.pending, false);
});

test('a slot the app has not heard from shows its backup, faded', () => {
  const v = slotView({ backupName: 'Nada Clav', backupSound: 'Clavi Piano' });
  assert.strictEqual(v.state, 'from-backup');
  assert.strictEqual(v.name, 'Nada Clav');
  assert.strictEqual(v.sound, 'Clavi Piano');
});

test('a backup record with no name still counts as a backup row', () => {
  // The slot was captured but the file carries no name of its own. That is a
  // record, not an empty slot, and collapsing the two would lose the
  // difference between "nothing is there" and "something is, unnamed".
  assert.strictEqual(slotView({ backupSound: 'Tine Piano' }).state, 'from-backup');
});

test('the SOUND alone makes a row live, before any parameters arrive', () => {
  // The whole reason the row does not wait: a slot move already costs a
  // recall, and the parameter read costs ~1.4s more.
  const v = slotView({ liveSound: 'Tine Piano', backupName: 'Something Old' });
  assert.strictEqual(v.state, 'live-read');
  assert.strictEqual(v.sound, 'Tine Piano');
  assert.strictEqual(v.pending, true, 'and the name is still coming');
  assert.strictEqual(v.name, 'Tine Piano', 'so it shows the sound meanwhile');
});

test('a live reading beats the backup record, which is the point of all this', () => {
  const v = slotView({ backupName: 'Something Old', backupSound: 'Reed Piano', liveSound: 'Tine Piano' });
  assert.strictEqual(v.state, 'live-read');
  assert.ok(!/Something Old/.test(v.name), `the stale name is gone (${v.name})`);
});

test('when the parameters land and the library knows them, the patch is named', () => {
  const v = slotView({
    liveSound: 'Tine Piano', liveParams: true, matchedName: 'Wurly w/ bite',
  });
  assert.strictEqual(v.name, 'Wurly w/ bite');
  assert.strictEqual(v.pending, false);
});

test('parameters that match nothing in the library read as (unsaved)', () => {
  const v = slotView({ liveSound: 'Tine Piano', liveParams: true, matchedName: null });
  assert.strictEqual(v.name, 'Tine Piano (unsaved)');
  assert.strictEqual(v.pending, false);
});

test('A FAILED READ NEVER SAYS (unsaved), because it cannot know', () => {
  // THE RULE THIS FILE EXISTS FOR. "(unsaved)" claims these values match no
  // patch in the library. Only the parameters can support that: two patches
  // can share a sound, and two files captured from different slots have been
  // found differing in 0 of 110 parameters. A read that never finished has
  // established nothing, so the row settles on the bare sound name — live,
  // named as far as anyone knows, claiming nothing about the library.
  const v = slotView({ liveSound: 'Tine Piano', readFailed: true });
  assert.strictEqual(v.name, 'Tine Piano');
  assert.strictEqual(v.state, 'live-read');
  assert.strictEqual(v.pending, false, 'and the shimmer stops — it ALWAYS ends');
});

test('a failed read ignores a match nobody could have made', () => {
  // A caller passing matchedName without liveParams is asserting a match it
  // had no parameters to make. The honest answer is still the sound.
  const v = slotView({ liveSound: 'Tine Piano', readFailed: true, matchedName: 'Invented' });
  assert.strictEqual(v.name, 'Tine Piano');
});

test('pending is false in every settled state, so the shimmer always ends', () => {
  const settled = [
    slotView({}),
    slotView({ backupName: 'X' }),
    slotView({ liveSound: 'S', liveParams: true, matchedName: 'Y' }),
    slotView({ liveSound: 'S', liveParams: true }),
    slotView({ liveSound: 'S', readFailed: true }),
  ];
  for (const v of settled) assert.strictEqual(v.pending, false);
  assert.strictEqual(slotView({ liveSound: 'S' }).pending, true, 'only an in-flight read shimmers');
});

test('the header counts slots heard from, not slots fully read', () => {
  // Counted on the sound, because that is the moment the row goes live on
  // screen. Counting the parameter read instead would print a number that
  // disagrees with what the player can see.
  const records = [
    { liveSound: 'A', liveParams: true },
    { liveSound: 'B' },
    { liveSound: 'C', readFailed: true },
    {},
    null,
  ];
  assert.strictEqual(liveCount(records), 3);
  assert.strictEqual(liveCount([]), 0);
  assert.strictEqual(liveCount(), 0);
});
