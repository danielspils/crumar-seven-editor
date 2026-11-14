// LEAVING A CHANGED PATCH ASKS FIRST. Leaving an unchanged one still does not.
//
// The old contract was simpler and is gone: navigating away discarded, always,
// with no prompt and no rescue (Daniel's call, 2026-08-12, replacing a
// save-first dialog — "a prompt between you and the next patch taxes the
// common case to protect the rare one"). That decision deferred a warning
// "until it bites".
//
// IT BIT. Daniel lost two patches on 13 Nov 2026, walking out of a patch
// looking for a save control while the edits he was looking for went with the
// click. So the rare case is no longer rare enough, and the dialog is back —
// but only where it is earned (out/save-what-you-hear.md §5).
//
// Both halves are on trial here, and the second one is the one that keeps the
// 2026-08-12 reasoning alive: browsing must still be untolled.
//
// What the app owed in exchange it still owes: discard means the library is
// left exactly as it was, and the instrument plays what you are now looking at
// rather than the sound you were trying out.
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };

  // ── UNCHANGED: nothing stands in the way ────────────────────────────────
  //
  // FIRST, deliberately. Asserted before anything has been edited, so a quiet
  // pass here cannot be the leftovers of a dialog that was dismissed earlier.
  await ui.selectBankPreset(0);
  await ui.sleep(700);
  ui.$$('#patch-list .patch-row')[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await ui.sleep(900);
  ui.check(!ui.$('.seven-modal'),
    'with nothing changed, browsing is untolled — no dialog at all');

  // ── CHANGED: it asks ────────────────────────────────────────────────────
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
  // The save controls waking up is what "unsaved" looks like now — the dot
  // was removed once loading a sound counted as an edit too (2026-08-13).
  if (!(await ui.waitFor(() => !!ui.$('.audition-bar.is-live'), { what: 'an unsaved change' }))) return;
  const edited = Number(ui.$(`.param[data-key="${key}"] .param-value`).textContent);
  ui.check(edited !== before, `the parameter moved (${before} → ${edited})`);

  // Switch patches. NOW something stands in the way.
  ui.$$('#patch-list .patch-row')[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  if (!(await ui.waitFor(() => !!ui.$('.seven-modal'), { what: 'the save dialog' }))) return;
  const dialog = ui.$('.seven-modal');
  const title = dialog.querySelector('.seven-modal-title').textContent.trim();
  ui.note(`it asks: "${title}"`);
  ui.check(title === 'You have unsaved changes',
    `the dialog names what is at stake (${title})`);

  // THE OVERWRITE ROW IS PRESENT, because something HAS changed — and it asks
  // for the hold, because the app cannot write a slot on the Seven at all.
  const rows = [...dialog.querySelectorAll('.sv-row')];
  ui.note(`rows offered: ${rows.map((x) => x.querySelector('.sv-row-t').textContent).join(' · ')}`);
  ui.check(rows.length === 2, `both destinations are offered (${rows.length})`);
  ui.check(rows.some((x) => /Hold the button on the Seven/.test(x.textContent)),
    'and the instrument row says the HOLD is what does it');

  // ── DISCARD AND LEAVE ───────────────────────────────────────────────────
  //
  // The deliberate press, never an Escape: discarding is the one move here
  // that cannot be walked back.
  const leave = dialog.querySelector('.seven-modal-deny');
  ui.check(!!leave && /Discard changes and leave/.test(leave.textContent),
    'leaving is its own, named button');
  if (!leave) return;
  ui.click(leave, 'Discard changes and leave');
  await ui.sleep(900);

  ui.check(!ui.$('.seven-modal'), 'the dialog is gone');
  ui.check(!ui.$('.audition-bar.is-live'), 'the live session is over');

  // No parting note either. One was written when leaving was rare and
  // deliberate; with destructive navigation it fired on every click through
  // the list, which is noise rather than news (Daniel, 2026-08-12). The
  // dialog has now said it to his face, so a note afterwards says it twice.
  await ui.selectBankPreset(0);
  ui.check(!ui.$('.audition-note.is-error'), 'leaving does not leave a warning behind');

  // The library must be untouched — discarded means discarded, not "written
  // somewhere else". This is the half the dialog does NOT change: choosing to
  // discard has to discard.
  const shown = Number(ui.$(`.param[data-key="${key}"] .param-value`)?.textContent);
  ui.note(`${key}: was ${before}, edited to ${edited}, library shows ${shown}`);
  ui.check(shown === before, `the library kept its own value (${shown} vs ${before})`);
})()
