// @env SEVEN_NO_REVEAL=1
//
// THE FOLDER BUTTON in the library header — app.js's #library-reveal branch,
// uncovered until now for a mundane reason: clicking it opens a real Finder
// window, which a test cannot un-open and a suite would spray across a desktop.
//
// SEVEN_NO_REVEAL does NOT suppress the call. A flag making reveal() a no-op
// would produce a test passing because nothing happened — and "nothing
// happened" is indistinguishable from "the WRONG folder was revealed", which is
// the only failure here worth catching. The flag records the path it would have
// opened, and this asserts that path is right.
//
// The flag's contract was measured before it was trusted (2026-08-21): with it,
// {revealed:false} and Finder window count 0 → 0; without it, {revealed:true}
// and 0 → 1, the front window named after the library folder.
//
// WHY THE CLICK AND THE PATH ARE CHECKED SEPARATELY. The listener discards
// reveal()'s answer, and a scenario cannot wrap the call to watch it:
// contextBridge DEEP-FREEZES the exposed object — measured, sevenAPI and
// sevenAPI.library both report Object.isFrozen true and an assignment silently
// does nothing. So the click proves the control is there and its handler runs;
// the direct call proves where it goes; and that the button is wired to that
// call at all is asserted from source in test/source-wiring.test.js, which runs
// on `npm test`.
(async () => {
  const btn = ui.$('#library-reveal');
  ui.check(!!btn, 'the reveal button is in the library header');
  if (!btn) return;
  ui.check(!btn.disabled && !!btn.offsetParent, 'and it is visible and enabled');

  // The real gesture. Nothing observable comes back — but a handler that threw
  // would surface as an uncaught error, and a button that had lost its listener
  // is what the source-wiring test catches.
  ui.click(btn, 'the folder button');
  await ui.sleep(400);

  // Where it goes.
  const answered = await window.sevenAPI.library.reveal();
  ui.note(`reveal answered: ${JSON.stringify(answered)}`);
  ui.check(answered && answered.revealed === false,
    'no Finder window is opened, because the flag is set');

  // THE ASSERTION THAT MATTERS: the right folder — the library the app is
  // actually using, which under the runner is a scratch copy.
  const expected = ui.env('SEVEN_LIBRARY_DIR');
  ui.check(!!expected, 'the runner told the app which library to use');
  ui.check(answered && answered.path === expected,
    `it would open the library folder in use (${answered && answered.path})`);
  ui.check(!/Application Support/.test(String(answered && answered.path)),
    'and NOT the real library — a scenario never touches it');
})()
