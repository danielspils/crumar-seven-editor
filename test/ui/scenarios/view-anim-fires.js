// @env SEVEN_NO_DEVICE=1
//
// THE ANIMATIONS ACTUALLY FIRE, IN THE REAL WINDOW, AND FIRE AGAIN.
//
// test/view-anim.test.js pins the ORDER of the three operations against a
// recording stub. It cannot say whether a real browser plays anything: that
// needs a real element, a real stylesheet and real layout, which is here.
//
// THE REPEAT IS THE POINT. Removing the reflow read leaves the first fade
// working and every one after it dead, so a scenario that clicks Patches once
// proves nothing. Every check below does the move twice.
//
// MEASURED WITH getAnimations(), not by watching opacity. A sampled opacity
// is a race — the fade is 250ms and a scenario cannot reliably catch the
// middle of it — while getAnimations() asks the browser directly what is
// running on that element, which is exactly the question.
(async () => {
  const px = (n) => Math.round(n * 10) / 10;

  // WHAT IS PLAYING ON THIS ELEMENT RIGHT NOW, by name. An empty list is the
  // failure the reflow bug produces.
  const playing = (el) => {
    if (!el || typeof el.getAnimations !== 'function') return [];
    return el.getAnimations().map((a) => (a.animationName
      || (a.effect && a.effect.getKeyframes && 'effect') || '?'));
  };

  const reduced = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  ui.note(`prefers-reduced-motion: ${reduced}`);
  if (reduced) {
    // A PRECONDITION THIS CANNOT CONTROL, so it skips rather than failing —
    // and says which of the two it is, per CLAUDE.md's rule.
    ui.note('the desk asks for reduced motion, so there is nothing to observe');
    return;
  }

  // The keyframe has to exist before anything can play it.
  const names = [];
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    for (const r of rules) if (r.name) names.push(r.name);
  }
  ui.note(`keyframes defined: ${names.join(', ')}`);
  ui.check(names.includes('tab-in-fade'), 'tab-in-fade is defined');
  ui.check(names.includes('modal-rise'), 'modal-rise is defined');
  // ONE FADE KEYFRAME, USED TWICE. The brief says not to write a second one,
  // so a second one is a failure rather than a style note.
  const fades = names.filter((n) => /fade/i.test(n) && n !== 'tab-in-fade');
  ui.check(fades.length === 0,
    fades.length ? `a second fade keyframe exists: ${fades.join(', ')}`
      : 'and there is only one fade keyframe, reused by the modal backdrop');

  // ---- 1. THE FOUR TOP TABS ---------------------------------------------
  //
  // Each move is checked by looking at the list that should be fading at the
  // moment the click lands. The list differs by tab: #patch-list on Seven,
  // .lib-list on the other three.
  const listFor = (tab) => (tab === 'seven'
    ? ui.$('#patch-list') : ui.$('#library .lib-list'));

  const tabMove = async (to, label) => {
    const btn = ui.$(`#top-tabs .top-tab[data-view="${to}"]`);
    if (!btn) { ui.check(false, `the ${to} tab is on screen`); return null; }
    ui.click(btn, `the ${to} tab`);
    // ONE FRAME, not a sleep: the class goes on synchronously in the click
    // handler, and the animation is registered by the next frame. A sleep
    // long enough to be safe is long enough for a 250ms fade to finish.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const el = listFor(to);
    const on = playing(el);
    ui.note(`  ${label.padEnd(26)} ${el ? el.className || el.id : '(no list)'}`
      + ` · playing: ${on.join(', ') || 'NOTHING'}`);
    return on;
  };

  ui.note('');
  ui.note('TOP TABS');
  await ui.selectTab('seven');
  await ui.sleep(600);
  const first = await tabMove('patches', 'seven -> patches');
  await ui.sleep(500);
  await tabMove('seven', 'patches -> seven');
  await ui.sleep(500);
  // THE REPEAT. Same move as `first`, and the one that dies without the
  // reflow read.
  const again = await tabMove('patches', 'seven -> patches AGAIN');

  ui.check(first && first.includes('tab-in-fade'),
    `the first tab change fades (${(first || []).join(', ') || 'nothing played'})`);
  ui.check(again && again.includes('tab-in-fade'),
    'AND THE REPEAT FADES — this is the one the reflow read exists for'
    + ` (${(again || []).join(', ') || 'nothing played'})`);

  // ---- 2. THE BANK TABS -------------------------------------------------
  ui.note('');
  ui.note('BANK TABS (the tabs hold still, the rows fade)');
  await ui.selectTab('seven');
  await ui.sleep(600);
  const bankMove = async (i, label) => {
    const t = ui.$$('#bank-tabs .bank-tab')[i];
    if (!t) return null;
    ui.click(t, `bank ${i + 1}`);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const on = playing(ui.$('#patch-list'));
    const tabsOn = playing(ui.$('#bank-tabs'));
    ui.note(`  ${label.padEnd(26)} rows: ${on.join(', ') || 'NOTHING'}`
      + ` · the tab strip: ${tabsOn.join(', ') || 'still'}`);
    ui.check(tabsOn.length === 0, `${label}: the bank tab strip holds still`);
    return on;
  };
  const b1 = await bankMove(1, 'bank 1 -> 2');
  await ui.sleep(500);
  await bankMove(2, 'bank 2 -> 3');
  await ui.sleep(500);
  const b3 = await bankMove(1, 'bank 3 -> 2 AGAIN');
  ui.check(b1 && b1.includes('tab-in-fade'), 'a bank change fades the rows');
  ui.check(b3 && b3.includes('tab-in-fade'), 'and a repeat fades them again');

  // ---- 3. OPENING A BACKUP RUN, AND COMING BACK OUT ---------------------
  ui.note('');
  ui.note('INTO A BACKUP RUN AND BACK');
  await ui.selectTab('backups');
  await ui.sleep(800);
  const intoRun = async (label) => {
    const run = ui.$('.lib-setlist[data-backup]');
    if (!run) { ui.note(`  ${label}: no backup runs in this library`); return null; }
    ui.click(run, 'a backup run');
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const on = playing(ui.$('#library .lib-list'));
    ui.note(`  ${label.padEnd(26)} playing: ${on.join(', ') || 'NOTHING'}`);
    return on;
  };
  const outOfRun = async (label) => {
    const back = ui.$('.lib-back');
    if (!back) { ui.note(`  ${label}: no back button`); return null; }
    ui.click(back, 'back');
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const on = playing(ui.$('#library .lib-list'));
    ui.note(`  ${label.padEnd(26)} playing: ${on.join(', ') || 'NOTHING'}`);
    return on;
  };
  const in1 = await intoRun('open a run');
  await ui.sleep(500);
  const out1 = await outOfRun('back out');
  await ui.sleep(500);
  const in2 = await intoRun('open a run AGAIN');
  await ui.sleep(500);
  await outOfRun('back out again');
  if (in1) {
    ui.check(in1.includes('tab-in-fade'), 'opening a run fades the list');
    ui.check(!!out1 && out1.includes('tab-in-fade'), 'and the back button does too');
    ui.check(!!in2 && in2.includes('tab-in-fade'), 'and a repeat fades again');
  }

  // ---- 4. A MODAL ARRIVES, AND LEAVES ----------------------------------
  //
  // THE LEAVING HALF IS THE FIX. A modal was reported still standing behind
  // the next one, so the thing to prove is that the root GOES — and that it
  // stops taking clicks the moment it starts going, which is what let the
  // old one swallow a press meant for the new one.
  ui.note('');
  ui.note('A MODAL');
  const before = ui.$$('.seven-modal-overlay').length;
  const p = SevenModal.confirm({
    title: 'Animation probe',
    body: 'Opened by view-anim-fires.js. Nothing is sent and nothing is saved.',
    confirmLabel: 'OK',
    cancelLabel: 'Close',
  });
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const host = ui.$('.seven-modal-overlay');
  ui.check(!!host, 'the modal is on screen');
  if (host) {
    const card = host.querySelector('.seven-modal');
    const hostOn = playing(host);
    const cardOn = playing(card);
    ui.note(`  arriving — backdrop: ${hostOn.join(', ') || 'NOTHING'}`
      + ` · card: ${cardOn.join(', ') || 'NOTHING'}`);
    ui.check(hostOn.includes('tab-in-fade'),
      'the backdrop reuses tab-in-fade rather than a second keyframe');
    ui.check(cardOn.includes('modal-rise'), 'and the card rises');
    // translate AND scale AS SEPARATE PROPERTIES, not transform — a card
    // already positioned by a transform must keep it.
    const kf = card.getAnimations()[0];
    const props = kf && kf.effect && kf.effect.getKeyframes
      ? Object.keys(kf.effect.getKeyframes()[0] || {}) : [];
    ui.note(`  the card's keyframe properties: ${props.join(', ')}`);
    ui.check(!props.includes('transform'),
      `translate/scale as separate properties, never transform (${props.join(', ')})`);

    // AND NOW IT LEAVES.
    const ok = host.querySelector('.seven-modal-ok');
    if (ok) ui.click(ok, 'OK');
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const leaving = ui.$('.seven-modal-overlay.is-leaving');
    ui.note(`  leaving — is-leaving present: ${!!leaving}`
      + ` · pointer-events: ${leaving ? getComputedStyle(leaving).pointerEvents : '—'}`);
    ui.check(!!leaving, 'it is marked as leaving rather than vanishing');
    if (leaving) {
      ui.check(getComputedStyle(leaving).pointerEvents === 'none',
        'and it stops taking clicks the moment it starts leaving');
      const box = leaving.getBoundingClientRect();
      ui.note(`  its box while leaving: ${px(box.width)}x${px(box.height)}`
        + ' — still full screen, which is why pointer-events matters');
    }
    await p;
    // THE GUARANTEE: it is gone. Longer than the 170ms animation, because
    // the fallback timer is what actually removes it.
    await ui.sleep(600);
    const after = ui.$$('.seven-modal-overlay').length;
    ui.note(`  overlays on screen: ${before} before, ${after} after`);
    ui.check(after === before,
      `the modal is REMOVED, not left standing (${after} overlay(s) remain)`);
  }

  // ---- 5. AND TWO MODALS IN A ROW, which is the reported bug ------------
  ui.note('');
  const p2 = SevenModal.confirm({ title: 'First', body: 'one', confirmLabel: 'OK' });
  await ui.sleep(120);
  const ok2 = ui.$('.seven-modal-overlay .seven-modal-ok');
  if (ok2) ui.click(ok2, 'OK on the first');
  await p2;
  // OPENED WHILE THE FIRST IS STILL FADING, deliberately: 60ms into a 170ms
  // leave. This is the exact moment the old modal used to be standing behind
  // the new one.
  await ui.sleep(60);
  const p3 = SevenModal.confirm({ title: 'Second', body: 'two', confirmLabel: 'OK' });
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const live = ui.$$('.seven-modal-overlay:not(.is-leaving)').length;
  const stale = ui.$$('.seven-modal-overlay.is-leaving').length;
  ui.note(`two in a row: ${live} live overlay(s), ${stale} still fading out`);
  // SAY WHETHER THE OVERLAP ACTUALLY HAPPENED. The 60ms wait is meant to open
  // the second modal while the first is still inside its 170ms leave, but the
  // clicks and awaits around it are not free and the first can be gone
  // already — measured: stale came back 0 on the first run of this.
  //
  // So the check below is worth exactly what it observed. When stale is 0 the
  // overlap was not reproduced here and the guarantee rests on the
  // single-modal path above (is-leaving, pointer-events: none) plus
  // test/view-anim.test.js, which proves the pointer events go first and the
  // removal happens even when animationend never fires. Said out loud rather
  // than left as a comment claiming a case the run did not reach.
  ui.note(stale > 0
    ? '  the overlap WAS reproduced: a leaving modal was on screen beside the new one'
    : '  the first modal had already gone, so this run did not reproduce the overlap'
      + ' — the guarantee rests on the checks above and on the unit tests');
  ui.check(live === 1, `exactly one modal takes clicks (${live})`);
  for (const el of ui.$$('.seven-modal-overlay.is-leaving')) {
    ui.check(getComputedStyle(el).pointerEvents === 'none',
      'and the one on its way out takes none');
  }
  const ok3 = ui.$('.seven-modal-overlay:not(.is-leaving) .seven-modal-ok');
  if (ok3) ui.click(ok3, 'OK on the second');
  await p3;
  await ui.sleep(600);
  ui.check(ui.$$('.seven-modal-overlay').length === before,
    'and both are gone afterwards');
})()
