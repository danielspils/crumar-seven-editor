// @env SEVEN_WINDOW_WIDTH=1024
//
// A NARROW WINDOW MUST NOT PUT A PICTURE ON A BUTTON.
//
// THIS SCENARIO IS WIDTH-AWARE ON PURPOSE. There are three bands and it
// asserts whichever one it was launched into, so the same file covers the
// whole range by changing one number — and so a launch into the wrong band
// fails loudly instead of quietly checking nothing:
//
//   1080px and up   --peek 72%, Daniel's approved geometry, untouched.
//                   Also covered at the default width by carousel-peeks.js.
//   1024..1079      --peek 44%. The peeks still render and must clear Save
//                   patch by at least 8px. This file's declared width is the
//                   TIGHT end of that band, 1024, because a bound is only
//                   worth testing where it is nearly met.
//   1023 and below  no peek renders at all. Covered by carousel-no-peek.js.
//
// WHERE THE THRESHOLDS COME FROM. The largest spread whose left peek still
// clears the button was swept on hardware and is linear in the width at half
// a percentage point per pixel: ceiling%(w) = 48.4 + 0.5(w - 1020), and one
// per cent of the 128px face is 1.28px. A spread keeps clearing by SOMETHING
// well past the point where the margin is real — 44% to ~1011px, 72% to
// ~1067 — but a bound met by a hair is not met (Daniel, 2026-11-15), so both
// thresholds are where 8px of margin runs out: 1024 for 44%, 1080 for 72%.
// Both land on the same 6.4pp gap and the same 8.19px.
//
// EVERY WIDTH BETWEEN THEM is covered by the arithmetic instead, in
// test/css-hazards.test.js, because a scenario can only ask at the width it
// was launched at. That test depends on this one: if the measured margin here
// stops matching the model, the model is what is wrong.
//
// THE SWEEP WAS TAKEN BY SQUEEZING #main, WHICH FIRES NO MEDIA QUERY — fine
// for locating where the 72% peek first touches, since 72% is the base value
// at every width, but worth checking rather than trusting. It was: this
// scenario at a REAL forced 1020px viewport, with the spread mutated back to
// 72%, measured the left peek at 443.5..538.2 against Save patch at
// 387.2..473.6 — an overlap of 30.1px, the squeeze's figure to the tenth.
//
// DANIEL CANNOT REACH ANY OF THIS. main.js sets minWidth: Math.min(1280,
// work.width) and his work area is 1147, so his default is his floor. The
// band only exists on a DISPLAY narrower than 1280, where minWidth collapses
// to the screen width — small or scaled panels. That is why it is fixed once
// and tested here rather than watched.
//
// WHY THE WIDTH IS FORCED FROM main.js AND NOT FROM HERE: the rule is a media
// query on the viewport, and window.resizeTo is ignored in Electron's
// renderer. Squeezing #main from a scenario changes the column's width but
// fires no media query at all — so a test written that way would measure the
// WIDE geometry and pass while the narrow bug stood.
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };
  const px = (n) => Math.round(n * 10) / 10;
  const box = (el) => (el ? el.getBoundingClientRect() : null);

  const MIN_MARGIN = 8;   // Daniel's bar: a bound met by a hair is not met.
  const PEEK_GONE = 1023; // at or below this, no peek renders at all.
  const SPREAD_TO = 1079; // at or below this, the tucked-in spread applies.

  const vw = document.documentElement.clientWidth;
  const band = vw <= PEEK_GONE ? 'no-peek' : vw <= SPREAD_TO ? 'tucked' : 'wide';
  ui.note(`viewport ${vw}px · band "${band}"`);

  await ui.selectTab('seven');
  await ui.sleep(800);
  const rows = ui.$$('#patch-list .patch-row');
  if (!rows.length) { ui.note('no bank rows'); return; }
  rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await ui.sleep(2400);

  const car = ui.$('#detail .engine-carousel');
  if (!car) { ui.note('no carousel on screen'); return; }
  const spread = getComputedStyle(car).getPropertyValue('--peek').trim();
  ui.note(`--peek at this width: ${spread}`);

  car.classList.add('is-open', 'no-anim');
  await ui.sleep(320);

  const col = box(ui.$('#detail .col-engine'));
  const heroEl = ui.$('#detail .car-face.is-hero');
  const hero = box(heroEl);
  ui.note(`column x${px(col.left)}..${px(col.right)} w${px(col.width)}`
    + ` · hero x${px(hero.left)}..${px(hero.right)}`);

  for (const f of ui.$$('#detail .car-face')) {
    const cs = getComputedStyle(f);
    const r = box(f);
    ui.note(`  face [${f.className}] display ${cs.display} w${px(r.width)}`
      + ` x${px(r.left)}..${px(r.right)} · ${cs.transform}`
      + ` · opacity ${cs.opacity} · events ${cs.pointerEvents}`);
  }

  // EVERY interactive element in the column, against every face that is
  // actually ON SCREEN — not just the one that was reported. The next control
  // to drift under a peek should fail here rather than in somebody's app.
  //
  // WHY "ON SCREEN" AND NOT "EVERY FACE": in the tucked band the two FAR faces
  // are parked at translateX(±140%) with opacity 0 and pointer-events none. At
  // 1020 the left one's laid-out box (365.4..442.2) does sit across Save patch,
  // and an unscoped version of this check fails on it — but nothing is drawn
  // there and a press goes straight through to the button, which the
  // elementFromPoint assertion below proves rather than assumes.
  const side = (p) => (/is-far/.test(p.className) ? 'far'
    : /is-hero/.test(p.className) ? 'hero'
      : /is-prev/.test(p.className) ? 'prev' : /is-next/.test(p.className) ? 'next' : '?');
  const drawn = ui.$$('#detail .car-face').filter((p) => {
    const cs = getComputedStyle(p);
    return box(p).width > 0 && Number(cs.opacity) > 0 && cs.pointerEvents !== 'none';
  });

  const controls = ui.$$('#detail .col-engine button, #detail .col-engine select, '
    + '#detail .col-engine input')
    .filter((el) => !el.closest('.engine-carousel') && box(el).width > 0);
  ui.note(`interactive elements in the column: ${controls.length}`);
  ui.check(controls.length > 0,
    'there are controls in the column to collide with — otherwise this proves nothing');

  for (const el of controls) {
    const r = box(el);
    const name = (el.id || String(el.className).split(/\s+/)[0] || el.tagName).trim();
    for (const p of drawn) {
      const pr = box(p);
      const over = !(pr.right <= r.left || pr.left >= r.right
        || pr.bottom <= r.top || pr.top >= r.bottom);
      if (over) {
        ui.note(`  ${side(p)} face x${px(pr.left)}..${px(pr.right)} OVERLAPS "${name}"`
          + ` x${px(r.left)}..${px(r.right)}`);
      }
      ui.check(!over, `no ${side(p)} face overlaps "${name}" at ${vw}px`);
    }
    // And the press itself lands on the control — the honest reachability
    // test, and the one the invisible far faces have to survive.
    //
    // THREE POINTS ACROSS, NOT THE CENTRE. Measured during a mutation check:
    // with the spread left at 72% the left peek covers 443.5..538.2 and Save
    // patch is 387.2..473.6, so the picture sits on the button's right-hand
    // END while its centre (430.4) stays clear — and a centre-only probe
    // passed through the whole bug. The overlap assertion caught it; this one
    // would not have, and a reachability test that cannot see a picture on a
    // button is scenery.
    for (const frac of [0.25, 0.5, 0.75]) {
      const x = r.left + r.width * frac;
      const y = r.top + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      ui.check(!!hit && (hit === el || el.contains(hit)),
        `a press ${Math.round(frac * 100)}% across "${name}" reaches it at ${vw}px`);
    }
  }

  // THE HERO SURVIVES IN BOTH BANDS. Hiding the peeks must not take the middle
  // with it — it is the whole picture below 1024, and it is still the choice.
  ui.check(!!heroEl && hero.width > 0, `the hero is on screen at ${vw}px`);
  const heroHit = document.elementFromPoint(hero.left + hero.width / 2,
    hero.top + hero.height / 2);
  ui.check(!!heroHit && (heroHit === heroEl || heroEl.contains(heroHit)),
    `a press on the hero reaches it at ${vw}px`);

  const peeks = ui.$$('#detail .car-face.is-peek');
  const save = ui.$('#save-live-btn') || ui.$('#detail .save-slot button');

  if (band === 'no-peek') {
    // NOTHING IS DRAWN BUT THE MIDDLE. Asserted three ways, because each
    // catches a different way of getting it wrong: the rule itself (display),
    // the consequence (no box to collide with), and the net effect (one face
    // on screen). A `visibility` or `opacity` version of the rule would pass
    // the third and fail the first two.
    ui.check(drawn.length === 1,
      `only the hero is on screen below ${PEEK_GONE + 1}px (${drawn.length} faces)`);
    for (const f of ui.$$('#detail .car-face:not(.is-hero)')) {
      const cs = getComputedStyle(f);
      ui.check(cs.display === 'none',
        `[${f.className}] is display:none at ${vw}px (is "${cs.display}")`);
      ui.check(box(f).width === 0 && box(f).height === 0,
        `[${f.className}] has no box at ${vw}px`);
    }
    ui.check(peeks.every((p) => getComputedStyle(p).display === 'none'),
      `no peek renders at ${vw}px — the band where no spread both clears the`
      + ' control and leaves a recognisable peek');
  } else {
    ui.check(spread === (band === 'tucked' ? '44%' : '72%'),
      `the ${band} spread is in force at ${vw}px (${spread})`);
    ui.check(drawn.length === 3,
      `three faces are on screen in the open state — hero and two peeks (${drawn.length})`);

    // THE MARGIN IS A NUMBER AND IT IS ASSERTED, not just logged. This is the
    // bound the 1024 threshold was derived from, so the arithmetic behind that
    // threshold fails here if it is wrong.
    const leftPeek = ui.$('#detail .car-face.is-peek.is-prev');
    if (save && leftPeek) {
      const margin = box(leftPeek).left - box(save).right;
      ui.note(`left peek clears Save patch by ${px(margin)}px`
        + ` (bar is ${MIN_MARGIN}px)`);
      ui.check(margin >= MIN_MARGIN,
        `the left peek clears Save patch by at least ${MIN_MARGIN}px at ${vw}px`
        + ` (${px(margin)}px)`);
    }

    // THE PEEKS MUST STILL BE INSTRUMENTS, not grey lines. Tucking them in is
    // only a fix while they remain an invitation to turn — and the moment it
    // stops being one is the moment the band below takes over.
    for (const p of peeks) {
      const pr = box(p);
      const which = /is-prev/.test(p.className) ? 'prev' : 'next';
      const shown = which === 'prev' ? hero.left - pr.left : pr.right - hero.right;
      ui.note(`  ${which} peek shows ${px(shown)}px of its ${px(pr.width)}`
        + ` (${Math.round(shown / pr.width * 100)}%) beyond the hero`);
      ui.check(shown >= pr.width * 0.3,
        `the ${which} peek is still recognisable at ${vw}px`
        + ` (${Math.round(shown / pr.width * 100)}% showing)`);
    }
  }

  // WHAT THIS SCENARIO DOES NOT COVER, said out loud so nobody reads a green
  // run as more than it is. In the TUCKED band, during a turn the far face
  // flies from ±140% into the peek slot, and the first part of that path
  // crosses Save patch at opacity .38. It cannot be fixed by the spread — the
  // peek position itself clears by single-figure pixels, so any park the far
  // faces could travel from is further out than the button's edge. Same family
  // as the turning overlap on the right that Daniel priced and kept (CLAUDE.md,
  // "A REPORTED WORKING STATE OUTRANKS A MEASURED IMPROVEMENT"), and transient
  // rather than resting. Recorded, not asserted. In the NO-PEEK band it cannot
  // happen at all, because the rule takes the far faces too.
  car.classList.remove('is-open', 'no-anim');
})()
