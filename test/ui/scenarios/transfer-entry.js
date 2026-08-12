// "Send to bank…" opens the bank choice, offers 2/3/4, and never offers Bank 1.
// Stops before the confirm: past that point the instrument is really written.
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };
  await ui.openLibrary();
  ui.click(await ui.waitEl('.seg-btn[data-tab="setlists"]', 'the Setlists tab'), 'the Setlists tab');
  await ui.waitFor(() => ui.$$('.lib-setlist-row').length > 0, { what: 'the setlist list' });

  const send = await ui.waitEl('[data-setlist-send]', 'a Send to bank button');
  ui.click(send, 'Send to bank…');
  const modal = await ui.waitEl('.seven-modal', 'the bank chooser');
  if (!ui.check(!!modal, 'the chooser opens')) return;

  const labels = ui.$$('.seven-modal [data-choice]').map((b) => b.textContent.trim());
  ui.note(`offered: ${labels.join(', ')}`);
  ui.check(labels.join() === 'Bank 2,Bank 3,Bank 4', `banks 2-4 are offered, got ${labels}`);
  ui.check(!labels.includes('Bank 1'), 'Bank 1 is never offered');
  ui.check(
    /factory presets/.test(modal.textContent),
    'it says why Bank 1 is absent'
  );

  // Leave without sending anything.
  ui.click(ui.$('.seven-modal-cancel'), 'the chooser close button');
  await ui.waitFor(() => !ui.$('.seven-modal'), { what: 'the chooser to close' });
  ui.check(!ui.$('.seven-modal'), 'declining closes it and writes nothing');
})()
