// A PROGRAM CHANGE NOBODY CAUSED MUST NOT MOVE THE DESTINATION.
//
// This is a reproduction first and a regression test second. Daniel chose
// Bank 3 / Preset 1 and was asked to hold 3/2. The arithmetic checked out at
// every step — the click gives `preset`, the plan puts the slot at index
// preset-1, the step reports i+1, the recall computes (bank-1)*8+i — so the
// numbering was never the suspect. This was, and it reproduced on the first
// attempt: chose BANK 3 · PRESET 5, the app recalled a slot, and the chooser
// silently read BANK 2 · PRESET 1 with nobody near the instrument.
//
// WHY IT LOOKED LIKE FOLLOWING THE PLAYER. With Send PC on, the Seven echoes
// every Program Change it RECEIVES, and the echo is byte-identical to a hand
// on the panel. The chooser follows the panel on purpose — Daniel's decision,
// and a good one — so it followed the app's own recall too. The tail of a
// previous transfer does exactly this when it puts the panel back.
//
// It needs a real instrument because it needs a real echo: nothing in the app
// can manufacture one, and a fake would be testing the fake.
//
// IT STORES NOTHING. The chooser is closed before any transfer begins. It does
// RECALL a slot, which is the ordinary thing auditioning does all day, and is
// the whole mechanism under test.
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };
  const st = await window.sevenAPI.midi.status();
  ui.note(`Send PC on the instrument: ${st.sendPc}`);
  if (!st.sendPc) {
    // A PRECONDITION THIS SCENARIO CANNOT ARRANGE — turning Send PC on is a
    // change to somebody's instrument settings, and the app only borrows it
    // inside a run it was asked to make. Without it there is no echo to test.
    return { skipped: 'Send PC is off on this instrument — no echo to follow' };
  }

  await ui.openLibrary();
  await ui.sleep(400);
  ui.click(await ui.waitEl('.seg-btn[data-tab="patches"]', 'the Patches tab'), 'Patches');
  await ui.sleep(600);
  const row = ui.$('#library .lib-row.lib-patch');
  ui.check(!!row, 'the library has a patch to send');
  if (!row) return;
  const wrap = row.closest('.lib-row-wrap') || row.parentElement;
  const send = wrap.querySelector('[data-send-patch]');
  ui.check(!!send, 'the row has a Send control');
  if (!send) return;
  ui.click(send, 'Send to Seven');

  const svg = await ui.waitEl('.seven-modal svg.modal-panel', 'the chooser');
  if (!svg) return;
  const where = ui.$('.seven-modal .mp-where');
  const bankHit = svg.querySelector('[data-mp-bank]');
  for (let i = 0; i < 4 && svg.dataset.bank !== '3'; i += 1) {
    ui.click(bankHit, 'the BANK control');
    await ui.sleep(160);
  }
  ui.click(svg.querySelector('[data-mp-preset="5"] [data-mp-hit]'), 'preset 5');
  await ui.sleep(250);
  const chosen = where.textContent;
  ui.check(chosen === 'BANK 3 · PRESET 5', `the click chose 3/5 ("${chosen}")`);

  // THE EVENT NOBODY CAUSED. Recalling from the app is what the tail of a
  // previous transfer does; the instrument echoes it straight back.
  ui.note('recalling bank 2 preset 1 (0-based 1,0) with nobody touching the panel…');
  await window.sevenAPI.midi.recall(1, 0);
  await ui.sleep(1200);
  const after = where.textContent;
  ui.note(`after the echo: "${after}"  (svg says bank=${svg.dataset.bank} preset=${svg.dataset.preset})`);
  ui.check(after === chosen,
    `the chooser KEEPS the player's choice ("${chosen}" -> "${after}")`);
  ui.check(svg.dataset.bank === '3' && svg.dataset.preset === '5',
    `and so do the lamps (bank ${svg.dataset.bank}, preset ${svg.dataset.preset})`);

  const x = ui.$('.seven-modal-cancel');
  if (x) ui.click(x, 'close the chooser');
  await ui.waitFor(() => !ui.$('.seven-modal'), { timeout: 3000, what: 'the chooser to close' });
  ui.check(!ui.$('.seven-modal'), 'closed, and nothing was written');
})()
