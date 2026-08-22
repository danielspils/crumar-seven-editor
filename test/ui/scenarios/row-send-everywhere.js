// @env SEVEN_NO_DEVICE=1
//
// SEND TO SEVEN IS ON EVERY LIBRARY ROW, not just a backup record's.
//
// It arrived on records only, because that is where it was first asked for —
// and sending a patch you OWN to the instrument is the more ordinary of the
// two acts. The Patches tab had no way to do it but the context menu (Daniel,
// 2026-08-22, looking at a Patches list with nothing but trash icons).
//
// A row that can be deleted can also be sent, so both controls share the row's
// right edge and this checks they do not sit on top of each other.
//
// Proven by CLICKING, as everything on these rows now is: an existence check
// passed for two dead controls this week.
(async () => {
  const check = async (tab, label) => {
    ui.click(await ui.waitEl(`.seg-btn[data-tab="${tab}"]`, `the ${label} tab`), label);
    await ui.sleep(700);
    if (tab === 'backups') {
      // WAIT for the list rather than reading it the instant the tab is
      // clicked. Read too early and it looks like a library with no backups,
      // which reads as a skip — and a skip on a false premise is worse than a
      // failure, because nobody looks again.
      await ui.waitFor(() => ui.$$('.lib-setlist[data-backup]').length > 0,
        { timeout: 4000, what: 'the backup runs' });
      const run = ui.$$('.lib-setlist[data-backup]')[0];
      ui.check(!!run, 'there is a backup run to open');
      if (!run) return null;
      ui.click(run.querySelector('.patch-name') || run, 'the newest run');
      await ui.waitFor(() => !!ui.$('#library .lib-row-wrap'),
        { timeout: 4000, what: "the run's rows" });
    }
    const send = ui.$('#library .lib-row-wrap [data-send-patch]');
    ui.check(!!send, `${label}: a row carries Send to Seven`);
    return send;
  };

  await ui.openLibrary();

  // ── Patches: send AND delete, side by side ─────────────────────────────
  const patchSend = await check('patches', 'Patches');
  const del = ui.$('#library .lib-row-wrap [data-patch-delete]');
  ui.check(!!del, 'Patches rows still carry delete');
  if (patchSend && del) {
    const s = patchSend.getBoundingClientRect();
    const d = del.getBoundingClientRect();
    ui.note(`send ${Math.round(s.left)}..${Math.round(s.right)} · delete ${Math.round(d.left)}..${Math.round(d.right)}`);
    ui.check(s.right <= d.left + 1,
      'send sits to the LEFT of delete rather than under it');
  }

  // It does something. With no instrument the answer is the toast asking for
  // one — still the whole chain: row → click router → sendToSeven →
  // sendPatchToSlot → the connection check.
  const toast = () => ui.$('#undo-toast.shown');
  ui.check(!toast(), 'nothing showing before the click');
  if (patchSend && ui.click(patchSend, 'Send to Seven on a Patches row')) {
    const spoke = await ui.waitFor(() => !!toast(), { timeout: 4000, what: 'the app to answer' });
    ui.note(`answered: "${toast() ? toast().textContent.trim() : '(silence)'}"`);
    ui.check(spoke, 'THE CLICK DID SOMETHING — wired end to end');
  }
  await ui.sleep(2600); // let the toast clear before the next half

  // ── Backups: send, and nothing else, since a record is read-only ───────
  const recSend = await check('backups', 'Backups');
  if (recSend) {
    ui.check(!ui.$('#library .lib-row-wrap [data-patch-delete]'),
      'a backup record still offers no delete');
    ui.check(!toast(), 'nothing showing before the click');
    if (ui.click(recSend, 'Send to Seven on a backup row')) {
      const spoke = await ui.waitFor(() => !!toast(), { timeout: 4000, what: 'the app to answer' });
      ui.check(spoke, 'and it is wired here too');
    }
  }
})()
