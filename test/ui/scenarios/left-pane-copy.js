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

  // ---- 7. BANK 1'S NOTE SAYS WHAT BANK 1 IS -----------------------------
  //
  // ON BANK 1 ONLY. A description of the factory bank sitting under Bank 3's
  // rows would be false, and #bank1-note is one element shared by all four
  // tabs — so the half worth asserting is that it goes away again.
  //
  // AND IN THE SAME PLACE AS THE FRESHNESS CAVEAT, which is item 3 and is
  // the part a reword could silently undo: these two are footnotes about the
  // same eight rows, so they share the line, the type rule and the position.
  const tabs = ui.$$('#bank-tabs .bank-tab');
  ui.note('');
  ui.note(`bank tabs: ${tabs.length}`);
  const noteByBank = [];
  const geomByBank = [];
  for (let i = 0; i < tabs.length; i += 1) {
    const t = ui.$$('#bank-tabs .bank-tab')[i];
    if (!t) break;
    ui.click(t, `bank tab ${i + 1}`);
    await ui.sleep(550);
    const n = ui.$('#bank1-note');
    const a = ui.$('#bank-asof');
    const shown = (el) => el && !el.hidden && el.getBoundingClientRect().width > 0;
    noteByBank.push(shown(n) ? text(n) : '');
    // THE RIGHT EDGE OF WHICHEVER FOOTNOTE IS SPEAKING. Both are pushed to
    // the same end of #fresh-line, so if they land in the same place this
    // number is the same on every bank — and if one of them costs an extra
    // flex gap, it is not.
    const live = shown(n) ? n : (shown(a) ? a : null);
    geomByBank.push(live ? {
      right: px(live.getBoundingClientRect().right),
      top: px(live.getBoundingClientRect().top),
      which: live.id,
      font: getComputedStyle(live).fontSize + '/' + getComputedStyle(live).fontWeight,
      tracking: getComputedStyle(live).letterSpacing,
      transform: getComputedStyle(live).textTransform,
      colour: getComputedStyle(live).color,
    } : null);
  }
  for (let i = 0; i < noteByBank.length; i += 1) {
    const g = geomByBank[i];
    ui.note(`  bank ${i + 1}: note "${noteByBank[i]}"`);
    ui.note(`           line: ${g ? `${g.which} right ${g.right} top ${g.top}`
      + ` · ${g.font} · ${g.tracking} · ${g.transform} · ${g.colour}` : '(nothing showing)'}`);
  }
  if (noteByBank.length) {
    ui.check(/reserved for Crumar models/i.test(noteByBank[0]),
      `Bank 1's note describes the bank ("${noteByBank[0]}")`);
    // IT IS THE DESCRIPTION, NOT THE REFUSAL. The two sentences live in the
    // same file and the whole point of there being two is that this one does
    // not tell a player what they cannot do.
    ui.check(!/cannot|overwrit/i.test(noteByBank[0]),
      'and it does not carry the refusal wording');
    const others = noteByBank.slice(1).filter((s) => s);
    ui.check(others.length === 0,
      others.length ? `a non-factory bank also shows it: ${others.join(' | ')}`
        : 'and banks 2-4 show nothing there');

    // NO GLYPH, AND NO STOP (Daniel, 17 Nov 2026). The note carried the
    // Bank 1 tab's own lock for one revision; the TAB keeps the lock and
    // this line is the words, because two padlocks on screen — one in the
    // tab strip, one directly under the rows — is the same fact drawn twice.
    const bank1 = ui.$$('#bank-tabs .bank-tab')[0];
    if (bank1) { ui.click(bank1, 'bank 1'); await ui.sleep(550); }
    const note = ui.$('#bank1-note');
    ui.check(!ui.$('#bank1-note svg'), 'the note carries no glyph of its own');
    // AND THE TAB STILL HAS ONE, so removing it from the line did not remove
    // it from the app. Asserted here because it is the half that would make
    // the deletion wrong rather than right.
    ui.check(!!ui.$('#bank-tabs .bank-tab .bank-tab-lock'),
      'and the Bank 1 TAB still carries it');
    if (note) {
      const t = text(note);
      ui.note(`  note text: "${t}"`);
      // THE PERIOD IS GONE FROM THE STRING, not hidden by CSS. text-transform
      // cannot remove a character, so what is read back here is what the
      // literal says.
      ui.check(!/\.$/.test(t), `and no full stop at the end ("${t}")`);
      ui.check(!/[.]/.test(t), 'and none anywhere in it');
    }

    // SAME TYPE AS THE CAVEAT, read off both rather than off the stylesheet.
    const b1 = geomByBank[0];
    const b2 = geomByBank.slice(1).find((g) => g);
    if (b1 && b2) {
      ui.note('');
      ui.note(`  bank 1 note vs bank ${geomByBank.indexOf(b2) + 1} caveat:`);
      for (const k of ['font', 'tracking', 'transform', 'colour', 'right', 'top']) {
        ui.check(String(b1[k]) === String(b2[k]),
          `  ${k}: ${b1[k]} === ${b2[k]}`);
      }
      // THE GREEN IS GONE. --action-text is what .foot-slot used, and
      // DESIGN.md reserves it for things that DO something.
      const action = getComputedStyle(document.documentElement)
        .getPropertyValue('--action-text').trim();
      ui.note(`  --action-text is ${action}; the note is ${b1.colour}`);
      ui.check(b1.colour !== action, 'and the note is not the action colour');
      ui.check(b1.transform === 'uppercase', 'the caps come from CSS');
    }
  }

  // ---- 2. NO RULE ABOVE ROW 1 ON ANY TAB --------------------------------
  //
  // THE BAND ABOVE THE ROWS, asked of whatever element each tab puts there.
  // Measured as a computed border, not by looking: the line was .lib-bar's
  // border-bottom, and the Seven tab's #bank-tabs has never had one.
  ui.note('');
  for (const tab of ['seven', 'patches', 'setlists', 'backups']) {
    await ui.selectTab(tab);
    await ui.sleep(600);
    const band = ui.$('#library .lib-bar') || ui.$('#bank-tabs');
    if (!band) { ui.note(`  ${tab}: nothing above the rows`); continue; }
    const cs = getComputedStyle(band);
    const w = parseFloat(cs.borderBottomWidth);
    ui.note(`  ${tab.padEnd(9)} ${band.className || band.id}`
      + ` border-bottom ${cs.borderBottomWidth} ${cs.borderBottomStyle}`);
    ui.check(!w || cs.borderBottomStyle === 'none',
      `${tab}: no rule between the header and row 1 (${cs.borderBottomWidth})`);
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
