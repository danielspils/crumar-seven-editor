// @env SEVEN_NO_DEVICE=1
//
// THE SOUND ENGINE IDENTITY BLOCK IS THREE LINES ON ONE RHYTHM.
//
//     Tine Piano  (Model)
//     Rhodes piano
//     [ Save patch ]
//
// Daniel, 17 Nov 2026. It was four: "Bank 1 · Preset 3" sat between the
// sub-line and the button. The caption is gone, the rows were renumbered, and
// what this measures is that the three survivors sit on the block's own 4px
// rhythm rather than a new number having crept in.
//
// AND THAT THE LEFTOVER WENT WHERE IT WAS EXPECTED TO. The picture still sets
// the block's height — .engine-stage spans the rows beside the text and is
// the taller of the two — so removing a line does not pull the parameters up,
// it moves slack below Save patch. Daniel named that in the brief as expected
// rather than a bug, so it is REPORTED here with a number rather than
// asserted away.
//
// OFFLINE, because a library patch populates the detail pane just as a preset
// does: this is about the layout of the block, not about an instrument.
(async () => {
  const px = (n) => Math.round(n * 10) / 10;
  const box = (el) => (el ? el.getBoundingClientRect() : null);

  // A patch from the library — any row that fills the detail pane will do.
  await ui.selectTab('patches');
  await ui.sleep(800);
  const row = ui.$('#library .lib-row.lib-patch');
  if (!row) { ui.check(false, 'there is a patch to select'); return; }
  ui.click(row, 'the first patch');
  await ui.sleep(1400);

  const head = ui.$('#detail .engine-head-text');
  if (!head) { ui.check(false, 'the sound engine block is on screen'); return; }
  const cs = getComputedStyle(head);
  ui.note(`grid rows "${cs.gridTemplateRows}" · row-gap "${cs.rowGap}"`);

  // ---- THE CAPTION IS GONE ----------------------------------------------
  ui.check(!ui.$('#detail .engine-pos'),
    'the "Bank N · Preset M" line is not in the block');

  // ---- THE THREE LINES, AND THE GAPS BETWEEN THEM -----------------------
  const name = ui.$('#detail .engine-sound');
  const sub = ui.$('#detail .engine-sub');
  const slot = ui.$('#detail .save-slot');
  // THE BUTTON, NOT ITS SLOT. .save-slot is a grid cell stretched by the
  // picture beside it, so its box says nothing about where the ink is — the
  // same distinction save-slot-spacing.js records.
  const bar = ui.$('#detail .save-slot .audition-bar');
  const btn = ui.$('#save-live-btn') || ui.$('#detail .save-slot button');

  const parts = [['name', name], ['sub-line', sub], ['save slot', slot],
    ['save bar', bar], ['button', btn]];
  ui.note('');
  ui.note('WHAT           top    bottom  height  margin-top');
  for (const [label, el] of parts) {
    if (!el) { ui.note(`  ${label.padEnd(13)} (not on screen)`); continue; }
    const r = box(el);
    ui.note(`  ${label.padEnd(13)}${String(px(r.top)).padStart(6)}`
      + `${String(px(r.bottom)).padStart(8)}${String(px(r.height)).padStart(8)}`
      + `  ${getComputedStyle(el).marginTop}`);
  }

  if (!name || !sub) { ui.check(false, 'the name and sub-line are both there'); return; }

  // THE INK, NOT THE BOX, AND THIS IS THE WHOLE CARE OF THIS SCENARIO.
  //
  // The first version measured `box(sub).bottom` and reported the gap to the
  // button as 4px while the visible gap was about 73. .engine-sub is a grid
  // item in a row the PICTURE spans, so it stretches to the row's height:
  // its box ran to y328 while the words "Rhodes piano" ended at about y261.
  // Box edges said the block was tight; the screen said otherwise.
  //
  // A Range over an element's contents measures where the glyphs actually
  // are, which is what a reader sees as the line.
  const inkBottom = (el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    const b = r.getBoundingClientRect();
    return b.height ? px(b.bottom) : px(box(el).bottom);
  };
  const inkTop = (el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    const b = r.getBoundingClientRect();
    return b.height ? px(b.top) : px(box(el).top);
  };
  ui.note('');
  ui.note(`name ink      ${inkTop(name)} .. ${inkBottom(name)}`);
  ui.note(`sub-line ink  ${inkTop(sub)} .. ${inkBottom(sub)}`
    + `   (its BOX runs to ${px(box(sub).bottom)})`);
  if (btn) ui.note(`button box    ${px(box(btn).top)} .. ${px(box(btn).bottom)}`);

  const g1 = px(inkTop(sub) - inkBottom(name));
  ui.note('');
  ui.note(`gap name -> sub-line (ink): ${g1}px`);
  ui.check(Math.abs(g1 - 4) <= 2.5, `the name-to-sub gap is the block's 4px (${g1})`);

  if (btn) {
    const g2 = px(box(btn).top - inkBottom(sub));
    ui.note(`gap sub-line -> button (ink to border): ${g2}px`);
    // THE SAME 4px PLUS THE BAR'S OWN 4px MARGIN — so the button's border
    // lands within a line of the words above it, not most of a picture
    // below them. This is the assertion the change is for: with the caption
    // gone the button must become the THIRD line of the group.
    ui.check(g2 <= 12,
      `and the button follows the sub-line directly (${g2}px — it was ~73`
      + ' while the text rows stretched to the picture)');
  }

  // ---- WHERE THE SLACK WENT, reported ----------------------------------
  const stage = ui.$('#detail .engine-stage');
  if (stage && slot && bar) {
    const sb = box(stage);
    const spanned = px(box(slot).bottom - box(sub).top);
    ui.note('');
    ui.note(`the stage is ${px(sb.height)}px; the rows beside it span ${spanned}px`);
    ui.note(`slack inside the save cell: ${px(box(slot).height - box(bar).height)}px`
      + ` (${px(box(bar).top - box(slot).top)} above the bar,`
      + ` ${px(box(slot).bottom - box(bar).bottom)} below)`);
    ui.note(sb.height > spanned
      ? '  THE PICTURE IS THE TALLER SIDE and sets the block height — so the'
        + ' line that was removed reappears as air BELOW Save patch, which is'
        + ' what Daniel said to expect.'
      : '  the text rows are the taller side, so the picture is not adding air');
  }

  // ---- AND NOTHING ELSE MOVED ------------------------------------------
  //
  // The brief says not to touch the picture or the parameter list. Both are
  // measured so "did not touch" is a number rather than an intention.
  const art = ui.$('#detail .engine-stage .engine-art, #detail .engine-stage .engine-carousel');
  if (art) {
    const ab = box(art);
    ui.note('');
    ui.note(`the instrument picture: ${px(ab.width)}x${px(ab.height)}`);
    ui.check(Math.abs(ab.width - 128) < 1,
      `still the 128px the carousel was built around (${px(ab.width)})`);
  }
  const params = ui.$$('#detail .params .param');
  ui.note(`parameter rows: ${params.length}`);
  if (params.length) {
    ui.note(`first param row h${px(box(params[0]).height)}`
      + ` at y${px(box(params[0]).top)}`);
  }
  ui.check(params.length > 0, 'the parameter list is still rendered');
})()
