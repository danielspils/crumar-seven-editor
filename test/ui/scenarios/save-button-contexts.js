// @env SEVEN_NO_DEVICE=1
//
// ONE CONTROL, THREE CONTEXTS. The label names the DESTINATION, never "save
// edits" — a backup record is not written to and cannot be, so a label
// promising to save into one would describe something the app refuses to do.
//
//   ON THE SEVEN   "Save as new patch"   always available
//   Backups        "Save as new patch"   only when something has drifted
//   Patches        "Save patch"          only when something has drifted
//
// ON THE SEVEN is always on because there is no file behind a bank slot to
// compare against: the app knows what the slot held at the last backup and the
// preset may have changed since, so it cannot claim the player edited anything.
// A control that is always available claims nothing; a drift marker there would
// be a guess.
//
// Offline on purpose. Drift itself needs a live session and therefore an
// instrument — that half is covered by test/drift.test.js as a unit, and by
// hardware. What is asserted here is which control appears where, which is
// exactly the part that does not need a Seven.
(async () => {
  const btn = () => ui.$('#save-live-btn');
  const label = () => (btn() ? btn().textContent.trim() : null);
  const mode = () => (btn() ? btn().dataset.saveMode : null);

  // ── ON THE SEVEN ────────────────────────────────────────────────────────
  const row = await ui.waitEl('#patch-list .patch-row', 'a slot in ON THE SEVEN');
  ui.click(row, 'a slot on the instrument');
  await ui.sleep(600);
  ui.check(!!btn(), 'ON THE SEVEN offers a save control');
  ui.note(`OTS: "${label()}" mode=${mode()} disabled=${btn() && btn().disabled}`);
  ui.check(label() === 'Save as new patch', `it reads "Save as new patch" (${label()})`);
  ui.check(mode() === 'new', 'and it saves as new, never overwrites');
  ui.check(btn() && !btn().disabled,
    'ALWAYS AVAILABLE — there is no file here to have drifted from');

  // ── Backups ─────────────────────────────────────────────────────────────
  await ui.openLibrary();
  ui.click(await ui.waitEl('.seg-btn[data-tab="backups"]', 'the Backups tab'), 'Backups');
  await ui.sleep(500);
  const run = ui.$$('.lib-setlist[data-backup]')[0];
  ui.check(!!run, 'there is a backup run to open');
  if (run) {
    ui.click(run.querySelector('.patch-name') || run, 'the newest run');
    await ui.sleep(600);
    const rec = ui.$('#library .lib-row.lib-patch, #library .lib-slot[data-file]');
    ui.check(!!rec, 'and a record inside it');
    if (rec) {
      ui.click(rec.querySelector('.patch-name') || rec, 'a backup record');
      await ui.sleep(600);
      ui.note(`Backups: "${label()}" mode=${mode()} disabled=${btn() && btn().disabled}`);
      ui.check(label() === 'Save as new patch',
        `a record saves as a NEW patch, never into the backup (${label()})`);
      ui.check(mode() === 'new', 'mode=new');
      ui.check(btn() && btn().disabled,
        'and it waits for drift — nothing has changed yet');
    }
  }

  // ── Patches ─────────────────────────────────────────────────────────────
  ui.click(await ui.waitEl('.seg-btn[data-tab="patches"]', 'the Patches tab'), 'Patches');
  await ui.sleep(500);
  const patch = ui.$('#library .lib-row.lib-patch');
  ui.check(!!patch, 'there is a patch of your own');
  if (patch) {
    ui.click(patch.querySelector('.patch-name') || patch, 'one of your patches');
    await ui.sleep(600);
    ui.note(`Patches: "${label()}" mode=${mode()} disabled=${btn() && btn().disabled}`);
    ui.check(label() === 'Save patch',
      `your own patch is written back to its own file (${label()})`);
    ui.check(mode() === 'overwrite', 'mode=overwrite');
    ui.check(btn() && btn().disabled, 'and it waits for drift');
  }

  // ── Send to Seven is gone from ON THE SEVEN ─────────────────────────────
  //
  // Deliberate, reversible trial: removing it also removes the only way to
  // copy one preset to another slot on the instrument.
  // Back to ON THE SEVEN properly: the library is open, so the bank rows are
  // clipped to nothing and `row` is both stale and unhittable. Close it first,
  // then take a fresh reference.
  ui.click(ui.$('#bank-strip'), 'the ON THE SEVEN strip (closing the library)');
  await ui.sleep(700);
  const slot = await ui.waitEl('#patch-list .patch-row', 'the slot list again');
  ui.click(slot, 'a slot on the instrument');
  await ui.sleep(600);
  ui.check(!ui.$('.audition-bar [data-save-to-seven]'),
    'no "Send to Seven" in the ON THE SEVEN bar');
  ui.check(!ui.$('.audition-bar [data-duplicate-edit]'),
    'and no "Duplicate and edit" anywhere — it went with the redesign');
})()
