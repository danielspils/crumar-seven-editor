// @env SEVEN_NO_DEVICE=1
//
// G: FOUR LEFT EDGES — MEASURE AND REPORT, CHANGE NOTHING.
//
// Reported as "back to being cramped" against the left edge at a narrow
// width, and separately as a Banks-tray alignment problem.
//
// The three library edges were aligned deliberately on 6px on 15 Nov so the
// back button's BORDER, the detail title and the rows' numbers share one
// left edge. The BANK TABS were never part of that alignment, which makes
// them the likely culprit.
//
// THE BORDER, NOT THE TEXT, for the back button: it was aligned on its box.
// getBoundingClientRect gives the border box, which is the right thing to
// compare — but a button with padding has text that starts further in, and
// comparing the wrong one would report a difference nobody can see.
//
// ASSERTS NOTHING ABOUT WHETHER 6px IS RIGHT. Whether that gutter is enough
// is Daniel's call. This says only whether the four agree with each other.
(async () => {
  const px = (n) => Math.round(n * 10) / 10;
  const left = (el) => (el ? Math.round(el.getBoundingClientRect().left * 10) / 10 : null);

  const report = async (label) => {
    ui.note(`--- ${label} · viewport ${document.documentElement.clientWidth}px ---`);

    // 1. THE BANK TABS, under the Seven tab.
    await ui.selectTab('seven');
    await ui.sleep(600);
    const tabs = ui.$$('#bank-tabs .bank-tab');
    const tabsRow = ui.$('#bank-tabs');
    const firstTab = tabs[0] || null;
    // 2. The numbered slot rows beneath them.
    const slotRow = ui.$('#patch-list .patch-row');
    const slotNum = slotRow && slotRow.querySelector('.patch-num');

    // THE INK, NOT THE BOX. Every container here spans the pane and so sits
    // at 0; what a reader sees as "the left edge" is the first painted thing
    // inside it. Comparing boxes reports four zeros and no difference at all,
    // which is the measurement equivalent of not looking.
    const tabLabel = firstTab
      && (firstTab.querySelector('.bank-tab-label') || firstTab);
    // WHAT THE TAB'S INK EDGE ACTUALLY IS. If it is a chosen gutter it can be
    // aligned to; if it falls out of centring, it is an artifact that moves
    // with the pane and with the label, and nothing can be aligned to it.
    if (firstTab) {
      const cs = getComputedStyle(firstTab);
      const tb = firstTab.getBoundingClientRect();
      const lb = tabLabel ? tabLabel.getBoundingClientRect() : null;
      ui.note(`first tab: padding-left "${cs.paddingLeft}" · text-align "${cs.textAlign}"`
        + ` · flex "${cs.flexGrow}" · box w${px(tb.width)}`
        + (lb ? ` · label w${px(lb.width)} · inset ${px(lb.left - tb.left)}` : ''));
      if (lb) {
        const centred = (tb.width - lb.width) / 2;
        ui.note(`  centring would put the label ${px(centred)}px in`
          + ` — ${Math.abs(centred - (lb.left - tb.left)) < 0.6 ? 'MATCHES, so it is an artifact of centring'
            : 'does not match, so something else sets it'}`);
      }
    }
    // EVERY TAB, because "the bank tabs' left edge" is only a thing if the
    // four agree. Bank 1 carries a lock and the others do not, so its
    // CONTENT is wider and centring puts its label somewhere else entirely.
    for (const [n, t] of tabs.entries()) {
      const tb = t.getBoundingClientRect();
      const lab = t.querySelector('.bank-tab-label') || t;
      const lb = lab.getBoundingClientRect();
      ui.note(`  tab ${n + 1}: box x${px(tb.left)} w${px(tb.width)}`
        + ` · label x${px(lb.left)} · inset ${px(lb.left - tb.left)}`
        + (t.querySelector('.bank-tab-lock') ? ' · has a lock' : ''));
    }
    ui.note(`bank tabs row   box ${px(left(tabsRow))}`);
    ui.note(`  first tab     box ${px(left(firstTab))}`
      + `  INK ${px(left(tabLabel))}`
      + `  "${firstTab ? firstTab.textContent.trim().slice(0, 12) : ''}"`);
    ui.note(`seven row       box ${px(left(slotRow))}`
      + `  INK ${px(left(slotNum))}  (its number)`);

    // CAPTURED NOW, NOT AT THE RETURN. Everything below switches tabs, which
    // destroys these nodes — and a DETACHED node answers
    // getBoundingClientRect with zeros rather than throwing, so the summary
    // table reported 0 for the bank tabs and the Seven rows while the notes
    // above it said 18.6 and 14. A measurement that silently becomes zero is
    // worse than one that fails.
    const tabInk = left(tabLabel);
    const sevenNum = left(slotNum);

    // 3. The setlist head, and 4. the detail bar with the back button.
    await ui.selectTab('setlists');
    await ui.sleep(600);
    const head = ui.$('.lib-setlist-head');
    ui.note(`lib-setlist-head left ${px(left(head))}`);

    // Open one so the detail bar and its back button exist.
    const row = ui.$$('.lib-setlist-row')[0];
    if (row) { ui.click(row, 'a setlist'); await ui.sleep(700); }
    const bar = ui.$('.lib-bar-detail');
    const back = ui.$('.lib-back');
    const slot = ui.$('.lib-slot');
    const slotN = slot && slot.querySelector('.slot-num');
    ui.note(`lib-bar-detail   left ${px(left(bar))}`);
    ui.note(`  back BORDER    left ${px(left(back))}`
      + `  "${back ? back.textContent.trim() : ''}"`);
    ui.note(`  setlist slot   left ${px(left(slot))}`);
    ui.note(`  its number     left ${px(left(slotN))}`);

    return {
      tabInk,
      sevenNum,
      // THE HEAD'S OWN BOX, not its first child. `querySelector('*')` found
      // whatever happened to be first in the DOM — a control on the RIGHT,
      // reading 133.7px — which is not a left edge at all.
      head: left(head),
      back: left(back),
      slotNum: left(slotN),
    };
  };

  const wide = await report('AT THE DEFAULT WIDTH');

  // A NARROW WIDTH, by squeezing the list pane — the window cannot be
  // resized from here, and the gutter is padding rather than a media query,
  // so a squeeze is faithful to what a narrower window does to these edges.
  const pane = ui.$('#library') || ui.$('#main');
  const original = pane ? pane.style.width : '';
  if (pane) { pane.style.width = '360px'; await ui.sleep(300); }
  const narrow = await report('WITH THE PANE SQUEEZED TO 360px');
  if (pane) { pane.style.width = original; await ui.sleep(200); }

  // ---- THE COMPARISON ---------------------------------------------------
  const show = (label, m) => {
    const edges = [
      ['bank tab ink', m.tabInk],
      ['Seven row number', m.sevenNum],
      ['setlist head ink', m.head],
      ['back button border', m.back],
      ['setlist slot number', m.slotNum],
    ].filter(([, v]) => v != null);
    const base = edges.length ? edges[0][1] : 0;
    ui.note(`${label}:`);
    for (const [name, v] of edges) {
      const d = Math.round((v - base) * 10) / 10;
      ui.note(`  ${name.padEnd(20)} ${String(px(v)).padStart(7)}`
        + `  ${d === 0 ? '—' : (d > 0 ? `+${d}` : `${d}`)}`);
    }
    const vals = edges.map(([, v]) => v);
    const spread = Math.max(...vals) - Math.min(...vals);
    ui.note(`  spread across the four regions: ${px(spread)}px`);
    return spread;
  };

  const wideSpread = show('AT THE DEFAULT WIDTH', wide);
  const narrowSpread = show('SQUEEZED', narrow);

  // The ONLY check: that the measurement happened. The numbers are the
  // deliverable and the verdict is Daniel's.
  ui.check(wide.tabInk != null && wide.sevenNum != null,
    'the bank tabs and the Seven rows were both measured');
  ui.note(`spread: ${px(wideSpread)}px at the default width,`
    + ` ${px(narrowSpread)}px squeezed`);
})()
