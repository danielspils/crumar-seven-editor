// A live edit reaches the instrument and the panel shows what the device
// ECHOED — not what was asked for.
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };
  await ui.selectBankPreset(0);
  if (!(await ui.enterAudition())) return;

  const row = ui.$('.param.is-live[data-max="127"]');
  ui.check(!!row, 'a continuous parameter is live');
  if (!row) return;
  const key = row.dataset.key;
  const before = Number(row.querySelector('.param-value').textContent);
  const bar = row.querySelector('.param-bar');
  const r = bar.getBoundingClientRect();

  // Press a quarter of the way along: 127 * 0.25 rounds to 32.
  bar.dispatchEvent(new PointerEvent('pointerdown', {
    bubbles: true, cancelable: true, clientX: r.left + r.width * 0.25, clientY: r.top + r.height / 2,
  }));
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  await ui.waitFor(
    () => ui.$(`.param[data-key="${key}"] .param-value`).textContent !== String(before),
    { what: 'the value to change' }
  );
  const after = Number(ui.$(`.param[data-key="${key}"] .param-value`).textContent);
  ui.note(`${key}: ${before} -> ${after}`);
  ui.check(Math.abs(after - 32) <= 1, `${key} landed near the pressed position (got ${after})`);
  ui.check(!!ui.$('.audition-dirty'), 'the bar marks unsaved changes');

  // The instrument agrees with the screen.
  const read = await window.sevenAPI.midi.readParam(key);
  ui.check(read.ok && read.value === after, `the Seven reports ${read.value}, the panel shows ${after}`);
})()
