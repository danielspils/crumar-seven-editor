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

  ui.check(titleOf(hold) === 'Overwrite Bank 3 · Preset 5',
    'the real bank and preset are named, in the words the instrument prints');
  ui.check(subOf(hold) === 'Holding the button on the Seven for three seconds is what saves it',
    'and the row says on its face that the HOLD is what does it');
  // NOT "confirm", in either word position: the app cannot write the preset at
  // all, so a sentence reading as app-saves-and-you-approve is the one wrong
  // thing this row can say. Asserted separately from the string above so a
  // future reword cannot reintroduce it while still matching some new wording.
  ui.check(!/confirm/i.test(subOf(hold)),
    'and never asks the player to CONFIRM something the app did not do');
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

  // ── THREE ROWS, in Patches (Daniel, 14 Nov 2026) ────────────────────────
  //
  // The second dialog was folded in, so one of your own patches offers all
  // three destinations at once. This is the case most worth LOOKING at: three
  // similar-sounding choices stacked is exactly the reading problem this
  // dialog exists for, and the only thing keeping them apart is that each
  // sentence is present and legible.
  const three = SevenSavePlan.saveRows({
    changed: true, slot: { bank: 3, preset: 5 }, canUpdate: true, targetName: 'Reed Piano',
  });
  ui.check(seen(three) === 'update,hold,computer',
    `Patches offers all three, update first (got ${seen(three)})`);
  m.body.innerHTML = SevenSavePlan.rowsHtml(three);
  await ui.sleep(200);
  const drawn3 = [...m.body.querySelectorAll('.sv-row')];
  ui.check(drawn3.length === 3, `three rows on screen (${drawn3.length})`);
  let lastBottom = -1;
  for (const el of drawn3) {
    const r = el.getBoundingClientRect();
    const sub = el.querySelector('.sv-row-s');
    const sh = Math.round(sub.getBoundingClientRect().height);
    ui.note(`"${titleOf(el)}" / "${subOf(el)}" — sub ${sh}px at y ${Math.round(r.top)}`);
    ui.check(sh >= 12, `"${titleOf(el)}" has a visible sentence (${sh}px)`);
    ui.check(r.top >= lastBottom - 1, `"${titleOf(el)}" is stacked below the one before`);
    lastBottom = r.bottom;
  }
  // The two that both write to the computer must not read the same. This is
  // the pair Daniel could not tell apart in the first place, one level down.
  const upd = drawn3.find((el) => titleOf(el).startsWith('Update'));
  const comp = drawn3.find((el) => titleOf(el) === 'Save to computer');
  ui.check(!!upd && titleOf(upd).includes('Reed Piano'),
    'the update row names the patch it would write into');
  ui.check(!!comp && subOf(comp) !== subOf(upd),
    'and the two computer destinations do not share a sentence');
  const threeRowHeight = Math.round(dialog.getBoundingClientRect().height);
  m.body.innerHTML = SevenSavePlan.rowsHtml(rows);
  await ui.sleep(150);

  // ── THE SIZE DOES NOT JUMP between the one-row and two-row forms ────────
  const twoRowHeight = Math.round(dialog.getBoundingClientRect().height);
  m.body.innerHTML = SevenSavePlan.rowsHtml(quiet);
  await ui.sleep(200);
  const oneRowHeight = Math.round(dialog.getBoundingClientRect().height);
  ui.note(`dialog height: three rows ${threeRowHeight}, two ${twoRowHeight}, one ${oneRowHeight}`);
  ui.check(threeRowHeight > twoRowHeight,
    'and a row that is PRESENT brings its own space — the dialog grows for it '
    + 'rather than squeezing three rows into the height of two');
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

  // ── A ROW CLICK ANSWERS THE DIALOG ──────────────────────────────────────
  //
  // THE ROWS ARE THE ONLY AFFIRMATIVE CONTROL. confirmLabel is '' on purpose,
  // so there is no OK button — and on 2026-11-14 that meant clicking
  // "Overwrite Bank 3 · Preset 5" did nothing at all: the row recorded which
  // destination it meant and settled nothing, so the dialog sat open.
  //
  // Diagnosed by measurement rather than by the obvious guess. The reported
  // symptom looked like clicks falling through to the page behind, and that
  // was not it: the backdrop is present at z-index 60 with pointer-events
  // auto, the row is a real <button>, and a click at the carousel's centre
  // hit-tests to the row itself. Nothing was falling through; the dialog had
  // no way to be answered.
  //
  // This asserts the CONTRACT, not one caller's wiring: modal.js settles on
  // any [data-modal-choice], and save-plan.js marks every row with it, so a
  // row-built dialog cannot be left unanswerable by a caller that forgot.
  const rowBtn = m.body.querySelector('.sv-row[data-sv="hold"]');
  ui.check(!!rowBtn, 'the overwrite row is a real element to click');
  ui.check(rowBtn.tagName === 'BUTTON', `and it is a <button> (${rowBtn.tagName})`);
  ui.check(rowBtn.hasAttribute('data-modal-choice'),
    'marked as a control that ANSWERS the dialog, not merely as a destination');
  let settled = null;
  m.action().then((v) => { settled = v; });
  await ui.sleep(120);
  ui.check(settled === null, 'nothing is settled before anything is clicked');
  rowBtn.click();
  await ui.sleep(300);
  ui.check(settled === true,
    `clicking the overwrite row answers the dialog (settled=${settled})`);
  // And the row still says WHICH destination it was, which is the caller's
  // half — the two attributes do two different jobs and both must survive.
  ui.check(rowBtn.dataset.sv === 'hold',
    'and still reports which destination was chosen');

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
