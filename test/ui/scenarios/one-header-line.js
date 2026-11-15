// ONE HEADER LINE ACROSS ALL THREE COLUMNS.
//
// Row 1 used to hold the logo and the word tabs alone and sat empty across
// the right two-thirds. SOUND ENGINE and EFFECTS CHAIN share it now, aligned
// on the word tabs' TEXT BASELINE rather than their box — a 12/700 upper
// label and a 13.33/400 word tab have different ascents, so equal boxes, and
// even equal line-heights, leave the text at two different heights.
//
// The alignment is one number in index.html (#detail's padding-top). A number
// in a comment rots quietly, which is why it is asserted here in a real
// window instead: change the type on either side and this fails rather than
// drifting.
//
// It also pins what must NOT happen below that line. The three columns run
// independently: the patch name is much larger type than a bank tab, and
// coupling their heights lets the name set the row and drag the bank tabs off
// the top of the list they label.
(async () => {
  const px = (n) => Math.round(n * 10) / 10;
  const ctx = document.createElement('canvas').getContext('2d');

  // FONT metrics, not glyph metrics. A line's baseline does not move because
  // the words in it happen to have no descenders — measuring 'Hxg' through
  // the resolved font gives the line box's own ascent and descent.
  const baselineOf = (el) => {
    const s = getComputedStyle(el);
    ctx.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    const m = ctx.measureText('Hxg');
    const A = m.fontBoundingBoxAscent;
    const D = m.fontBoundingBoxDescent;
    const r = el.getBoundingClientRect();
    const L = parseFloat(s.lineHeight) || r.height;
    // The content area is centred in the line box; the baseline sits A below
    // the top of it.
    return r.top + (r.height - L) / 2 + (L - (A + D)) / 2 + A;
  };

  await ui.selectTab('seven');
  await ui.sleep(500);
  const rows = ui.$$('#patch-list .patch-row');
  if (!rows.length) { ui.note('no bank rows on screen'); return { skipped: 'no bank rows' }; }
  rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await ui.sleep(1600);

  const root = document.documentElement;
  const was = root.getAttribute('data-theme');

  for (const theme of ['dark', 'light']) {
    root.setAttribute('data-theme', theme);
    await ui.sleep(120);

    const tab = ui.$$('#library .top-tab:not(.top-logo)')
      .find((e) => e.getBoundingClientRect().width > 0);
    const titles = ui.$$('#detail .col-title')
      .filter((e) => e.getBoundingClientRect().width > 0);
    if (!tab || titles.length < 2) {
      ui.check(false, `${theme}: the header line should hold the word tabs and both column titles`);
      continue;
    }
    const tb = baselineOf(tab);
    for (const t of titles) {
      const b = baselineOf(t);
      const d = b - tb;
      ui.note(`${theme}: "${t.textContent.trim()}" baseline y${px(b)} vs "${tab.textContent.trim()}" y${px(tb)} — delta ${px(d)}`);
      ui.check(Math.abs(d) <= 1,
        `${theme}: "${t.textContent.trim()}" sits on the word tabs' baseline (${px(d)}px off)`);
    }
    // ON THE SAME LINE, not merely at the same height in a different band.
    const tabBox = tab.getBoundingClientRect();
    for (const t of titles) {
      const r = t.getBoundingClientRect();
      ui.check(r.bottom > tabBox.top && r.top < tabBox.bottom,
        `${theme}: "${t.textContent.trim()}" shares the nav line's band`);
    }
  }
  if (was) root.setAttribute('data-theme', was); else root.removeAttribute('data-theme');

  // THEY ARE HEADERS, NOT TABS. Sharing a line with the word tabs is exactly
  // where the risk of reading as selectable comes from.
  for (const t of ui.$$('#detail .col-title')) {
    const s = getComputedStyle(t);
    const label = t.textContent.trim();
    ui.check(t.tagName.toLowerCase() !== 'button' && !t.hasAttribute('tabindex'),
      `"${label}" is not focusable`);
    ui.check(s.borderBottomWidth === '0px' || s.borderBottomStyle === 'none',
      `"${label}" carries no underline`);
    ui.check(s.cursor !== 'pointer', `"${label}" does not offer a pointer cursor`);
  }

  // THE COLUMNS ARE NOT COUPLED BELOW THE LINE. The bank tabs sit directly on
  // the list they label; nothing in the detail column may push them off it.
  const strip = ui.$('#bank-tabs').getBoundingClientRect();
  const first = ui.$('#patch-list .patch-row').getBoundingClientRect();
  ui.note(`bank strip bottom y${px(strip.bottom)} · first slot row y${px(first.top)} · gap ${px(first.top - strip.bottom)}px`);
  ui.check(Math.abs(first.top - strip.bottom) <= 1,
    `the bank tabs sit on their list (${px(first.top - strip.bottom)}px apart)`);

  // And the same with the longest name in the library loaded, which is the
  // case that would set a shared row's height if one existed.
  const longest = ui.$$('#patch-list .patch-row')
    .sort((a, b) => b.textContent.trim().length - a.textContent.trim().length)[0];
  if (longest) {
    longest.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await ui.sleep(1600);
    // RE-QUERY: the list re-renders on selection, so the rects taken above
    // belong to detached nodes.
    const strip2 = ui.$('#bank-tabs').getBoundingClientRect();
    const first2 = ui.$('#patch-list .patch-row').getBoundingClientRect();
    ui.note(`with the longest name loaded: gap ${px(first2.top - strip2.bottom)}px`);
    ui.check(Math.abs(first2.top - strip2.bottom) <= 1,
      'and still sit on it with the longest patch name loaded');
  }
})()
