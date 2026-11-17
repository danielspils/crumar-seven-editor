// @env SEVEN_UI_WATCH_BOOT=1
//
// F: THE FIRST THING THE APP SAYS MUST NOT BE FALSE.
//
// Reported from a dev-build session: launching with the Seven plugged in
// painted the app's full DISCONNECTED state for OVER A SECOND — "No
// instrument connected", a Connect button, empty lists, "Select a patch", no
// logo in the nav — while the instrument was attached and already being read.
//
// THE LOADER WAS ALREADY THE ANSWER and was arriving too late. It covers the
// window, so showing it by default hides the false state as well — one change
// for both halves. What made that possible without trading an app-flash for a
// loader-flash is that the main process CAN answer the connect question before
// the window loads: portPresent() reads port NAMES only, opens nothing and
// sends nothing.
//
// WHY THIS NEEDS SEVEN_UI_WATCH_BOOT. The runner normally waits for the boot
// loader to clear before starting a scenario — so a script that began
// afterwards would find the window correct however long it had been wrong.
// The same flag, and the same reason, as backup-offer.js.
//
// WHAT THIS SCENARIO DOES NOT PROVE, AND THE MUTATION THAT SAID SO.
//
// It CANNOT see the launch flash. A scenario's script runs after the document
// has loaded, so the earliest paints are long past. Measured rather than
// assumed: putting `hidden` back on #boot-loader — the exact bug, the loader
// arriving a beat late — and this file still PASSED.
//
// So read it as what it is: proof that the disconnected state is never
// readable WHILE THE LOADER IS UP, which is real and worth keeping, and not
// as proof that the flash is gone. The property that actually fixes the
// flash — that the loader is visible from the INITIAL HTML, with no script
// needed to show it — is static, and is asserted in test/css-hazards.test.js
// where a mutation does fail.
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };

  const loader = () => ui.$('#boot-loader');
  const up = () => {
    const el = loader();
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  // THE FLAG IS THE DECISION, and it is made before <body> is parsed.
  const flag = document.documentElement.getAttribute('data-seven-boot');
  ui.note(`data-seven-boot: ${flag === null ? '(absent — an instrument was seen)' : `"${flag}"`}`);
  ui.check(flag === null,
    'with an instrument attached the loader is NOT switched off before paint');

  // ---- WHAT IS ON SCREEN WHILE THE LOADER IS UP -------------------------
  //
  // The disconnected state is a set of real strings. If any of them is
  // READABLE — on screen, not behind the loader — while the instrument is
  // attached, the app is telling the player something false.
  const FALSE_CLAIMS = [
    'No instrument connected',
    'Select a patch',
  ];
  const seen = new Map();
  const t0 = performance.now();
  let samples = 0;
  while (up() && performance.now() - t0 < 20000) {
    samples += 1;
    // REACHABILITY, not presence. The disconnected markup legitimately EXISTS
    // behind the loader — that is the whole point of a cover — so asking
    // whether the text is in the DOM would fail on correct behaviour. What
    // matters is whether a person can read it, and the loader covering the
    // window is what decides that.
    const mid = document.elementFromPoint(
      Math.round(document.documentElement.clientWidth / 2),
      Math.round(document.documentElement.clientHeight / 2)
    );
    const covered = !!mid && !!mid.closest('#boot-loader');
    if (!covered) {
      const text = (document.body.textContent || '').replace(/\s+/g, ' ');
      for (const claim of FALSE_CLAIMS) {
        if (text.includes(claim) && !seen.has(claim)) {
          seen.set(claim, Math.round(performance.now() - t0));
        }
      }
    }
    await ui.sleep(16);
  }
  const upFor = Math.round(performance.now() - t0);
  ui.note(`the loader was up for ${upFor}ms across ${samples} samples`);
  ui.note(seen.size
    ? `FALSE CLAIMS READABLE: ${[...seen].map(([c, ms]) => `"${c}" at ${ms}ms`).join(', ')}`
    : 'no disconnected-state text was ever readable while the loader was up');

  ui.check(seen.size === 0,
    'the app never showed its disconnected state while an instrument was being read'
    + (seen.size ? ` — ${[...seen.keys()].join(', ')}` : ''));
  ui.check(samples > 0,
    'the loader was actually up to watch — otherwise this tested nothing');

  // ---- AND AFTERWARDS THE APP IS THE APP --------------------------------
  await ui.waitFor(() => !up(), { timeout: 20000, what: 'the loader to clear' });
  const mid = document.elementFromPoint(
    Math.round(document.documentElement.clientWidth / 2),
    Math.round(document.documentElement.clientHeight / 2)
  );
  ui.check(!!mid && !mid.closest('#boot-loader'),
    'and the window belongs to the app once the read has landed');
})()
