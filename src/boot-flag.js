'use strict';

// THE FIRST THING THE APP SAYS MUST NOT BE FALSE.
//
// Launching with the Seven plugged in used to paint the app's full
// DISCONNECTED state for over a second — "No instrument connected", a Connect
// button, empty lists, "Select a patch", no logo in the nav — while the
// instrument was attached and already being read. The boot loader covers the
// window and would have hidden all of it, but the renderer showed it a beat
// later, and that beat is what you could see.
//
// SO THE LOADER STARTS VISIBLE AND THE APP PAINTS BEHIND IT (Daniel, 16 Nov
// 2026). `#boot-loader` carries no `hidden` attribute now; this script takes
// it away again when there is nothing to wait for.
//
// AND AN OFFLINE LAUNCH SHOWS NO LOADER AT ALL. The trade Daniel accepted was
// a brief loader when nothing is plugged in — honest, but still a flash. It
// turned out not to be necessary: `portPresent()` reads port NAMES only, so
// the main process can answer before the window loads and the question is
// settled before a single frame.
//
// WHY A FILE RATHER THAN AN INLINE SCRIPT. The page's CSP is
// `default-src 'self'` with no `script-src 'unsafe-inline'`, so an inline
// <head> script is blocked outright. A same-origin file is allowed, and a
// classic <script> in <head> with no `defer` blocks parsing — so this runs
// before <body> exists and therefore before anything in it can paint.
//
// IT TOUCHES THE DOCUMENT ELEMENT, NOT THE LOADER. <body> has not been parsed
// when this runs, so `#boot-loader` does not exist yet; an attribute on <html>
// is the only handle available this early, and the stylesheet keys off it.
//
// IT CANNOT STOP THE APP. Every failure answers "no instrument", which costs
// the loader and nothing else — a throw in the first script of the page would
// take the whole window with it.
(function bootFlag() {
  let attached = false;
  try {
    attached = !!(window.sevenAPI
      && typeof window.sevenAPI.instrumentAttached === 'function'
      && window.sevenAPI.instrumentAttached());
  } catch {
    attached = false;
  }
  if (!attached) {
    document.documentElement.setAttribute('data-seven-boot', 'none');
  }
}());
