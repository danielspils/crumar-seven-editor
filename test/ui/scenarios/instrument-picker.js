// The picker's Instruments tab assigns a SOUND to a slot — the one honest
// "unedited" option, since the Seven never gave up factory defaults.
(async () => {
  await ui.openLibrary();
  await ui.selectTab('setlists');
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
  // THE INSTRUMENT'S OWN COUNT, not a number written here. This asserted 24,
  // which was true of a Seven with no expansions on the day it was written
  // and false the moment one was installed — it failed on 16 Nov 2026 against
  // a unit reporting 27, with all 27 tiles rendering perfectly.
  //
  // A count is a measurement and a measurement has a date (CLAUDE.md, "A
  // RECORDED FACT MUST NOT STAND IN FOR CURRENT STATE"). What is load-bearing
  // is that EVERY sound the instrument has is offered — so the expectation
  // comes from the connected unit's own sound table, whatever it currently
  // holds. Offline there is no table to ask, and the check says so rather
  // than inventing a number.
  const st = await window.sevenAPI.midi.status();
  const sounds = st && st.soundTable && st.soundTable.sounds;
  if (sounds) {
    ui.note(`the instrument reports ${sounds.length} sounds`);
    ui.check(tiles.length === sounds.length,
      `every sound this instrument has is offered as a tile`
      + ` (${tiles.length} tiles against ${sounds.length} sounds)`);
  } else {
    ui.note('no sound table to compare against — nothing connected');
    ui.check(tiles.length > 0, `sounds are offered as tiles (${tiles.length})`);
  }
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

  // Choosing an instrument asks ONE thing: what to call it. Where the values
  // come from is no longer a question — a model starts from Crumar's Bank 1
  // preset, a sample from a clean slate (Daniel, 2026-08-16). The field is
  // pre-filled with the sound's name, numbered if that is taken.
  const start = await ui.waitEl('.seven-modal', 'the name prompt');
  const field = start.querySelector('.name-input');
  ui.check(!!field, 'it asks for a name');
  ui.note(`offered name: ${field ? field.value : '(none)'}`);
  ui.check(!!field && new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( \\d+)?$`).test(field.value),
    'pre-filled with the sound, numbered if taken');
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
