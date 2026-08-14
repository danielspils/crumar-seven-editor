'use strict';

// Bottom-edge fade for scrollable lists: a cut-off row at a container's edge
// reads as the end of the list, so every long scroller wears a fade while
// there is more below it, and drops it at the end (or never shows it when the
// content fits). One place so the affordance means the same thing everywhere.
//
// Two mechanisms, both driven by the same `at-end` class:
//
//   mask   — default. The fade lives on the scroller's own viewport via
//            mask-image, so no wrapper or extra markup is needed, and it
//            blends to whatever is behind rather than a hardcoded colour.
//   ::after — for a scroller with a POSITION:FIXED descendant. A masked
//            element becomes the containing block for fixed children, which
//            would trap a modal inside the list. Those scrollers put the
//            gradient on a positioned parent instead (see #library-body).

(function (global) {
  const AT_END = 'at-end';

  // A couple of pixels of slack: fractional scroll heights mean scrollTop
  // rarely lands exactly on the maximum.
  function atEnd(el) {
    // A list that FITS is at its end by definition — there is nothing below
    // the fold for a fade to hint at, and one drawn anyway made a short list
    // look truncated (Daniel, 2026-08-13).
    if (el.scrollHeight - el.clientHeight <= 2) return true;
    return el.scrollHeight - el.clientHeight - el.scrollTop <= 2;
  }

  // `el` is the scroller; `flagOn` is the element that carries the class
  // (the scroller itself for the mask flavour, a parent for the ::after one).
  function refresh(el, flagOn) {
    (flagOn || el).classList.toggle(AT_END, atEnd(el));
  }

  // Watch a scroller that exists for the life of the app.
  function watch(el, flagOn) {
    if (!el) return () => {};
    const update = () => refresh(el, flagOn);
    el.addEventListener('scroll', update, { passive: true });
    // Content and viewport both change size — a re-render, a window resize, a
    // dragged split. ResizeObserver catches all three without a resize handler.
    if (global.ResizeObserver) {
      const ro = new ResizeObserver(update);
      ro.observe(el);
      if (el.firstElementChild) ro.observe(el.firstElementChild);
    }
    update();
    // And again after layout. On first load the heights are not final when
    // this runs, so a list that fits measured as one that does not and wore a
    // fade until something else forced a re-check — which is why switching
    // tabs and coming back "fixed" it (Daniel, 2026-08-13).
    requestAnimationFrame(update);
    // Fonts land later still, and they change how tall a list is.
    if (global.document && document.fonts && document.fonts.ready) {
      document.fonts.ready.then(update, () => {});
    }
    return update;
  }

  // Watch scrollers that get replaced by re-renders: scroll is registered in
  // the capture phase on a stable root (scroll does not bubble), and callers
  // re-run refreshAll() after they rebuild their DOM.
  function watchWithin(root, selector, flagOn) {
    const update = () => {
      const el = root.querySelector(selector);
      if (el) refresh(el, flagOn || el);
    };
    root.addEventListener('scroll', update, true);
    // Scroll and re-render are not the only ways the answer changes. The
    // viewport can be resized around a list that never scrolled and never
    // re-rendered — a dragged window, the section above collapsing, the detail
    // panel growing — and the class then describes a geometry that is gone
    // (Daniel, 2026-08-13: "stale scroll state fade"). watch() has observed
    // size all along; this flavour did not, which is the whole difference.
    //
    // Observing the ROOT rather than the scroller: the scroller is replaced on
    // every render, so an observer on it would be watching a detached node
    // after the first one.
    if (global.ResizeObserver) new ResizeObserver(update).observe(root);
    update();
    // Same reason as watch(): heights are not final in the frame that mounts.
    if (global.requestAnimationFrame) requestAnimationFrame(update);
    return update;
  }

  global.SevenScrollFade = { watch, watchWithin, refresh };
})(window);
