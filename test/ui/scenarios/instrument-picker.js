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

  // Choosing an instrument now says what the new patch will be COPIED FROM
  // before it writes anything, and that has to be answered (Daniel,
  // 2026-08-14). Accepting the default is what a person does most of the time.
  const start = await ui.waitEl('.seven-modal', 'the starting-point dialog');
  ui.note(`starting point: ${start?.textContent.replace(/\s+/g, ' ').trim().slice(0, 90)}`);
  ui.check(/Starting from:|No capture of this sound/.test(start?.textContent || ''),
    'it says where the values will come from');
  ui.click(start.querySelector('.seven-modal-ok'), 'Create patch');
  await ui.waitFor(() => !ui.$('.seven-modal'), { what: 'the dialog to close' });
  await ui.sleep(1000);
  const row = ui.$$('.lib-slot')[slot];
  ui.note(`slot ${slot + 1}: ${row?.textContent.replace(/\s+/g, ' ').trim().slice(0, 60)}`);
  // Choosing an instrument MAKES a patch — that model with the effects it
  // comes with — so the slot holds a patch file like any other and there is no
  // sound-only row left to render (Daniel, 2026-08-14).
  ui.check(!ui.$('.lib-slot-sound'), 'the slot is an ordinary patch row, not a sound-only one');
  ui.check(!!row?.dataset.file, 'and it references a patch file');
  // The row names its MODEL in the model column, like every other row. It used
  // to say "Instrument" there — a kind of sound the Seven does not have — and
  // carry a three-line tooltip explaining itself (Daniel, 2026-08-14).
  ui.check(
    (row?.textContent || '').includes(name),
    `the slot names its model (${name})`
  );
  ui.check(!row?.hasAttribute('title'), 'and explains itself without a tooltip');
  ui.check(!/\(m\)|\(s\)/.test(row?.textContent || ''), 'with no (m)/(s) either');
})()
