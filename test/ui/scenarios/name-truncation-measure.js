// @env SEVEN_NO_DEVICE=1
//
// WHICH PATCH NAMES TRUNCATE, MEASURED IN THE REAL WINDOW.
//
// tools/longest-names.js estimated at 7.9px a character, which was good
// enough to find the problem and is not good enough to confirm it is gone:
// proportional type makes that an average, and the name column was narrowed
// from 247px to 153px by item 11's reserved control column.
//
// THE RIGHT QUESTION IS scrollWidth AGAINST clientWidth. A span with
// `text-overflow: ellipsis` reports the width its content WANTS in
// scrollWidth and the width it HAS in clientWidth; the second being smaller
// is the definition of truncating. No font arithmetic, no guessing.
//
// It reports rather than asserts, except for the one check that it looked at
// anything at all.
(async () => {
  const px = (n) => Math.round(n * 10) / 10;

  await ui.selectTab('setlists');
  await ui.sleep(700);
  const lists = ui.$$('.lib-setlist-row');
  ui.note(`setlists: ${lists.length}`);

  // Walk them, measuring every slot row that carries a patch name. Opening a
  // setlist REPLACES the list, so the view is walked back between them.
  const rows = [];
  for (let i = 0; i < lists.length; i += 1) {
    const here = ui.$$('.lib-setlist-row');
    if (!here[i]) break;
    ui.click(here[i], `setlist ${i + 1}`);
    await ui.sleep(650);
    for (const el of ui.$$('.lib-slot .patch-name')) {
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      rows.push({
        shown: (el.textContent || '').trim(),
        title: el.getAttribute('title') || '',
        want: el.scrollWidth,
        have: el.clientWidth,
      });
    }
    const back = ui.$('.lib-back');
    if (back) { ui.click(back, 'back'); await ui.sleep(550); }
  }

  ui.note(`patch-name spans measured: ${rows.length}`);
  ui.check(rows.length > 0, 'there were names in view to measure');
  if (!rows.length) return;

  const cut = rows.filter((r) => r.want > r.have + 1);
  ui.note(`column width: ${px(rows[0].have)}px`);
  ui.note(`TRUNCATING: ${cut.length} of ${rows.length}`);
  ui.note('');
  for (const r of rows) {
    const mark = r.want > r.have + 1 ? 'CUT' : '   ';
    ui.note(`  ${mark} want ${String(r.want).padStart(4)} have ${String(r.have).padStart(4)}`
      + `  "${r.shown}"`);
  }

  // ---- THE BACKUPS TAB, which is where GENERATED names live --------------
  //
  // The setlist slots above are the player's own patches, so item 3's change
  // is not exercised by them at all. A backup run's rows are the ones whose
  // stored name is "Bank 3 Preset 8 — Venice Upright U1 Felt".
  await ui.selectTab('backups');
  await ui.sleep(800);
  const runs = ui.$$('.lib-setlist[data-backup]');
  ui.note('');
  ui.note(`backup runs: ${runs.length}`);
  if (runs.length) {
    ui.click(runs[0], 'the newest backup run');
    await ui.sleep(900);
    const brows = ui.$$('.patch-name, .lib-row .patch-name');
    ui.note(`rows inside it: ${brows.length}`);
    for (const el of brows.slice(0, 10)) {
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      const shown = (el.textContent || '').trim();
      const title = el.getAttribute('title') || '';
      const cutHere = el.scrollWidth > el.clientWidth + 1;
      ui.note(`  ${cutHere ? 'CUT' : '   '} want ${String(el.scrollWidth).padStart(4)}`
        + ` have ${String(el.clientWidth).padStart(4)}  "${shown}"`);
      if (title && title !== shown) ui.note(`        title "${title}"`);
    }
  }

  // AND WHAT THE TITLE STILL CARRIES. The shortened display is only safe
  // while the full stored name is one hover away.
  ui.note('');
  const shortened = rows.filter((r) => r.title && r.title !== r.shown);
  ui.note(`rows whose title differs from what is shown: ${shortened.length}`);
  for (const r of shortened.slice(0, 8)) {
    ui.note(`  shown "${r.shown}"  ·  title "${r.title}"`);
  }
})()
