'use strict';

// THE REFLOW IS THE WHOLE TRICK, AND A TEST THAT CHECKS THE FIRST TRANSITION
// CANNOT SEE IT.
//
// `fadeIn` removes the class, reads layout, adds the class. Drop the read and
// the browser never sees a frame without the class, so adding it back is not
// a change and nothing plays — but the FIRST fade still works, because the
// class genuinely was absent to begin with. The bug only appears on the
// SECOND fade of the same element: Patches, Seven, Patches.
//
// So every test here does the move twice and asserts the second one too.
// Daniel's brief says exactly this: "Prove a change fires and a repeat fires
// again — the reflow bug passes a test that only ever checks the first
// transition."
//
// A FAKE ELEMENT RATHER THAN A DOM, because the thing under test is the
// ORDER of three operations. A recording stub makes that order readable;
// jsdom would make it invisible, since jsdom does not run animations either.

const test = require('node:test');
const assert = require('node:assert');

const anim = require('../src/view-anim');

// A node that records what was done to it, in order. `getBoundingClientRect`
// is the load-bearing read, so it logs like everything else.
function fakeEl() {
  const log = [];
  const classes = new Set();
  const listeners = {};
  return {
    log,
    classes,
    classList: {
      add: (c) => { classes.add(c); log.push(`add:${c}`); },
      remove: (c) => { classes.delete(c); log.push(`remove:${c}`); },
      contains: (c) => classes.has(c),
    },
    getBoundingClientRect: () => { log.push('read'); return { width: 10, height: 10 }; },
    addEventListener: (ev, fn) => { log.push(`on:${ev}`); (listeners[ev] ||= []).push(fn); },
    style: {},
    fire: (ev) => { for (const fn of listeners[ev] || []) fn(); },
  };
}

// The module asks the real matchMedia. Nothing is faked globally beyond this
// one answer, and it is restored after each use.
function withMotion(reduced, fn) {
  const had = Object.prototype.hasOwnProperty.call(global, 'window');
  const prev = global.window;
  global.window = { matchMedia: () => ({ matches: reduced }) };
  try { return fn(); } finally {
    if (had) global.window = prev; else delete global.window;
  }
}

test('a fade removes the class, READS LAYOUT, then adds it', () => {
  withMotion(false, () => {
    const el = fakeEl();
    assert.strictEqual(anim.fadeIn(el), true);
    // The read must sit BETWEEN the remove and the add. Without it the class
    // goes off and on inside one frame and no animation plays.
    assert.deepStrictEqual(el.log.slice(0, 3),
      ['remove:tab-fade', 'read', 'add:tab-fade'],
      `wrong order: ${el.log.join(' ')}`);
  });
});

test('AND A REPEAT FIRES AGAIN — the case a first-transition test misses', () => {
  withMotion(false, () => {
    const el = fakeEl();
    anim.fadeIn(el);
    el.fire('animationend');          // the first fade finishes and cleans up
    assert.ok(!el.classes.has('tab-fade'), 'the class comes off at the end');

    el.log.length = 0;
    assert.strictEqual(anim.fadeIn(el), true);
    assert.deepStrictEqual(el.log.slice(0, 3),
      ['remove:tab-fade', 'read', 'add:tab-fade'],
      `the second fade did not re-arm: ${el.log.join(' ')}`);
  });
});

test('and again when the first fade never finished', () => {
  // A re-render can replace the list before animationend fires, so the class
  // is still on when the next fade starts. That is the case the remove at the
  // top exists for, and it is NOT the same as the clean repeat above.
  withMotion(false, () => {
    const el = fakeEl();
    anim.fadeIn(el);
    assert.ok(el.classes.has('tab-fade'));
    el.log.length = 0;
    anim.fadeIn(el);
    assert.deepStrictEqual(el.log.slice(0, 3),
      ['remove:tab-fade', 'read', 'add:tab-fade'],
      `an interrupted fade did not re-arm: ${el.log.join(' ')}`);
  });
});

test('the class comes off at the end, or the fade works once per page load', () => {
  withMotion(false, () => {
    const el = fakeEl();
    anim.fadeIn(el);
    assert.ok(el.log.includes('on:animationend'), 'it listens for the end');
    el.fire('animationend');
    assert.ok(!el.classes.has('tab-fade'),
      'left on, `animation: ... both` pins the final keyframe and the next add is not a change');
  });
});

test('reduced motion does nothing at all', () => {
  withMotion(true, () => {
    const el = fakeEl();
    assert.strictEqual(anim.fadeIn(el), false);
    assert.deepStrictEqual(el.log, [], `it touched the element: ${el.log.join(' ')}`);
  });
});

test('a missing element is not an exception — decoration never throws', () => {
  withMotion(false, () => {
    assert.strictEqual(anim.fadeIn(null), false);
    assert.strictEqual(anim.fadeIn(undefined), false);
    assert.strictEqual(anim.fadeIn({}), false);
    // A node whose classList throws — a detached one mid-re-render.
    const hostile = { classList: { remove() { throw new Error('detached'); } } };
    assert.strictEqual(anim.fadeIn(hostile), false);
  });
});

// ---- MODALS --------------------------------------------------------------

test('a leaving modal stops taking pointer events BEFORE it animates', () => {
  withMotion(false, () => {
    const el = fakeEl();
    anim.modalLeave(el, () => {});
    assert.strictEqual(el.style.pointerEvents, 'none',
      'an overlay mid-fade is still a full-screen element over whatever opened next');
    assert.ok(el.classes.has('is-leaving'));
  });
});

test('the removal happens once, on animationend', () => {
  withMotion(false, () => {
    const el = fakeEl();
    let removed = 0;
    anim.modalLeave(el, () => { removed += 1; });
    assert.strictEqual(removed, 0, 'not before the animation');
    el.fire('animationend');
    assert.strictEqual(removed, 1);
    el.fire('animationend');
    assert.strictEqual(removed, 1, 'and not twice');
  });
});

test('the removal happens even when animationend never fires', async () => {
  // THIS IS THE GUARANTEE, not a safety net. animationend does not fire when
  // an animation is cancelled — a display change, a moved node, a stylesheet
  // that did not load — and a modal that fails to leave is the bug being
  // fixed. The timer is what removes it; the event only makes it prompt.
  await withMotion(false, async () => {
    const el = fakeEl();
    let removed = 0;
    anim.modalLeave(el, () => { removed += 1; });
    await new Promise((r) => setTimeout(r, anim.LEAVE_MS + 200));
    assert.strictEqual(removed, 1, 'the fallback timer must remove it');
  });
});

test('reduced motion removes the modal immediately', () => {
  withMotion(true, () => {
    const el = fakeEl();
    let removed = 0;
    assert.strictEqual(anim.modalLeave(el, () => { removed += 1; }), false);
    assert.strictEqual(removed, 1, 'the point is that it goes, not that it goes prettily');
  });
});

test('a teardown that throws does not take the caller down', () => {
  withMotion(true, () => {
    const el = fakeEl();
    assert.doesNotThrow(() => anim.modalLeave(el, () => { throw new Error('boom'); }));
  });
});

test('entering re-arms too, and clears itself on a timer not animationend', () => {
  // Xtra's own correction: the card can be REPLACED mid-animation by a
  // re-render, and a listener dies with the node it was attached to — which
  // would leave is-entering stuck on the host for good.
  withMotion(false, () => {
    const el = fakeEl();
    anim.modalEnter(el);
    assert.deepStrictEqual(el.log.slice(0, 3),
      ['remove:is-entering', 'read', 'add:is-entering'],
      `wrong order: ${el.log.join(' ')}`);
    assert.ok(!el.log.includes('on:animationend'),
      'a listener would die with a card replaced mid-animation');
  });
});
