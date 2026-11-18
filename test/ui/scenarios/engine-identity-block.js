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

  // ---- SIDEWAYS: THE NUDGE AND THE FULL-WIDTH TEXT ----------------------
  //
  // Daniel, 18 Nov 2026: the identity text spans the full panel width and
  // the picture then nudges 30px toward the centre. Both are horizontal, and
  // the vertical numbers above are what proves they stayed horizontal.
  const stageEl = ui.$('#detail .engine-stage');
  const colEl = ui.$('#detail .engine-head-text');
  if (stageEl && colEl && name && sub) {
    const st = box(stageEl);
    const col = box(colEl);
    const nm = box(name);
    const sb = box(sub);
    ui.note('');
    ui.note(`the text column   x ${px(col.left)}..${px(col.right)} (${px(col.width)})`);
    ui.note(`  name box        x ${px(nm.left)}..${px(nm.right)} (${px(nm.width)})`);
    ui.note(`  sub-line box    x ${px(sb.left)}..${px(sb.right)} (${px(sb.width)})`);
    ui.note(`the stage         x ${px(st.left)}..${px(st.right)} (${px(st.width)})`
      + ` · margin-right ${getComputedStyle(stageEl).marginRight}`);
    ui.note(`  its right edge is ${px(col.right - st.right)}px short of the column's`);
    // THE NUDGE AS A QUANTITY, not as one property's value.
    //
    // THIS PINNED `margin-right === 30px` AND BROKE on a change that did not
    // move the picture at all: the chevrons moved out of the card and into
    // 26px of new padding on the stage, so the inset is now 4px of margin
    // plus 26px of padding. Same 30px, same picture position — measured at
    // x616..744 before and after — and an assertion on the MECHANISM called
    // it a regression.
    //
    // So it asks what the brief actually asked for: 30px of space between
    // the picture's cell and the column's edge, however it is carried.
    const ss = getComputedStyle(stageEl);
    const inset = Math.round((parseFloat(ss.marginRight) + parseFloat(ss.paddingRight)) * 10) / 10;
    ui.note(`  the inset is ${ss.marginRight} margin + ${ss.paddingRight} padding = ${inset}px`);
    ui.check(inset === 30,
      `the picture is nudged 30px toward the centre (${inset}px)`);
    // FULL WIDTH means both text lines span the whole column, not just the
    // 1fr track beside the picture. The name already did; the sub-line is
    // what changed.
    ui.check(Math.abs(sb.width - col.width) < 1.5,
      `the sub-line spans the full panel width (${px(sb.width)} of ${px(col.width)})`);
    ui.check(Math.abs(nm.width - col.width) < 1.5,
      `and so does the name line (${px(nm.width)} of ${px(col.width)})`);
    // AND NEITHER WRAPS. One line each is the whole requirement — a wrap
    // here is what adds the height this change is not allowed to add.
    ui.check(px(nm.height) < 30, `the name is one line (${px(nm.height)}px)`);
    ui.check(px(sb.height) < 26, `the sub-line is one line (${px(sb.height)}px)`);
    const ns = getComputedStyle(name);
    ui.check(ns.whiteSpace === 'nowrap',
      `the name is nowrap, so a longer one truncates (${ns.whiteSpace})`);
    ui.check(ns.textOverflow === 'ellipsis',
      `and truncates visibly (${ns.textOverflow})`);
    // THE TEXT MUST NOT REACH THE PICTURE. They share grid row 2 now, so
    // this is the thing that would break: a sub-line long enough to run
    // under the drawing.
    const subInk = (() => {
      const r = document.createRange();
      r.selectNodeContents(sub);
      const b = r.getBoundingClientRect();
      return b.width ? px(b.right) : px(sb.left);
    })();
    ui.note(`  the sub-line's INK ends at ${subInk}; the picture starts at ${px(st.left)}`);
    ui.check(subInk <= st.left + 0.5,
      `the sub-line's text stops clear of the picture`
      + ` (${subInk} against ${px(st.left)})`);
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
