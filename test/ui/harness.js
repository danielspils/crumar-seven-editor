'use strict';

// Injected into the renderer ahead of every UI scenario. Everything here
// exists because of a bug that shipped: the hit test because dispatchEvent
// ignores pointer-events and passed through a wall the mouse could not, the
// waits because the instrument answers in its own time, the recorded failures
// because a scenario that throws on the first problem hides the rest.

window.ui = (() => {
  const failures = [];
  const notes = [];

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function check(ok, message) {
    if (!ok) failures.push(message);
    return !!ok;
  }

  function note(text) {
    notes.push(text);
  }

  // What a MOUSE would hit at this element's centre. Returns the element the
  // browser reports, so a scenario can assert the click can actually land.
  function hitTarget(el) {
    const r = el.getBoundingClientRect();
    return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  }

  // Clicks the way a person does: at a point, on whatever is really on top.
  // Fails the scenario when the intended target is unreachable rather than
  // quietly dispatching an event no user could have produced.
  function click(el, what = 'control') {
    // A missing element is a failed expectation, not an exception: a scenario
    // that throws here reports one line and hides everything after it.
    if (!check(!!el, `${what}: not on screen`)) return false;
    const hit = hitTarget(el);
    const reachable = hit && (hit === el || el.contains(hit) || hit.contains(el));
    if (!check(reachable, `${what}: a click at its centre lands on <${hit && hit.className}>, not the control`)) {
      return false;
    }
    hit.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return true;
  }

  async function waitFor(predicate, { timeout = 15000, step = 150, what = 'condition' } = {}) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (predicate()) return true;
      await sleep(step);
    }
    check(false, `timed out after ${timeout}ms waiting for ${what}`);
    return false;
  }

  // Waits for a selector and returns the element (null if it never appears).
  // Fixed sleeps were the source of the suite's only flake: the app re-renders
  // after IPC, and "500ms is probably enough" is not a test.
  async function waitEl(sel, what = sel) {
    await waitFor(() => !!document.querySelector(sel), { what });
    return document.querySelector(sel);
  }

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  const connected = () => !!$('#connection-row.connected');
  // "Live" is no longer a bar on screen: the bar only appears once there is an
  // unsaved edit to warn about. What live MEANS is that the instrument's
  // buffer holds what is shown, and the proof of that is writable controls.
  const live = () => !!$('.param.is-live');

  // Most scenarios need an instrument; the runner skips them when none is
  // attached rather than reporting failures the code did not cause.
  async function requireDevice() {
    await waitFor(connected, { timeout: 20000, what: 'the Seven to connect' });
    return connected();
  }

  // The library section remembers whether it was open, ACROSS RUNS — it is
  // persisted view state. A scenario that clicks the header blindly toggles
  // whatever the last one left behind, which is how two scenarios that each
  // passed alone failed together. Ensure the state; never toggle it.
  async function openLibrary() {
    if (!document.querySelector('#library.lib-open')) {
      document.getElementById('library-head').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
    await waitFor(() => !!document.querySelector('#library.lib-open'), { what: 'the library to open' });
    await sleep(250); // its body renders just after the class lands
    // Land on PATCHES. The library opens on Backups now (2026-08-13), and
    // every scenario here goes on to wait for patch rows — so they all timed
    // out on a tab that has none. The app's default is deliberate; this is the
    // harness catching up with it.
    const tab = document.querySelector('.seg-btn[data-tab="patches"]');
    if (tab && !tab.classList.contains('active')) {
      tab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await sleep(250);
    }
  }

  async function selectBankPreset(index) {
    const rows = $$('#patch-list .patch-row');
    if (!check(rows[index], `bank row ${index} exists`)) return false;
    rows[index].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await sleep(700);
    return true;
  }

  // Enter audition mode the way the Audition button does, answering the
  // first-run explainer if this profile has never seen it. A scenario that
  // did this by hand would be testing the explainer, not the thing it came for.
  // There is no longer anything to press: selecting a patch makes the
  // instrument play it, which IS the live session. This waits for that rather
  // than driving a button that no longer exists.
  async function enterAudition() {
    if (live()) return true;
    await waitFor(live, { what: 'the session to open', timeout: 8000 });
    return live();
  }

  return {
    sleep, check, note, click, hitTarget, waitFor, waitEl, $, $$, connected, live,
    requireDevice, selectBankPreset, enterAudition, openLibrary,
    result: () => ({ failures, notes }),
  };
})();
