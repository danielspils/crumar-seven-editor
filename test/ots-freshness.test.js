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
