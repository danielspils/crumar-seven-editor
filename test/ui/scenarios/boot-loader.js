// THE BOOT LOADER, WITH AN INSTRUMENT ATTACHED.
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
  // NOT ui.requireDevice(). That one WAITS for a connection and records a
  // failure when none arrives — it is built for scenarios that return
  // immediately and skip. This file keeps going either way, so it asks a
  // question instead of making a demand.
  const st0 = await window.sevenAPI.midi.status();
  const attached = !!st0 && st0.state === 'connected';

  const el = () => ui.$('#boot-loader');
  const mark = () => ui.$('#boot-mark');
  const status = () => ui.$('#boot-status');

  // ---- 1. IT IS GONE, and it does not persist ----------------------------
  //
  // By the time a scenario runs, the read has resolved. A loader still up at
  // this point is the failure that matters most: a sheet over the whole app.
  ui.check(!!el(), 'the boot loader markup exists in the document');
  ui.check(el().hidden, 'the boot loader is hidden once the read has resolved');
  const box = el().getBoundingClientRect();
  ui.note(`loader box ${px(box.width)}x${px(box.height)} · hidden=${el().hidden}`
    + ` · instrument ${attached ? 'attached' : 'NOT attached'}`);
  ui.check(box.width === 0 && box.height === 0,
    'it has no box, so nothing of it is left over the app');

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
