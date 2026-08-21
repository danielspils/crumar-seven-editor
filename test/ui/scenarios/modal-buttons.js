// @env SEVEN_NO_DEVICE=1
//
// THE TWO OPTIONAL MODAL BUTTONS, clicked for real.
//
//   .seven-modal-second  — rendered only when secondaryLabel is passed
//   .seven-modal-deny    — rendered only when denyLabel is passed
//
// Both are branches of the modal's own click router, and neither had ever been
// clicked by a test. Their real call sites need a connected Seven — the
// transfer walk passes "Stop", the unsaved-edits dialog passes "Save a copy" —
// which is why they sat uncovered.
//
// THEY DO NOT NEED ONE. SevenModal is a component: hand it the labels, and a
// genuine button appears on screen and takes a genuine click. That is what is
// asserted here — the button exists, and it resolves the value its call site
// depends on.
//
// What this CANNOT prove is that anything ever passes those labels. Each has
// exactly one caller; delete it and both buttons vanish from the app with this
// scenario still green. That half is a question about SOURCE, not about a
// device, and it is asserted in test/modal-callers.test.js — which runs on
// `npm test`, while this file only runs when somebody types the second command.
(async () => {
  const btn = (cls) => ui.$(`.seven-modal ${cls}`);
  const gone = () => !ui.$('.seven-modal');

  // ── secondaryLabel → "secondary" ────────────────────────────────────────
  //
  // The value matters as much as the click: audition.js branches on the string
  // 'secondary' to save a copy instead of overwriting. Resolve `true` here and
  // somebody's patch is overwritten when they asked for a copy.
  let answer = SevenModal.confirm({
    title: 'Save “Test Patch”',
    body: 'Overwrite this patch, or keep it and save your changes as a copy?',
    confirmLabel: 'Overwrite patch',
    secondaryLabel: 'Save a copy',
    cancelLabel: 'Cancel',
  });
  await ui.waitFor(() => !!btn('.seven-modal-second'), { timeout: 3000, what: 'the secondary button' });
  ui.check(!!btn('.seven-modal-second'), 'secondaryLabel renders a button of its own');
  ui.note(`secondary reads: "${btn('.seven-modal-second').textContent.trim()}"`);

  ui.click(btn('.seven-modal-second'), 'Save a copy');
  const secondary = await answer;
  ui.check(secondary === 'secondary',
    `it resolves the string its caller branches on, not true (${JSON.stringify(secondary)})`);
  await ui.waitFor(gone, { timeout: 2000, what: 'the modal to close' });
  ui.check(gone(), 'and the modal closes behind it');

  // ── denyLabel → false, the same as dismissing ───────────────────────────
  //
  // "Stop" during the transfer walk is a step in the task, not an escape from
  // a dialog — but it must answer exactly what the corner X answers, or the
  // walk would treat stopping as consent to continue.
  answer = SevenModal.confirm({
    title: 'Hold preset 1 on Bank 2',
    body: 'Hold the preset button for three seconds.',
    confirmLabel: 'Held it — next',
    denyLabel: 'Stop',
    cancelLabel: 'Stop',
    tone: 'is-transfer',
  });
  await ui.waitFor(() => !!btn('.seven-modal-deny'), { timeout: 3000, what: 'the deny button' });
  ui.check(!!btn('.seven-modal-deny'), 'denyLabel renders a button beside the action');
  ui.note(`deny reads: "${btn('.seven-modal-deny').textContent.trim()}"`);

  // Focus stays on the action here — measured, and correct: a deny button
  // alone does not move it. `defaultDeny` is the separate switch that does,
  // and it is asserted below.
  ui.note(`focus starts on: ${document.activeElement && document.activeElement.className}`);

  ui.click(btn('.seven-modal-deny'), 'Stop');
  const denied = await answer;
  ui.check(denied === false,
    `deny answers exactly what dismissing answers (${JSON.stringify(denied)})`);
  await ui.waitFor(gone, { timeout: 2000, what: 'the modal to close' });
  ui.check(gone(), 'and closes');

  // ── defaultDeny: Enter must not mean yes ────────────────────────────────
  //
  // The real safety property behind the deny button. On a dialog that ends in
  // a write to somebody's instrument, the keyboard must not start on the
  // destructive answer — the same defence the OS dialog used to give for free
  // by defaulting to Cancel.
  answer = SevenModal.confirm({
    title: 'Send to the Seven',
    body: 'This overwrites the preset.',
    confirmLabel: 'Send',
    denyLabel: 'Stop',
    cancelLabel: 'Stop',
    defaultDeny: true,
  });
  await ui.waitFor(() => !!btn('.seven-modal-deny'), { timeout: 3000, what: 'the deny button' });
  const focused = document.activeElement;
  ui.note(`with defaultDeny, focus starts on: ${focused && focused.className}`);
  ui.check(!!focused && focused.classList.contains('seven-modal-deny'),
    'focus starts on Stop, not on the button that writes to the instrument');

  // And Enter, from there, must not confirm.
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await ui.sleep(300);
  ui.check(!gone() , 'Enter does not confirm a defaultDeny dialog');
  ui.click(btn('.seven-modal-deny'), 'Stop');
  ui.check(await answer === false, 'and Stop still answers no');
  await ui.waitFor(gone, { timeout: 2000, what: 'the modal to close' });

  // ── neither appears unasked ─────────────────────────────────────────────
  //
  // The same router, with no optional labels: a stray button here would put
  // "Save a copy" on a dialog that has nothing to copy.
  answer = SevenModal.confirm({
    title: 'Plain question',
    body: 'Yes or no.',
    confirmLabel: 'Yes',
    cancelLabel: 'Close',
  });
  await ui.waitFor(() => !!ui.$('.seven-modal'), { timeout: 3000, what: 'the plain modal' });
  ui.check(!btn('.seven-modal-second'), 'no secondaryLabel, no secondary button');
  ui.check(!btn('.seven-modal-deny'), 'no denyLabel, no deny button');
  ui.click(btn('.seven-modal-cancel'), 'the corner close');
  await answer;
})()
