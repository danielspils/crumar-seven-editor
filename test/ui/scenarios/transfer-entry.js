// "Send to bank…" opens the bank choice, offers 2/3/4, and never offers Bank 1.
// Stops before the confirm: past that point the instrument is really written.
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };
  await ui.openLibrary();
  ui.click(await ui.waitEl('.seg-btn[data-tab="setlists"]', 'the Setlists tab'), 'the Setlists tab');
  await ui.waitFor(() => ui.$$('.lib-setlist-row').length > 0, { what: 'the setlist list' });

  // Open the setlist first. Send lives in the setlist's own header now, not on
  // the row — the list is for finding one, the detail view is where you
  // arrange it and then put it on the instrument (2026-08-13).
  ui.click(ui.$$('.lib-setlist-row')[0], 'the first setlist');
  const send = await ui.waitEl('[data-setlist-send]', 'a Send to Seven button');
  ui.click(send, 'Send to Seven →');
  const modal = await ui.waitEl('.seven-modal', 'the bank chooser');
  if (!ui.check(!!modal, 'the chooser opens')) return;

  // All four banks are SHOWN, and Bank 1 is unpickable. Leaving it out raised
  // the question of whether it existed at all; greyed, the answer is on screen
  // with the reason under the buttons (Daniel, 2026-08-14).
  const labels = ui.$$('.seven-modal [data-choice]').map((b) => b.textContent.trim());
  ui.note(`offered: ${labels.join(', ')}`);
  ui.check(labels.join() === 'Bank 1,Bank 2,Bank 3,Bank 4', `all four banks are shown, got ${labels}`);
  const bank1 = ui.$$('.seven-modal [data-choice]').find((b) => b.textContent.trim() === 'Bank 1');
  ui.check(!!bank1 && bank1.disabled, 'Bank 1 is shown but cannot be chosen');
  ui.check(
    ui.$$('.seven-modal [data-choice]:not([disabled])').length === 3,
    'the three storable banks are the ones on offer'
  );
  // The keyboard must not start on a button that does nothing.
  ui.check(
    document.activeElement && document.activeElement.textContent.trim() === 'Bank 2',
    `focus lands on the first bank that can be chosen (${document.activeElement?.textContent?.trim()})`
  );
  ui.check(
    /factory presets/.test(modal.textContent),
    'it says why Bank 1 cannot be chosen'
  );

  // Leave without sending anything.
  ui.click(ui.$('.seven-modal-cancel'), 'the chooser close button');
  await ui.waitFor(() => !ui.$('.seven-modal'), { what: 'the chooser to close' });
  ui.check(!ui.$('.seven-modal'), 'declining closes it and writes nothing');
})()
