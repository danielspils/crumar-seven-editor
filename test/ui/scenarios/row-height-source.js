// @env SEVEN_NO_DEVICE=1
//
// WHERE A ROW'S HEIGHT COMES FROM, broken into its parts.
//
// .lib-slot measures 38.5px against .lib-row's 37.8, and the question put is
// whether the 0.7 is STRUCTURAL — the slot's second line — or unrelated
// padding that should be folded in. Those have different answers and a
// measurement can tell them apart, so nothing here is reasoned from the
// stylesheet.
//
// A row's height is exactly: padding-top + content + padding-bottom + border.
// Printing all four for each row type says which term differs, which is the
// whole question. Reasoning from the CSS cannot: .lib-row and .lib-slot
// carried IDENTICAL padding (7px 6px 7px var(--list-gutter)) while measuring
// 4.7px apart, so the padding was never the difference.
//
// It reports rather than asserts, except that it found both row types.
(async () => {
  const px = (n) => Math.round(n * 100) / 100;
  const box = (el) => el.getBoundingClientRect();

  const parts = (el, label) => {
    const cs = getComputedStyle(el);
    const b = box(el);
    const pt = parseFloat(cs.paddingTop);
    const pb = parseFloat(cs.paddingBottom);
    const bt = parseFloat(cs.borderTopWidth);
    const bb = parseFloat(cs.borderBottomWidth);
    const content = px(b.height - pt - pb - bt - bb);
    ui.note('');
    ui.note(`=== ${label} · ${String(el.className).split(/\s+/).slice(0, 2).join(' ')} ===`);
    ui.note(`  height ${px(b.height)} = pad ${pt}+${pb} · border ${bt}+${bb}`
      + ` · CONTENT ${content}`);
    ui.note(`  align-items ${cs.alignItems} · row-gap ${cs.rowGap}`
      + ` · grid-template-rows "${cs.gridTemplateRows}"`);
    // EVERY CHILD'S OWN BOX AND TYPE. A grid row is as tall as its tallest
    // cell, so the term that decides `content` is one of these.
    const kids = [...el.children].map((k) => {
      const kb = box(k);
      const kc = getComputedStyle(k);
      return {
        cls: String(k.className).split(/\s+/)[0] || k.tagName.toLowerCase(),
        h: px(kb.height),
        top: px(kb.top - b.top),
        fs: kc.fontSize,
        lh: kc.lineHeight,
        text: (k.textContent || '').trim().slice(0, 18),
      };
    });
    for (const k of kids) {
      ui.note(`    ${k.cls.padEnd(16)} h ${String(k.h).padStart(6)}`
        + ` top+${String(k.top).padStart(5)} · ${k.fs}/${k.lh}`
        + (k.text ? `  "${k.text}"` : ''));
    }
    // HOW MANY GRID ROWS ARE ACTUALLY LAID OUT. This is the structural
    // question: a second line makes the row taller whatever the padding is,
    // and grid-template-rows names every row the browser created.
    const trackCount = (cs.gridTemplateRows || '').trim().split(/\s+/)
      .filter((t) => t && t !== 'none').length;
    ui.note(`  grid rows laid out: ${trackCount}`);
    return { h: px(b.height), pt, pb, bt, bb, content, kids, trackCount,
      align: cs.alignItems, rowGap: cs.rowGap };
  };

  // ---- A LIBRARY ROW, from the Patches tab ------------------------------
  await ui.selectTab('patches');
  await ui.sleep(700);
  const libRow = ui.$('#library .lib-row.lib-patch');
  const a = libRow ? parts(libRow, 'A LIBRARY ROW (Patches)') : null;

  // ---- A SLOT ROW, both kinds ------------------------------------------
  //
  // THE EMPTY ONE AND THE FILLED ONE, because they are the two cases the
  // question is about: an empty slot has one line, a filled one has the meta
  // line under the name. If the 0.7px is the meta line, the EMPTY slot will
  // not show it.
  await ui.selectTab('setlists');
  await ui.sleep(700);
  let empty = null;
  let filled = null;
  const lists = ui.$$('.lib-setlist-row').length;
  for (let i = 0; i < lists; i += 1) {
    const here = ui.$$('.lib-setlist-row')[i];
    if (!here) break;
    ui.click(here, `setlist ${i + 1}`);
    await ui.sleep(700);
    const e = ui.$('#library .lib-slot-empty');
    const f = ui.$('#library .lib-slot-patch');
    if (e && !empty) empty = parts(e, 'AN EMPTY SLOT');
    if (f && !filled) filled = parts(f, 'A FILLED SLOT');
    if (empty && filled) break;
    const back = ui.$('.lib-back');
    if (back) { ui.click(back, 'back'); await ui.sleep(500); }
  }

  // ---- AND THE SEVEN TAB'S OWN ROW, which is the target figure ---------
  await ui.selectTab('seven');
  await ui.sleep(700);
  const seven = ui.$('#patch-list .patch-row');
  const s = seven ? parts(seven, 'THE SEVEN TAB (the target)') : null;

  // ---- THE ANSWER ------------------------------------------------------
  ui.note('');
  ui.note('---- WHERE THE DIFFERENCE IS ----');
  const rows = [['Seven .patch-row', s], ['.lib-row', a],
    ['.lib-slot empty', empty], ['.lib-slot filled', filled]].filter(([, v]) => v);
  ui.note('WHAT                  height    pad   border  content  gridRows  align');
  for (const [k, v] of rows) {
    ui.note(`  ${k.padEnd(20)}${String(v.h).padStart(6)}`
      + `${String(v.pt + v.pb).padStart(7)}${String(v.bt + v.bb).padStart(8)}`
      + `${String(v.content).padStart(9)}${String(v.trackCount).padStart(10)}`
      + `  ${v.align}`);
  }
  if (a && empty) {
    ui.note('');
    ui.note(`.lib-slot(empty) - .lib-row: height ${px(empty.h - a.h)}`
      + ` · padding ${px((empty.pt + empty.pb) - (a.pt + a.pb))}`
      + ` · CONTENT ${px(empty.content - a.content)}`);
    ui.note(empty.content !== a.content
      ? 'SO THE DIFFERENCE IS IN THE CONTENT BOX, not the padding.'
      : 'SO THE DIFFERENCE IS PADDING, and folding it in is a one-line change.');
  }
  if (empty && filled) {
    ui.note(`.lib-slot filled - empty: height ${px(filled.h - empty.h)}`
      + ` · grid rows ${filled.trackCount} vs ${empty.trackCount}`);
  }
  ui.check(rows.length >= 2, 'at least two row types were taken apart');
})()
