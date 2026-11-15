// @env SEVEN_NO_DEVICE=1
//
// WHAT A BACKUP RECORD OFFERS, and what it must not.
//
// An unedited record showed "Save as new patch" in the action colour and a
// "Send to Seven" text link beside it. The save control was correct about
// drift — it was DISABLED, and the bar was is-idle — but a disabled button
// still drew in full: measured disabled=true, color rgb(79,185,106), opacity 1
// (2026-08-21). Nothing was firing wrongly; nothing was hiding it either.
//
// Now: hidden until something drifts, and hidden by VISIBILITY so the slot
// keeps its height and the panel does not jump when an edit arrives.
(async () => {
  const btn = () => ui.$('#save-live-btn');

  await ui.openLibrary();
  await ui.selectTab('backups');
  await ui.sleep(600);
  const run = ui.$$('.lib-setlist[data-backup]')[0];
  ui.check(!!run, 'there is a backup run');
  if (!run) return;
  ui.click(run.querySelector('.patch-name') || run, 'the newest run');
  await ui.sleep(700);
  const rec = ui.$('#library .lib-row.lib-patch, #library .lib-slot[data-file]');
  ui.check(!!rec, 'and a record inside it');
  if (!rec) return;
  ui.click(rec.querySelector('.patch-name') || rec, 'a backup record');
  await ui.sleep(800);

  // ── the save control is not on screen ───────────────────────────────────
  ui.check(!!btn(), 'the save control is still in the DOM, holding its space');
  const cs = getComputedStyle(btn());
  ui.note(`save: visibility=${cs.visibility} disabled=${btn().disabled} text="${btn().textContent.trim()}"`);
  ui.check(cs.visibility === 'hidden',
    'an unedited record shows NO save control');
  ui.check(btn().disabled, 'and it cannot be reached by a click either');
  ui.check(btn().getAttribute('aria-hidden') === 'true' && btn().tabIndex === -1,
    'nor by a screen reader or the tab key');

  // THE SPACE IS RESERVED: the slot has real height while nothing is showing.
  const box = btn().getBoundingClientRect();
  ui.note(`reserved slot: ${Math.round(box.width)}x${Math.round(box.height)}`);
  ui.check(box.height > 0,
    'the hidden control still occupies its height, so nothing jumps when it appears');

  // ── no Send to Seven link, anywhere in the panel ────────────────────────
  ui.check(!ui.$('#detail [data-save-to-seven], .audition-bar [data-save-to-seven]'),
    'no "Send to Seven" text link in the detail panel');
  ui.check(!/Send to Seven/.test((ui.$('.audition-bar') || {}).textContent || ''),
    'and the bar does not say it in any other form');

  // ── it moved to the row ────────────────────────────────────────────────
  //
  // Queried FRESH: the list re-renders on selection, and a reference taken
  // before that is detached — a detached element reports empty computed
  // styles, which reads as "no styling" rather than "wrong element".
  const rowSend = ui.$('#library [data-send-patch]');
  ui.check(!!rowSend, 'the backup row carries Send to Seven instead');
  let sendPos = null;
  if (rowSend) {
    const cs2 = getComputedStyle(rowSend);
    sendPos = { position: cs2.position, right: cs2.right };
    ui.note(`row control: "${rowSend.textContent.trim()}" position=${cs2.position} right=${cs2.right}`);
    ui.check(cs2.position === 'absolute', 'anchored like the other row controls');
    ui.check(cs2.transitionProperty.includes('opacity'),
      'and revealed rather than permanently drawn');
  }

  // …and that treatment is the one the Patches tab already uses. The two
  // cannot be on screen together, so each is measured in its own tab and the
  // numbers compared.
  await ui.selectTab('patches');
  await ui.sleep(600);
  const del = ui.$('#library .patch-delete');
  if (del && sendPos) {
    const b = getComputedStyle(del);
    ui.note(`delete: position=${b.position} right=${b.right}`);
    ui.check(sendPos.position === b.position && sendPos.right === b.right,
      'the new control sits exactly where the existing row control does');
  } else {
    ui.note('no .patch-delete to compare against in this library');
  }

  // ── the honesty label ──────────────────────────────────────────────────
  //
  // IT USED TO BE A SPACING CHECK on the collapsed summary strip, where the
  // bank name and this label shared a line and could collide. The strip is
  // gone with the two-tray layout — and so is that collision, which is one of
  // the things the redesign removed rather than fixed. What is still worth
  // asserting is that the label is on screen and says something.
  await ui.selectTab('seven');
  const asof = ui.$('#bank-asof');
  ui.check(!!asof, 'the freshness caveat is on the Seven tab');
  if (asof) {
    ui.note(`freshness: "${asof.textContent.trim()}"`);
    ui.check(/as of|verified|backup/i.test(asof.textContent),
      'and it says what the view is as of');
  }
})()
