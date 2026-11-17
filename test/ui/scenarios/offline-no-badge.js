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
  await ui.selectTab('patches');
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

  // ── AND IT NO LONGER SAYS WHY, WHICH IS THE ACCEPTED COST ─────────────
  //
  // "Connect your Seven to see which sounds are installed" came off all three
  // tabs on 17 Nov 2026 (Daniel): the status bar already says whether the
  // Seven is connected, and this said it again at more length, permanently.
  //
  // THE RULE IT CAME FROM IS UNCHANGED. Offline the app claims nothing about
  // any instrument, which is what the assertion above pins — no row is marked
  // "not installed". What went is the SENTENCE, not the silence. The cost,
  // stated so nobody re-adds the line by accident: the absence of warnings is
  // now unknown rather than good news, and nothing on screen says so.
  const line = ui.$('#library .lib-unknown-sounds');
  ui.note(`the explanatory line: ${line ? `"${line.textContent.trim()}"` : 'gone, as intended'}`);
  ui.check(!line, 'the connection banner is gone from the Patches tab');

  // ── THE SETLIST SLOT MAKES THE SAME CLAIM, so it is checked too ─────────
  await ui.selectTab('setlists');
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
