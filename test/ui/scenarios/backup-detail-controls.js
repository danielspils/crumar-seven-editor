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
  // ON BANK 2, NOT WHICHEVER BANK THE APP OPENED ON.
  //
  // THIS COULD NOT PASS FROM A FRESH LAUNCH and was red for weeks without
  // anybody noticing (recorded as item 14 in docs/next-1.5.7.md, 17 Nov
  // 2026). `bankIndex` starts at 0 in app.js and is NEVER persisted, so a
  // freshly launched app always lands on Bank 1 — and Bank 1 is the
  // FACTORY bank, which cannot go stale, so its caveat is deliberately
  // empty. The check asked the one bank exempt from the rule it was
  // checking, and `/as of|verified|backup/.test('')` is false.
  //
  // IT SURVIVED BECAUSE OF THE OTHER HAZARD CLAUDE.md ALREADY DOCUMENTS:
  // the runner does not reset userData between scenarios, so inside a full
  // run it could inherit a bank selection from whatever ran before it and
  // pass for a reason that had nothing to do with this file. Run alone from
  // a fresh launch, it failed.
  //
  // THE FIX IS THE ONE one-list-on-screen.js GOT: choose the state rather
  // than inherit it. Bank 2 always has one of the two honest answers — an
  // age, or "not yet backed up".
  await ui.selectTab('seven');
  await ui.sleep(500);
  const bank2 = ui.$$('#bank-tabs .bank-tab')[1];
  if (bank2) { ui.click(bank2, 'bank 2'); await ui.sleep(600); }
  const asof = ui.$('#bank-asof');
  ui.check(!!asof, 'the freshness caveat is on the Seven tab');
  if (asof) {
    const text = (asof.textContent || '').trim();
    ui.note(`freshness on bank 2: "${text}"`);
    ui.check(/as of|verified|backup/i.test(text),
      `and it says what the view is as of ("${text}")`);
    // AND BANK 1 SAYS NOTHING, which is the other half of the same rule and
    // is worth pinning now that the first half is measured on the right
    // bank: a factory bank cannot drift, so a caveat there would be a
    // claim the app has no business making.
    const bank1 = ui.$$('#bank-tabs .bank-tab')[0];
    if (bank1) {
      ui.click(bank1, 'bank 1');
      await ui.sleep(600);
      const b1 = (ui.$('#bank-asof') || {}).textContent || '';
      ui.note(`freshness on bank 1 (the factory bank): "${b1.trim()}"`);
      ui.check(b1.trim() === '' || /not yet backed up/i.test(b1),
        `Bank 1 claims no staleness — it cannot drift ("${b1.trim()}")`);
    }
  }
})()
