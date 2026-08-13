// The picker's Instruments tab assigns a SOUND to a slot — the one honest
// "unedited" option, since the Seven never gave up factory defaults.
(async () => {
  await ui.openLibrary();
  ui.click(await ui.waitEl('.seg-btn[data-tab="setlists"]', 'the Setlists tab'), 'the Setlists tab');
  const first = await ui.waitEl('.lib-setlist .patch-name', 'a setlist row');
  if (!ui.check(!!first, 'a setlist to open')) return;
  ui.click(first, 'the first setlist');
  await ui.sleep(800);

  const assign = await ui.waitEl('[data-slot-assign]', 'a slot Assign button');
  if (!ui.check(!!assign, 'a slot offers Assign')) return;
  const slot = Number(assign.dataset.slotAssign);
  ui.click(assign, 'Assign');
  ui.check(!!(await ui.waitEl('.pick-modal', 'the picker')), 'the picker opens');

  ui.click(await ui.waitEl('[data-pick-mode="sounds"]', 'the Instruments tab'), 'the Instruments tab');
  await ui.waitFor(() => ui.$$('.pick-tile-art').length > 0, { what: 'the instrument tiles' });
  const tiles = ui.$$('.pick-tile-art');
  ui.check(tiles.length === 24, `every sound is offered as a tile (${tiles.length})`);
  // Art is either a drawn illustration — a full-colour PNG, or an inlined SVG
  // for the ones still drawn as line work — or the line-art mark for
  // instruments with nothing to photograph. All three count; what matters is
  // that a tile renders something, not which element carries it.
  const art = tiles[0]?.querySelector('.sound-art');
  ui.check(!!art, 'tiles carry artwork');
  ui.check(
    !!(art && (art.querySelector('img') || art.querySelector('svg'))) || art?.tagName === 'svg',
    'the artwork renders as a picture'
  );
  const drawn = tiles.filter((t) => t.querySelector('.sound-art.is-drawing')).length;
  ui.note(`${drawn} of ${tiles.length} tiles use a drawn illustration`);

  const name = tiles[0].dataset.pickSound;
  ui.click(tiles[0], `the ${name} tile`);
  await ui.sleep(1000);
  const row = ui.$$('.lib-slot')[slot];
  ui.note(`slot ${slot + 1}: ${row?.textContent.replace(/\s+/g, ' ').trim().slice(0, 60)}`);
  ui.check(!!ui.$('.lib-slot-sound'), 'the slot renders as sound-only');
  // The sentence became a TAG plus a tooltip: a slot holding an instrument
  // is marked "Instrument", and the why lives in the title (2026-08-13).
  ui.check(
    (row?.textContent || '').includes('Instrument'),
    'the slot is marked as holding an instrument'
  );
  ui.check(
    (row?.getAttribute('title') || '').includes('leaves every setting as it is'),
    'and the tooltip says what sending it does'
  );
})()
