// @env SEVEN_NO_DEVICE=1
//
// ONE CONTROL, THREE CONTEXTS. The label names the DESTINATION, never "save
// edits" — a backup record is not written to and cannot be, so a label
// promising to save into one would describe something the app refuses to do.
//
//   ON THE SEVEN   "Save patch"          always available
//   Backups        "Save as new patch"   only when something has drifted
//   Patches        "Save patch"          only when something has drifted
//
// ON THE SEVEN is always on because there is no file behind a bank slot to
// compare against: the app knows what the slot held at the last backup and the
// preset may have changed since, so it cannot claim the player edited anything.
// A control that is always available claims nothing; a drift marker there would
// be a guess.
//
// IT READS "Save patch" THERE SINCE 14 NOV 2026 (docs/save-what-you-hear.md §3).
// It said "Save as new patch", and Daniel could not read that in the moment,
// standing at the instrument: "They're hard to wrap my head around in the
// moment. I found that yesterday with the existing 'save as a new patch'. What
// does that mean? I know now but only because I'm working on the software."
// The label described the FILING; the choice is the instrument or the
// computer, and that question now gets asked inside the dialog where both
// answers are visible at once.
//
// Elsewhere the label is untouched. On a backup record "Save as new patch"
// names the destination exactly, a record never being written to — so that one
// is still pinned below, and this change must not be allowed to spread to it.
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
  // Same precondition as bank-tab-arrows.js, same reason: with the library
  // tray open — which is persisted state a previous scenario may have left —
  // "On the Seven" is a collapsed strip and its slot rows are not on screen.
  await ui.closeLibrary();
  const row = await ui.waitClickable('#patch-list .patch-row', 'a slot in ON THE SEVEN');
  ui.click(row, 'a slot on the instrument');
  await ui.sleep(600);
  ui.check(!!btn(), 'ON THE SEVEN offers a save control');
  ui.note(`OTS: "${label()}" mode=${mode()} disabled=${btn() && btn().disabled}`);
  ui.check(label() === 'Save patch', `it reads "Save patch" (${label()})`);
  ui.check(mode() === 'new', 'and it saves as new, never overwrites');
  ui.check(btn() && !btn().disabled,
    'ALWAYS AVAILABLE — there is no file here to have drifted from');
  // TWO STATES, BOTH CLICKABLE. Outlined with nothing changed, solid once
  // something has. Outlined is NOT disabled: saving an untouched slot into
  // Patches is how an unedited factory preset gets into the library at all.
  ui.check(btn() && btn().classList.contains('is-quiet'),
    'and with nothing changed it is the quiet state, not the asking one');
  ui.check(!(btn() && btn().classList.contains('is-ready')),
    'it is not dressed as the thing to press until something has changed');

  // ── Backups ─────────────────────────────────────────────────────────────
  await ui.openLibrary();
  await ui.selectTab('backups');
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
  await ui.selectTab('patches');
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
  await ui.selectTab('seven');
  await ui.sleep(700);
  const slot = await ui.waitEl('#patch-list .patch-row', 'the slot list again');
  ui.click(slot, 'a slot on the instrument');
  await ui.sleep(600);
  ui.check(!ui.$('.audition-bar [data-save-to-seven]'),
    'no "Send to Seven" in the ON THE SEVEN bar');
  ui.check(!ui.$('.audition-bar [data-duplicate-edit]'),
    'and no "Duplicate and edit" anywhere — it went with the redesign');
})()
