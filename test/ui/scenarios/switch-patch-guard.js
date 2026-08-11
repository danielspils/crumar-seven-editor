// Switching patches with unsaved edits offers to save them, and saving keeps
// the values on this computer.
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };
  await ui.selectBankPreset(0);
  if (!(await ui.enterAudition())) return;

  const row = ui.$('.param.is-live[data-max="127"]');
  if (!ui.check(!!row, 'a continuous parameter is live')) return;
  const key = row.dataset.key;
  const bar = row.querySelector('.param-bar');
  const r = bar.getBoundingClientRect();
  bar.dispatchEvent(new PointerEvent('pointerdown', {
    bubbles: true, cancelable: true, clientX: r.left + r.width * 0.75, clientY: r.top + r.height / 2,
  }));
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  if (!(await ui.waitFor(() => !!ui.$('.audition-dirty'), { what: 'an unsaved change' }))) return;
  const edited = Number(ui.$(`.param[data-key="${key}"] .param-value`).textContent);

  // Now switch patches: the app must ASK rather than discard.
  ui.$$('#patch-list .patch-row')[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  const asked = await ui.waitFor(() => !!ui.$('.seven-modal'), { timeout: 4000, what: 'the save-first prompt' });
  ui.check(asked, 'switching with unsaved edits asks first');
  if (!asked) return;
  ui.check(!!ui.$('.seven-modal-second'), 'the prompt offers switching without saving too');
  ui.$('.seven-modal-ok').click();       // "Save, Then Switch"
  await ui.waitFor(() => !ui.$('.seven-modal'), { what: 'the prompt to close' });
  await ui.sleep(1200);

  // Back to the first patch: the saved value must be what was edited.
  await ui.selectBankPreset(0);
  const shown = Number(ui.$(`.param[data-key="${key}"] .param-value`)?.textContent);
  ui.note(`${key}: edited ${edited}, library now ${shown}`);
  ui.check(shown === edited, `the edit was saved to the library (${shown} vs ${edited})`);
})()
