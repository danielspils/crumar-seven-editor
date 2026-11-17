// @env SEVEN_NO_DEVICE=1
//
// WHAT THE LEFT PANE SAYS, READ OFF THE SCREEN.
//
// Items 4, 6, 7 and 8 are four changes to words and one to a control's shape.
// Each is small enough to look right in a diff and be wrong in the window —
// a constant with no consumer, a sentence on the wrong bank, a button that
// kept its full-bleed box — so each is read back from the rendered DOM here.
//
// OFFLINE, deliberately. Three of the four are about what the app says when
// it has nothing to ask: the freshness caption describes the LIBRARY's record
// rather than the instrument, and Bank 1's foot is a fact about Crumar's
// decision, not about the cable.
(async () => {
  const px = (n) => Math.round(n * 10) / 10;
  const text = (el) => (el ? (el.textContent || '').trim() : null);

  // ---- 8. THE FRESHNESS LINE KEEPS THE AGE AND DROPS THE DATE -----------
  //
  // ON BANK 2, NOT WHICHEVER TAB THE APP OPENED ON. Bank 1 is the factory's
  // and CANNOT go stale, so its caption is deliberately empty — read there,
  // this measured "" and skipped its own assertions while reporting success.
  // A check that cannot fail because it is pointed at the one bank exempt
  // from the rule is the shape this project calls scenery.
  await ui.selectTab('seven');
  await ui.sleep(700);
  const bank2 = ui.$$('#bank-tabs .bank-tab')[1];
  if (bank2) { ui.click(bank2, 'bank 2'); await ui.sleep(600); }
  const fresh = text(ui.$('#bank-asof'));
  ui.note(`freshness line: "${fresh}"`);
  if (fresh && /as of last backup/.test(fresh)) {
    // A DATE IN ANY SHAPE, not just the one that was there. "16 Nov",
    // "2026-11-16" and "16/11" are all the thing that came off, and an
    // equality check against one wording would pin the others in.
    ui.check(!/\d{1,2}\s+\w{3}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}/.test(fresh),
      `no date in the freshness line ("${fresh}")`);
    ui.check(!/[()]/.test(fresh), 'and no parenthesised age either');
  } else {
    // AND IT SAYS SO AS A FAILURE, not a note. On a non-factory bank in a
    // library with backups there IS a record, so an absent caption means the
    // line is broken rather than inapplicable — "a scenario may skip only
    // for a precondition it cannot control".
    ui.check(/not yet backed up/.test(fresh || ''),
      `bank 2's caption is either an age or the never-backed-up state ("${fresh}")`);
  }

  // ---- 7. BANK 1'S FOOT SAYS WHAT BANK 1 IS -----------------------------
  //
  // ON BANK 1 ONLY. A description of the factory bank sitting under Bank 3's
  // rows would be false, and #foot-seven is one element shared by all four
  // tabs — so the half worth asserting is that it EMPTIES again.
  const tabs = ui.$$('#bank-tabs .bank-tab');
  ui.note(`bank tabs: ${tabs.length}`);
  const footByBank = [];
  for (let i = 0; i < tabs.length; i += 1) {
    const t = ui.$$('#bank-tabs .bank-tab')[i];
    if (!t) break;
    ui.click(t, `bank tab ${i + 1}`);
    await ui.sleep(550);
    footByBank.push(text(ui.$('#foot-seven')) || '');
  }
  for (let i = 0; i < footByBank.length; i += 1) {
    ui.note(`  bank ${i + 1} foot: "${footByBank[i]}"`);
  }
  if (footByBank.length) {
    ui.check(/reserved for Crumar models/.test(footByBank[0]),
      `Bank 1's foot describes the bank ("${footByBank[0]}")`);
    // IT IS THE DESCRIPTION, NOT THE REFUSAL. The two sentences live in the
    // same file and the whole point of there being two is that this one does
    // not tell a player what they cannot do.
    ui.check(!/cannot|overwrit/i.test(footByBank[0]),
      'and it does not carry the refusal wording');
    const others = footByBank.slice(1).filter((s) => s);
    ui.check(others.length === 0,
      others.length ? `a non-factory bank also shows a foot: ${others.join(' | ')}`
        : 'and banks 2-4 show nothing there');
  }

  // ---- 4. A SETLIST ROW COUNTS PATCHES, NOT EMPTIES ---------------------
  await ui.selectTab('setlists');
  await ui.sleep(800);
  const counts = ui.$$('.lib-setlist-count, .lib-setlist .patch-sound').map(text)
    .filter((s) => s);
  ui.note('');
  ui.note(`setlist row counts: ${counts.map((c) => `"${c}"`).join(' · ') || '(none)'}`);
  ui.check(counts.length > 0, 'there are setlist rows to read');
  for (const c of counts) {
    ui.check(!/empty/i.test(c), `no empties clause in "${c}"`);
    ui.check(/\d+ patch(es)?$/.test(c), `and it counts patches: "${c}"`);
  }

  // ---- 6. CREATE NEW SETLIST IS AN OUTLINED BUTTON ----------------------
  const btn = ui.$('.lib-new-setlist');
  const bar = ui.$('.lib-new-setlist-bar');
  ui.note('');
  if (!btn) {
    ui.check(false, 'the create-setlist button is on screen');
  } else {
    const cs = getComputedStyle(btn);
    const b = btn.getBoundingClientRect();
    const barBox = bar ? bar.getBoundingClientRect() : null;
    ui.note(`create button: "${text(btn)}"`);
    ui.note(`  border ${cs.borderTopWidth} ${cs.borderTopStyle} · radius ${cs.borderTopLeftRadius}`
      + ` · background ${cs.backgroundColor}`);
    ui.note(`  box ${px(b.width)}x${px(b.height)} at x${px(b.left)}`
      + (barBox ? ` · its strip ${px(barBox.width)} wide at x${px(barBox.left)}` : ''));
    ui.check(parseFloat(cs.borderTopWidth) >= 1, `1px border (${cs.borderTopWidth})`);
    ui.check(Math.round(parseFloat(cs.borderTopLeftRadius)) === 5,
      `5px radius (${cs.borderTopLeftRadius})`);
    // NOT FILLED. transparent or rgba(...,0) both count; what must not be
    // true is a solid colour behind the words.
    ui.check(/^(transparent|rgba\(0, 0, 0, 0\))$/.test(cs.backgroundColor),
      `not filled (${cs.backgroundColor})`);
    // AND NOT A ROW. A bordered box the full width of the pane reads as a
    // panel, which is what it was before and what the border alone would
    // not have changed.
    if (barBox) {
      ui.check(b.width < barBox.width - 20,
        `it is a button, not a full-bleed row (${px(b.width)} inside ${px(barBox.width)})`);
    }
    // ITS BORDER SITS ON THE GUTTER, like every other row's ink. The eye
    // reads a bordered control's border as its left edge, so the strip's
    // padding has to move the box.
    const gutter = parseFloat(getComputedStyle(document.documentElement)
      .getPropertyValue('--list-gutter'));
    if (barBox) {
      ui.note(`  its border is ${px(b.left - barBox.left)}px in; --list-gutter is ${gutter}`);
      ui.check(Math.abs((b.left - barBox.left) - gutter) < 1.5,
        'the button\'s border lands on the list gutter');
    }
  }
})()
