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
  // Art is either a drawn illustration (a wrapper holding an inlined SVG) or
  // the line-art mark for instruments with nothing to draw. Both count.
  const art = tiles[0]?.querySelector('.sound-art');
  ui.check(!!art, 'tiles carry artwork');
  ui.check(!!(art && art.querySelector('svg') || art?.tagName === 'svg'), 'the artwork is an SVG');
  const drawn = tiles.filter((t) => t.querySelector('.sound-art.is-drawing')).length;
  ui.note(`${drawn} of ${tiles.length} tiles use a drawn illustration`);

  const name = tiles[0].dataset.pickSound;
  ui.click(tiles[0], `the ${name} tile`);
  await ui.sleep(1000);
  const row = ui.$$('.lib-slot')[slot];
  ui.note(`slot ${slot + 1}: ${row?.textContent.replace(/\s+/g, ' ').trim().slice(0, 60)}`);
  ui.check(!!ui.$('.lib-slot-sound'), 'the slot renders as sound-only');
  ui.check(
    (row?.textContent || '').includes('settings stay as they are'),
    'the slot says what a sound-only entry does'
  );
})()
