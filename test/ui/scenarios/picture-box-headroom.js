// HOW MUCH ROOM IS THERE TO GROW THE PICTURE? MEASUREMENT ONLY.
//
// The proposal is 128 x 128 -> 180 x 180 (Daniel, 18 Nov 2026). THE BOX A
// PLAYER SEES IS THE CAROUSEL'S, and it is SQUARE: `.engine-carousel` sets
// `height: 128px` and carries no aspect-ratio. The 363/512 slot with its
// ~180px ceiling belongs to the PLAIN variant, which is a different box.
//
// SO THE BINDING CONSTRAINT IS HEIGHT, NOT WIDTH. +52px of height is what
// could push the parameter list down, and the numbers that must not move are
// the first parameter row's y, the identity block's lines, Save patch's box,
// and row 1 across the four tabs.
//
// THIS SCENARIO CHANGES NOTHING. It reports the slack, the largest square
// that fits, and what the caption does at the proposed size — all computed
// from the live layout rather than from the stylesheet.
//
// CAROUSEL-CAPTION IS PART OF THIS. Its 0.8px overlap is the PAINTED
// rectangle of a 512x418 drawing inside a 128 box, centred by object-fit:
// contain. Change the box and every painted rectangle changes, so the
// caption's clearance is measured here at each candidate size rather than
// fixed separately first.
(async () => {
  const px = (n) => Math.round(n * 10) / 10;
  const box = (sel) => {
    const el = ui.$(sel);
    return el ? el.getBoundingClientRect() : null;
  };

  await ui.openLibrary();
  await ui.sleep(400);
  const patchRow = ui.$('#library .lib-row.lib-patch, #library [data-file]');
  if (!patchRow) return { skipped: 'this library holds no patch to open' };
  ui.click(patchRow, 'a patch');
  await ui.sleep(2500);

  const car = ui.$('#detail .engine-carousel');
  if (!ui.check(!!car, 'the carousel box is on screen')) return;

  const report = async (label) => {
    await ui.sleep(300);
    const detail = box('#detail');
    // RE-QUERIED. Paging the stack re-renders the pane, and a node held from
    // before that reports a rect of all zeros rather than failing — which is
    // exactly what the squeezed half of this reported on its first run
    // (`carousel box 0 x 0`). Same trap as ots-freshness-fade's detached tab
    // and fx-tray-anchors' first draft.
    const live = ui.$('#detail .engine-carousel');
    if (!live) { ui.note(`${label}: the carousel is not on screen`); return; }
    const carR = live.getBoundingClientRect();
    const save = box('#detail .save-slot');
    const sub = box('#detail .engine-sub');
    const firstParam = box('#detail .col-fx .param') || box('#detail .param');
    // `.car-count` is the "Combo Piano · 15 of 24" line under the stack —
    // what carousel-caption calls the caption. IT ONLY RENDERS WHILE THE
    // FRONT CARD DIFFERS FROM THE LOADED SOUND, so the stack has to be paged
    // before it exists at all. Measuring its absence as "no overlap" is how
    // this would report clearance it never checked.
    let caption = box('#detail .car-count');
    if (!caption) {
      const step = ui.$('#detail .engine-carousel .is-step-next');
      if (step) { ui.click(step, 'paging the stack so the caption appears'); await ui.sleep(700); }
      caption = box('#detail .car-count');
    }
    const img = ui.$('#detail .engine-carousel .car-face.is-front img');

    ui.note(`──────── ${label} ────────`);
    ui.note(`#detail      ${px(detail.width)} x ${px(detail.height)}`
      + ` · scrollHeight ${px(ui.$('#detail').scrollHeight)} clientHeight ${px(ui.$('#detail').clientHeight)}`);
    ui.note(`carousel box ${px(carR.width)} x ${px(carR.height)} at y${px(carR.top)}..${px(carR.bottom)}`);
    if (sub) ui.note(`identity     y${px(sub.top)}..${px(sub.bottom)} (${px(sub.height)})`);
    if (save) ui.note(`Save patch   y${px(save.top)}..${px(save.bottom)} (${px(save.height)})`);
    if (firstParam) ui.note(`first param  y${px(firstParam.top)} (${px(firstParam.height)} tall)`);

    // THE SLACK. Whatever sits between the bottom of the engine column's last
    // item and the bottom of the pane is what +52px would have to come out of.
    const lastBottom = Math.max(save ? save.bottom : 0, sub ? sub.bottom : 0, carR.bottom);
    const slack = detail.bottom - lastBottom;
    ui.note(`SLACK below the engine column: ${px(slack)}px`
      + ` (last item ends y${px(lastBottom)}, pane ends y${px(detail.bottom)})`);
    const scroller = ui.$('#detail');
    const overflow = scroller.scrollHeight - scroller.clientHeight;
    ui.note(`the pane ${overflow > 0 ? `ALREADY SCROLLS by ${px(overflow)}px` : 'does not scroll'}`);
    const largest = Math.floor(carR.height + Math.max(0, slack));
    ui.note(`LARGEST SQUARE that fits without the pane growing: ${largest}px`
      + ` (${px(carR.height)} + ${px(Math.max(0, slack))})`);

    // THE CAPTION, which is the thing the known red is about.
    if (caption && img) {
      const nat = { w: img.naturalWidth, h: img.naturalHeight };
      const painted = (boxSide) => {
        const s = Math.min(boxSide / nat.w, boxSide / nat.h);
        return { w: nat.w * s, h: nat.h * s };
      };
      const now = painted(carR.height);
      const bottomNow = carR.top + (carR.height + now.h) / 2;
      ui.note(`front drawing natural ${nat.w}x${nat.h}`
        + ` → painted ${px(now.w)}x${px(now.h)}, its real bottom y${px(bottomNow)}`);
      ui.note(`caption      y${px(caption.top)}..${px(caption.bottom)}`);
      ui.note(`clearance now: ${px(caption.top - bottomNow)}px`
        + ` (negative = the overlap carousel-caption reports)`);
      for (const side of [140, 160, 180, largest]) {
        const p = painted(side);
        // The box grows downward from the same top in this grid cell, so the
        // painted bottom moves by the box growth plus half the extra height.
        const grow = side - carR.height;
        const bottomThen = carR.top + (side + p.h) / 2;
        ui.note(`  at ${side}px: painted ${px(p.w)}x${px(p.h)},`
          + ` bottom y${px(bottomThen)}, caption would need to move ${px(bottomThen - bottomNow)}px`
          + ` (box +${px(grow)})`);
      }
    } else {
      ui.note('caption or front <img> not found — clearance not measured');
    }
  };

  // THE NUMBERS THAT MUST NOT MOVE, captured before anything is simulated.
  const pin = () => ({
    firstParam: (box('#detail .col-fx .param') || box('#detail .param')).top,
    identityTop: box('#detail .engine-sub').top,
    identityBottom: box('#detail .engine-sub').bottom,
    saveTop: box('#detail .save-slot').top,
    saveBottom: box('#detail .save-slot').bottom,
    saveLeft: box('#detail .save-slot').left,
    saveWidth: box('#detail .save-slot').width,
  });

  await report('DEFAULT WIDTH');

  // ---- SIMULATE THE GROWTH, THEN PUT IT BACK --------------------------
  //
  // REASONING FROM THE LAYOUT IS NOT MEASURING IT. The first parameter row
  // starts ABOVE the picture's bottom, which says the parameters are in a
  // separate column — but "says" is not "shows". Growing the box for a moment
  // and re-reading the pinned numbers is the only thing that settles whether
  // +52px of height moves anything, and it costs one restore.
  const simulate = async (what) => {
    const live = ui.$('#detail .engine-carousel');
    if (!live) { ui.note(`${what}: no carousel to grow`); return; }
    const before = pin();
    const colE = box('#detail .col-engine');
    const colF = box('#detail .col-fx');
    ui.note(`${what}: engine column ${px(colE.width)}px · fx column ${px(colF.width)}px`);
    // DOES THE SAVE BUTTON'S TEXT STILL FIT? A narrower box is not harm by
    // itself; a clipped label is. scrollWidth past clientWidth is the tell.
    const clip = () => {
      const b = ui.$('#detail .save-slot button, #detail .save-slot .btn, #detail .save-slot');
      if (!b) return 'no button found';
      return b.scrollWidth > b.clientWidth + 1
        ? `CLIPPED (${b.scrollWidth} into ${b.clientWidth})`
        : `fits (${b.scrollWidth} in ${b.clientWidth})`;
    };
    ui.note(`  ${what} save label at rest: ${clip()}`);
    for (const side of [140, 160, 180, 260]) {
      live.style.height = `${side}px`;
      live.style.width = `${side}px`;
      await ui.sleep(350);
      const after = pin();
      const moved = Object.keys(before)
        .filter((k) => Math.abs(after[k] - before[k]) > 0.5)
        .map((k) => `${k} ${px(before[k])}→${px(after[k])}`);
      const scroller = ui.$('#detail');
      const eNow = box('#detail .col-engine');
      const fNow = box('#detail .col-fx');
      ui.note(`  ${what} at ${side}x${side}: ${moved.length ? 'MOVED — ' + moved.join(', ') : 'nothing moved'}`
        + ` · columns ${px(eNow.width)}/${px(fNow.width)}`
        + ` · pane ${scroller.scrollHeight > scroller.clientHeight
          ? `SCROLLS by ${px(scroller.scrollHeight - scroller.clientHeight)}px` : 'does not scroll'}`
        + ` · save label ${clip()}`);
    }
    live.style.height = '';
    live.style.width = '';
    await ui.sleep(350);
    const restored = pin();
    ui.check(Math.abs(restored.firstParam - before.firstParam) <= 0.5,
      `${what}: the layout is back where it started (first param y${px(restored.firstParam)})`);
  };

  await simulate('DEFAULT');


  // SQUEEZED. #detail is flex:1, so flex-basis wins over an inline width —
  // max-width is the lever that actually narrows it (harness note, 18 Nov).
  const restore = await ui.squeeze(ui.$('#detail'), 520, { what: 'the detail pane' });
  await report('SQUEEZED to 520px');
  await simulate('SQUEEZED');
  restore();
  await ui.sleep(300);

  ui.check(true, 'measurement only — nothing was changed');
})()
