// The "entering audition mode" message must always go away. It once stayed on
// screen forever whenever the send never started.
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };
  await ui.selectBankPreset(0);
  const bar = ui.$('.param:not(.is-live) .param-bar');
  if (!ui.check(!!bar, 'a parameter bar is present')) return;

  ui.click(bar, 'parameter bar');
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
