// @env SEVEN_NO_DEVICE=1
//
// THE REFRESH CONTROL, in the state most people will meet it in: no
// instrument. It must not be there — a control whose entire job is to make the
// Seven play through its presets has nothing to offer when there is no Seven,
// and offering it anyway would be a button that explains why it cannot work.
//
// The sweep itself needs the cable and is covered by hand when one is
// attached: 32 recalls, each read from the broadcast it produces.
(async () => {
  await ui.sleep(900);
  const head = ui.$('#seven-head');
  ui.check(!!head, 'the ON THE SEVEN header is there');
  ui.note(`header reads: "${head.textContent.trim()}"`);

  ui.check(!ui.$('#ots-refresh'),
    'no refresh control with nothing attached — there is nothing to read');

  // And the header still says what it always said, from the backup.
  ui.check(/as of last backup|not yet backed up/.test(head.textContent),
    'the header falls back to the backup, and says so');
  ui.check(!/\d:\d\d[ap]m/.test(head.textContent),
    'it claims no clock time, because no slot has been read');

  // No row may claim to have changed: that verdict needs a read, and there has
  // been none.
  ui.check(!ui.$('#patch-list .patch-row.is-changed'),
    'and no row claims "Changed since backup" without evidence');
})()
