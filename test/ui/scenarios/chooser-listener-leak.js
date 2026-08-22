// THE CHOOSER PUTS ITS LISTENER BACK.
//
// chooseDestination registers a program-change listener so the panel can
// follow the instrument. For as long as that existed it was never removed —
// `onEvent` was a bare `ipcRenderer.on` with no unsubscribe at all, so there
// was nothing to call. One listener per opening, for the life of the session.
//
// A leak is invisible by construction: nothing misbehaves at the moment it
// happens, and by the time anything does the cause is hours behind. The only
// thing that stops it recurring is something that can COUNT, which is why
// preload exposes listenerCount — a Set of renderer callbacks behind one
// ipcRenderer listener that is registered once and never removed.
//
// Ten opens is Daniel's number, and it is a good one: Node's default
// MaxListeners warning is 10, so a leak of this shape historically announced
// itself just past here — in a console nobody was reading.
//
// NO INSTRUMENT NEEDED. This counts registrations, and registering does not
// require anything to be plugged in.
(async () => {
  const count = () => window.sevenAPI.midi.listenerCount();
  ui.check(typeof count() === 'number', `listenerCount answers (${count()})`);
  const base = count();
  ui.note(`the app's own standing listeners: ${base}`);

  // ── the API keeps its promise ──────────────────────────────────────────
  const offs = [];
  for (let i = 0; i < 10; i += 1) offs.push(window.sevenAPI.midi.onEvent(() => {}));
  ui.note(`after 10 registrations: ${count()}`);
  ui.check(count() === base + 10, `ten listeners are ten listeners (${count()})`);
  for (const off of offs) off();
  ui.check(count() === base, `and they all come off again (${count()} back to ${base})`);

  // Unsubscribing twice must not eat somebody else's listener.
  const off = window.sevenAPI.midi.onEvent(() => {});
  off(); off(); off();
  ui.check(count() === base, `unsubscribing three times removes one (${count()})`);

  // ── AND THE CHOOSER USES IT, ten times over ────────────────────────────
  //
  // Driven through the real control rather than by calling onEvent, because
  // what leaked was not the API — it was a caller that had nothing to call.
  // Closed with the X every time, so nothing is ever sent.
  // The Send control refuses to open the chooser without an instrument, so the
  // second half needs one connected — a precondition this scenario cannot
  // arrange. The half above has already run and already asserted.
  if (!(await ui.requireDevice())) {
    return { skipped: 'no instrument attached — the Send control cannot open the chooser' };
  }
  await ui.openLibrary();
  await ui.sleep(400);
  ui.click(await ui.waitEl('.seg-btn[data-tab="patches"]', 'the Patches tab'), 'Patches');
  await ui.sleep(600);
  const row = ui.$('#library .lib-row.lib-patch');
  if (!row) { ui.check(false, 'the library has a patch to send'); return; }
  const send = (row.closest('.lib-row-wrap') || row.parentElement)
    .querySelector('[data-send-patch]');
  if (!send) { ui.check(false, 'the row has a Send control'); return; }

  const before = count();
  let opened = 0;
  for (let i = 0; i < 10; i += 1) {
    ui.click(send, `Send to Seven (${i + 1}/10)`);
    const svg = await ui.waitFor(() => ui.$('.seven-modal svg.modal-panel'),
      { timeout: 3000, what: 'the chooser' });
    if (!svg) break;           // no instrument: the flow toasts instead
    opened += 1;
    ui.click(ui.$('.seven-modal-cancel'), 'the X');
    await ui.waitFor(() => !ui.$('.seven-modal'), { timeout: 3000, what: 'it to close' });
  }
  ui.note(`opened and closed the chooser ${opened} times · listeners ${before} → ${count()}`);
  ui.check(opened === 10, `all ten openings happened (${opened})`);
  ui.check(count() === before,
    `and the count is exactly where it started (${before} → ${count()})`);
})()
