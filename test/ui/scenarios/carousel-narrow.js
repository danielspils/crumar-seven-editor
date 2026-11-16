// @env SEVEN_WINDOW_WIDTH=1020
//
// A NARROW WINDOW MUST NOT PUT A PICTURE ON A BUTTON.
//
// At 72% spread the LEFT peek lands on the Save patch button below ~1067px —
// measured, by sweeping the room between the two until it crossed zero:
// +21.1px at 1100, -4.5px at 1060, so the crossing is 1067. At 1020 the
// overlap is 30.1px, and a click there would hit the picture.
//
// THAT SWEEP WAS TAKEN BY SQUEEZING #main, WHICH FIRES NO MEDIA QUERY — fine
// for locating where the 72% peek first touches, since 72% is the base value
// at every width, but worth checking rather than trusting. It was: this
// scenario at a REAL forced 1020px viewport, with the spread mutated back to
// 72%, measured the left peek at 443.5..538.2 against Save patch at
// 387.2..473.6 — an overlap of 30.1px, the squeeze's figure to the tenth. So
// the 1067 crossing stands on a method that has been checked against the real
// thing at one point on its range.
//
// DANIEL CANNOT REACH THIS. main.js sets minWidth: Math.min(1280, work.width)
// and his work area is 1147, so his default is his floor. Anyone on a smaller
// display meets it on first launch, which is why it is fixed rather than
// watched — and why this scenario forces the window width rather than trusting
// the desk it runs on.
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

  const vw = document.documentElement.clientWidth;
  ui.note(`viewport ${vw}px`);
  ui.check(vw <= 1067,
    `the window really is narrow (${vw}px) — otherwise this proves nothing`);
  if (vw > 1067) return;

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
  const hero = box(ui.$('#detail .car-face.is-hero'));
  ui.note(`column x${px(col.left)}..${px(col.right)} w${px(col.width)}`
    + ` · hero x${px(hero.left)}..${px(hero.right)}`);

  for (const f of ui.$$('#detail .car-face')) {
    const cs = getComputedStyle(f);
    const r = box(f);
    ui.note(`  face [${f.className}] w${px(r.width)} x${px(r.left)}..${px(r.right)}`
      + ` · ${cs.transform} · opacity ${cs.opacity} · events ${cs.pointerEvents}`);
  }

  // EVERY interactive element in the column, against every face that is
  // actually ON SCREEN — not just the one that was reported. The next control
  // to drift under a peek should fail here rather than in somebody's app.
  //
  // WHY "ON SCREEN" AND NOT "EVERY FACE": the two FAR faces are parked at
  // translateX(±140%) with opacity 0 and pointer-events none. At this width
  // the left one's laid-out box (365.4..442.2) does sit across Save patch, and
  // an unscoped version of this check fails on it — but nothing is drawn there
  // and a press goes straight through to the button, which the elementFromPoint
  // assertion below proves rather than assumes. Their job is to arrive DURING a
  // turn; see the note at the end for what that costs here and why it is not
  // fixable from the spread.
  const side = (p) => (/is-far/.test(p.className) ? 'far'
    : /is-hero/.test(p.className) ? 'hero'
      : /is-prev/.test(p.className) ? 'prev' : /is-next/.test(p.className) ? 'next' : '?');
  const drawn = ui.$$('#detail .car-face').filter((p) => {
    const cs = getComputedStyle(p);
    return box(p).width > 0 && Number(cs.opacity) > 0 && cs.pointerEvents !== 'none';
  });
  ui.check(drawn.length === 3,
    `three faces are on screen in the open state — hero and two peeks (${drawn.length})`);

  const controls = ui.$$('#detail .col-engine button, #detail .col-engine select, '
    + '#detail .col-engine input')
    .filter((el) => !el.closest('.engine-carousel') && box(el).width > 0);
  ui.note(`interactive elements in the column: ${controls.length}`);

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
    // THREE POINTS ACROSS, NOT THE CENTRE. Measured during the mutation check:
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

  // THE MARGIN IS A NUMBER, not a pass. 44% clears Save patch here by a few
  // pixels, and a future change that shaves it should be readable in the log
  // before it becomes a failure.
  const save = ui.$('#save-live-btn') || ui.$('#detail .save-slot button');
  const leftPeek = ui.$('#detail .car-face.is-peek.is-prev');
  if (save && leftPeek) {
    ui.note(`left peek clears Save patch by ${px(box(leftPeek).left - box(save).right)}px`);
  }

  // THE PEEKS MUST STILL BE INSTRUMENTS, not grey lines. Tucking them in is
  // only a fix while they remain an invitation to turn.
  for (const p of ui.$$('#detail .car-face.is-peek')) {
    const pr = box(p);
    const side = /is-prev/.test(p.className) ? 'prev' : 'next';
    const shown = side === 'prev' ? hero.left - pr.left : pr.right - hero.right;
    ui.note(`  ${side} peek shows ${px(shown)}px of its ${px(pr.width)}`
      + ` (${Math.round(shown / pr.width * 100)}%) beyond the hero`);
    ui.check(shown >= pr.width * 0.3,
      `the ${side} peek is still recognisable at ${vw}px`
      + ` (${Math.round(shown / pr.width * 100)}% showing)`);
  }

  // WHAT THIS SCENARIO DOES NOT COVER, said out loud so nobody reads a green
  // run as more than it is: DURING a turn the far face flies from ±140% into
  // the peek slot, and at this width the first two thirds of that path cross
  // Save patch at opacity .38. It cannot be fixed by the spread — the peek
  // position itself clears by only a few pixels, so any park the far faces
  // could use and still have somewhere to travel from is further out than the
  // button's edge. It is the same family as the turning overlap on the right
  // that Daniel priced and kept (CLAUDE.md, "A REPORTED WORKING STATE
  // OUTRANKS A MEASURED IMPROVEMENT"), and it is transient rather than
  // resting. Recorded, not asserted.
  car.classList.remove('is-open', 'no-anim');
})()
