// The Sounds modal can never stack. A measurement once reported its contents
// twice — one modal or two was never established — so the builder refuses to
// create a second while one is open. This drives the real path: the Settings
// row, clicked twice the way a double-click or a doubly-bound listener would.
(async () => {
  const modals = () => ui.$$('.seven-modal.is-expansions').length;
  const bodies = () => ui.$$('.exp-modal').length;

  ui.click(await ui.waitEl('#settings-button', 'the Settings button'), 'Settings');
  const row = await ui.waitEl('#settings-panel .set-row.set-link', 'the Sounds row');
  if (!ui.check(/Sounds/.test(row.textContent), `the row is the Sounds row (${row.textContent.trim()})`)) return;

  ui.click(row, 'Sounds');
  await ui.waitFor(() => modals() === 1, { what: 'the Sounds modal' });
  ui.check(bodies() === 1, `one modal body (${bodies()})`);

  // Ask again while it is open — what a doubly-bound handler would do.
  const before = modals();
  await window.sevenAPI.midi.status(); // a tick, so the second ask is not coalesced
  document.querySelector('#settings-button').click();
  await ui.sleep(200);
  const stillOne = modals();
  ui.check(stillOne === before, `still one modal after a second ask (${stillOne})`);
  ui.check(bodies() === 1, `still one body (${bodies()})`);
  ui.note(`modals: ${stillOne}, bodies: ${bodies()}`);

  // Put the window back: a scenario that leaves a modal open blocks every
  // scenario after it in the suite, which is how this one first appeared to
  // hang the whole run.
  const close = ui.$('.seven-modal.is-expansions .seven-modal-ok')
    || ui.$('.seven-modal.is-expansions .seven-modal-cancel');
  if (close) ui.click(close, 'Close');
  await ui.waitFor(() => modals() === 0, { what: 'the modal to close' });
})()
