// THE WHEEL HAS ONE POSITION, AND NOTHING IT DRAWS EATS A CLICK.
//
// This scenario was first written to assert that both peek faces sit fully
// inside the engine column. That turned out to be unreachable without moving
// the wheel out of column 2, and moving it cost three things that were worse
// than the clipped peek — so Daniel chose the trade with the numbers in front
// of him (2026-11-15) and this file follows the decision rather than the
// original wish. What it pins now is what that decision has to keep true.
//
//   1. ONE POSITION. The hero's centre is identical at rest and awake. When it
//      was not, the picture jumped 93.5px the moment the wheel woke.
//   2. AND THE SAME ONE AFTER A TURN. Turning REBUILDS the faces; a rebuilt
//      wheel that landed somewhere else snapped 607 -> 700.5 at the exact
//      frame the new name arrived, which reads as the wheel skipping an extra
//      image. Daniel placed that moment precisely and he was right about the
//      moment — the cause is the rebuild, not the text, and the measurements
//      say so: the header held its height and the stage held its top through
//      the whole turn.
//   3. NOTHING ABOVE THE WHEEL MOVES WHILE THE HEADER LOADS. The cheap way to
//      reintroduce 2 is to let the name or badge change the block's height.
//   4. NO PEEK TAKES A CLICK FROM A CONTROL. A peek over meta TEXT is allowed
//      and deliberate. A peek over a BUTTON is not: a click at the overlap's
//      centre was measured hitting the peek's `img` rather than Save patch.
//
// What is deliberately NOT asserted: that the right-hand peek is fully
// visible. It is clipped by the column edge, knowingly — the hero at scale
// 1.12 is 104.7px half-width with 93.5px to the edge, so no spread shows it
// whole without moving the wheel. Asserting it would be asserting against a
// decision somebody made on purpose.
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };
  const px = (n) => Math.round(n * 10) / 10;
  const box = (el) => (el ? el.getBoundingClientRect() : null);
  const centreOf = (r) => (r ? r.left + r.width / 2 : null);

  await ui.selectTab('seven');
  await ui.sleep(800);
  const rows = ui.$$('#patch-list .patch-row');
  if (!rows.length) { ui.note('no bank rows on screen'); return; }

  // ── 3. NOTHING MOVES WHILE THE HEADER LOADS ─────────────────────────────
  rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  const t0 = performance.now();
  const loadTops = [];
  const loadHeads = [];
  for (let i = 0; i < 40; i++) {
    const stage = ui.$('#detail .engine-stage');
    const head = ui.$('#detail .engine-head-text');
    if (stage) loadTops.push(px(box(stage).top));
    if (head) loadHeads.push(px(box(head).height));
    await ui.sleep(50);
  }
  const uTops = [...new Set(loadTops)];
  const uHeads = [...new Set(loadHeads)];
  ui.note(`while the header loaded (${Math.round(performance.now() - t0)}ms): `
    + `stage top ${uTops.join(' -> ')} · head height ${uHeads.join(' -> ')}`);
  ui.check(uTops.length === 1, `the stage does not shift while the header loads (${uTops.join(' -> ')})`);
  ui.check(uHeads.length === 1, `and the header block keeps its height (${uHeads.join(' -> ')})`);

  const car = ui.$('#detail .engine-carousel');
  if (!car) { ui.note('no carousel on screen (offline?)'); return; }

  // ── 1. ONE POSITION, REST vs AWAKE ──────────────────────────────────────
  const rest = centreOf(box(ui.$('#detail .car-face.is-hero')));
  car.classList.add('is-open', 'no-anim');
  await ui.sleep(320);
  const awake = centreOf(box(ui.$('#detail .car-face.is-hero')));
  ui.note(`hero centre: rest ${px(rest)} · awake ${px(awake)}`);
  ui.check(Math.abs(awake - rest) <= 1,
    `the hero has ONE position, not two (${px(rest)} vs ${px(awake)})`);

  // ── 4. NO PEEK TAKES A CLICK FROM A CONTROL ─────────────────────────────
  // Every interactive element in the engine column, not just the one that was
  // reported: the next one to drift under a peek should fail here, not in the
  // app.
  const col = ui.$('#detail .col-engine');
  const controls = ui.$$('#detail .col-engine button, #detail .col-engine select, '
    + '#detail .col-engine input, #detail .col-engine [role="button"]')
    .filter((el) => !el.closest('.engine-carousel') && box(el).width > 0);
  ui.note(`interactive elements in the engine column: ${controls.length}`);
  const peeks = ui.$$('#detail .car-face.is-peek').filter((p) => box(p).width > 0);
  for (const el of controls) {
    const r = box(el);
    const name = (el.id || el.className || el.tagName).toString().trim().split(/\s+/)[0];
    for (const p of peeks) {
      const pr = box(p);
      const over = !(pr.right <= r.left || pr.left >= r.right
        || pr.bottom <= r.top || pr.top >= r.bottom);
      if (!over) continue;
      const cx = (Math.max(pr.left, r.left) + Math.min(pr.right, r.right)) / 2;
      const cy = (Math.max(pr.top, r.top) + Math.min(pr.bottom, r.bottom)) / 2;
      const hit = document.elementFromPoint(cx, cy);
      const reaches = !!(hit && (hit === el || el.contains(hit)));
      ui.note(`   peek over "${name}" at (${px(cx)}, ${px(cy)}) -> hits `
        + `${hit ? hit.tagName.toLowerCase() : 'null'}${reaches ? ' (the control)' : ' (NOT the control)'}`);
      ui.check(reaches, `a pointer over "${name}" reaches the control, not the peek`);
    }
  }
  // And the one that was reported, by name, whether or not a peek is over it.
  const save = ui.$('#save-live-btn') || ui.$('#detail .save-slot button');
  if (save && box(save).width) {
    const r = box(save);
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    ui.check(!!hit && (hit === save || save.contains(hit)),
      'a pointer on Save patch reaches Save patch');
  } else {
    ui.note('Save patch is not on screen for this slot — not checked');
  }

  // ── 2. AND THE SAME POSITION AFTER A TURN ───────────────────────────────
  car.classList.remove('no-anim');
  const next = ui.$('#detail .car-face.is-peek.is-next');
  if (!next) { ui.note('no next peek to turn with — the turn half is not checked'); return; }
  const before = centreOf(box(ui.$('#detail .car-face.is-hero')));
  next.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  // Through the whole turn AND the rebuild that follows the device confirming.
  const seen = [];
  for (let i = 0; i < 70; i++) {
    await ui.sleep(50);
    const h = ui.$('#detail .car-face.is-hero');
    if (h) seen.push(px(centreOf(box(h))));
  }
  const settled = seen[seen.length - 1];
  ui.note(`hero centre before the turn ${px(before)} · after it settles ${settled}`);
  ui.check(Math.abs(settled - before) <= 1,
    `the wheel lands where it started, so a turn does not look like two (${px(before)} vs ${settled})`);
})()
