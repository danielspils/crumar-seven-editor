'use strict';

// THE APP'S ARRIVAL AND DEPARTURE VOCABULARY, in one place.
//
// Ported from JUNO-Xtra (`~/roland-junox-editor`, index.html ~3634 and
// app.js ~5115) on 18 Nov 2026 as BEHAVIOUR, not as a copied rule: the two
// apps' markup differs and a rule lifted across would attach to the wrong
// thing. What came over is the shape of each move and the reasons in Xtra's
// own comments; the selectors and the elements are this app's.
//
// THREE CONSUMERS, which is why this is a module rather than a function in
// app.js: the four top tabs and the bank tabs (app.js), the list moves inside
// the library (library-view.js), and every modal (modal.js). Three copies of
// a 250ms fade is three chances for one of them to drift.
//
// DECORATION IS NEVER WORTH AN EXCEPTION. Xtra's rule, kept verbatim in
// spirit: every public function here swallows its own errors. A missing
// element, a node detached by a re-render mid-animation, a browser without
// `animate` — none of them may take down the thing they were decorating.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SevenViewAnim = api;
})(typeof window !== 'undefined' ? window : null, function () {
  // ONE DEFINITION. app.js and library-view.js each carried their own copy of
  // this expression before this module existed.
  function reducedMotion() {
    try {
      return typeof window !== 'undefined' && !!window.matchMedia
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (_) {
      // A matchMedia that throws is not a reason to animate anyway: treat an
      // unreadable preference as "do not move".
      return true;
    }
  }

  // THE CLASS HAS TO GO OFF, THE LAYOUT HAS TO BE READ, THEN THE CLASS GOES
  // ON. The read is load-bearing and it is the whole trick: without it the
  // browser never sees a frame in which the class is absent, so adding it
  // again is not a change and no animation plays. A repeat of the same move —
  // clicking Patches, Seven, Patches — is exactly the case that fails, and it
  // is the case a test written around the FIRST transition will never catch.
  //
  // getBoundingClientRect() rather than offsetWidth, because it forces the
  // same layout flush and says what it is doing.
  //
  // AND THE CLASS COMES OFF AGAIN at the end. Left on, the element carries
  // `animation: ... both`, which pins it at the keyframe's final state — a
  // no-op visually, but it means the next `add` is not a change either, and
  // the fade works once per page load.
  function fadeIn(el, cls = 'tab-fade') {
    try {
      if (!el || !el.classList || reducedMotion()) return false;
      el.classList.remove(cls);
      el.getBoundingClientRect();
      el.classList.add(cls);
      el.addEventListener('animationend', () => {
        try { el.classList.remove(cls); } catch (_) { /* detached */ }
      }, { once: true });
      return true;
    } catch (_) {
      return false;
    }
  }

  // Several at once — a view whose "body" is more than one element.
  function fadeInAll(els, cls) {
    let n = 0;
    for (const el of els || []) if (fadeIn(el, cls)) n += 1;
    return n;
  }

  // ---- MODALS -----------------------------------------------------------
  //
  // A modal has two halves and only one of them is polish.
  //
  // ARRIVING is decoration: the backdrop fades, the card rises .975 -> 1 from
  // 14px above. LEAVING IS A FIX. Daniel reported a modal still standing
  // behind the next one on 16 Nov 2026, and a root that is still in the
  // document is a root that still takes clicks. So the leaving root stops
  // taking pointer events the MOMENT it starts leaving, before any of the
  // animation has played, and it is removed whether or not the animation
  // reports back.
  const ENTER_MS = 260;
  const LEAVE_MS = 170;

  function modalEnter(host) {
    try {
      if (!host || !host.classList || reducedMotion()) return false;
      host.classList.remove('is-entering');
      host.getBoundingClientRect();
      host.classList.add('is-entering');
      // A TIMER, NOT animationend, and this is Xtra's own correction: the
      // card can be REPLACED mid-animation by a re-render (a modal that
      // swaps its body between steps does exactly that), and the listener
      // dies with the node it was attached to, leaving the class stuck on
      // the host for good.
      setTimeout(() => {
        try { host.classList.remove('is-entering'); } catch (_) { /* gone */ }
      }, ENTER_MS + 60);
      return true;
    } catch (_) {
      return false;
    }
  }

  // `remove` is the caller's own teardown — whatever it did before this
  // existed. It runs exactly once, either when the animation ends or when the
  // fallback timer fires, whichever is first.
  //
  // IT IS CALLED EVEN WITH REDUCED MOTION, and immediately: the point is that
  // the modal goes, not that it goes prettily.
  function modalLeave(host, remove) {
    const go = (() => {
      let done = false;
      return () => {
        if (done) return;
        done = true;
        try { remove(); } catch (_) { /* the caller's own problem, not ours */ }
      };
    })();
    try {
      if (!host || !host.classList || reducedMotion()) { go(); return false; }
      // FIRST, BEFORE ANY ANIMATION. An overlay mid-fade is still a full
      // -screen element on top of whatever opened next.
      host.style.pointerEvents = 'none';
      host.classList.remove('is-entering');
      host.classList.add('is-leaving');
      host.addEventListener('animationend', go, { once: true });
      // THE FALLBACK IS NOT BELT AND BRACES. animationend does not fire at
      // all when the animation is cancelled — by a display change, by the
      // node being moved, by a stylesheet that did not load — and a modal
      // that fails to leave is the exact bug this is fixing. The timer is
      // what guarantees removal; the event only makes it prompt.
      setTimeout(go, LEAVE_MS + 120);
      return true;
    } catch (_) {
      go();
      return false;
    }
  }

  return { reducedMotion, fadeIn, fadeInAll, modalEnter, modalLeave, ENTER_MS, LEAVE_MS };
});
