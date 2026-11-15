// WHILE A DIALOG IS OPEN, NOTHING BEHIND IT REACTS.
//
// Daniel, 2026-11-14: with the save dialog open, the preset carousel behind it
// was hovering and animating. The obvious reading is that the modal was not
// capturing the mouse and clicks were falling through. MEASURED, that was not
// it — the backdrop is present at z-index 60 with pointer-events auto, and
// document.elementFromPoint at the carousel's centre returns the dialog's own
// row button. Nothing falls through.
//
// THE CAUSE IS THAT THE CAROUSEL NEVER ASKED. Its opener is a `pointermove`
// listener on `document` which decides by comparing clientX/clientY against
// getBoundingClientRect, deliberately: its peek faces are drawn outside its own
// box, and an element big enough to cover them would catch passing traffic
// (app.js, Daniel 2026-08-13). A coordinate test bound to `document` is
// invisible to everything painted on top of it — the event still arrives, and
// the coordinates are still inside the rect. z-index and pointer-events cannot
// reach that bug, which is why the backdrop looked correct and was.
//
// So this scenario asserts the property rather than the plumbing: a pointer
// event over the carousel's own region, with a dialog up, must not open it.
//
// It needs the instrument, because the carousel only renders when the connected
// unit's sound table has two or more sounds in it (renderer.js, soundCarousel).
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };

  // The carousel lives beside a SELECTED patch, with the library open — the
  // same door carousel-never-writes goes through.
  await ui.openLibrary();
  const seg = await ui.waitEl('.seg-btn[data-tab="patches"]', 'the patches tab');
  ui.click(seg, 'the patches tab');
  await ui.sleep(700);
  const row = ui.$('#library .lib-row.lib-patch, #library [data-file]');
  if (!row) {
    ui.note('this library has no patch to select — not checked');
    return;
  }
  ui.click(row, 'a patch');
  await ui.sleep(3000);

  const car = ui.$('[data-carousel]');
  if (!ui.check(!!car, 'the carousel is on screen')) return;
  const r = car.getBoundingClientRect();
  const cx = Math.round(r.left + r.width / 2);
  const cy = Math.round(r.top + r.height / 2);
  const point = (x, y) => document.dispatchEvent(new PointerEvent('pointermove', {
    clientX: x, clientY: y, bubbles: true,
  }));

  // ── IT DOES OPEN, with nothing in the way ───────────────────────────────
  //
  // THE CONTROL CASE, AND IT IS NOT OPTIONAL. Without it, a carousel that had
  // stopped opening for any reason at all would satisfy every assertion below
  // — a scenario passing because the thing under test is broken, which is the
  // shape CLAUDE.md files under a fixture that cannot express its subject.
  point(5, 5);
  await ui.sleep(300);
  ui.check(!car.classList.contains('is-open'), 'it starts shut');
  point(cx, cy);
  await ui.sleep(400);
  ui.check(car.classList.contains('is-open'),
    'a pointer over the carousel DOES open it when nothing covers it');

  // ── AND THEN A DIALOG OPENS OVER IT ─────────────────────────────────────
  const m = SevenModal.open({
    title: 'Save patch',
    bodyHtml: SevenSavePlan.rowsHtml(
      SevenSavePlan.saveRows({ changed: true, slot: { bank: 3, preset: 5 } })
    ),
    confirmLabel: '',
    cancelLabel: 'Cancel',
    tone: 'is-save',
  });
  await ui.sleep(500);

  // The already-open carousel is SHUT by the dialog arriving, rather than left
  // frozen mid-animation behind the backdrop.
  ui.check(!car.classList.contains('is-open'),
    'a dialog opening over a hovered carousel closes it');

  // And it stays shut however the pointer moves across it.
  for (const [x, y, where] of [
    [cx, cy, 'the centre'],
    [Math.round(r.left + 4), cy, 'the left edge'],
    [Math.round(r.right - 4), cy, 'the right edge'],
  ]) {
    point(x, y);
    await ui.sleep(300);
    ui.check(!car.classList.contains('is-open'),
      `with the dialog up, a pointer over ${where} does not open it`);
  }

  // THE BACKDROP IS DOING ITS OWN JOB TOO, which is the half that was never
  // broken — asserted so that a future change cannot quietly rely on the
  // coordinate guard above to cover for a backdrop that stopped working.
  const hit = document.elementFromPoint(cx, cy);
  ui.note(`a click at the carousel centre lands on <${hit && hit.tagName.toLowerCase()}`
    + ` class="${hit ? String(hit.className).slice(0, 30) : '-'}">`);
  ui.check(!!(hit && hit.closest('.seven-modal-overlay')),
    'and a click there is hit-tested to the dialog, not to the carousel');
  ui.check(!!(hit && !hit.closest('[data-carousel]')),
    'so no click can reach the carousel either');

  // ── CLOSED AGAIN: the carousel comes back ───────────────────────────────
  //
  // The guard must be a GUARD, not an off switch. Without this, hardcoding
  // `return` in that listener would pass everything above.
  m.close();
  await ui.sleep(400);
  point(5, 5);
  await ui.sleep(250);
  point(cx, cy);
  await ui.sleep(400);
  ui.check(car.classList.contains('is-open'),
    'and once the dialog is gone the carousel opens again');
})()
