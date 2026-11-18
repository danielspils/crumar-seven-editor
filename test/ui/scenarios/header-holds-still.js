// THE SOUND ENGINE HEADING DOES NOT FOLLOW THE STACK.
//
// THE BUG (Daniel, 18 Nov 2026, with a screenshot). Slot 2 — Reed Piano —
// selected and sounding. The stack paged to card 5. The heading read "DX Synth
// Piano" over the sub-line "DX Digital E.P.". Nothing had been loaded. The
// panel was naming a sound the instrument was not playing.
//
// WHY THE HEADING MAY NOT PREVIEW. The parameter rows below it are the loaded
// patch's values, read off the instrument, and they cannot follow a card the
// instrument has never been sent. A heading that moves while the rows beneath
// it do not is not a preview — it is two different sounds stacked under one
// name. Daniel considered letting the heading preview and rejected it for
// exactly that reason, which is why the CAPTION under the stack exists: the
// caption is the part that is allowed to move.
//
// IT MUST RUN CONNECTED. The faulty branch in renderEngine was gated on
// `view.connected`, so offline the heading already held still — a version of
// this scenario that ran without an instrument would have passed against the
// broken code and proved nothing. That is why it declares requireDevice()
// rather than taking the easier offline route.
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };

  const headName = () => {
    const el = ui.$('#detail .engine-sound');
    // The heading carries a Model/Sample badge inside it; the name is the
    // text before that, not the element's whole textContent.
    if (!el) return null;
    const badge = el.querySelector('.badge');
    const whole = el.textContent || '';
    return (badge ? whole.replace(badge.textContent || '', '') : whole).trim();
  };
  const subLine = () => {
    const el = ui.$('#detail .engine-sub .engine-group');
    return el ? el.textContent.trim() : null;
  };
  const frontName = () => {
    const f = ui.$('#detail .car-face.is-front');
    return f ? f.dataset.carName : null;
  };
  const caption = () => {
    const c = ui.$('#detail .car-count');
    return c ? c.textContent.trim() : null;
  };

  await ui.openLibrary();
  await ui.selectTab('seven');
  // SLOT 2, the one in the report. Index 1 is the second row.
  if (!(await ui.selectBankPreset(1))) return;
  await ui.sleep(1200);

  const loaded = headName();
  const loadedSub = subLine();
  if (!ui.check(!!loaded, `the heading names the slot's sound ("${loaded}")`)) return;
  ui.note(`loaded: "${loaded}" / "${loadedSub}" · front card "${frontName()}"`);

  // AT REST THE FRONT CARD IS THE LOADED SOUND, which is what makes the
  // comparison below meaningful: if these disagreed before any turning, a
  // later difference would say nothing about the stack having moved.
  ui.check(frontName() === loaded,
    `at rest the front card is the loaded sound ("${frontName()}")`);
  ui.check(caption() === null,
    `and there is no caption at rest (${caption() === null ? 'none' : `"${caption()}"`})`);

  // TURN IT. One step is enough for the bug, but the stack wraps, so this
  // keeps stepping until the front card genuinely differs rather than
  // assuming one press moved it.
  const step = ui.$('#detail [data-car-step="1"]');
  if (!ui.check(!!step, 'the stack has a next chevron')) return;
  let turned = 0;
  while (frontName() === loaded && turned < 6) {
    ui.click(step, 'the next chevron');
    await ui.sleep(900);
    turned += 1;
  }
  const front = frontName();
  if (!ui.check(front && front !== loaded,
    `the stack turned to a different instrument ("${front}" after ${turned} step(s))`)) return;

  // ---- THE THREE THINGS, IN ONE STATE ----------------------------------
  //
  // This is the assertion that is the bug. Before the fix the heading read
  // the front card's name, so the first check failed and the third could not
  // be true at all.
  ui.note(`after turning: heading "${headName()}" · front card "${front}" · caption ${caption() ? `"${caption()}"` : 'none'}`);

  ui.check(headName() === loaded,
    `the heading STILL names the loaded sound ("${headName()}", wanted "${loaded}")`);
  ui.check(subLine() === loadedSub,
    `and the sub-line has not moved either ("${subLine()}", wanted "${loadedSub}")`);

  const cap = caption();
  ui.check(!!cap && cap.includes(front),
    `the caption names the front card ("${cap}")`);

  ui.check(headName() !== front,
    `and the heading and the front card DIFFER — "${headName()}" vs "${front}"`);

  // THE KNOCK-ON DANIEL ASKED ABOUT, pinned rather than reasoned about.
  // `moved` in soundCarousel compares the front card to `patch.soundName`,
  // not to the heading. Had it compared against the heading, the two would
  // always agree once the heading followed, and the LOAD affordance could
  // never appear. It does appear, which is the evidence.
  const chip = ui.$('#detail .car-load');
  ui.check(!!chip,
    'the LOAD chip is offered, so "differs" is measured against the instrument '
    + 'and not against the heading');

  // AND NOTHING WAS SENT. Turning is browsing; the instrument keeps playing
  // what it was playing. If the heading is right but the Seven moved, the
  // panel would be honest about the wrong thing.
  const live = ui.$('#detail .engine-sound');
  ui.check(!!live && !live.classList.contains('is-candidate'),
    'the heading is not muted as a candidate — it is naming a sound that is playing');
})()
