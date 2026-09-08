// AUDITIONING NEEDS NO DESTINATION, so it needs no preset selected.
//
// The carousel used to refuse with "Choose a preset to try an instrument on
// it" — a gate that asked for a DESTINATION back when picking a sound ran
// through the transfer walk. Auditioning sends 0x46 to the edit buffer and
// recalls nothing, so from Patches or Backups that toast was telling you to
// select a preset for a send that never goes near one.
//
// This drives the IPC the carousel calls rather than the wheel itself: the
// carousel's own geometry is covered elsewhere, and what changed here is that
// the path is reachable at all without a bank slot.
(async () => {
  if (!(await ui.requireDevice())) return;

  // 1. A LIBRARY patch selected, and no preset on the instrument.
  await ui.openLibrary();
  const row = await ui.waitEl('#library .lib-row.lib-patch, #library .lib-slot[data-file]',
    'a library patch');
  if (!ui.check(!!row, 'the library has a patch to select')) return;
  ui.click(row, 'a patch in the library');
  // Selecting a patch PLAYS it, and that send has to finish before another
  // starts — the sender refuses a second one in flight. This is the audition
  // settling, not a guess at timing.
  await ui.sleep(3000);

  const fromLibrary = await window.sevenAPI.midi.auditionSound('Tine Piano');
  ui.check(!!(fromLibrary && fromLibrary.ok),
    'auditioning works from the library with no preset selected: '
    + ((fromLibrary && fromLibrary.error) || 'ok'));

  // 2. And with a preset on the instrument selected, which always worked.
  await ui.closeLibrary();
  await ui.selectBankPreset(2, 1);
  await ui.sleep(3000);   // the recall + its own send, same reason
  const withPreset = await window.sevenAPI.midi.auditionSound('Reed Piano');
  ui.check(!!(withPreset && withPreset.ok),
    'and still works with a preset selected: '
    + ((withPreset && withPreset.error) || 'ok'));

  // 3. The refusal that MUST remain: a sound this unit does not have.
  const bogus = await window.sevenAPI.midi.auditionSound('Bösendorfer Imperial');
  ui.check(!(bogus && bogus.ok),
    'a sound this instrument lacks is still refused, not guessed at');
})()
