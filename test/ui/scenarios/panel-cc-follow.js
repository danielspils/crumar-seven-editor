// onPanelCc — THE ONE PATH NOTHING CAN AUTOMATE.
//
// It answers "the player just touched the panel", so producing the input needs
// a hand on the instrument. Everything either side of that is checked here.
//
//   SEVEN_UI_SIGNAL=/tmp/seven-signal npm run test:ui panel-cc-follow
//   …then turn the knob, and: echo go > /tmp/seven-signal
//
// WHAT IT GUARDS. While a patch is live, the app's copy of a parameter must
// follow what the INSTRUMENT reports, not what the app last sent — the panel is
// the truth about the edit buffer. And a change the player made must count as
// UNSAVED WORK, because the alternative is saving a patch that quietly disagrees
// with the instrument it came from. That reconciliation is where a wrong answer
// overwrites somebody's patch.
//
// Treble (veq_trb, CC 13) because it is one of only 25 parameters that announce
// a CC at all, and the EQ belongs to every patch whatever engine is loaded.
// Nothing here is stored: the edit buffer holds it until a preset is recalled,
// and no save runs.
(async () => {
  const KEY = 'veq_trb';
  const valueOf = () => {
    const row = ui.$(`.param[data-key="${KEY}"] .param-value`);
    return row ? row.textContent.trim() : null;
  };
  const saveBtn = () => ui.$('#save-live-btn');
  const dirty = () => {
    const b = saveBtn();
    return !!b && !b.disabled;
  };

  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };

  // Get a patch live. Selecting a bank preset recalls it, and the buffer then
  // holds exactly what is on screen — which is the one condition editing needs.
  await ui.openLibrary();
  if (!(await ui.selectBankPreset(0))) return;
  const isLive = await ui.enterAudition();
  if (!ui.check(isLive, 'a patch is live, so the panel and the screen agree')) return;

  const before = valueOf();
  if (!ui.check(before !== null, `the ${KEY} row is on screen (value: ${before})`)) return;
  ui.note(`Treble reads ${before} before you touch it`);

  // If it is already dirty the test cannot tell an old edit from the one it is
  // about to ask for. Say so rather than reporting a pass that means nothing.
  if (dirty()) {
    ui.check(false,
      'this patch already has unsaved edits — recall a preset to clear them, then re-run');
    return;
  }

  const got = await ui.waitForHuman(
    `TURN THE TREBLE KNOB on the Seven, a good amount (it is CC 13). ` +
    `Nothing is stored. Then signal.`,
    { timeout: 180000 }
  );
  if (!got) {
    ui.note('skipped: no signal arrived — set SEVEN_UI_SIGNAL and write to it');
    return;
  }

  // onPanelCc debounces by 80ms and then reads the parameter back off the
  // instrument, so give the round trip room without making it a fixed sleep.
  await ui.waitFor(() => valueOf() !== before, { timeout: 5000, what: 'the value to follow the panel' });

  const after = valueOf();
  // Recorded as a NOTE, not only inside the check: a passing check prints
  // nothing, so a green run would say the app followed the panel without ever
  // showing the numbers it followed it to. "Measure, don't eyeball" applies to
  // the test's own output.
  ui.note(`Treble: ${before} → ${after} after your turn`);
  ui.check(after !== before,
    `the app followed the panel rather than its own last value (${before} → ${after})`);
  ui.check(dirty(),
    'and counted it as unsaved work — a player edit the library does not have yet');

  // The value must be what the INSTRUMENT says, not a guess: onPanelCc reads
  // the parameter back rather than trusting the CC's own data byte, because a
  // CC is 7-bit and this parameter is not.
  const readBack = await window.sevenAPI.midi.readParam(KEY);
  ui.note(`the Seven itself reports ${readBack && readBack.value}`);
  ui.check(readBack && readBack.ok && String(readBack.value) === after,
    `the displayed value is the one the Seven reports (screen: ${after}, device: ${readBack && readBack.value})`);
})()
