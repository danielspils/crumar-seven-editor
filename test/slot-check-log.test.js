'use strict';

// THE RECORD OF WHY A SLOT WAS SKIPPED, OR WASN'T.
//
// The 2026-08-23 failure — a restore reporting "already matched" for eight
// slots that did not match, writing nothing — left NO TRACE. Everything
// learned about it came from probes run hours later, on an instrument whose
// state had moved on, by somebody who had to be present.
//
// So what matters about these lines is that they are readable AFTER THE FACT
// by somebody who was not watching: which slot, what the check saw, what it
// decided, and — when it declined — which input refused.

const test = require('node:test');
const assert = require('node:assert');

const log = require('../src/slot-check-log.js');

const base = {
  at: '2026-08-23T09:12:03Z', bank: 3, preset: 6,
  soundId: 7, soundName: 'Acoustic Piano', lookup: 'ok',
  wants: 'Venice Upright U1', tableSize: 110, patchSize: 110, compared: 21,
};

test('a line says which slot, what it saw, and what it decided', () => {
  const l = log.line({ ...base, verdict: 'differs', reason: 'param', detail: 'amp_bs held 64 want 60' });
  assert.match(l, /2026-08-23T09:12:03Z/);
  assert.match(l, /bank3\/preset6/);
  assert.match(l, /sound=7\(Acoustic Piano\)/, 'the sound id AND the name it resolved to');
  assert.match(l, /lookup=ok/);
  assert.match(l, /table=110/, "the size the DEVICE reported, not the schema's");
  assert.match(l, /compared=21/, 'how many were actually checked');
  assert.match(l, /verdict=differs/);
  assert.match(l, /reason=param/);
  assert.match(l, /detail=amp_bs held 64 want 60/);
});

test('the two inputs that could take out both checks are legible', () => {
  // A sound that will not resolve and a short table were the only paths found
  // to a wrong "already held" — one disables the sound check, the other the
  // parameter check, and the failure needed both. Whichever fires, the line
  // has to say so without anybody knowing to look for it.
  const noSound = log.line({
    ...base, soundId: null, soundName: null, lookup: 'unresolved',
    compared: 0, verdict: 'cannot-confirm', reason: 'sound-unresolved',
  });
  assert.match(noSound, /sound=- lookup=unresolved/);
  assert.match(noSound, /verdict=cannot-confirm reason=sound-unresolved/);

  const shortTable = log.line({
    ...base, tableSize: 6, verdict: 'cannot-confirm', reason: 'table-shorter-than-patch',
  });
  assert.match(shortTable, /table=6 patch=110/, 'both sizes, so the mismatch is visible');
  assert.match(shortTable, /reason=table-shorter-than-patch/);
});

test('a plain match carries no reason, and everything else does', () => {
  assert.doesNotMatch(log.line({ ...base, compared: 110, verdict: 'already-held' }), /reason=/);
  for (const reason of ['no-param-table', 'unreadable-param', 'non-numeric-value',
    'reply-has-no-key', 'patch-keys-not-covered', 'patch-names-no-sound']) {
    assert.match(log.line({ ...base, verdict: 'cannot-confirm', reason }), new RegExp(`reason=${reason}`));
  }
});

test('the file is capped, oldest first — it has to be safe to leave on', () => {
  const files = new Map();
  const fs = {
    appendFileSync: (f, t) => files.set(f, (files.get(f) || '') + t),
    statSync: (f) => ({ size: (files.get(f) || '').length }),
    readFileSync: (f) => files.get(f) || '',
    writeFileSync: (f, t) => files.set(f, t),
  };
  for (let i = 0; i < 3000; i += 1) {
    log.append(fs, 'x.log', log.line({ ...base, preset: i, verdict: 'already-held' }), { maxBytes: 4000 });
  }
  const lines = files.get('x.log').split('\n').filter(Boolean);
  assert.ok(lines.length <= 2000, `capped, got ${lines.length}`);
  // OLDEST FIRST: what is kept is the recent past, which is what somebody
  // reading after a failure needs.
  assert.match(lines[lines.length - 1], /preset2999/, 'the newest line survives');
  assert.doesNotMatch(files.get('x.log'), /preset0 /, 'the oldest are gone');
});

test('a log that cannot be written never stops a transfer', () => {
  // The run it is describing matters more than the description of it.
  const fs = { appendFileSync: () => { throw new Error('read-only volume'); } };
  assert.strictEqual(log.append(fs, 'x.log', 'anything'), false);
});
