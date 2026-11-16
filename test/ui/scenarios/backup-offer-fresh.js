// A RECENT BACKUP IS NOT MENTIONED AT ALL.
//
// The other half of backup-offer.js, and the half most worth having: a
// feature that only ever appears is indistinguishable from one that always
// appears, and the cost of a false offer is a dialog in front of somebody who
// opened the app to play.
//
// No @env here ON PURPOSE. The real threshold is two weeks and the library
// the runner copies was backed up within that, so this is the ordinary case
// running under the ordinary rule. If the default is ever lowered by accident
// — the mutation this file exists for — it fails.
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };

  const rows = ui.$$('#patch-list .patch-row');
  ui.check(rows.length > 0, 'the app is up');

  // The age the app itself reports for the backup, so a failure here says
  // WHY rather than just that a dialog appeared.
  const asOf = ui.$('#bank-as-of');
  ui.note(`the slot list says: "${asOf ? asOf.textContent.trim() : '(no label)'}"`);

  // Long enough to cover the offer's trigger — it fires when the boot loader
  // has gone, and the runner has already waited for that.
  await ui.sleep(3000);

  const modal = ui.$('.seven-modal');
  ui.note(modal
    ? `a dialog is on screen: "${modal.textContent.replace(/\s+/g, ' ').trim().slice(0, 90)}"`
    : 'no dialog on screen');
  ui.check(!modal,
    'nothing is offered when the last backup is newer than the threshold');
})()
