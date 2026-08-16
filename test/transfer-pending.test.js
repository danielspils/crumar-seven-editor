'use strict';

// The marker that remembers an unfinished walk. It holds two facts and a
// timestamp — which setlist, which bank, when — because the walk itself works
// out what is still outstanding by reading the instrument.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { PendingTransfer, STALE_AFTER_MS } = require('../src/transfer-pending');

const fresh = () => new PendingTransfer(fs.mkdtempSync(path.join(os.tmpdir(), 'seven-pending-')));
const setlists = [{ name: 'Long Winters' }, { name: 'Half Brothers' }];

test('a started walk is offered back, by name', () => {
  const p = fresh();
  p.start({ setlistIndex: 1, setlistName: 'Half Brothers', bank: 3 });
  const got = p.read(setlists);
  assert.strictEqual(got.setlistName, 'Half Brothers');
  assert.strictEqual(got.bank, 3);
  assert.strictEqual(got.setlistIndex, 1);
});

test('the index follows the NAME — setlists get reordered between sessions', () => {
  const p = fresh();
  p.start({ setlistIndex: 1, setlistName: 'Half Brothers', bank: 3 });
  const moved = [{ name: 'Half Brothers' }, { name: 'Long Winters' }];
  assert.strictEqual(p.read(moved).setlistIndex, 0);
});

test('nothing to resume when the setlist is gone', () => {
  const p = fresh();
  p.start({ setlistIndex: 1, setlistName: 'Half Brothers', bank: 3 });
  assert.strictEqual(p.read([{ name: 'Long Winters' }]), null);
  // …and the marker is dropped, so it cannot be offered again.
  assert.strictEqual(p.read(setlists), null);
});

test('a walk abandoned more than a week ago is not offered', () => {
  const p = fresh();
  const eightDays = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  p.start({ setlistIndex: 1, setlistName: 'Half Brothers', bank: 3, at: eightDays });
  assert.strictEqual(p.read(setlists), null);
  assert.ok(!fs.existsSync(p.path()), 'and the stale marker is deleted');

  // A day inside the window still is.
  const p2 = fresh();
  const sixDays = new Date(Date.now() - (STALE_AFTER_MS - 24 * 60 * 60 * 1000)).toISOString();
  p2.start({ setlistIndex: 1, setlistName: 'Half Brothers', bank: 3, at: sixDays });
  assert.ok(p2.read(setlists), 'six days is still offered');
});

test('clear means clear — offered once, however the question was answered', () => {
  const p = fresh();
  p.start({ setlistIndex: 1, setlistName: 'Half Brothers', bank: 3 });
  p.clear();
  assert.strictEqual(p.read(setlists), null);
  p.clear(); // twice is not an error
});

test('a malformed or absent marker is nothing to resume', () => {
  const p = fresh();
  assert.strictEqual(p.read(setlists), null, 'absent');
  fs.mkdirSync(p.dir, { recursive: true });
  fs.writeFileSync(p.path(), 'not json at all');
  assert.strictEqual(p.read(setlists), null, 'unreadable');
  fs.writeFileSync(p.path(), JSON.stringify({ bank: 3 }));
  assert.strictEqual(p.read(setlists), null, 'missing the setlist name');
  assert.ok(!fs.existsSync(p.path()), 'and it is cleaned up');
});
