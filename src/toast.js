'use strict';

// Transient status, bottom-centre for results and dead-centre for work in
// progress. Split out of app.js because three unrelated parts of the app need
// it (undo, audition, connection errors) and none of them should have to know
// where it lives or how it is dismissed.

(function (global) {
  const ID = 'undo-toast';
  const RESULT_MS = 2200;
  // A sticky message waits to be dismissed by whoever raised it, but never
  // forever: every path that clears one is a path that can be missed, and a
  // status that never goes away is worse than one that goes early.
  const SAFETY_MS = 10000;

  function element() {
    let el = document.getElementById(ID);
    if (!el) {
      el = document.createElement('div');
      el.id = ID;
      document.body.appendChild(el);
    }
    return el;
  }

  function show(text, { sticky = false } = {}) {
    const el = element();
    el.textContent = text;
    el.classList.add('shown');
    el.classList.toggle('is-busy', sticky);
    clearTimeout(el._timer);
    el._timer = sticky
      ? setTimeout(() => el.classList.remove('shown', 'is-busy'), SAFETY_MS)
      : setTimeout(() => el.classList.remove('shown'), RESULT_MS);
  }

  function hide() {
    const el = document.getElementById(ID);
    if (el) {
      clearTimeout(el._timer);
      el.classList.remove('shown', 'is-busy');
    }
  }

  global.SevenToast = { show, hide };
})(window);
