// A CARD LEAVES AND RETURNS BY THE SAME SIDE.
//
// Daniel, 18 Nov 2026, watching it in the app: pressing the left chevron
// brought the new card in from the LEFT, and it felt like it should come from
// the right. The incoherence was that a card left one way and returned the
// other — forward sends the front card out to translate(40%, -50%), while
// `.is-waiting` was parked at translate(-140%, -50%).
//
// One value fixed it: the waiting card now parks where the front card exits
// to. Off to the RIGHT is both where a card goes when you move forward and
// where it comes back from when you move back.
//
// WHAT THIS PINS, and it is the direction rather than the pixel count: on a
// BACKWARD step the arriving card must come from the right of centre and
// travel LEFTWARD. Asserting its exact parking offset would make this a test
// of a number somebody may well tune; asserting the side is the thing that was
// actually wrong.
//
// AND IT MEASURES THE CROSSING, which is the consequence Daniel asked about.
// With one corridor the incoming card moves left while the outgoing front card
// moves right, so they pass through each other; under the old parking they
// diverged. Whether that reads as a shuffle or a collision depends on how much
// of each is painted while they overlap, so this samples both cards' positions
// AND their opacities through the turn and reports the worst moment.
//
// NO INSTRUMENT. The stack renders offline — deliberately, so the app can be
// demonstrated without a Seven — and turning it sends nothing.
(async () => {
  const px = (n) => Math.round(n * 10) / 10;
  const car = () => ui.$('#detail .engine-carousel');
  const card = (cls) => ui.$(`#detail .engine-carousel .${cls}`);
  const centre = (el) => {
    const r = el.getBoundingClientRect();
    return r.left + r.width / 2;
  };

  await ui.openLibrary();
  await ui.sleep(400);
  const patchRow = ui.$('#library .lib-row.lib-patch, #library [data-file]');
  if (!patchRow) return { skipped: 'this library holds no patch to open' };
  ui.click(patchRow, 'a patch');
  await ui.sleep(2500);

  if (!ui.check(!!car(), 'the engine stack is on screen')) return;
  car().scrollIntoView({ block: 'center' });
  await ui.sleep(400);

  const prev = ui.$('#detail .engine-carousel .is-step-prev');
  if (!ui.check(!!prev, 'the previous chevron is there')) return;

  // ---- 1. THE WAITING CARD PARKS ON THE RIGHT --------------------------
  //
  // At rest, before any turn. Measured against the FRONT card's centre rather
  // than against the stage's, because the front card is what it will replace
  // and what the player is looking at.
  const frontAtRest = centre(card('is-front'));
  const waitingAtRest = centre(card('is-waiting'));
  ui.note(`at rest: front centre x${px(frontAtRest)}, waiting centre x${px(waitingAtRest)}`);
  ui.check(waitingAtRest > frontAtRest,
    `the waiting card is parked to the RIGHT of the front card`
    + ` (+${px(waitingAtRest - frontAtRest)}px)`);

  // AND IT IS THE SAME CORRIDOR THE FRONT CARD LEAVES BY. The forward exit is
  // a CSS rule rather than a live position, so this reads the declared value
  // instead of animating a turn in the wrong direction to find it.
  const exitRule = Array.from(document.styleSheets)
    .flatMap((s) => { try { return Array.from(s.cssRules); } catch { return []; } })
    .find((r) => r.selectorText === '.engine-carousel.is-turning-next .is-front');
  const waitRule = Array.from(document.styleSheets)
    .flatMap((s) => { try { return Array.from(s.cssRules); } catch { return []; } })
    .find((r) => r.selectorText === '.engine-carousel .is-waiting');
  if (exitRule && waitRule) {
    const xOf = (t) => (t.match(/translate\(\s*(-?[\d.]+%)/) || [])[1];
    const exitX = xOf(exitRule.style.transform);
    const waitX = xOf(waitRule.style.transform);
    ui.note(`forward exit translate x ${exitX}; waiting parked at x ${waitX}`);
    ui.check(exitX === waitX,
      `one corridor — a card returns from exactly where it leaves (${exitX})`);
  } else {
    ui.check(false, 'both transform rules are readable from the stylesheet');
  }

  // ---- 2. THE ARRIVING CARD TRAVELS LEFTWARD ---------------------------
  //
  // Sampled through the turn. The classes are rewritten by the re-render at
  // the end, so each sample re-queries and the loop stops if the node goes.
  const samples = [];
  const incoming = card('is-waiting');
  const outgoing = card('is-front');
  ui.click(prev, 'stepping the stack backward');
  const t0 = performance.now();
  while (performance.now() - t0 < 320) {
    if (!incoming.isConnected || !outgoing.isConnected) break;
    samples.push({
      t: Math.round(performance.now() - t0),
      inX: centre(incoming),
      outX: centre(outgoing),
      inOp: Number(getComputedStyle(incoming).opacity),
      outOp: Number(getComputedStyle(outgoing).opacity),
      inR: incoming.getBoundingClientRect(),
      outR: outgoing.getBoundingClientRect(),
    });
    await ui.sleep(40);
  }
  ui.note(`sampled ${samples.length} frames over the turn`);
  if (!ui.check(samples.length >= 4, 'the turn was sampled')) return;

  const first = samples[0];
  const last = samples[samples.length - 1];
  ui.note(`incoming x${px(first.inX)} → x${px(last.inX)};`
    + ` outgoing x${px(first.outX)} → x${px(last.outX)}`);
  ui.check(last.inX < first.inX,
    `the arriving card travels LEFTWARD into the centre`
    + ` (${px(first.inX)} → ${px(last.inX)})`);
  ui.check(last.outX > first.outX,
    `and the leaving card moves rightward into the stack`
    + ` (${px(first.outX)} → ${px(last.outX)})`);

  // ---- 3. WHAT THE CROSSING ACTUALLY LOOKS LIKE ------------------------
  //
  // REPORTED, NOT ASSERTED. "Shuffle or collision" is Daniel's judgement to
  // make; what this owes him is the numbers at the worst moment rather than an
  // adjective. The measure of how much a crossing is SEEN is the overlap
  // weighted by how painted both cards are — two shapes sharing space while
  // one is at opacity .05 is not a collision.
  let worst = null;
  for (const s of samples) {
    const overlap = Math.max(0,
      Math.min(s.inR.right, s.outR.right) - Math.max(s.inR.left, s.outR.left));
    const seen = overlap * Math.min(s.inOp, s.outOp);
    if (!worst || seen > worst.seen) worst = { ...s, overlap, seen };
  }
  const width = first.inR.width;
  ui.note(`card width ${px(width)}px at the real size`);
  ui.note(`WORST MOMENT t+${worst.t}ms: they overlap ${px(worst.overlap)}px`
    + ` (${px((worst.overlap / width) * 100)}% of a card),`
    + ` incoming at opacity ${px(worst.inOp)}, outgoing at ${px(worst.outOp)}`);
  ui.note(`weighted visibility of the overlap: ${px(worst.seen)}`
    + ` — the lower this is, the less the crossing is seen at all`);
  // The one thing worth failing on: both cards fully painted on top of each
  // other would be a collision by any reading.
  ui.check(!(worst.overlap > width * 0.5 && Math.min(worst.inOp, worst.outOp) > 0.8),
    'the cards are never both solid and half-covering each other');

  // ---- 3b. AGAINST THE DIRECTION THAT ALREADY LOOKS RIGHT --------------
  //
  // A 98% overlap means nothing on its own. The FORWARD turn is the control:
  // it is the step Daniel has been using all along and has never objected to,
  // so if backward's worst moment is no worse than forward's, the crossing is
  // within what the stack already does rather than something new.
  //
  // Measured the same way, on the same cards, at the same size.
  await ui.sleep(700);
  const next = ui.$('#detail .engine-carousel .is-step-next');
  if (next) {
    const fIn = card('is-next');          // the card coming forward to front
    const fOut = card('is-front');        // …and the one leaving to the right
    if (fIn && fOut) {
      const fwd = [];
      ui.click(next, 'stepping the stack forward');
      const f0 = performance.now();
      while (performance.now() - f0 < 320) {
        if (!fIn.isConnected || !fOut.isConnected) break;
        fwd.push({
          t: Math.round(performance.now() - f0),
          inR: fIn.getBoundingClientRect(), outR: fOut.getBoundingClientRect(),
          inOp: Number(getComputedStyle(fIn).opacity),
          outOp: Number(getComputedStyle(fOut).opacity),
        });
        await ui.sleep(40);
      }
      let fWorst = null;
      for (const s of fwd) {
        const overlap = Math.max(0,
          Math.min(s.inR.right, s.outR.right) - Math.max(s.inR.left, s.outR.left));
        const seen = overlap * Math.min(s.inOp, s.outOp);
        if (!fWorst || seen > fWorst.seen) fWorst = { ...s, overlap, seen };
      }
      if (fWorst) {
        ui.note(`FORWARD's worst moment t+${fWorst.t}ms: overlap ${px(fWorst.overlap)}px`
          + ` (${px((fWorst.overlap / width) * 100)}%), opacities ${px(fWorst.inOp)}`
          + ` / ${px(fWorst.outOp)}, weighted ${px(fWorst.seen)}`);
        ui.note(`BACKWARD weighted ${px(worst.seen)} vs FORWARD ${px(fWorst.seen)}`
          + ` — backward is ${worst.seen > fWorst.seen ? 'MORE' : 'no more'} visible a crossing`);
        // REPORTED, NOT ASSERTED — and deliberately so, having been written as
        // an assertion first and failed (63.7 vs 18.5, 18 Nov 2026).
        //
        // IT WOULD HAVE PINNED A DECISION NOBODY MADE. Daniel chose the
        // one-corridor parking after prototyping it against two alternatives,
        // and asked for the crossing to be MEASURED AND REPORTED. "Backward
        // must be no worse than forward" is a different claim, invented here,
        // with a 1.35 nobody agreed — and a test that pins behaviour somebody
        // merely happened to prefer needs a reason in the comment or should
        // not be written (CLAUDE.md).
        //
        // WHY THEY DIFFER, since the number is useless without it: the two
        // steps are not mirrors. Forward, the leaving card travels 90% of a
        // card-width out to +40% while the arriving one shifts 14%, so they
        // separate immediately. Backward, the arriving card covers that same
        // 90% ONTO a front card that only moves 14% — it lands on a nearly
        // stationary target rather than passing it.
        //
        // If the crossing is ever judged too much, the fix is in those two
        // travels and not here; this note is what a later reader needs to
        // know it was seen and priced.
        ui.note(worst.seen > fWorst.seen * 1.35
          ? `NOTE: backward's crossing is ${px(worst.seen / fWorst.seen)}x forward's.`
            + ` Reported for judgement, not failed — see the comment here.`
          : `backward's crossing is within forward's, which nobody has objected to`);
      }
    }
  }

  // ---- 4. BOTH THEMES --------------------------------------------------
  //
  // The geometry is theme-independent — the transforms are the same rules —
  // so what is checked here is what DIFFERS: how visible a card is against its
  // ground while the two are crossing. A card that is nearly invisible in one
  // theme and strong in the other would read as two different animations.
  await ui.sleep(600);
  for (const theme of ['light', 'dark']) {
    document.documentElement.setAttribute('data-theme', theme);
    await ui.sleep(400);
    const f = card('is-front');
    const w = card('is-waiting');
    if (!f || !w) { ui.check(false, `the stack is still there in ${theme}`); continue; }
    const cs = getComputedStyle(f);
    ui.note(`${theme}: front card background ${cs.backgroundColor}, border ${cs.borderColor};`
      + ` waiting parked x${px(centre(w) - centre(f))}px from the front`);
    ui.check(centre(w) > centre(f),
      `the waiting card parks to the right in ${theme} too`);
  }
  document.documentElement.removeAttribute('data-theme');
  await ui.sleep(200);
})()
