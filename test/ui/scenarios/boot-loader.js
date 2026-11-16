// @env SEVEN_UI_WATCH_BOOT=1
//
// THE BOOT LOADER, WITH AN INSTRUMENT ATTACHED.
//
// THE DECLARATION ABOVE IS WHY THIS FILE CAN SEE ITS SUBJECT. The runner
// waits for the loader to clear before starting a scenario, because every
// other scenario needs an app it can click. This one needs the opposite, and
// says so in its own source rather than relying on a race.
//
// Launching with a Seven attached reads it for a measured median of 2072ms
// (CLAUDE.md, 15 Nov 2026), and the window used to be blank for all of it.
// The mark warms up like a bulb and reaches full only when the read lands.
//
// THE HARD PART OF TESTING THIS is that the thing under test is over before a
// scenario can look at it: the runner's script runs after the renderer is up,
// by which time the connect has usually finished. So this checks the two
// things that survive — that the loader is GONE and left nothing behind — and
// then drives the overlay itself to check the states it passes through.
//
// Driving it directly is honest here and would not be for the climb: the
// brightness curve is pure CSS with no JS deciding anything, so re-showing the
// overlay exercises exactly the code and the rules a boot does. What it cannot
// prove is the WIRING — that a real connect calls it — and
// test/source-wiring.test.js carries that half, as it does for every click
// whose handler discards its result.
//
// IT DOES NOT CALL requireDevice. The states below are CSS and DOM and need
// no instrument, so gating the whole file on hardware would mean the design
// went unchecked on every run without a Seven on the desk — which is most of
// them, and was this one. Only the part that can only be true after a REAL
// read is gated, and it says so where it is gated.
(async () => {
  const px = (n) => Math.round(n * 10) / 10;

  const el = () => ui.$('#boot-loader');
  const mark = () => ui.$('#boot-mark');
  const status = () => ui.$('#boot-status');

  ui.check(!!el(), 'the boot loader markup exists in the document');
  if (!el()) return;

  // ---- 1. IT IS GONE, and it does not persist ----------------------------
  //
  // THE FIRST VERSION ASSUMED THE READ WAS ALREADY OVER, and with an
  // instrument attached it is not. Measured 16 Nov 2026 on the first real
  // hardware run: the scenario found the loader UP at 1147x687 with the
  // window's centre belonging to the logo path, because the runner starts the
  // script as soon as the renderer is ready and the connect takes ~2.1s. The
  // test was wrong, not the loader — but "still up" and "stuck up" are the
  // same observation at one instant, and only one of them is a bug.
  //
  // So it WAITS, and the wait is the measurement. A loader that never goes
  // fails here with a number saying how long it was given.
  const startedUp = !el().hidden;
  const t0 = performance.now();
  let waited = 0;
  // WHERE ON THE CURVE DID THE READ LAND? The climb is a CSS animation, so it
  // carries its own clock: getAnimations()[].currentTime is how far into the
  // 3.6s it had travelled. Sampled until the landing cancels it — the last
  // value before `animation: none` empties the list IS the point the
  // instrument answered at. This is the one number that says whether the
  // curve was shaped correctly against the measured 2072ms read, and it can
  // only be taken during a real boot.
  //
  // AND WHAT THE LOADER COSTS A BOOT. Four moments, on one clock — the two
  // figures reported before were on DIFFERENT clocks (the animation's own
  // currentTime against time since this script began) and the ~850ms between
  // them was not a gap, it was a comparison that did not mean anything.
  //
  // The budget is Daniel's: a little is fine, more than about a second is
  // not, and the animation must never be the reason he waits.
  let lastWarm = null;
  let saidSomething = null; // any status text seen at any moment of the boot
  let tLit = null;          // the read resolved: landBootLoader adds is-lit
  let tFly = null;          // the flight to the nav begins
  let tGone = null;         // the overlay leaves the DOM; the app is usable
  if (startedUp) {
    while (!el().hidden && performance.now() - t0 < 15000) {
      const m0 = mark();
      const anims = m0 ? m0.getAnimations() : [];
      const climb = anims.find((a) => a.animationName === 'boot-warm');
      if (climb && typeof climb.currentTime === 'number') lastWarm = climb.currentTime;
      if (tLit == null && m0 && m0.classList.contains('is-lit')) tLit = performance.now();
      if (tFly == null && el().classList.contains('is-flying')) tFly = performance.now();
      // A NORMAL BOOT SAYS NOTHING, AT ANY POINT. Sampled throughout rather
      // than checked at the end, because the failure this guards against is a
      // line that appears for a moment and goes — which an end-state check
      // cannot see at all.
      const stNow = status();
      if (stNow && stNow.textContent.trim() !== '') saidSomething = stNow.textContent.trim();
      await ui.sleep(8);
    }
    tGone = performance.now();
    waited = Math.round(tGone - t0);
  }
  if (tLit != null) {
    const g = (a, b) => (a == null || b == null ? '?' : `${Math.round(b - a)}ms`);
    ui.note('WHAT THE LOADER COSTS AFTER THE INSTRUMENT ANSWERS:');
    ui.note(`  connect resolved / lit begins -> flight begins : ${g(tLit, tFly)}`);
    ui.note(`  flight begins -> overlay gone                  : ${g(tFly, tGone)}`);
    ui.note(`  TOTAL after the read resolves                  : ${g(tLit, tGone)}`);
    // The read itself, for context: how long the mark was climbing before the
    // instrument answered. That part is the wait, not the animation.
    if (lastWarm != null) ui.note(`  (the read itself ran ${Math.round(lastWarm)}ms)`);
    // DANIEL'S BUDGET, asserted rather than admired.
    if (tGone != null) {
      ui.check(tGone - tLit < 1000,
        `the loader costs under a second after the instrument answers`
        + ` (${Math.round(tGone - tLit)}ms)`);
    }
  }
  if (startedUp) {
    ui.note(`status text seen during the boot: ${saidSomething ? `"${saidSomething}"` : 'none'}`);
    ui.check(saidSomething === null,
      `a normal boot says nothing — the warm-up carries it`
      + (saidSomething ? ` (saw "${saidSomething}")` : ''));
  }
  const stEnd = status();
  ui.check(!stEnd || stEnd.textContent.trim() === '',
    `and the settled state says nothing either`
    + (stEnd ? ` (is "${stEnd.textContent.trim()}")` : ''));
  if (lastWarm != null) {
    // Read from the stylesheet rather than written here, or the two drift and
    // the percentage quietly starts describing a curve that no longer exists.
    const climbEl = mark();
    const durMs = (() => {
      const d = climbEl ? getComputedStyle(climbEl).animationDuration.split(',')[0].trim() : '';
      return /ms$/.test(d) ? parseFloat(d) : parseFloat(d) * 1000;
    })() || 4800;
    const pct = lastWarm / durMs * 100;
    const rung = pct < 12 ? 'still striking, below the first rung'
      : pct < 34 ? 'between the first and second rung'
        : pct < 62 ? 'between the second and third rung'
          : pct < 100 ? 'past the third rung, on the tail'
            : 'the curve had run out before the read landed';
    ui.note(`THE READ LANDED AT ${Math.round(lastWarm)}ms of the`
      + ` ${Math.round(durMs)}ms curve (${Math.round(pct)}%) — ${rung}`);
    // THE CURVE MUST NOT HAVE FINISHED FIRST. If it had, brightness stopped
    // being a progress indicator before the progress ended.
    ui.check(lastWarm < durMs,
      `the instrument answered before the climb ran out`
      + ` (${Math.round(lastWarm)}ms of ${Math.round(durMs)}ms)`);
  }
  const st0 = await window.sevenAPI.midi.status();
  const attached = !!st0 && st0.state === 'connected';
  ui.note(startedUp
    ? `the loader was UP when this script began, and cleared ${waited}ms later`
    : 'the loader had already cleared before this script began');

  ui.check(el().hidden,
    `the boot loader is hidden once the read has resolved`
    + (startedUp ? ` (waited ${waited}ms)` : ''));
  const box = el().getBoundingClientRect();
  ui.note(`loader box ${px(box.width)}x${px(box.height)} · hidden=${el().hidden}`
    + ` · instrument ${attached ? 'attached' : 'NOT attached'}`);
  ui.check(box.width === 0 && box.height === 0,
    'it has no box, so nothing of it is left over the app');

  // ---- THE LANDING: IT BECAME THE NAV LOGO -------------------------------
  //
  // The mark flies to where the logo lives and hands over. What is checkable
  // afterwards is the END STATE: exactly one mark on screen, in the nav, at
  // its normal size and position, with no leftover transform from the
  // flight. A stuck transform would leave the nav logo displaced or the wrong
  // size, which is the failure this shape can produce.
  const navInk = ui.$('.top-logo .top-logo-ink');
  const navSvg = navInk && navInk.querySelector('svg');
  ui.check(!!navSvg, 'the nav carries the inlined logo');
  if (navSvg) {
    const nr = navSvg.getBoundingClientRect();
    const cs = getComputedStyle(navSvg);
    ui.note(`nav logo x${px(nr.left)}..${px(nr.right)} y${px(nr.top)}`
      + ` ${px(nr.width)}x${px(nr.height)} · transform ${cs.transform}`
      + ` · ink visibility ${getComputedStyle(navInk).visibility}`);
    ui.check(nr.width > 0 && nr.height > 0, 'and it is on screen');
    ui.check(cs.transform === 'none',
      `with no transform left over from the flight (${cs.transform})`);
    ui.check(getComputedStyle(navInk).visibility === 'visible',
      'and it is visible again — the flight hides it and must give it back');
    // 28.2px is the approved height (the asset is cropped to the baseline).
    ui.check(Math.abs(nr.height - 28.2) < 1.5,
      `at its normal size (${px(nr.height)}px against 28.2)`);
  }

  // EXACTLY ONE MARK. Two would be a double image, none would be a flash.
  // Asked of the whole document rather than of the two places it could be.
  const marksOnScreen = ui.$$('svg').filter((s) => {
    const r = s.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && !!s.closest('.top-logo, #boot-loader');
  });
  ui.note(`logo marks rendered right now: ${marksOnScreen.length}`
    + ` (${marksOnScreen.map((s) => (s.closest('#boot-loader') ? 'loader' : 'nav')).join(', ') || 'none'})`);
  ui.check(marksOnScreen.length === 1,
    `exactly one logo mark is rendered after the landing (${marksOnScreen.length})`);

  // THE ONLY ASSERTION THAT NEEDS HARDWARE. With an instrument attached the
  // loader really ran during this launch, so the mark carries the artwork it
  // was filled with — evidence the boot path executed, not just that the
  // overlay is tidy now. Without one there was nothing to read, which is
  // boot-loader-offline.js's subject rather than this file's.
  if (attached) {
    ui.check(mark().innerHTML.trim() !== '',
      'the mark was filled during this launch, so the real boot path ran');
  } else {
    ui.note('no instrument: skipping the "the real boot path ran" check only');
  }

  // AND NOTHING OF IT IS CATCHABLE. `hidden` with a `display` rule that
  // overrode it would leave an invisible sheet eating every click — the bug
  // that looks exactly like the app hanging. Asked at the centre of the
  // window rather than inferred from the box.
  const mid = document.elementFromPoint(
    Math.round(document.documentElement.clientWidth / 2),
    Math.round(document.documentElement.clientHeight / 2)
  );
  ui.note(`the centre of the window belongs to <${mid ? mid.tagName.toLowerCase() : 'nothing'}`
    + `${mid && mid.id ? ` id="${mid.id}"` : ''}>`);
  ui.check(!!mid && !mid.closest('#boot-loader'),
    'a press in the middle of the window does not land on the loader');

  // ---- 2. THE STATES IT PASSES THROUGH -----------------------------------
  const m = mark();
  const st = status();
  if (!m || !st) { ui.check(false, 'the loader has a mark and a status line'); return; }

  // WARMING. The overlay is shown the way app.js shows it.
  //
  // THE STARTING STATE IS CHOSEN, NOT INHERITED (CLAUDE.md). After a REAL
  // boot the mark is still carrying is-lit, and is-lit sets `animation: none`
  // — so adding is-warming on top of it produced no animation at all and the
  // mark was already at --logo. Measured on the first hardware run: the
  // climb and flicker assertions failed with animation-name "none" against a
  // loader that was working perfectly. Offline this never showed, because
  // offline nothing ever lights the mark.
  m.classList.remove('is-lit', 'is-warming');
  el().classList.remove('is-leaving');
  if (st) st.classList.remove('is-done');
  void m.offsetWidth; // settle the removal before the animation is re-added
  m.innerHTML = window.sevenAPI.getLogoSvg();
  m.classList.add('is-warming');
  st.textContent = 'Reading the instrument…';
  el().hidden = false;
  await ui.sleep(360);

  const svg = m.querySelector('svg');
  ui.check(!!svg, 'the mark is an inlined SVG, not an <img>');
  ui.check(!m.querySelector('img'), 'the mark contains no <img> — currentColor would not reach it');
  const path = svg && svg.querySelector('path');
  ui.check(!!path && path.getAttribute('fill') === 'currentColor',
    'the artwork paints with currentColor, which is what the warm-up drives');

  const warmStyle = getComputedStyle(m);
  ui.note(`warming: animation-name "${warmStyle.animationName}"`
    + ` · duration "${warmStyle.animationDuration}"`
    + ` · colour ${warmStyle.color}`);
  ui.check(/boot-warm/.test(warmStyle.animationName),
    `the climb is running (${warmStyle.animationName})`);
  ui.check(/boot-flick/.test(warmStyle.animationName),
    `the flicker is running on top of it (${warmStyle.animationName})`);
  // THE CURVE MUST NOT COMPLETE ON ITS OWN. If it ever reaches --logo without
  // the read landing, brightness stops being a progress indicator and the
  // loader starts lying.
  const lit = getComputedStyle(document.documentElement).getPropertyValue('--logo').trim();
  ui.note(`  --logo is ${lit}; the mark while warming is ${warmStyle.color}`);
  ui.check(el().hidden === false, 'the loader is on screen while reading');

  // LANDING. The read resolving is what lights it.
  m.classList.add('is-lit');
  st.textContent = 'Crumar Seven · 27 sounds';
  st.classList.add('is-done');
  await ui.sleep(620);
  const litStyle = getComputedStyle(m);
  ui.note(`lit: animation-name "${litStyle.animationName}"`
    + ` · colour ${litStyle.color} · opacity ${litStyle.opacity}`);
  ui.check(litStyle.animationName === 'none',
    `the landing cancels both animations wherever they were (${litStyle.animationName})`);
  ui.check(litStyle.opacity === '1',
    `the flicker cannot leave the mark part-faded (opacity ${litStyle.opacity})`);
  ui.check(litStyle.filter !== 'none', 'the lit mark carries its glow');

  // ---- 3. AND IT GOES AWAY AGAIN ------------------------------------------
  el().classList.add('is-leaving');
  await ui.sleep(320);
  el().hidden = true;
  el().classList.remove('is-leaving');
  m.classList.remove('is-warming', 'is-lit');
  st.classList.remove('is-done');
  st.textContent = '';
  m.innerHTML = '';
  ui.check(el().hidden, 'the loader is put back out of the way');
  ui.check(el().getBoundingClientRect().width === 0,
    'and has no box again');
})()
