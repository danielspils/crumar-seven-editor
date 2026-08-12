// The picker's Instruments tab assigns a SOUND to a slot — the one honest
// "unedited" option, since the Seven never gave up factory defaults.
(async () => {
  ui.$('#library-head').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await ui.sleep(500);
  ui.click(ui.$('.seg-btn[data-tab="setlists"]'), 'the Setlists tab');
  await ui.sleep(500);
  const first = ui.$('.lib-setlist .patch-name');
  if (!ui.check(!!first, 'a setlist to open')) return;
  ui.click(first, 'the first setlist');
  await ui.sleep(800);

  const assign = ui.$('[data-slot-assign]');
  if (!ui.check(!!assign, 'a slot offers Assign')) return;
  const slot = Number(assign.dataset.slotAssign);
  ui.click(assign, 'Assign');
  await ui.sleep(500);
  ui.check(!!ui.$('.pick-modal'), 'the picker opens');

  ui.click(ui.$('[data-pick-mode="sounds"]'), 'the Instruments tab');
  await ui.sleep(400);
  const tiles = ui.$$('.pick-tile-art');
  ui.check(tiles.length === 24, `every sound is offered as a tile (${tiles.length})`);
  ui.check(!!tiles[0]?.querySelector('svg.sound-art'), 'tiles carry their instrument artwork');

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
