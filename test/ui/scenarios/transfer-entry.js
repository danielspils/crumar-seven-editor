// "Send to Seven" on a setlist opens the BANK CHOOSER, on the panel.
// Stops before the confirm: past that point the instrument is really written.
//
// This was four green buttons labelled Bank 1-4, and this scenario asserted
// their labels, their disabled state and which one took focus. All of that is
// gone — the question is now asked by the instrument's own bank control, which
// cycles — so what it asserts is the same PROPERTIES on the new surface:
//
//   the chooser opens from the setlist's own header
//   Bank 1 can be landed on, cannot be sent to, and says why
//   the action stays dim until there is somewhere to send
//   leaving writes nothing
//
// The reason it still needs a real Seven is the entry point, not the panel:
// sendSetlist refuses to open the chooser at all without one.
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

  const svg = modal.querySelector('svg.modal-panel');
  ui.check(!!svg, 'IT IS THE PANEL, not four generic buttons');
  if (!svg) { ui.click(ui.$('.seven-modal-cancel'), 'close'); return; }
  const next = modal.querySelector('.seven-modal-ok');
  const lamps = () => [...svg.querySelectorAll('[id^="mp-led-bank-"].on')].map((e) => e.id.slice(-1)).join('');
  const cap = () => svg.querySelector('[data-mp-cap="bank"]').textContent;

  // ONE QUESTION. A setlist fills a whole bank, so there is no preset to pick
  // and no bracket asking for one.
  ui.check(!svg.querySelector('[data-mp-cap="preset"]'), 'no preset is asked for');
  ui.check(svg.querySelector('.mp-heading').textContent === 'SELECT BANK', 'it asks for a bank');
  ui.check(lamps() === '', `nothing is lit before anything is chosen (${lamps() || 'none'})`);
  ui.check(cap() === 'Bank: —', `and the bracket says so ("${cap()}")`);
  ui.check(next.disabled, 'the action is dim with nowhere to send');
  ui.note(`focus starts on: ${document.activeElement && document.activeElement.className}`);

  // ── CYCLE TO BANK 1: shown, landable, not a destination ────────────────
  //
  // Leaving Bank 1 out of the cycle raised the question of whether it existed
  // at all. The instrument's own button passes through it, so this one does
  // too — and then says why it cannot be used (Daniel, 2026-08-14 and
  // 2026-08-22).
  const hit = svg.querySelector('[data-mp-bank]');
  const seen = [];
  for (let i = 0; i < 4 && lamps() !== '1'; i += 1) {
    ui.click(hit, 'the BANK control');
    await ui.sleep(200);
    seen.push(lamps() || '-');
  }
  ui.note(`pressed to reach Bank 1: ${seen.join(' → ')}`);
  ui.check(lamps() === '1', `Bank 1 lights, because the instrument can be there (${lamps()})`);
  ui.check(/factory presets/.test(modal.textContent), 'it says why Bank 1 cannot be chosen');
  ui.check(next.disabled, 'and the action stays dim on it');

  // ── AND ON TO ONE THAT CAN BE WRITTEN ──────────────────────────────────
  ui.click(hit, 'the BANK control');
  await ui.sleep(220);
  ui.check(lamps() === '2', `it moves on to Bank 2 (${lamps()})`);
  ui.check(cap() === 'Bank: 2', `the bracket follows ("${cap()}")`);
  ui.check(!next.disabled, 'and NOW the action is live');
  ui.check(svg.querySelectorAll('[data-mp-preset] .led.on').length === 8,
    'the whole row lights: every preset in it is about to be written');

  // Leave without sending anything.
  ui.click(ui.$('.seven-modal-cancel'), 'the chooser close button');
  await ui.waitFor(() => !ui.$('.seven-modal'), { what: 'the chooser to close' });
  ui.check(!ui.$('.seven-modal'), 'declining closes it and writes nothing');
})()
