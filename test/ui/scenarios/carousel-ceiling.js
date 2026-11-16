// @env SEVEN_WINDOW_WIDTH=1088
//
// A PROBE, NOT A GUARD. It measures the carousel's clearance ceiling at ONE
// forced width and prints it; it asserts almost nothing, because what it is
// for is deriving a number rather than defending one.
//
// WHY IT EXISTS. `b8f78ee` moved Save patch into the block it acts on —
// approved, and it stays — and that moved the button the carousel's left peek
// has to clear. The two were each correct and nothing compared them, so the
// 1024px threshold derived before the move was 4.99px too generous and
// carousel-narrow.js went red at 3.2px against the 8px bar.
//
// THE METHOD IS THE ORIGINAL ONE. At a fixed width, sweep the spread and read
// the real geometry at each step: the clearance is
//
//     margin(spread, w) = leftPeek.left - savePatch.right
//
// and the largest spread with margin >= 0 is the CEILING at that width, the
// largest with margin >= 8 is what the bar actually allows. Run it at two or
// more widths and the line through the ceilings gives ceiling%(w), from which
// the threshold for any fixed spread follows.
//
// THE WIDTH IS FORCED FROM main.js. A media query is on the viewport, and
// window.resizeTo is ignored in Electron's renderer; squeezing #main changes
// the column and fires no query at all, which is how a measurement taken that
// way describes the WIDE geometry while claiming to describe the narrow one.
// So one width per run, declared above, changed between runs.
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };
  const px = (n) => Math.round(n * 100) / 100;
  const box = (el) => (el ? el.getBoundingClientRect() : null);
  const MIN_MARGIN = 8;

  const vw = document.documentElement.clientWidth;
  ui.note(`viewport ${vw}px`);

  await ui.selectTab('seven');
  await ui.sleep(800);
  const rows = ui.$$('#patch-list .patch-row');
  if (!rows.length) { ui.note('no bank rows'); return; }
  rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await ui.sleep(2400);

  const car = ui.$('#detail .engine-carousel');
  if (!car) { ui.note('no carousel on screen'); return; }
  const inForce = getComputedStyle(car).getPropertyValue('--peek').trim();
  ui.note(`--peek the stylesheet gives this width: ${inForce}`);

  // OPEN AND UN-ANIMATED. The peek only takes its resting offset while the
  // carousel is open, and a transition in flight would be measured mid-move.
  car.classList.add('is-open', 'no-anim');
  await ui.sleep(320);

  const save = ui.$('#save-live-btn') || ui.$('#detail .save-slot button');
  if (!save) { ui.note('no Save patch button on screen'); return; }
  const faceOf = () => ui.$('#detail .car-face.is-peek.is-prev');
  if (!faceOf()) {
    // The no-peek band hides it, which is a legitimate answer and not a fault:
    // it means this width is already below whatever threshold is in force.
    ui.note('no left peek renders at this width — it is in the no-peek band');
    return;
  }

  const sb = box(save);
  ui.note(`Save patch x${px(sb.left)}..${px(sb.right)}`);

  // ---- THE SWEEP --------------------------------------------------------
  //
  // Every whole per cent from 80 down to 10. Inline on the element, which beats
  // the media query by specificity, so the band in force does not limit what
  // can be asked.
  // BOTH STATES, AND THE HOVER ONE IS THE BOUND. The stylesheet says so in
  // its own words — "anything wider escapes on hover before it escapes at
  // rest, which is why the bound was taken from the HOVER size" — and the
  // thresholds in force were nonetheless derived from the RESTING peek. On
  // hover the face goes from scale .74 to .82, so it grows 128 x 0.08 =
  // 10.24px and its left edge moves 5.12px LEFT of where the resting
  // measurement found it.
  //
  // The hover transform is applied INLINE rather than inferred: CSS :hover
  // cannot be driven by a synthetic event, and arithmetic on the resting box
  // is a model. (It was checked against a real one: the full-suite run of
  // 16 Nov happened to have the pointer parked on this peek and measured
  // x478.2 w105, which is what this produces.)
  const HOVER = 'translateX(calc(-1 * var(--peek))) scale(.82)';
  const rows2 = [];
  for (let s = 80; s >= 10; s -= 1) {
    car.style.setProperty('--peek', `${s}%`);
    const f = faceOf();
    f.style.removeProperty('transform');
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));
    const rest = box(faceOf());
    const restMargin = rest.left - box(save).right;

    f.style.transform = HOVER;
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));
    const hov = box(faceOf());
    const hovMargin = hov.left - box(save).right;
    f.style.removeProperty('transform');

    rows2.push({
      s, margin: hovMargin, restMargin, left: hov.left, w: hov.width,
      restLeft: rest.left, restW: rest.width,
    });
  }
  car.style.removeProperty('--peek');

  const touching = rows2.filter((r) => r.margin >= 0);
  const clearing = rows2.filter((r) => r.margin >= MIN_MARGIN);
  const ceiling = touching.length ? touching[0].s : null;      // largest with >= 0
  const allowed = clearing.length ? clearing[0].s : null;      // largest with >= 8

  // Print the interesting neighbourhood rather than all 71 rows.
  const near = rows2.filter((r) => r.margin > -6 && r.margin < 20);
  ui.note('spread | hover x | HOVER margin | rest margin');
  for (const r of near) {
    ui.note(`  ${String(r.s).padStart(3)}% | ${String(px(r.left)).padStart(7)} |`
      + ` ${String(px(r.margin)).padStart(12)} | ${String(px(r.restMargin)).padStart(11)}`
      + (r.s === ceiling ? '   <- ceiling (>= 0)' : '')
      + (r.s === allowed ? '   <- largest clearing 8px' : ''));
  }

  const at44 = rows2.find((r) => r.s === 44);
  const at72 = rows2.find((r) => r.s === 72);
  const grow = at44 ? at44.w - at44.restW : null;
  ui.note(`hovering grows the peek ${grow == null ? '?' : px(grow)}px`
    + ` (${at44 ? px(at44.restW) : '?'} -> ${at44 ? px(at44.w) : '?'}),`
    + ' so its left edge moves half that further left');
  ui.note(`AT ${vw}px: ceiling ${ceiling}% · largest clearing ${MIN_MARGIN}px ${allowed}%`);
  ui.note(`  44%: HOVER ${at44 ? px(at44.margin) : 'n/a'}px`
    + ` · rest ${at44 ? px(at44.restMargin) : 'n/a'}px`);
  ui.note(`  72%: HOVER ${at72 ? px(at72.margin) : 'n/a'}px`
    + ` · rest ${at72 ? px(at72.restMargin) : 'n/a'}px`);

  // The only assertion: that the sweep actually moved the peek. A sweep where
  // nothing changes would print a tidy table of the same number and look like
  // a measurement.
  const spreadOfMargins = Math.max(...rows2.map((r) => r.margin))
    - Math.min(...rows2.map((r) => r.margin));
  ui.check(spreadOfMargins > 50,
    `the sweep moved the peek (${px(spreadOfMargins)}px between the extremes)`);

  car.classList.remove('is-open', 'no-anim');
})()
