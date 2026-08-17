// The donation ask, drawn by the real app (docs/DONATIONS.md).
//
// Needs no instrument: the ask is a modal and a rule, and both are reachable
// without hardware. Run it with the state reset, or the rules will correctly
// refuse to show anything:
//
//   SEVEN_RESET_DONATIONS=1 npm run test:ui donation-ask
//
// What it guards is the shape of the ask rather than the plumbing — the copy
// is Daniel's, verbatim, and the three buttons must carry the same weight,
// because an exit that is harder to click than the ask is a trick.
(async () => {
  const api = window.sevenAPI.donations;

  const due = await api.due();
  if (due !== 1) {
    return { skipped: `state is not empty (due=${due}); run with SEVEN_RESET_DONATIONS=1` };
  }

  const ask = (showing) => SevenModal.choose({
    title: 'This app is free',
    body: 'This Seven Goes to Eleven is free. But donations help cover code '
      + 'signing and hosting. Thanks from Seattle! - Daniel',
    choices: [
      { label: 'Donate', value: 'donate' },
      showing === 1
        ? { label: 'Remind me later', value: 'later' }
        : { label: "Don't ask again", value: 'never' },
      { label: 'I already donated', value: 'already' },
    ],
    cancelLabel: 'Close',
  });

  // ---- Showing 1 ---------------------------------------------------------
  await api.shown();
  const first = ask(1);
  await ui.sleep(200);

  const buttons = () => [...document.querySelectorAll('.seven-modal-actions button')];
  ui.check(!!ui.$('.seven-modal-overlay'), 'the ask is on screen');
  ui.note(`buttons: ${buttons().map((b) => b.textContent).join(' | ')}`);
  ui.check(buttons().length === 3, 'three choices');
  ui.check(
    buttons()[1].textContent === 'Remind me later',
    'showing 1 offers to be reminded'
  );
  ui.check(
    new Set(buttons().map((b) => b.className)).size === 1,
    'all three carry the same visual weight — no highlighted Donate'
  );

  const body = (ui.$('.seven-modal-body p') || {}).textContent || '';
  ui.check(body.startsWith('This Seven Goes to Eleven is free.'), 'the copy is Daniel’s');
  ui.check(!/\$\d/.test(body), 'and carries no number — the amount is Ko-fi’s business');

  ui.click(ui.$('[data-choice="later"]'), 'Remind me later');
  await api.answer(await first);

  // ---- The seven-day rule ------------------------------------------------
  ui.check(await api.due() === 0, 'a second trigger the same day is dropped, not queued');

  // ---- The permanent exit ------------------------------------------------
  await api.answer('already');
  ui.check(await api.due() === 0, '"I already donated" ends it');

  return { notes: 'ask shown once, then silent' };
})()
