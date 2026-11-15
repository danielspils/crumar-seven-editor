// THE THREE THINGS THAT MUST STAY TRUE OF THE CAROUSEL.
//
// This file has been rewritten twice today and both earlier versions asserted
// geometry that a later decision made false — which is its own lesson: a test
// written around a fix is a test that dies with the fix. What is here now is
// only what holds in the state Daniel reported as working, so it survives the
// next attempt at the remaining flaw instead of having to be rewritten again.
//
//   1. THE HERO'S CENTRE DOES NOT MOVE ON WAKE. Two separate attempts today
//      moved it — one by 93.5px laterally, one by scaling from the wrong
//      origin — and both read as the wheel jumping or skipping an image.
//   2. BOTH PEEKS RENDER. The peeks ARE the control: clicking one brings it to
//      the middle. A clip that hid them left the wheel unturnable, which is
//      the regression that started the whole chain.
//   3. A CLICK ON SAVE PATCH REACHES SAVE PATCH. A picture must never take a
//      press meant for a control.
//
// DELIBERATELY NOT ASSERTED: that the right-hand peek stays inside the engine
// column. It does not — while turning it runs ~55px past the edge, across the
// parameter rows and into the effects column. That is the one original flaw,
// Daniel has seen it, priced it against shrinking the resting artwork by a
// quarter, and kept it. Asserting it would be asserting against his decision;
// loosening the old assertion until it passed either way would be worse.
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
  rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await ui.sleep(2400);

  const car = ui.$('#detail .engine-carousel');
  if (!car) { ui.note('no carousel on screen (offline?)'); return; }
  const col = box(ui.$('#detail .col-engine'));
  ui.note(`engine column x${px(col.left)}..${px(col.right)} · carousel w${px(box(car).width)}`);

  // ── 1. THE CENTRE DOES NOT MOVE ────────────────────────────────────────
  // THE STARTING STATE IS CHOSEN, NOT INHERITED. app.js may leave the wheel
  // open after a selection, and a turn may still be settling — so measuring
  // "at rest" without saying what rest is reads whatever the app happened to
  // be doing. Two runs minutes apart gave 128px and 143.4px for the same
  // measurement before this was forced.
  car.classList.remove('is-open', 'is-turning', 'is-turning-next', 'is-turning-prev', 'no-anim');
  await ui.sleep(400);
  const rest = hero();
  ui.note(`REST  hero x${px(rest.left)}..${px(rest.right)} w${px(rest.width)} centre ${px(cx(rest))}`);
  car.classList.add('is-open', 'no-anim');
  await ui.sleep(320);
  const awake = hero();
  ui.note(`AWAKE hero x${px(awake.left)}..${px(awake.right)} w${px(awake.width)} centre ${px(cx(awake))}`);
  ui.check(Math.abs(cx(awake) - cx(rest)) <= 1,
    `the hero's centre does not move on wake (${px(cx(rest))} vs ${px(cx(awake))})`);

  // ── 2. BOTH PEEKS RENDER ───────────────────────────────────────────────
  // REACHABLE, NOT MERELY LAID OUT. The first version of this asked for a
  // non-zero box and a non-zero opacity, and it PASSED with the clip that
  // started this whole chain reinstated — getBoundingClientRect reports the
  // laid-out box whether or not a pixel of it is painted, and opacity is a
  // property of the element, not of what survives an ancestor's overflow.
  // A peek IS the control: clicking one brings it to the middle. So the
  // question is whether a press at its centre lands on it, which a clip
  // answers by failing.
  const peeks = ui.$$('#detail .car-face.is-peek');
  let reachable = 0;
  for (const p of peeks) {
    const r = box(p);
    const side = /is-prev/.test(p.className) ? 'prev' : 'next';
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const lands = !!(hit && (hit === p || p.contains(hit)));
    if (lands) reachable++;
    ui.note(`  ${side} peek x${px(r.left)}..${px(r.right)} w${px(r.width)}`
      + ` opacity ${getComputedStyle(p).opacity}`
      + ` · a press at its centre hits ${hit ? hit.tagName.toLowerCase() : 'null'}`
      + `${lands ? ' (the peek)' : ' (NOT the peek)'}`
      + (r.right > col.right ? ` — runs ${px(r.right - col.right)}px past the column (the known flaw)` : ''));
    ui.check(lands, `the ${side} peek can be clicked where it is drawn`);
  }
  ui.check(reachable === 2, `both peeks are reachable when the wheel wakes (${reachable} of 2)`);

  // ── 3. SAVE PATCH IS NOT TAKEN BY A PICTURE ────────────────────────────
  const save = ui.$('#save-live-btn') || ui.$('#detail .save-slot button');
  if (save && box(save).width) {
    const r = box(save);
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    ui.note(`Save patch x${px(r.left)}..${px(r.right)} — a click there hits `
      + `${hit ? hit.tagName.toLowerCase() : 'null'}`);
    ui.check(!!hit && (hit === save || save.contains(hit)),
      'a click on Save patch reaches Save patch while the wheel is awake');
  } else {
    ui.note('Save patch is not on screen for this slot — not checked');
  }

  car.classList.remove('is-open', 'no-anim');
})()
