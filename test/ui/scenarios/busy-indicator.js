// The "entering audition mode" message must always go away. It once stayed on
// screen forever whenever the send never started.
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };
  // A BANK preset is a recall — one message, nothing to wait for. The wait
  // this indicator exists for is loading a patch from the library, which sends
  // the sound and 110 values.
  await ui.openLibrary();
  const row = await ui.waitEl('#library .lib-row.lib-patch', 'a library patch');
  if (!ui.check(!!row, 'a library patch to load')) return;

  ui.click(row, 'a library patch');
  await ui.waitFor(() => !!ui.$('#undo-toast.is-busy.shown'), { timeout: 3000, what: 'the busy indicator' });
  const el = ui.$('#undo-toast');
  const box = el.getBoundingClientRect();
  const dx = Math.abs((box.left + box.width / 2) - innerWidth / 2);
  const dy = Math.abs((box.top + box.height / 2) - innerHeight / 2);
  ui.check(dx < 2 && dy < 2, `the busy indicator is centred (off by ${Math.round(dx)},${Math.round(dy)})`);

  await ui.waitFor(ui.live, { what: 'audition mode' });
  await ui.waitFor(() => !ui.$('#undo-toast.shown'), { timeout: 4000, what: 'the busy indicator to clear' });
  ui.check(!ui.$('#undo-toast.shown'), 'the busy indicator cleared once live');
})()
