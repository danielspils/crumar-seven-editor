// @env SEVEN_NO_DEVICE=1
//
// RICH OLIVIERI'S BUG, in the state it happens in.
//
// With his Seven disconnected the app told him a patch needed an expansion he
// already owns. It answered "is this sound installed" from the SCHEMA — this
// build's own list — which predates the expansion, so a sound it had never
// heard of came back missing (2026-08-20).
//
// A claim about hardware needs hardware. Offline the app says what it knows
// about the FILE and nothing about any instrument, with ONE line for the whole
// region rather than a marker per row: the uncertainty belongs to the view,
// not to each patch.
//
// SEVEN_NO_DEVICE is declared, not hoped for. This desk always has a Seven
// attached, and without the flag this scenario would assert the connected
// behaviour here and the offline behaviour on anybody else's machine.
(async () => {
  await ui.openLibrary();
  await ui.sleep(500);
  ui.click(await ui.waitEl('.seg-btn[data-tab="patches"]', 'the Patches tab'), 'Patches');
  await ui.sleep(700);

  const rows = ui.$$('#library .lib-row.lib-patch');
  ui.check(rows.length > 0, `the library has patches to look at (${rows.length})`);
  if (!rows.length) return;

  // ── NOT ONE ROW CLAIMS ANYTHING ABOUT AN INSTRUMENT ────────────────────
  const badges = ui.$$('#library .badge-warn');
  const notInstalled = badges.filter((b) => /not installed/i.test(b.textContent));
  ui.note(`rows ${rows.length} · "not installed" badges ${notInstalled.length}`);
  ui.check(notInstalled.length === 0,
    'no patch is marked "Not installed" with nothing connected');

  // ── AND IT SAYS WHY, ONCE ──────────────────────────────────────────────
  const line = ui.$('#library .lib-unknown-sounds');
  ui.check(!!line, 'the region says why it cannot answer');
  if (line) {
    ui.note(`the line reads: "${line.textContent.trim()}"`);
    ui.check(ui.$$('#library .lib-unknown-sounds').length === 1,
      'once for the region, not once per row');
    // IT MUST NOT SCROLL AWAY FROM THE ROWS IT EXPLAINS. Daniel asked this
    // before it was built: a header inside the scroller outlives nothing.
    const list = ui.$('#library .lib-list');
    ui.check(!!list && !list.contains(line),
      'and it sits outside the scrolling list, so it cannot slide away');
    const lb = line.getBoundingClientRect();
    const rb = list.getBoundingClientRect();
    ui.note(`line bottom ${Math.round(lb.bottom)} · list top ${Math.round(rb.top)}`);
    ui.check(lb.bottom <= rb.top + 1, 'above the rows it is about');
  }

  // ── THE SETLIST SLOT MAKES THE SAME CLAIM, so it is checked too ─────────
  ui.click(await ui.waitEl('.seg-btn[data-tab="setlists"]', 'the Setlists tab'), 'Setlists');
  await ui.sleep(700);
  const first = ui.$('#library .lib-setlist-row');
  if (first) {
    ui.click(first, 'the first setlist');
    await ui.sleep(700);
    const warns = ui.$$('#library .sound-tag.is-warn')
      .filter((t) => /^\(!\)$/.test(t.textContent.trim()));
    ui.note(`setlist slots flagged with (!): ${warns.length}`);
    ui.check(warns.length === 0, 'nor does a setlist slot claim a sound is missing');
  } else {
    ui.note('no setlists in this library — the slot half was not exercised');
  }
})()
