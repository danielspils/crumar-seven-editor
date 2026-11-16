// @env SEVEN_WINDOW_WIDTH=1000
//
// BELOW 1032px THE PEEKS DO NOT RENDER, AND THAT IS THE FIX.
//
// The companion to carousel-narrow.js, which carries the full derivation of
// both thresholds and the geometry behind them. The short version: clearing
// Save patch needs a spread under 35.2% by 1002px, and showing 30% of a peek
// needs one over it, so below 1032 (the 8px-margin bar, measured on the
// HOVERED peek) the two requirements cross and no value satisfies both.
// Daniel's call, 2026-11-15: give up the peeks. A missing invitation beats a
// picture sitting on a button.
//
// THE NUMBER WAS 1024 UNTIL 16 Nov 2026, when the bar was re-derived on the
// hovered peek rather than the resting one — hovering grows the face 10.24px
// and moves its left edge 5.12px left, which is 8px of window width.
//
// WHY 1000px. The band is 1031 and below, and 1000 is inside it with room to
// spare while still being a width somebody really has — the band only exists
// on a DISPLAY narrower than 1280, because main.js sets minWidth:
// Math.min(1280, work.width). 480 is only the guard in the SEVEN_WINDOW_WIDTH
// plumbing and not a window anyone can open, so testing there would be
// testing the harness.
//
// IT WAS 800px FIRST, AND 800 FAILS FOR A REASON THAT IS NOT THIS. Measured
// 2026-11-15: at 800 the engine column's own layout collapses — the heading
// block (.engine-head-text) lands on top of Save patch, and the effects
// column (.fx-section) lands on top of the Type picker — so neither control
// can be pressed whatever the carousel does. PROVEN INDEPENDENT of the rule
// under test rather than assumed: the breakpoint was temporarily dropped to
// 1px so no face was hidden, and the same two elements covered the same two
// controls at the same width. Logged for its own fix; moving this scenario up
// is not a workaround for it, because this file's subject is the peeks.
//
// AND THE FUNCTION IS REPLACED, NOT JUST THE HINT. Hiding the peeks first
// removed the ability to change the sound at all: clicking a peek is the only
// caller of turnCarousel (src/app.js), and the Select button under the wheel
// confirms the middle rather than moving it. Two step buttons at the
// carousel's edges now call the same turnCarousel in this band only.
//
// SO THE SHARP ASSERTION HERE IS A GESTURE, NOT A SELECTOR: press each button
// and check the instrument in the middle changed. Delete the buttons and this
// file fails saying the carousel cannot be turned — the failure somebody can
// act on — rather than saying an element is missing, which reads like a stale
// test and gets deleted.
//
// Turning sends NOTHING to the instrument. turnCarousel moves view state and
// re-renders; only Select (chosenFromCarousel) writes a sound. So this
// scenario leaves the Seven exactly where it found it.
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };
  const px = (n) => Math.round(n * 10) / 10;
  const box = (el) => (el ? el.getBoundingClientRect() : null);

  const vw = document.documentElement.clientWidth;
  ui.note(`viewport ${vw}px`);
  ui.check(vw <= 1031,
    `the window is inside the no-peek band (${vw}px) — otherwise this proves nothing`);
  if (vw > 1031) return;

  await ui.selectTab('seven');
  await ui.sleep(800);
  const rows = ui.$$('#patch-list .patch-row');
  if (!rows.length) { ui.note('no bank rows'); return; }
  rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await ui.sleep(2400);

  const car = ui.$('#detail .engine-carousel');
  if (!car) { ui.note('no carousel on screen'); return; }

  // OPEN IT FIRST. At rest the peeks sit on the hero with opacity 0 anyway, so
  // a test that never opened the wheel would pass with the rule deleted.
  car.classList.add('is-open', 'no-anim');
  await ui.sleep(320);

  const heroEl = ui.$('#detail .car-face.is-hero');
  const hero = box(heroEl);
  ui.note(`hero x${px(hero.left)}..${px(hero.right)} w${px(hero.width)}`);

  // Three statements of one rule, because each catches a different way of
  // getting it wrong: the declaration, the box it removes, and the net count.
  // A `visibility: hidden` or `opacity: 0` version would pass the last and
  // fail the first two — and would leave a focusable, measurable element
  // sitting over the button.
  const others = ui.$$('#detail .car-face:not(.is-hero)');
  ui.check(others.length > 0,
    `the wheel still builds its neighbours (${others.length}) — they are hidden,`
    + ' not absent, so this is a CSS question and not an empty carousel');
  for (const f of others) {
    const cs = getComputedStyle(f);
    const r = box(f);
    ui.note(`  face [${f.className}] display ${cs.display} w${px(r.width)}`);
    ui.check(cs.display === 'none',
      `[${f.className}] is display:none at ${vw}px (is "${cs.display}")`);
    ui.check(r.width === 0 && r.height === 0,
      `[${f.className}] has no box at ${vw}px`);
  }
  const onScreen = ui.$$('#detail .car-face').filter((p) => box(p).width > 0);
  ui.check(onScreen.length === 1,
    `exactly one face is on screen — the hero (${onScreen.length})`);

  // NOTHING LANDS ON A CONTROL. The point of the whole exercise, so it is
  // asserted here too rather than inferred from the rule above.
  const controls = ui.$$('#detail .col-engine button, #detail .col-engine select, '
    + '#detail .col-engine input')
    .filter((el) => !el.closest('.engine-carousel') && box(el).width > 0);
  ui.note(`interactive elements in the column: ${controls.length}`);
  ui.check(controls.length > 0,
    'there are controls in the column to collide with — otherwise this proves nothing');
  for (const el of controls) {
    const r = box(el);
    const name = (el.id || String(el.className).split(/\s+/)[0] || el.tagName).trim();
    for (const p of onScreen) {
      const pr = box(p);
      const over = !(pr.right <= r.left || pr.left >= r.right
        || pr.bottom <= r.top || pr.top >= r.bottom);
      if (over) {
        ui.note(`  face x${px(pr.left)}..${px(pr.right)} OVERLAPS "${name}"`
          + ` x${px(r.left)}..${px(r.right)}`);
      }
      ui.check(!over, `no face overlaps "${name}" at ${vw}px`);
    }
    for (const frac of [0.25, 0.5, 0.75]) {
      const hit = document.elementFromPoint(r.left + r.width * frac,
        r.top + r.height / 2);
      const ok = !!hit && (hit === el || el.contains(hit));
      if (!ok) {
        ui.note(`  "${name}" at ${Math.round(frac * 100)}% is covered by`
          + ` <${hit ? hit.tagName.toLowerCase() : 'nothing'}`
          + `${hit && hit.className ? ` class="${hit.className}"` : ''}`
          + `${hit && hit.id ? ` id="${hit.id}"` : ''}>`);
      }
      ui.check(ok,
        `a press ${Math.round(frac * 100)}% across "${name}" reaches it at ${vw}px`);
    }
  }

  // THE HERO IS STILL THE PICTURE AND STILL THE CHOICE.
  ui.check(!!heroEl && hero.width > 0, `the hero is on screen at ${vw}px`);
  const heroHit = document.elementFromPoint(hero.left + hero.width / 2,
    hero.top + hero.height / 2);
  ui.check(!!heroHit && (heroHit === heroEl || heroEl.contains(heroHit)),
    `a press on the hero reaches it at ${vw}px`);

  // No peek can be pressed — that is the rule above, restated as a gesture.
  const reachablePeek = ui.$$('#detail .car-face.is-peek').filter((p) => {
    const r = box(p);
    if (!r.width) return false;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (hit === p || p.contains(hit));
  });
  ui.check(reachablePeek.length === 0, `no peek can be pressed at ${vw}px`);

  // AND THE WHEEL STILL TURNS, WHICH IS THE POINT OF THIS HALF.
  //
  // This is the assertion the step buttons exist for, so it is written as the
  // FUNCTION and not as the markup: it clicks each button and checks the
  // instrument in the middle actually changed. Delete the buttons and this
  // fails saying the carousel cannot be turned — which is the failure worth
  // reading. An "is the element present" check would fail saying an element is
  // missing, and somebody would delete the check.
  const steps = ui.$$('#detail .engine-carousel [data-car-step]');
  ui.note(`step buttons: ${steps.length}`);
  for (const s of steps) {
    const r = box(s);
    const dir = s.dataset.carStep;
    ui.note(`  step ${dir} x${px(r.left)}..${px(r.right)} w${px(r.width)}`
      + ` · ${getComputedStyle(s).display} · "${s.getAttribute('aria-label')}"`);
    ui.check(r.width > 0 && r.height > 0, `the step button ${dir} has a box at ${vw}px`);
    ui.check(!!s.getAttribute('aria-label'),
      `the step button ${dir} has an accessible name`);
    // Nothing in column 1 is under it, and it is itself pressable.
    for (const el of controls) {
      const cr = box(el);
      const name = (el.id || String(el.className).split(/\s+/)[0] || el.tagName).trim();
      const over = !(r.right <= cr.left || r.left >= cr.right
        || r.bottom <= cr.top || r.top >= cr.bottom);
      ui.check(!over, `the step button ${dir} does not overlap "${name}" at ${vw}px`);
    }
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    ui.check(!!hit && (hit === s || s.contains(hit)),
      `a press on the step button ${dir} reaches it at ${vw}px`);
  }

  // PLACEMENT AND DIRECTION, which the first version of these tests did not
  // cover at all — they asked whether the buttons existed and whether they
  // worked, and both were true while they sat stacked under SELECT pointing
  // downwards (Daniel's screenshot, 2026-11-15).
  const prevStep = ui.$('#detail .engine-carousel [data-car-step="-1"]');
  const nextStep = ui.$('#detail .engine-carousel [data-car-step="1"]');
  if (prevStep && nextStep) {
    const pr = box(prevStep);
    const nr = box(nextStep);
    // FLANKING, not stacked: one each side of the hero, and neither inside the
    // hero's own horizontal extent. Stacked together they give no sense of
    // direction, which is the whole reason a chevron is the right shape here.
    ui.check(pr.right <= hero.left,
      `the prev step sits left of the hero (ends ${px(pr.right)},`
      + ` hero starts ${px(hero.left)})`);
    ui.check(nr.left >= hero.right,
      `the next step sits right of the hero (starts ${px(nr.left)},`
      + ` hero ends ${px(hero.right)})`);
    ui.check(pr.right <= nr.left,
      'the two step buttons are on opposite sides of the hero, not side by side');
    // Vertically on the hero's midline, or "flanking" is only true on one axis.
    const mid = hero.top + hero.height / 2;
    for (const [el, label] of [[prevStep, 'prev'], [nextStep, 'next']]) {
      const r = box(el);
      ui.check(r.top <= mid && r.bottom >= mid,
        `the ${label} step straddles the hero's midline (${px(r.top)}..${px(r.bottom)}`
        + ` against ${px(mid)})`);
    }

    // THE LEFT ONE IS THE TIGHT SIDE, and it answers to the same 8px bar the
    // peeks did. Save patch is the control it has to clear; the right-hand
    // button has the column's own margin to sit in. Asserted as a NUMBER so a
    // layout change that eats the gap is readable before it is a collision.
    const saveBtn = ui.$('#save-live-btn') || ui.$('#detail .save-slot button');
    if (saveBtn) {
      const gap = pr.left - box(saveBtn).right;
      ui.note(`  prev step clears Save patch by ${px(gap)}px (bar is 8px)`);
      ui.check(gap >= 8,
        `the prev step clears Save patch by at least 8px at ${vw}px (${px(gap)}px)`);
    }

    // DIRECTION, measured off the rendered transform rather than read off the
    // source. Two assertions, because either alone is meaningless: the shape
    // must be the app's shared chevron — a V with its apex at the bottom — and
    // it must be turned a quarter circle, one each way. Unrotated it points
    // DOWN, which in this app means "expand".
    // The matrix is read out of the string rather than through
    // DOMMatrixReadOnly: that name is not in eslint.config.mjs's enumerated
    // browser globals, and the globals there are deliberately a list with
    // reasons beside them rather than a blanket (CLAUDE.md). Adding one for a
    // two-line convenience is not worth widening the list.
    const angleOf = (el) => {
      const t = getComputedStyle(el).transform;
      const nums = (t.match(/matrix\(([^)]+)\)/) || [])[1];
      if (!nums) return null;
      const [a, b] = nums.split(',').map((n) => parseFloat(n));
      return Math.round(Math.atan2(b, a) * 180 / Math.PI);
    };
    for (const [el, label, want] of [[prevStep, 'prev', 90], [nextStep, 'next', -90]]) {
      const path = el.querySelector('svg path');
      ui.check(!!path && path.getAttribute('d') === 'M2 2 L7 7 L12 2',
        `the ${label} step draws the app's shared chevron`
        + ` (d="${path ? path.getAttribute('d') : 'none'}")`);
      const deg = angleOf(el);
      ui.note(`  ${label} step rotated ${deg}deg`
        + ` — ${deg === 90 ? 'points left' : deg === -90 ? 'points right' : 'NOT a quarter turn'}`);
      ui.check(deg === want,
        `the ${label} step points ${want === 90 ? 'left' : 'right'} at ${vw}px`
        + ` (rotated ${deg}deg, wanted ${want})`);
    }
  }

  // One click each way, through the real listener. TURN_MS is 340 in app.js
  // and the faces are rebuilt after it, so the wait is the turn plus room.
  //
  // A MISSING BUTTON MUST FAIL AS A MISSING FUNCTION. The first version
  // short-circuited with "there is a step button -1 to press", which reads as
  // a stale selector and invites somebody to delete the line. The click is
  // attempted if there is something to click and the assertion is made either
  // way, so deleting the buttons fails with "the carousel cannot be turned".
  for (const dir of ['-1', '1']) {
    const before = ui.$('#detail .car-face.is-hero');
    const was = before && before.dataset.carName;
    const btn = ui.$(`#detail .engine-carousel [data-car-step="${dir}"]`);
    if (btn) btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await ui.sleep(900);
    const after = ui.$('#detail .car-face.is-hero');
    const now = after && after.dataset.carName;
    ui.note(`  step ${dir}: "${was}" -> "${now}"${btn ? '' : ' (nothing to press)'}`);
    ui.check(!!now && now !== was,
      `the carousel can be turned at ${vw}px — step ${dir} moved the middle from`
      + ` "${was}" to "${now}"`
      + (btn ? '' : '; THERE IS NO STEP BUTTON, so the sound cannot be changed'
        + ' from this view at all — the peeks are hidden at this width and'
        + ' clicking a peek is the only other caller of turnCarousel'));
    // Re-open: the rebuild drops the classes this scenario set by hand.
    const fresh = ui.$('#detail .engine-carousel');
    if (fresh) { fresh.classList.add('is-open', 'no-anim'); await ui.sleep(260); }
  }

  const end = ui.$('#detail .engine-carousel');
  if (end) end.classList.remove('is-open', 'no-anim');
})()
