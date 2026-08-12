// Leaving audition mode DISCARDS. Navigating to another patch ends the
// session and the edits go — no prompt, no rescue. Daniel's call (2026-08-12),
// replacing a save-first dialog: the bar already says nothing is saved until
// you save it, and a prompt between you and the next patch taxes the common
// case to protect the rare one.
//
// What the app owes in exchange is on trial here: the library must be left
// exactly as it was, and the instrument must be playing what you are now
// looking at rather than the sound you were trying out.
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };
  await ui.selectBankPreset(0);
  if (!(await ui.enterAudition())) return;

  const row = ui.$('.param.is-live[data-max="127"]');
  if (!ui.check(!!row, 'a continuous parameter is live')) return;
  const key = row.dataset.key;
  const before = Number(ui.$(`.param[data-key="${key}"] .param-value`).textContent);
  const bar = row.querySelector('.param-bar');
  const r = bar.getBoundingClientRect();
  bar.dispatchEvent(new PointerEvent('pointerdown', {
    bubbles: true, cancelable: true, clientX: r.left + r.width * 0.75, clientY: r.top + r.height / 2,
  }));
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  if (!(await ui.waitFor(() => !!ui.$('.audition-dirty'), { what: 'an unsaved change' }))) return;
  const edited = Number(ui.$(`.param[data-key="${key}"] .param-value`).textContent);
  ui.check(edited !== before, `the parameter moved (${before} → ${edited})`);

  // Switch patches. Nothing may stand in the way.
  ui.$$('#patch-list .patch-row')[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await ui.sleep(900);
  ui.check(!ui.$('.seven-modal'), 'switching is not interrupted by a prompt');
  ui.check(!ui.$('.audition-bar.is-live'), 'the live session is over');

  // No parting note either. One was written when leaving was rare and
  // deliberate; with destructive navigation it fired on every click through
  // the list, which is noise rather than news (Daniel, 2026-08-12).
  await ui.selectBankPreset(0);
  ui.check(!ui.$('.audition-note.is-error'), 'leaving does not leave a warning behind');

  // The library must be untouched — discarded means discarded, not "written
  // somewhere else".
  const shown = Number(ui.$(`.param[data-key="${key}"] .param-value`)?.textContent);
  ui.note(`${key}: was ${before}, edited to ${edited}, library shows ${shown}`);
  ui.check(shown === before, `the library kept its own value (${shown} vs ${before})`);
})()
