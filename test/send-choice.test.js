'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { decideSend } = require('../src/send-choice.js');

// A scripted user: each call to ask() returns the next answer.
const asker = (...answers) => {
  const calls = { n: 0 };
  return [async () => { calls.n += 1; return answers.shift(); }, calls];
};

test('a clean patch is never asked anything', () => {
  let asked = 0;
  return decideSend({ hasDrift: false, ask: async () => { asked += 1; }, saveAsNew: async () => true })
    .then((r) => {
      assert.strictEqual(r, 'send');
      assert.strictEqual(asked, 0, 'the common case stays the fast one');
    });
});

test('a drifted patch is asked', async () => {
  const [ask, calls] = asker(true);
  assert.strictEqual(await decideSend({ hasDrift: true, ask, saveAsNew: async () => true }), 'send');
  assert.strictEqual(calls.n, 1);
});

test('X does nothing at all', async () => {
  const [ask] = asker(false);
  let saved = 0;
  const r = await decideSend({ hasDrift: true, ask, saveAsNew: async () => { saved += 1; return true; } });
  assert.strictEqual(r, 'cancel', 'nothing is sent');
  assert.strictEqual(saved, 0, 'and nothing is saved');
});

test('SEND ORIGINAL proceeds, without saving', async () => {
  const [ask] = asker(true);
  let saved = 0;
  const r = await decideSend({ hasDrift: true, ask, saveAsNew: async () => { saved += 1; return true; } });
  assert.strictEqual(r, 'send');
  assert.strictEqual(saved, 0);
});

test('SAVE EDITS stops after saving — it does NOT chain into the send', async () => {
  const [ask, calls] = asker('secondary');
  const r = await decideSend({ hasDrift: true, ask, saveAsNew: async () => true });
  assert.strictEqual(r, 'saved', 'the player is left on the new patch');
  assert.strictEqual(calls.n, 1, 'and is not asked again');
});

test('CANCELLING THE NAME returns to the question, it does not close everything', async () => {
  // The branch nobody would think to try by hand. Losing the send because you
  // thought better of a name is not an outcome anybody asked for.
  const [ask, calls] = asker('secondary', 'secondary', true);
  let attempts = 0;
  const r = await decideSend({
    hasDrift: true,
    ask,
    saveAsNew: async () => { attempts += 1; return false; },  // cancelled, every time
  });
  assert.strictEqual(attempts, 2, 'each attempt at the name was offered');
  assert.strictEqual(calls.n, 3, 'and the question came back after each');
  assert.strictEqual(r, 'send', 'until a real answer was given');
});

test('a refused save is treated the same as a cancelled one', async () => {
  // A name already taken throws at the seam and saveAsNew answers false. The
  // player is still standing in front of an undecided question.
  const [ask] = asker('secondary', false);
  const r = await decideSend({ hasDrift: true, ask, saveAsNew: async () => false });
  assert.strictEqual(r, 'cancel', 'they closed it on the second pass');
});
