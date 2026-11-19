// ROW 1 SITS AT THE SAME y ON ALL FOUR TABS.
//
// WHY IT EXISTS (18 Nov 2026). It was one of four numbers named as "must not
// change" when the picture box went 128 -> 160, and it was the ONE of the four
// nobody had as a before/after pair. The other three were measured; this was
// argued — the lists live in #library, the picture in #detail, so it cannot
// have moved — and an argument is not a measurement. CLAUDE.md has a heading
// for that: a figure carried forward without a date is the shape this project
// has been wrong about twice.
//
// IT IS ALSO WORTH HAVING ON ITS OWN. Four tabs showing four different lists
// at the same first-row position is a layout promise nothing else pins: the
// slot rows come from one renderer and the library's rows from another, so
// the two can drift apart without any single file looking wrong.
//
// NO INSTRUMENT. Tab switching and row geometry need no Seven.
(async () => {
  const px = (n) => Math.round(n * 10) / 10;
  const TABS = ['seven', 'patches', 'setlists', 'backups'];

  // THE TRAY HAS TO BE OPEN or three of the four tabs have their list inside a
  // collapsed container, where the rows EXIST but have no layout box. The
  // first run of this reported `row 1 at y0` for patches, setlists and backups
  // — zeros, which is what a box-less element answers rather than failing, and
  // which would have read as "the rows moved 264px" instead of "I measured
  // something that was not on screen".
  await ui.openLibrary();
  await ui.sleep(500);

  // VISIBLE rows only, for the same reason.
  const firstRow = () => {
    const all = ui.$$('#library .lib-row, #library .patch-row, #bank-region .patch-row');
    return all.find((el) => el.getBoundingClientRect().height > 0) || null;
  };

  const seen = [];
  for (const tab of TABS) {
    const btn = ui.$(`#top-tabs .top-tab[data-view="${tab}"]`);
    if (!btn) { ui.note(`${tab}: no tab button found`); continue; }
    ui.click(btn, `the ${tab} tab`);
    await ui.sleep(700);
    const row = firstRow();
    if (!row) { ui.note(`${tab}: no first row on screen`); continue; }
    const r = row.getBoundingClientRect();
    seen.push({ tab, y: r.top, h: r.height });
    ui.note(`${tab.padEnd(9)} row 1 at y${px(r.top)} · ${px(r.height)}px tall`);
  }

  if (!ui.check(seen.length >= 2,
    `at least two tabs showed a first row (${seen.length})`)) return;

  // THE CLAIM: one y, whichever list is showing. Half a pixel of slack for
  // sub-pixel layout, which is the same tolerance the other row scenarios use.
  const ys = seen.map((s) => s.y);
  const spread = Math.max(...ys) - Math.min(...ys);
  ui.note(`spread across ${seen.length} tabs: ${px(spread)}px`);
  ui.check(spread <= 0.5,
    `row 1 is at the same y on every tab (${px(spread)}px apart:`
    + ` ${seen.map((s) => `${s.tab} ${px(s.y)}`).join(', ')})`);
})()
