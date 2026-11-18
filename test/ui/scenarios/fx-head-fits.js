// DOES THE SECTION SUMMARY FIT BESIDE ITS TITLE?
//
// WHY (Daniel, 18 Nov 2026). The chain's first row was "MASTER VOLUME / EQ"
// and the summary beside it truncated to "V...". The title was shortened to
// "VOLUME / EQ", and the question Daniel asked is the one worth a scenario:
// does seven characters back actually give the summary room, or does it only
// move the truncation point?
//
// WHY MEASURING IS THE ONLY WAY TO ANSWER IT. `.fx-head` is a flex row —
// chevron (24px, fixed), title (auto), summary (`flex: 1`, zero basis,
// nowrap, ellipsis), pill. The summary gets only the free space the title
// leaves, so "seven characters shorter" buys an amount of pixels that depends
// on the font, the .12em tracking on the title, and the pane's width. Counting
// characters cannot answer it.
//
// HOW CLIPPING IS DETECTED: scrollWidth > clientWidth on the summary. That is
// the element's own report that its text does not fit the box it was given,
// which is what the ellipsis is drawn from. It is read while the summary is
// `visibility: hidden` too — visibility does not affect layout, and the slot
// is deliberately kept in both states so the pill stays anchored right.
(async () => {
  const widthOf = (el) => (el ? Math.round(el.getBoundingClientRect().width * 10) / 10 : null);

  await ui.openLibrary();
  await ui.sleep(400);
  const row = ui.$('#library .lib-row.lib-patch, #library [data-file]');
  if (!row) return { skipped: 'this library holds no patch, so no chain renders' };
  ui.click(row, 'a patch');
  await ui.sleep(1200);

  const heads = ui.$$('#detail .fx-head');
  if (!ui.check(heads.length > 0, `the effects chain is on screen (${heads.length} sections)`)) {
    return;
  }

  const pane = ui.$('#detail');
  const report = (label) => {
    ui.note('');
    ui.note(`################  ${label}  ################`);
    ui.note(`    the pane is ${widthOf(pane)}px wide`);
    ui.note('    TITLE                 t.w   sum box  sum text  pill   clipped');
    const clipped = [];
    for (const h of ui.$$('#detail .fx-head')) {
      const title = h.querySelector('.fx-title');
      const sum = h.querySelector('.fx-summary');
      const pill = h.querySelector('.fx-state');
      if (!title || !sum) continue;
      // scrollWidth/clientWidth are integers; a 1px slack keeps sub-pixel
      // rounding from reading as a clip on text that actually fits.
      const over = sum.scrollWidth - sum.clientWidth;
      const isClipped = over > 1;
      if (isClipped) clipped.push(`${title.textContent.trim()} ("${sum.textContent.trim()}")`);
      ui.note(`    ${title.textContent.trim().padEnd(20).slice(0, 20)}  `
        + `${String(widthOf(title)).padStart(5)}  `
        + `${String(sum.clientWidth).padStart(7)}  `
        + `${String(sum.scrollWidth).padStart(8)}  `
        + `${String(widthOf(pill)).padStart(5)}  `
        + `${isClipped ? `YES by ${over}px` : 'no'}`);
      if (isClipped) {
        ui.note(`      "${sum.textContent.trim()}" needs ${sum.scrollWidth}px and has ${sum.clientWidth}px`);
      }
    }
    return clipped;
  };

  // DID THE SEVEN CHARACTERS BUY ANYTHING? Measured against the old string
  // rather than argued from character counts.
  //
  // The title is put back to "Master Volume / EQ" for one frame and the
  // summary re-measured. Without this the scenario could only say the summary
  // fits TODAY — which would leave Daniel's actual question ("or does it only
  // move the truncation point?") unanswered, and would keep passing if someone
  // lengthened the title again by less than the slack.
  const compareTitles = async (atWidth) => {
    const h = ui.$$('#detail .fx-head').find((x) => x.dataset.group === 'efx_veq');
    if (!h) return 'no Volume / EQ row to compare';
    const t = h.querySelector('.fx-title');
    const s = h.querySelector('.fx-summary');
    const now = { box: s.clientWidth, text: s.scrollWidth };
    const kept = t.textContent;
    t.textContent = 'Master Volume / EQ';
    await ui.sleep(160);
    const before = { box: s.clientWidth, text: s.scrollWidth };
    t.textContent = kept;
    await ui.sleep(160);
    const verdict = (m) => (m.text - m.box > 1 ? `CLIPPED by ${m.text - m.box}px` : 'fits');
    return `at ${atWidth}px — "MASTER VOLUME / EQ": summary box ${before.box}px, `
      + `${verdict(before)}  ·  "VOLUME / EQ": box ${now.box}px, ${verdict(now)}`
      + `  ·  the shorter title bought ${now.box - before.box}px`;
  };

  // 1. THE PANE AS IT SHIPS. This is the width the complaint was made at and
  //    the only one that settles Daniel's question.
  const atRest = report('THE PANE AS IT OPENS');
  ui.note(await compareTitles(widthOf(pane)));

  // THE ROW THE CHANGE WAS FOR, named rather than left to the table. If this
  // still clips, the title was not the binding constraint and the fix belongs
  // to the summary — which is Daniel's call, not this scenario's.
  const veq = ui.$$('#detail .fx-head').find((h) => h.dataset.group === 'efx_veq');
  if (ui.check(!!veq, 'the Volume / EQ row is on screen')) {
    const t = veq.querySelector('.fx-title');
    const s = veq.querySelector('.fx-summary');
    ui.check(t.textContent.trim() === 'Volume / EQ',
      `its title is the shortened one ("${t.textContent.trim()}")`);
    // THE TEXT'S OWN WIDTH, FROM A RANGE OVER ITS CONTENTS. scrollWidth is
    // useless for measuring slack here: the summary is `flex: 1`, so when the
    // text fits the box has already grown past it and scrollWidth === clientWidth
    // by definition. "needs 83px in 83px" looked like an exact squeeze and was
    // really "fits, by an unknown margin". A Range measures the glyphs.
    const r = document.createRange();
    r.selectNodeContents(s);
    const ink = Math.round(r.getBoundingClientRect().width * 10) / 10;
    const slack = Math.round((s.clientWidth - ink) * 10) / 10;
    ui.note(`VOLUME / EQ: title ${widthOf(t)}px · summary "${s.textContent.trim()}" `
      + `inks at ${ink}px in a ${s.clientWidth}px box — ${slack}px of slack`);
    ui.check(slack > 0,
      `and its summary "${s.textContent.trim()}" has room to spare `
      + `(${ink}px of text in ${s.clientWidth}px)`);
  }

  // 2. AND THE WHOLE CHAIN, because shortening one title says nothing about
  //    the others, and REVERB carries the longest summary in the set
  //    ("Level n · Decay n") behind a title of its own.
  ui.check(atRest.length === 0,
    `no section summary is clipped at the pane's own width`
    + (atRest.length ? ` — clipped: ${atRest.join(', ')}` : ''));

  // 3. SQUEEZED, so the scenario says WHERE it gives out rather than only
  //    whether it survives today's width. Reported, not asserted: the pane has
  //    a minimum and narrower than that is not a state the app ships.
  //
  // max-width, NOT width. #detail is `flex: 1`, so its main size comes from
  // `flex-basis: 0%` and an inline `width` is ignored entirely — the first
  // version of this block set width, printed "the pane is 747px wide" under a
  // heading that said 460, and reported "nothing clipped" three times about
  // the state it had already measured. A squeeze that does not squeeze is a
  // measurement of nothing wearing the heading of a measurement.
  //
  // SO THE SQUEEZE PROVES ITSELF. Each width is checked to have actually
  // taken before anything is concluded from it.
  for (const w of [520, 460, 400]) {
    // ui.squeeze, not an inline version of it: two other scenarios had a
    // squeeze block that never squeezed, so the check that the box moved
    // belongs in one place rather than copied into each caller.
    const restore = await ui.squeeze(pane, w, { what: 'the detail pane' });
    if (Math.abs(widthOf(pane) - w) > 2) {
      ui.note(`    the squeeze did not take — nothing below this is about ${w}px`);
      await restore();
      continue;
    }
    const bad = report(`SQUEEZED TO ${w}px`);
    ui.note(`    at ${w}px: ${bad.length ? `${bad.length} CLIPPED — ${bad.join(', ')}` : 'nothing clipped'}`);
    ui.note(`    ${await compareTitles(w)}`);
  }
  pane.style.maxWidth = '';
})()
