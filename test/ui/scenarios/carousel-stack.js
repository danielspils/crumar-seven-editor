// THE STACK DRAWS INSIDE ITS OWN CELL. Daniel's brief: "Measure that the
// stack's painted bounds stay inside .engine-stage at both pane widths, and
// that no control beside it is covered. That test is the point of the
// change."
//
// IT IS THE POINT BECAUSE IT IS THE CLAIM THE DELETIONS REST ON. The wheel
// drew its neighbours OUTSIDE the stage, and everything removed with it —
// the clearance bar swept per window width, the document-level pointermove
// test, the media query that hid the peeks below 1031px and took the only
// way of turning the wheel with them — existed to manage faces that escaped.
// If the stack escapes too, those deletions were wrong and the bugs come
// back by another route.
//
// THE PAINTED BOUNDS, NOT THE LAYOUT BOX. Every card is `width: 100%` of the
// cell and then TRANSFORMED — translated off-centre and scaled down — so its
// layout box says nothing about where it is drawn. getBoundingClientRect()
// reports the transformed box, which is the one the eye sees, and that is
// what is compared.
//
// IT NEEDS THE INSTRUMENT, and that is not a convenience — it is the app
// refusing to guess. The carousel renders only when something is connected
// (`view.canPickSound && view.connected` in renderer.js): offline, soundList
// falls back to the SCHEMA's 24 sounds, which is this BUILD's list and not
// the player's instrument, so a wheel there would offer sounds their Seven
// does not have and hide ones it does. That rule predates this change and is
// right. The consequence for this scenario is that it CANNOT run offline —
// written with @env SEVEN_NO_DEVICE=1 first, it reported "no carousel on
// screen" and failed on its own preconditions rather than on the geometry.
//
// SO IT SKIPS WITHOUT ONE, and the skip is honest by CLAUDE.md's rule: no
// instrument is a precondition this scenario cannot control, not a result
// the feature is responsible for.
//
// ---- THE FIVE SCENARIOS THIS ONE REPLACES ------------------------------
//
// Deleted 18 Nov 2026, each of them a guard on machinery that no longer
// exists. Listed because a deleted file cannot be told from one that was
// never written, and somebody will ask what covered this before:
//
//   carousel-peeks.js        the three things that had to stay true of the
//                            wheel: the hero's centre does not move on wake,
//                            both peeks are REACHABLE (not merely laid out —
//                            getBoundingClientRect reports a box whether or
//                            not a pixel is painted, so it pressed at the
//                            peek's centre and asked what answered), and a
//                            click on Save patch reaches Save patch.
//   carousel-narrow.js       the 1032 band, where the spread dropped to 44%.
//   carousel-no-peek.js      the 1000 band, where no spread worked and the
//                            peeks were hidden entirely.
//   carousel-ceiling.js      a PROBE that swept the spread at a fixed width
//                            to derive the clearance ceiling, after b8f78ee
//                            moved Save patch and left the old threshold
//                            4.99px too generous.
//   modal-blocks-carousel.js that a pointer event over the carousel with a
//                            dialog up did not open it.
//
// THE LAST ONE IS THE ONE WORTH UNDERSTANDING, because its lesson outlives
// its subject. The bug was NOT clicks falling through the backdrop —
// measured, elementFromPoint at the carousel's centre returned the dialog's
// own button, and the backdrop was correct at z-index 60. The bug was that
// the carousel never asked: it decided by comparing clientX/clientY against
// a rect, on `document`, and a coordinate test bound to the document is
// invisible to everything painted over it. z-index and pointer-events
// cannot reach that. The stack has no such test — it has no hover state at
// all — so the property is gone rather than defended.
//
// WHAT THIS FILE KEEPS FROM THEM: the press test. The two checks below that
// ask `document.elementFromPoint` what answers at a control's centre are
// carousel-peeks.js's sharpest idea, applied to every interactive element in
// the pane rather than to Save patch alone.
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };
  const px = (n) => Math.round(n * 10) / 10;
  const box = (el) => (el ? el.getBoundingClientRect() : null);

  await ui.selectTab('patches');
  await ui.sleep(800);
  const row = ui.$('#library .lib-row.lib-patch');
  if (!row) { ui.check(false, 'there is a patch to select'); return; }
  ui.click(row, 'the first patch');
  await ui.sleep(1400);

  const report = async (label) => {
    const stage = ui.$('#detail .engine-stage');
    const car = ui.$('#detail [data-carousel]');
    ui.note('');
    ui.note(`################  ${label}  ################`);
    if (!stage || !car) {
      ui.note('  no carousel on screen — this patch has fewer than two sounds?');
      return null;
    }
    const s = box(stage);
    ui.note(`  .engine-stage  x ${px(s.left)}..${px(s.right)}`
      + ` y ${px(s.top)}..${px(s.bottom)}  (${px(s.width)}x${px(s.height)})`);

    // ---- EVERY CARD, AND WHETHER IT ESCAPES ---------------------------
    const cards = ui.$$('#detail [data-carousel] .car-face');
    ui.note(`  cards: ${cards.length}`);
    ui.note('  WHICH         x range            y range          out by');
    const escapes = [];
    for (const c of cards) {
      const b = box(c);
      const cls = [...c.classList].find((k) => k.startsWith('is-')) || '?';
      const cs = getComputedStyle(c);
      // AN INVISIBLE CARD CANNOT COVER ANYTHING. is-waiting is parked off to
      // the left at opacity 0 on purpose — it is where a backward step comes
      // FROM — so it is measured and reported but not held to the bound.
      const visible = Number(cs.opacity) > 0.01;
      const out = Math.max(
        s.left - b.left, b.right - s.right, s.top - b.top, b.bottom - s.bottom, 0
      );
      ui.note(`    ${cls.padEnd(12)}${String(px(b.left)).padStart(7)}..`
        + `${String(px(b.right)).padEnd(8)}${String(px(b.top)).padStart(7)}..`
        + `${String(px(b.bottom)).padEnd(8)}  ${px(out)}`
        + (visible ? '' : '   (opacity 0 — parked)'));
      if (visible && out > 0.5) escapes.push(`${cls} by ${px(out)}px`);
    }
    ui.check(escapes.length === 0,
      escapes.length ? `${label}: cards painted outside .engine-stage: ${escapes.join(', ')}`
        : `${label}: every visible card stays inside .engine-stage`);

    // ---- AND NOTHING BESIDE IT IS COVERED ------------------------------
    //
    // THE SAME QUESTION THE OLD SCENARIOS ASKED OF THE PEEKS, asked of every
    // interactive thing in the detail pane rather than of Save patch alone.
    // Save patch was the tightest control and the one the ceiling was swept
    // against, but "the tightest one is clear" is not "nothing is covered",
    // and a stack that drew wrong could land anywhere.
    const controls = ui.$$('#detail button, #detail a, #detail input, #detail select')
      .filter((el) => !el.closest('[data-carousel]'))
      .filter((el) => { const b = box(el); return b.width > 0 && b.height > 0; });
    ui.note(`  interactive controls beside the stack: ${controls.length}`);
    const covered = [];
    for (const el of controls) {
      const b = box(el);
      for (const c of cards) {
        if (Number(getComputedStyle(c).opacity) <= 0.01) continue;
        const cb = box(c);
        const overlapX = Math.min(b.right, cb.right) - Math.max(b.left, cb.left);
        const overlapY = Math.min(b.bottom, cb.bottom) - Math.max(b.top, cb.top);
        if (overlapX > 0.5 && overlapY > 0.5) {
          const name = (el.textContent || el.id || el.className || '?').trim().slice(0, 24);
          covered.push(`"${name}" by ${[...c.classList].find((k) => k.startsWith('is-'))}`
            + ` (${px(overlapX)}x${px(overlapY)}px)`);
        }
      }
    }
    ui.check(covered.length === 0,
      covered.length ? `${label}: a card overlaps ${covered.join('; ')}`
        : `${label}: no control beside the stack is covered`);

    // ---- AND NOTHING COULD TAKE A CLICK ANYWAY -------------------------
    //
    // BOXES ARE THE WRONG QUESTION ON THEIR OWN. An overlap only matters if
    // the thing on top can take the press, so this asks the browser directly
    // what is at each control's centre — the check that would have caught
    // the wheel's peek-on-Save-patch without any arithmetic.
    const stolen = [];
    for (const el of controls) {
      const b = box(el);
      const cx = b.left + b.width / 2;
      const cy = b.top + b.height / 2;
      if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) continue;
      const hit = document.elementFromPoint(cx, cy);
      if (hit && hit.closest('[data-carousel] .car-face')) {
        stolen.push((el.textContent || el.id || '?').trim().slice(0, 24));
      }
    }
    ui.check(stolen.length === 0,
      stolen.length ? `${label}: a card takes the press at the centre of ${stolen.join(', ')}`
        : `${label}: every control answers its own press`);

    return { stage: s, cards: cards.length };
  };

  await report('DEFAULT WIDTH');

  // THE SECOND WIDTH. The pane is what the brief names, and squeezing it is
  // what moves the detail column — the stage's own width follows.
  const pane = ui.$('#library');
  const original = pane ? pane.style.width : '';
  if (pane) {
    pane.style.width = '360px';
    await ui.sleep(600);
    await report('PANE SQUEEZED TO 360px');
    pane.style.width = original;
    await ui.sleep(300);
  }

  // ---- THE POSITION COUNTER ---------------------------------------------
  ui.note('');
  const count = ui.$('#detail .car-count');
  ui.check(!!count, 'the position counter is under the stack');
  if (count) {
    const t = (count.textContent || '').trim();
    const cs = getComputedStyle(count);
    const fresh = ui.$('#bank-asof') || ui.$('#bank1-note');
    ui.note(`counter: "${t}" · ${cs.fontSize}/${cs.fontWeight} · ${cs.letterSpacing}`
      + ` · ${cs.textTransform} · ${cs.color}`);
    ui.check(/^\d+ of \d+$/.test(t), `it reads "n of m" (${t})`);
    // SAME TYPE AS THE FRESHNESS LINE, asked of both rather than compared
    // against copied values: they share the .fresh rule, so this is checking
    // that the class is actually on it.
    if (fresh) {
      const f = getComputedStyle(fresh);
      ui.note(`freshness line: ${f.fontSize}/${f.fontWeight} · ${f.letterSpacing}`
        + ` · ${f.textTransform} · ${f.color}`);
      for (const k of ['fontSize', 'fontWeight', 'letterSpacing', 'textTransform', 'color']) {
        ui.check(cs[k] === f[k], `  ${k}: ${cs[k]} === ${f[k]}`);
      }
    }
    const b = box(count);
    const stage = box(ui.$('#detail .engine-stage'));
    if (stage) {
      ui.note(`counter box y ${px(b.top)}..${px(b.bottom)}`
        + ` against a stage ending at ${px(stage.bottom)}`);
    }
  }

  // ---- THE CHEVRONS ARE THE ONLY HIT TARGETS ----------------------------
  ui.note('');
  const steps = ui.$$('#detail [data-car-step]');
  ui.note(`chevrons: ${steps.length}`);
  ui.check(steps.length === 2, 'both chevrons are present at this width');
  for (const s of steps) {
    const b = box(s);
    const stage = box(ui.$('#detail .engine-stage'));
    const cs = getComputedStyle(s);
    ui.note(`  ${s.className} ${px(b.width)}x${px(b.height)} at x${px(b.left)}`
      + ` · display ${cs.display}`);
    ui.check(cs.display !== 'none', 'it is shown — it is the control now');
    if (stage) {
      ui.check(b.left >= stage.left - 0.5 && b.right <= stage.right + 0.5,
        `and it sits inside the stage (${px(b.left)}..${px(b.right)}`
        + ` in ${px(stage.left)}..${px(stage.right)})`);
    }
    // The press lands on the button itself, not on a card over it.
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    ui.check(!!hit && !!hit.closest('[data-car-step]'),
      `a press at its centre reaches it (hit <${hit ? hit.tagName.toLowerCase() : 'none'}>)`);
  }

  // ---- AND A STEP TURNS THE STACK ---------------------------------------
  //
  // 0x46 AND NOTHING ELSE is the send path and needs an instrument; what is
  // checkable offline is that a chevron MOVES the stack and that the counter
  // follows it. Nothing is sent here — there is no instrument to send to.
  ui.note('');
  const before = (ui.$('#detail .car-count') || {}).textContent;
  const frontBefore = (ui.$('#detail .is-front') || {}).dataset;
  const next = ui.$('#detail [data-car-step="1"]');
  if (next && before) {
    ui.click(next, 'the next chevron');
    await ui.sleep(900);
    const after = (ui.$('#detail .car-count') || {}).textContent;
    const frontAfter = (ui.$('#detail .is-front') || {}).dataset;
    ui.note(`counter ${before} -> ${after}`);
    ui.note(`front ${frontBefore ? frontBefore.carName : '?'}`
      + ` -> ${frontAfter ? frontAfter.carName : '?'}`);
    ui.check(after !== before, `a step advances the counter (${before} -> ${after})`);
    ui.check(!frontBefore || !frontAfter || frontBefore.carName !== frontAfter.carName,
      'and a different instrument is in front');
  }
})()
