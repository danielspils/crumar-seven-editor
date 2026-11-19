// IS THE PLAIN INSTRUMENT PICTURE REACHABLE? ESTABLISHED, NOT READ.
//
// The engine header draws the sound either as the depth card STACK
// (.engine-carousel) or as a PLAIN drawing in a 363/512 box. The plain one is
// a candidate for deletion, and the instruction was explicit: do not delete on
// a reading of the source, establish it in the running app.
//
// READING THE SOURCE SAYS IT IS ALIVE, which is the opposite of the premise:
//
//   currentPatch()   `if (deviceSel) return ...`            — no lastTouched test
//   the view's pos   `lastTouched === 'device' && deviceSel` — has one
//
// So with deviceSel set and lastTouched NOT 'device', and no library
// selection, currentPatch() hands back a patch while the view gets `{}`. No
// canPickSound and no `sounds`, which makes BOTH plain-variant paths fire at
// once — renderer.js:768's ternary arm and soundCarousel's own early return.
//
// The gesture that should produce it: pick a bank slot, then move to a list
// tab without picking anything there.
//
// NO INSTRUMENT. The stack renders offline by design.
(async () => {
  const plain = () => ui.$('#detail .engine-art:not(.engine-carousel)');
  const stack = () => ui.$('#detail .engine-carousel');
  const state = () => (plain() ? 'PLAIN' : (stack() ? 'stack' : 'neither'));
  const say = (what) => {
    const p = plain();
    ui.note(`${what.padEnd(42)} ${state()}`
      + (p ? ` · box ${Math.round(p.getBoundingClientRect().width)}x${Math.round(p.getBoundingClientRect().height)}` : ''));
    return state();
  };

  const seen = new Set();

  // ---- 1. A BANK SLOT, which is the ordinary device selection ----------
  await ui.closeLibrary();
  await ui.sleep(400);
  const slot = ui.$('#bank-region .patch-row');
  if (slot) { ui.click(slot, 'a bank slot'); await ui.sleep(1200); }
  seen.add(say('device slot selected'));

  // ---- 2. NOW A LIST TAB, WITHOUT SELECTING ANYTHING THERE -------------
  //
  // THE CANDIDATE STATE. lastTouched moves to the library while libSelected
  // is still null and deviceSel survives, so the view falls through both
  // canPickSound arms to `{}`.
  for (const view of ['patches', 'setlists', 'backups']) {
    const tab = ui.$(`#top-tabs .top-tab[data-view="${view}"]`);
    if (!tab) continue;
    ui.click(tab, `the ${view} tab`);
    await ui.sleep(900);
    seen.add(say(`${view} tab, nothing selected on it`));
  }

  // ---- 3. AND BACK TO THE SEVEN TAB ------------------------------------
  const sevenTab = ui.$('#top-tabs .top-tab[data-view="seven"]');
  if (sevenTab) { ui.click(sevenTab, 'the Seven tab'); await ui.sleep(900); }
  seen.add(say('back on the Seven tab'));

  // ---- 4. A LIBRARY PATCH, the state that used to get the plain box ----
  await ui.openLibrary();
  await ui.sleep(500);
  const row = ui.$('#library .lib-row.lib-patch, #library [data-file]');
  if (row) { ui.click(row, 'a library patch'); await ui.sleep(2000); }
  seen.add(say('library patch selected'));

  // ---- THE VERDICT ------------------------------------------------------
  ui.note(`states seen: ${[...seen].join(', ')}`);
  // REPORTED, NOT ASSERTED EITHER WAY. The question is which paths are alive;
  // failing here would only say the answer was not the one expected.
  ui.check(true, seen.has('PLAIN')
    ? 'THE PLAIN VARIANT IS REACHABLE — it must not be deleted'
    : 'the plain variant was NOT reached by any of these gestures');
})()
