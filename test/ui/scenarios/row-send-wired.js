// @env SEVEN_NO_DEVICE=1
//
// THE ROW'S "Send to Seven" ACTUALLY DOES SOMETHING WHEN CLICKED.
//
// It shipped wired to nothing. The markup was there, the click branch was
// there, and app.js never supplied the `sendToSeven` callback the branch calls
// — so the guard `if (entry && on.sendToSeven)` was falsy and the click
// returned in silence. No throw, nothing in the console, and a scenario that
// merely found the element would have passed.
//
// That is the SECOND failure of this exact shape in one day (renderBanks() was
// the first): the code exists, nothing calls it, both suites green. So this
// asserts a CONSEQUENCE — the app said something back — rather than the
// element's existence.
//
// With no instrument, the consequence is the toast asking for one. That is
// still the whole chain: row click -> library click router -> on.sendToSeven
// -> sendPatchToSlot -> the connection check. Break any link and it goes quiet
// again, which is exactly what this catches.
(async () => {
  await ui.openLibrary();
  ui.click(await ui.waitEl('.seg-btn[data-tab="backups"]', 'the Backups tab'), 'Backups');
  await ui.sleep(600);
  const run = ui.$$('.lib-setlist[data-backup]')[0];
  ui.check(!!run, 'there is a backup run to open');
  if (!run) return;
  ui.click(run.querySelector('.patch-name') || run, 'the newest run');
  await ui.sleep(700);

  const send = ui.$('#library [data-send-patch]');
  ui.check(!!send, 'a backup row carries the Send control');
  if (!send) return;

  // Nothing should be on screen before the click, or the assertion after it
  // proves nothing.
  const toastEl = () => ui.$('#undo-toast.shown');
  ui.check(!toastEl(), 'no toast before the click');

  ui.click(send, 'the row’s Send to Seven');

  const spoke = await ui.waitFor(() => !!toastEl(), { timeout: 4000, what: 'the app to answer' });
  ui.note(`the app answered: "${toastEl() ? toastEl().textContent.trim() : '(silence)'}"`);
  ui.check(spoke, 'THE CLICK DID SOMETHING — it is wired end to end');
  ui.check(/connect the seven/i.test((toastEl() || {}).textContent || ''),
    'and it is the send path answering, not some other message');
})()
