// THE WHEEL PULLS BACK TO SHOW ITS OPTIONS, AND NEVER LEAVES COLUMN 2.
//
// At rest the hero is full size and alone. Awake, it scales DOWN, and the room
// it gives up is what makes two symmetric peeks visible. Settling, it grows
// back. Size carries the meaning: large is "this is what you have", small is
// "you are choosing".
//
// The history matters because two earlier shapes failed here and this file is
// what stops either returning:
//   - the hero GREW to 1.12 while awake, which is why a visible peek was
//     impossible — 104.7px of half-width against 93.5px of room — and the
//     right-hand neighbour ended up off the end of the column;
//   - the wheel was then CENTRED ON THE COLUMN to make room, which worked and
//     cost three things: a 93.5px jump on wake, a snap back to rest at the
//     frame a turn's new name arrived, and a peek lying over the Save patch
//     button where a click hit the picture instead of the control.
//
// THE CENTRE-X ASSERTION IS THE LOAD-BEARING ONE. Both failures above were
// lateral movement; a scale that shifts x has rebuilt the same bug wearing a
// different shape.
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };
  const px = (n) => Math.round(n * 10) / 10;
  const box = (el) => (el ? el.getBoundingClientRect() : null);
  const cx = (r) => (r ? r.left + r.width / 2 : null);
  const hero = () => box(ui.$('#detail .car-face.is-hero'));

  await ui.selectTab('seven');
  await ui.sleep(800);
  const rows = ui.$$('#patch-list .patch-row');
  if (!rows.length) { ui.note('no bank rows on screen'); return; }

  // Nothing above the wheel may move while the header loads — the cheap way to
  // reintroduce the snap is to let the name or badge change the block's height.
  rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  const tops = new Set();
  const heads = new Set();
  for (let i = 0; i < 40; i++) {
    const st = ui.$('#detail .engine-stage');
    const hd = ui.$('#detail .engine-head-text');
    if (st) tops.add(px(box(st).top));
    if (hd) heads.add(px(box(hd).height));
    await ui.sleep(50);
  }
  ui.note(`while the header loaded: stage top ${[...tops].join(' -> ')} · head h ${[...heads].join(' -> ')}`);
  ui.check(tops.size === 1, `the stage does not shift while the header loads (${[...tops].join(' -> ')})`);
  ui.check(heads.size === 1, `the header keeps its height (${[...heads].join(' -> ')})`);

  const car = ui.$('#detail .engine-carousel');
  if (!car) { ui.note('no carousel on screen (offline?)'); return; }
  const stage = box(ui.$('#detail .engine-stage'));
  const col = box(ui.$('#detail .col-engine'));
  ui.note(`column x${px(col.left)}..${px(col.right)} w${px(col.width)}`
    + ` · column 2 (the stage) x${px(stage.left)}..${px(stage.right)} w${px(stage.width)}`);

  // ── AT REST: full size, inside column 2, alone ──────────────────────────
  const rest = hero();
  ui.note(`REST  hero x${px(rest.left)}..${px(rest.right)} w${px(rest.width)} centre ${px(cx(rest))}`);
  ui.check(rest.left >= stage.left - 1 && rest.right <= stage.right + 1,
    `the resting hero is fully inside column 2 (${px(rest.left)}..${px(rest.right)} in ${px(stage.left)}..${px(stage.right)})`);
  const restPeeksVisible = ui.$$('#detail .car-face.is-peek')
    .filter((p) => Number(getComputedStyle(p).opacity) > 0.01).length;
  ui.check(restPeeksVisible === 0, `no peeks at rest (${restPeeksVisible} visible)`);

  // ── AWAKE: hero smaller, two peeks, all inside column 2 ────────────────
  car.classList.add('is-open', 'no-anim');
  await ui.sleep(320);
  const awake = hero();
  ui.note(`AWAKE hero x${px(awake.left)}..${px(awake.right)} w${px(awake.width)} centre ${px(cx(awake))}`);
  ui.check(Math.abs(cx(awake) - cx(rest)) <= 1,
    `the centre does not move on wake (${px(cx(rest))} vs ${px(cx(awake))})`);
  ui.check(awake.width < rest.width - 1,
    `the hero pulls back to make the room (${px(rest.width)} -> ${px(awake.width)})`);

  // WHAT IS PAINTED, NOT WHAT IS LAID OUT. The stage clips, so a face's box
  // runs past column 2 while the part you can see does not — and clipping is
  // the point: a peek does not need a whole instrument, and clipping buys back
  // more room than shrinking the hero further would. getBoundingClientRect
  // reports the box, so every question here is asked of the INTERSECTION with
  // the stage, which is the only part that is drawn or can be clicked.
  const seen = (el) => {
    const r = box(el);
    if (!r) return null;
    const left = Math.max(r.left, stage.left);
    const right = Math.min(r.right, stage.right);
    const top = Math.max(r.top, stage.top);
    const bottom = Math.min(r.bottom, stage.bottom);
    if (right <= left || bottom <= top) return null;
    return { left, right, top, bottom, width: right - left, height: bottom - top, full: r.width };
  };

  const peeks = {};
  for (const p of ui.$$('#detail .car-face.is-peek')) {
    const key = /is-prev/.test(p.className) ? 'prev' : 'next';
    const v = seen(p);
    peeks[key] = v;
    if (!v) { ui.check(false, `the ${key} peek is visible at all`); continue; }
    const inside = v.left >= stage.left - 1 && v.right <= stage.right + 1;
    const beyond = key === 'prev' ? awake.left - v.left : v.right - awake.right;
    ui.note(`  ${key} peek shows x${px(v.left)}..${px(v.right)} = ${px(v.width)}px`
      + ` of its ${px(v.full)} (${Math.round(v.width / v.full * 100)}%)`
      + ` · ${px(beyond)}px of that is beyond the hero · ${inside ? 'inside' : 'ESCAPES'} column 2`);
    ui.check(inside, `the ${key} peek is fully inside column 2`);
    // A THIRD IS ENOUGH INVITATION. Asserted a little under that so a rounding
    // difference at another width is not a failure.
    ui.check(v.width >= v.full * 0.28,
      `and shows enough of itself to invite a click (${Math.round(v.width / v.full * 100)}%)`);
    ui.check(beyond > 8, `and ${px(beyond)}px of it is not hidden behind the hero`);
  }
  if (peeks.prev && peeks.next) {
    ui.check(Math.abs(peeks.prev.width - peeks.next.width) <= 2,
      `the peeks show the same amount of themselves (${px(peeks.prev.width)} vs ${px(peeks.next.width)})`);
    const gapL = awake.left - peeks.prev.left;
    const gapR = peeks.next.right - awake.right;
    ui.check(Math.abs(gapL - gapR) <= 2,
      `and sit symmetrically about the hero (${px(gapL)} vs ${px(gapR)})`);
  }

  // ── NOTHING IN COLUMN 1 IS TOUCHED, IN ANY STATE ───────────────────────
  // By construction now — the wheel cannot leave the stage — so this is the
  // assertion that proves the construction, not a hopeful extra.
  const controls = ui.$$('#detail .col-engine button, #detail .col-engine select, '
    + '#detail .col-engine input')
    .filter((el) => !el.closest('.engine-carousel') && box(el).width > 0);
  ui.note(`interactive elements in the engine column: ${controls.length}`);
  for (const el of controls) {
    const r = box(el);
    const name = (el.id || String(el.className).split(/\s+/)[0] || el.tagName).trim();
    for (const p of ui.$$('#detail .car-face')) {
      // The PAINTED part again: a face's box may run past the stage, but the
      // clip means nothing of it is drawn or clickable out there.
      const pr = seen(p);
      if (!pr) continue;
      const over = !(pr.right <= r.left || pr.left >= r.right
        || pr.bottom <= r.top || pr.top >= r.bottom);
      ui.check(!over, `no face overlaps "${name}" while the wheel is awake`);
    }
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    ui.check(!!hit && (hit === el || el.contains(hit)),
      `a pointer on "${name}" reaches it while the wheel is awake`);
  }

  // ── MID-TURN AND AFTER SETTLING ────────────────────────────────────────
  car.classList.remove('no-anim');
  const next = ui.$('#detail .car-face.is-peek.is-next');
  if (!next) { ui.note('no next peek to turn with'); return; }
  const before = cx(hero());
  next.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  // THE WHEEL'S CENTRE, NOT THE DEPARTING FACE'S. During a turn the outgoing
  // hero deliberately travels out to a peek position — that is the rotation,
  // and asserting IT does not move would be asserting the animation away. What
  // must hold still is the wheel itself: if the carousel ever translates, the
  // lateral jump is back under another name.
  // RE-QUERIED EVERY SAMPLE. A turn REBUILDS the faces and replaces the
  // carousel node, so a reference captured before the click is detached half
  // way through — and a detached node reports zeros rather than throwing,
  // which reads as the wheel teleporting to the origin. This project has been
  // caught by that three times; it is the reason for the lookup inside the
  // loop rather than a cached `car`.
  const carCx = [];
  const mid = [];
  for (let i = 0; i < 70; i++) {
    await ui.sleep(50);
    const live = ui.$('#detail .engine-carousel');
    if (live) carCx.push(px(cx(box(live))));
    const h = hero();
    if (h) mid.push(px(cx(h)));
  }
  const carDrift = Math.max(...carCx) - Math.min(...carCx);
  ui.note(`through the turn the wheel's own centre spanned ${px(carDrift)}px`
    + ` · the hero's spanned ${px(Math.max(...mid) - Math.min(...mid))}px as it rotated`);
  ui.check(carDrift <= 1, `the wheel does not move laterally during a turn (${px(carDrift)}px)`);
  ui.check(Math.abs(mid[mid.length - 1] - before) <= 1,
    `and the new hero lands on the same centre (${px(before)} vs ${mid[mid.length - 1]})`);
  const settled = hero();
  ui.check(Math.abs(settled.width - rest.width) <= 2,
    `the hero grows back to full size once it settles (${px(settled.width)} vs ${px(rest.width)})`);
})()
