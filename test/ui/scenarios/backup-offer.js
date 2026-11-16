// @env SEVEN_BACKUP_STALE_DAYS=0
// @env SEVEN_UI_WATCH_BOOT=1
//
// THE SECOND FLAG IS WHAT MAKES "NEVER BLOCKS" TESTABLE AT ALL. The runner
// normally waits for the boot loader to clear before starting a scenario, so
// a script that began afterwards would find the loader gone however early the
// offer had fired — measured: a mutation dispatching the offer while the
// overlay still covered the app PASSED. Watching the boot instead lets this
// file see the whole window and say when the dialog appeared.
//
// THE STALE-BACKUP OFFER: it appears, it never blocks, and it asks once.
//
// A full read of 32 slots is 45-50 seconds, so the app offers it rather than
// doing it (Daniel, 16 Nov 2026). The threshold is two weeks; this run forces
// it to 0 so any backup counts as stale, because the alternative way to reach
// this path is to wait a fortnight. The DEFAULT is what
// test/backup-stale.test.js pins, and backup-offer-fresh.js covers the case
// where nothing is offered.
//
// Forcing the threshold changes the STARTING STATE. It disarms nothing: every
// assertion below is about what the offer then does.
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };

  // THE BOOT IS NEVER BLOCKED. The app has to be usable before the offer is
  // even looked for — the runner waits for the boot loader to clear, so
  // reaching this line at all is part of the claim.
  // ---- THE OFFER MUST NOT APPEAR DURING THE BOOT ------------------------
  //
  // Sampled across the whole loader window rather than checked once: an offer
  // that flashed up over the loader and was still there afterwards would look
  // identical, at the end, to one that waited properly.
  const loader = () => ui.$('#boot-loader');
  let dialogDuringBoot = null;
  const t0 = performance.now();
  while (loader() && !loader().hidden && performance.now() - t0 < 20000) {
    const m = ui.$('.seven-modal');
    if (m && dialogDuringBoot === null) {
      dialogDuringBoot = m.textContent.replace(/\s+/g, ' ').trim().slice(0, 60);
    }
    await ui.sleep(16);
  }
  ui.note(`while the loader was up, dialogs seen: ${dialogDuringBoot || 'none'}`);
  ui.check(dialogDuringBoot === null,
    'the offer never blocks the boot — nothing is asked while the loader is up'
    + (dialogDuringBoot ? ` (saw "${dialogDuringBoot}")` : ''));

  const rows = ui.$$('#patch-list .patch-row');
  ui.note(`the app is up: ${rows.length} slot rows on screen`);
  ui.check(rows.length > 0, 'the boot completed');

  // AND THE APP IS REACHABLE, not merely rendered — "rows exist" is true
  // behind a full-window overlay too.
  const r = rows[0].getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  ui.note(`a press on the first row lands on <${hit ? hit.tagName.toLowerCase() : 'nothing'}`
    + `${hit && hit.closest('#boot-loader') ? ' INSIDE THE LOADER' : ''}>`);
  ui.check(!!hit && !hit.closest('#boot-loader'),
    'and a press on a slot row reaches it');

  const dialog = await ui.waitFor(
    () => !!ui.$('.seven-modal'),
    { timeout: 12000, what: 'the stale-backup offer' }
  ).then(() => ui.$('.seven-modal')).catch(() => null);

  ui.check(!!dialog, 'an offer appears when the last backup is older than the threshold');
  if (!dialog) return;

  const text = dialog.textContent.replace(/\s+/g, ' ').trim();
  ui.note(`it says: "${text}"`);
  // THE NUMBER IS LIVE, not a literal. It is built from the same ago() every
  // dated row in the app uses, so it cannot drift from the line under the
  // slot list and cannot read "1 days ago" — ago() answers "yesterday" there.
  ui.check(/Your last backup was .+\. Back up the Seven now\?/.test(text),
    'the sentence is the agreed one, with a live age');
  ui.check(!/\b1 days ago\b/.test(text), 'and never says "1 days ago"');

  // TWO REAL BUTTONS, which is the layout Daniel drew. Worth asserting as
  // text rather than by class: `cancelLabel` does NOT draw a button — it
  // names the corner X — so a dialog built with it would pass a
  // "does a Continue exist" check on an aria-label while showing one button.
  const buttons = [...dialog.querySelectorAll('button')]
    .map((b) => b.textContent.trim()).filter(Boolean);
  ui.note(`buttons: ${buttons.join(' · ')}`);
  ui.check(buttons.includes('Back up now'), 'it offers "Back up now"');
  // "Continue", not "Not now" or "Skip": declining is not a deferral.
  ui.check(buttons.includes('Continue'), 'and "Continue" to carry on, as a button');
  ui.check(buttons.length === 2,
    `two buttons and no more (${buttons.length}: ${buttons.join(', ')})`);
  // No second mechanism for a promise the once-per-session rule already keeps.
  ui.check(!/don.t ask|again/i.test(text), 'with no "don\'t ask again" box');

  // ---- DECLINING IS FRICTIONLESS, AND IT DOES NOT COME BACK --------------
  const cont = [...dialog.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Continue');
  cont.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await ui.sleep(700);
  ui.check(!ui.$('.seven-modal'), 'Continue dismisses it in one click');

  // The app is still usable, and nothing was started.
  ui.check(ui.$$('#patch-list .patch-row').length > 0, 'the app carries on');
  const backupBtn = ui.$('#backup-btn') || [...ui.$$('button')]
    .find((b) => /Back up instrument/.test(b.textContent));
  if (backupBtn) {
    ui.note(`the toolbar button reads: "${backupBtn.textContent.trim()}"`);
    ui.check(/Back up instrument/.test(backupBtn.textContent),
      'declining started no backup — the button is not in its Cancel state');
  }

  // ONCE PER SESSION. Selecting a row re-renders and re-reads; none of that
  // may bring the offer back.
  if (ui.$$('#patch-list .patch-row')[1]) {
    ui.$$('#patch-list .patch-row')[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await ui.sleep(2600);
  }
  ui.note(`dialogs on screen after carrying on: ${ui.$$('.seven-modal').length}`);
  ui.check(!ui.$('.seven-modal'), 'and it does not ask again this session');
})()
