// @env SEVEN_NO_DEVICE=1
//
// NO INSTRUMENT, NO LOADER. A flourish over an empty library is a flourish
// about nothing, and worse: the loader exists to explain a wait that is only
// happening because a Seven is being read. With nothing attached there is no
// read and no wait, so there is nothing to explain.
//
// THE TRAP THIS AVOIDS is a test that only asks whether the loader is hidden
// NOW. It is hidden now in every passing case, including the one where it
// appeared and went away again — which is exactly the behaviour this file
// exists to forbid. So it asks for a TRACE instead: app.js fills the mark
// with the logo artwork at the moment it shows the loader, and nothing ever
// empties it. An empty mark means the loader was never shown at all.
//
// SEVEN_NO_DEVICE lies at ONE place, _findPort in seven-midi.js, so connect()
// fails through the genuine no-port path and everything downstream is the
// code a user without an instrument runs.
(async () => {
  const el = ui.$('#boot-loader');
  const mark = ui.$('#boot-mark');
  const status = ui.$('#boot-status');

  ui.check(!!el && !!mark, 'the boot loader markup is in the document');
  if (!el || !mark) return;

  // Give the auto-connect tick every chance to have run and shown something.
  // It fires immediately at boot and then every three seconds; waiting past
  // one full interval means a loader that appears late still fails this.
  await ui.sleep(3600);

  const box = el.getBoundingClientRect();
  const shown = getComputedStyle(el).display;
  ui.note(`hidden=${el.hidden} · display "${shown}" · box ${Math.round(box.width)}x${Math.round(box.height)}`
    + ` · data-seven-boot "${document.documentElement.getAttribute('data-seven-boot')}"`
    + ` · mark innerHTML ${mark.innerHTML.length} chars`
    + ` · status "${status ? status.textContent : ''}"`);

  // NOT VISIBLE, ASKED AS A MEASUREMENT RATHER THAN AS A FLAG (16 Nov 2026).
  //
  // This asserted `el.hidden` until the loader was made to start VISIBLE so
  // the app cannot paint its disconnected state in front of it. With nothing
  // attached it is now hidden by boot-flag.js's attribute and a CSS rule
  // instead of by the `hidden` property — the loader is just as absent and
  // the old assertion failed anyway, because it was testing one particular
  // MECHANISM rather than the thing that matters.
  //
  // display and the box together: a rule that only set `visibility` would
  // leave a full-window sheet over the app with a box to prove it.
  ui.check(shown === 'none' || el.hidden,
    `the loader is not rendered with no instrument attached (display "${shown}")`);
  ui.check(box.width === 0 && box.height === 0,
    `and it has no box at all (${Math.round(box.width)}x${Math.round(box.height)})`);
  ui.check(mark.innerHTML.trim() === '',
    'the mark was never filled with the artwork — so the loader was never shown,'
    + ' not merely shown and hidden again');
  ui.check(!status || status.textContent.trim() === '',
    'nothing was said about reading an instrument that is not there');
  ui.check(!mark.classList.contains('is-warming') && !mark.classList.contains('is-lit'),
    `the mark carries no state classes (class="${mark.className}")`);

  // And the window belongs to the app, not to an invisible sheet.
  const mid = document.elementFromPoint(
    Math.round(document.documentElement.clientWidth / 2),
    Math.round(document.documentElement.clientHeight / 2)
  );
  ui.check(!!mid && !mid.closest('#boot-loader'),
    'a press in the middle of the window does not land on the loader');
})()
