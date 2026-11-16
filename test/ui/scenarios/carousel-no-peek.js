// @env SEVEN_WINDOW_WIDTH=1000
//
// BELOW 1024px THE PEEKS DO NOT RENDER, AND THAT IS THE FIX.
//
// The companion to carousel-narrow.js, which carries the full derivation of
// both thresholds and the geometry behind them. The short version: clearing
// Save patch needs a spread under 35.2% by 994px, and showing 30% of a peek
// needs one over it, so below ~1024 (the 8px-margin bar) the two requirements
// cross and no value satisfies both. Daniel's call, 2026-11-15: give up the
// peeks. A missing invitation beats a picture sitting on a button.
//
// WHY 1000px. The band is 1023 and below, and 1000 is inside it with room to
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
// WHAT IT COSTS, asserted here rather than left for somebody to discover:
// clicking a peek is the ONLY thing that turns the wheel, so in this band the
// sound cannot be changed from this view. That is checked below — not because
// it is desirable, but because it is the consequence of the decision and a
// future reader should meet it as a measured fact rather than a surprise.
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };
  const px = (n) => Math.round(n * 10) / 10;
  const box = (el) => (el ? el.getBoundingClientRect() : null);

  const vw = document.documentElement.clientWidth;
  ui.note(`viewport ${vw}px`);
  ui.check(vw <= 1023,
    `the window is inside the no-peek band (${vw}px) — otherwise this proves nothing`);
  if (vw > 1023) return;

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

  // AND THE WHEEL CANNOT BE TURNED. Recorded as the measured consequence of
  // the decision: app.js turns only on a click on a .is-peek, and there is no
  // peek to click. If a later change gives this band another way to turn —
  // arrows, or keeping only the right-hand peek — this assertion is the one
  // that should be inverted, deliberately, in the same commit.
  const reachablePeek = ui.$$('#detail .car-face.is-peek').filter((p) => {
    const r = box(p);
    if (!r.width) return false;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (hit === p || p.contains(hit));
  });
  ui.check(reachablePeek.length === 0,
    `no peek can be pressed at ${vw}px — so the wheel does not turn here, which`
    + ' is the known cost of the no-peek band, not a separate bug');

  car.classList.remove('is-open', 'no-anim');
})()
