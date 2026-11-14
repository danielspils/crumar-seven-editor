// @env SEVEN_NO_DEVICE=1
//
// THE SAVE DIALOG, drawn (out/save-what-you-hear.md §3).
//
// The problem it exists for is a reading problem, not a logic one. Daniel could
// not tell "Save as new patch" from saving to the Seven while standing at the
// instrument: "They're hard to wrap my head around in the moment ... I know now
// but only because I'm working on the software." So the two choices sit next to
// each other, each carrying its own sentence, and the sentences have to be
// legible and present — which is a thing you can only check by looking.
//
// The DECISION is pinned in test/save-plan.test.js, which runs in `npm test`.
// This is the half that needs a window: the rows render, both lines are there,
// the dialog is the same size whichever set of rows it holds, and it reads in
// light as well as dark.
//
// The markup and the rows both come from SevenSavePlan — the real ones. Built
// here rather than driven through openSaveFlow because reaching that needs a
// live session, and a live session needs the cable.
(async () => {
  const seen = (rows) => rows.map((r) => r.value).join(',');

  // ── WITH NOTHING CHANGED: one row, and no slot to overwrite ─────────────
  const quiet = SevenSavePlan.saveRows({ changed: false, slot: { bank: 3, preset: 5 } });
  ui.check(seen(quiet) === 'computer',
    `nothing changed offers the computer only (got ${seen(quiet)})`);

  // ── WITH CHANGES: the overwrite row, naming the real slot ───────────────
  const rows = SevenSavePlan.saveRows({ changed: true, slot: { bank: 3, preset: 5 } });
  ui.check(seen(rows) === 'hold,computer', `changed offers both (got ${seen(rows)})`);

  const m = SevenModal.open({
    title: 'Save patch',
    bodyHtml: SevenSavePlan.rowsHtml(rows),
    confirmLabel: '',
    cancelLabel: 'Cancel',
    tone: 'is-save',
  });
  await ui.sleep(300);

  const dialog = m.body.closest('.seven-modal');
  const drawn = [...m.body.querySelectorAll('.sv-row')];
  ui.check(drawn.length === 2, `both rows are on screen (${drawn.length})`);
  if (drawn.length !== 2) { m.close(); return; }

  const [hold, computer] = drawn;
  const titleOf = (el) => el.querySelector('.sv-row-t').textContent;
  const subOf = (el) => el.querySelector('.sv-row-s').textContent;

  ui.note(`row 1: "${titleOf(hold)}" / "${subOf(hold)}"`);
  ui.note(`row 2: "${titleOf(computer)}" / "${subOf(computer)}"`);

  ui.check(titleOf(hold) === 'Overwrite Bank 3 / Slot 5', 'the real bank and slot are named');
  ui.check(subOf(hold) === 'Hold the button on the Seven to confirm',
    'and the row says on its face that the HOLD is what does it');
  ui.check(titleOf(computer) === 'Save to computer', 'the other destination is the computer');
  ui.check(subOf(computer).includes('The Seven is untouched'),
    'which says the instrument is left alone');

  // THE SENTENCE UNDER EACH TITLE IS THE WHOLE DEFENCE against the two being
  // mistaken for each other, so it must actually be rendered — not collapsed,
  // not clipped to nothing.
  for (const [name, el] of [['hold', hold], ['computer', computer]]) {
    const sub = el.querySelector('.sv-row-s');
    const h = Math.round(sub.getBoundingClientRect().height);
    ui.note(`${name} sub-line height ${h}`);
    ui.check(h >= 12, `the ${name} row's sentence is visible (${h}px)`);
  }

  // Full width and stacked: side by side they read as a pair to pick between
  // quickly, and this is a question worth a moment.
  const hb = hold.getBoundingClientRect();
  const cb = computer.getBoundingClientRect();
  ui.note(`rows ${Math.round(hb.width)}x${Math.round(hb.height)} at y ${Math.round(hb.top)} and ${Math.round(cb.top)}`);
  ui.check(cb.top >= hb.bottom - 1, 'the rows are stacked, not side by side');
  ui.check(Math.abs(hb.width - cb.width) < 1, 'and the same width');

  // ── THE SIZE DOES NOT JUMP between the one-row and two-row forms ────────
  const twoRowHeight = Math.round(dialog.getBoundingClientRect().height);
  m.body.innerHTML = SevenSavePlan.rowsHtml(quiet);
  await ui.sleep(200);
  const oneRowHeight = Math.round(dialog.getBoundingClientRect().height);
  ui.note(`dialog height: two rows ${twoRowHeight}, one row ${oneRowHeight}`);
  ui.check(oneRowHeight < twoRowHeight,
    'a row that is absent takes its space with it — the dialog is not padded out '
    + 'to hide that there is nothing to overwrite');

  // ── BOTH THEMES ────────────────────────────────────────────────────────
  //
  // Measured, not eyeballed: the rows are drawn with --line and --text-muted,
  // and a token that resolves to nothing in one theme is invisible there.
  m.body.innerHTML = SevenSavePlan.rowsHtml(rows);
  await ui.sleep(150);
  for (const theme of ['dark', 'light']) {
    document.documentElement.dataset.theme = theme;
    await ui.sleep(200);
    const row = m.body.querySelector('.sv-row');
    const sub = row.querySelector('.sv-row-s');
    const cs = getComputedStyle(row);
    const subColor = getComputedStyle(sub).color;
    ui.note(`${theme}: border ${cs.borderTopColor}, title ${getComputedStyle(row).color}, sub ${subColor}`);
    const transparent = (c) => /rgba\(0,\s*0,\s*0,\s*0\)|transparent/.test(c);
    ui.check(!transparent(cs.borderTopColor), `${theme}: the row has a visible edge`);
    ui.check(!transparent(subColor), `${theme}: the sentence has a visible colour`);
    ui.check(subColor !== cs.backgroundColor,
      `${theme}: the sentence is not the same colour as what it sits on`);
  }
  document.documentElement.dataset.theme = 'dark';

  m.close();

  // ── THE TICK BOX, on the hold screen ───────────────────────────────────
  //
  // Ticked by DEFAULT is the whole protection: unticked it is a step he would
  // skip in exactly the moment he needs it.
  const h = SevenModal.open({
    title: 'Hold it on the Seven',
    bodyHtml:
      SevenModalPanel.buildPanel(window.sevenAPI.getPanelSvg(), { brackets: false })
      + `<div class="tx-face" data-face="hold">${SevenModalPanel.holdFaceHtml()}</div>`
      + '<label class="sv-check"><input type="checkbox" class="sv-copy" checked>'
      + '<span><b>Also save a copy to Patches</b><br>'
      + 'If you walk away without holding the button, the sound is still on your computer.'
      + '</span></label>',
    confirmLabel: 'Done',
    cancelLabel: 'Cancel',
    tone: 'is-save',
  });
  await ui.sleep(300);
  const box = h.body.querySelector('.sv-copy');
  ui.check(!!box, 'the tick box is on the hold screen');
  ui.check(!!box && box.checked, 'and it is TICKED when the screen opens');
  const holdLine = h.body.querySelector('.tx-hold-line');
  ui.check(!!holdLine && holdLine.textContent.includes('lights will run'),
    'the hold instruction is the shared one, not a second telling');
  h.close();
})()
