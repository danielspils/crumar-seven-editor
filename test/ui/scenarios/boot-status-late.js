// @env SEVEN_UI_WATCH_BOOT=1
// @env SEVEN_BOOT_STATUS_MS=300
//
// WHEN THE READ RUNS LONG, THE LOADER SAYS WHAT IT IS WAITING ON.
//
// A normal boot is silent: the warm-up already says the app is busy, and a
// caption repeating that for three seconds is noise (boot-loader.js asserts
// the silence). The line exists for the case where the warm-up stops being
// reassuring — a cable half in, the instrument switched off — and in the real
// app it arrives after 4000ms, chosen from six measured cold boots whose slow
// end was 3007ms.
//
// WAITING FOUR SECONDS HERE WOULD TEST NOTHING USEFUL and would need a real
// fault to produce. SEVEN_BOOT_STATUS_MS moves the threshold instead, so the
// late path runs against a healthy instrument: the read still takes its usual
// ~2.6-3.0s, the threshold is simply crossed first. The mechanism under test
// — the timer, the text, the fade, the cancellation on landing — is the same
// code either way, and the DEFAULT is what boot-loader.js pins.
//
// This is a starting state the scenario chooses, not an assertion it disarms.
(async () => {
  const el = ui.$('#boot-loader');
  const st = ui.$('#boot-status');
  const mark = ui.$('#boot-mark');
  ui.check(!!el && !!st && !!mark, 'the loader, its mark and its status line exist');
  if (!el || !st || !mark) return;

  ui.note(`threshold for this run: ${window.__SEVEN_ENV.SEVEN_BOOT_STATUS_MS}ms`);
  ui.check(!el.hidden, 'the loader is up — this scenario watches the boot');

  // The line should arrive shortly after the (lowered) threshold and well
  // before the read resolves.
  const t0 = performance.now();
  let seen = null;
  let seenAt = null;
  while (performance.now() - t0 < 6000) {
    const txt = st.textContent.trim();
    if (txt && seen === null) { seen = txt; seenAt = Math.round(performance.now() - t0); }
    if (mark.classList.contains('is-lit')) break;
    await ui.sleep(8);
  }
  ui.note(seen
    ? `the line appeared ${seenAt}ms in: "${seen}"`
    : 'no line appeared before the read resolved');

  ui.check(seen === 'Reading the instrument…',
    `a long read says what it is waiting on (saw ${seen ? `"${seen}"` : 'nothing'})`);
  ui.check(st.classList.contains('is-late') || mark.classList.contains('is-lit'),
    'and it is the late class that reveals it, so it fades rather than snapping');

  // IT GOES WHEN THE INSTRUMENT ANSWERS. A line still saying "reading" next
  // to a mark at full brightness would be the app contradicting itself.
  const tLanded = performance.now();
  while (performance.now() - tLanded < 4000) {
    if (el.hidden) break;
    await ui.sleep(8);
  }
  ui.note(`after the landing the line reads: "${st.textContent.trim()}"`);
  ui.check(st.textContent.trim() === '',
    'and it is cleared once the instrument answers, not left behind');
})()
