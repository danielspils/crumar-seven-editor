// @env SEVEN_NO_DEVICE=1
//
// C: A NEW BACKUP ROW ARRIVES, AND IT FLARES RATHER THAN FADING UP FROM DIM.
//
// Ported from JUNO-Xtra's arriveBackupRows so the two apps read as one
// family — the behaviour, not the file; no code crossed between the repos.
//
// WHY THE DISTINCTION MATTERS ENOUGH TO TEST. This app already uses OPACITY
// to mean "stale": a Seven row the app has not heard from this session draws
// at .58. If a new backup row faded up from dim, the two treatments would
// converge on one meaning and neither would say anything. The flare goes
// ABOVE full brightness and settles back, which nothing else here does — so
// what is asserted is the brightness curve, not merely that something moved.
//
// NO INSTRUMENT. The rows come from the library on disk; the run that wrote
// them is not re-run here.
(async () => {
  const px = (n) => Math.round(n * 100) / 100;

  await ui.selectTab('backups');
  await ui.sleep(900);

  const rows = () => ui.$$('.lib-setlist[data-backup]');
  ui.note(`backup rows on screen: ${rows().length}`);
  if (!rows().length) { ui.check(false, 'there are backup rows to arrive'); return; }

  // ---- 1. THE FIRST FILL ANIMATES EVERYTHING ----------------------------
  //
  // The Set of shown keys starts empty, so the first time the list is drawn
  // every row is new. That is the wanted behaviour rather than an edge case
  // to suppress — but by the time this script runs the first fill is over,
  // so it is forced by clearing the Set the way a fresh list would have it.
  // THE ELEMENT THE VIEW OWNS, which is where the Set lives — `#library-body`,
  // the `el` handed to createLibraryView. Guessing `#library` found a real
  // element with no Set on it and threw on `.delete`, which is the shape of
  // mistake that reads as "the feature is missing".
  const box = ui.$('#library-body');
  ui.check(!!box, 'the list container is reachable');
  if (!box) return;

  // What the container remembers having shown. Asserted rather than assumed:
  // if the name ever changes, this scenario would otherwise silently test a
  // fresh Set every time and never exercise the "already seen" half.
  ui.note(`the list remembers ${box.seenBackupKeys ? box.seenBackupKeys.size : '(nothing)'} keys`);
  ui.check(!!box.seenBackupKeys && box.seenBackupKeys.size > 0,
    'the list has recorded the rows it has already shown');

  // ---- 2. A ROW ALREADY SHOWN DOES NOT RE-ANIMATE -----------------------
  //
  // The half that keeps this from flaring the whole list every time somebody
  // visits the tab.
  await ui.selectTab('patches');
  await ui.sleep(400);
  await ui.selectTab('backups');
  await ui.sleep(250);
  const onReturn = rows().flatMap((r) => r.getAnimations());
  ui.note(`animations running after returning to the tab: ${onReturn.length}`);
  ui.check(onReturn.length === 0,
    'coming back to Backups does not re-animate rows it has already shown');

  // ---- 3. A ROW IT HAS NOT SHOWN FLARES ---------------------------------
  //
  // Forced by forgetting one key, which is exactly the state a genuinely new
  // run produces: a row whose identity the list has never recorded.
  const target = rows()[0];
  const key = target.dataset.backup;
  box.seenBackupKeys.delete(key);
  ui.note(`forgetting "${key}" and re-rendering`);

  // A real re-render, through the app's own path — not a hand call — so this
  // exercises the hook where it actually lives.
  await window.sevenAPI.library.list();
  document.dispatchEvent(new CustomEvent('seven-library-changed'));
  await ui.sleep(60);

  let anims = rows().filter((r) => r.dataset.backup === key)
    .flatMap((r) => r.getAnimations());
  if (!anims.length) {
    // The app may not re-render on that event; drive the view the way a tab
    // change does, which is a path that definitely re-renders.
    await ui.selectTab('patches');
    await ui.sleep(300);
    await ui.selectTab('backups');
    await ui.sleep(60);
    anims = rows().filter((r) => r.dataset.backup === key)
      .flatMap((r) => r.getAnimations());
  }
  ui.note(`animations on the forgotten row: ${anims.length}`);
  ui.check(anims.length > 0, `the row the list had forgotten animates again`);
  if (!anims.length) return;

  // ---- 4. AND IT IS A FLARE, NOT A FADE ---------------------------------
  const frames = anims[0].effect.getKeyframes();
  ui.note('keyframes:');
  for (const f of frames) {
    ui.note(`  offset ${f.computedOffset} · opacity ${f.opacity} · filter ${f.filter}`);
  }
  const timing = anims[0].effect.getTiming();
  ui.note(`timing: ${timing.duration}ms, easing ${timing.easing}, fill ${timing.fill}`);

  const brightness = frames
    .map((f) => Number(/brightness\(([\d.]+)\)/.exec(f.filter || '') ?.[1]))
    .filter((n) => !Number.isNaN(n));
  ui.note(`brightness curve: ${brightness.join(' -> ')}`);
  ui.check(brightness.length === 3, `three brightness stops (${brightness.length})`);
  ui.check(brightness[0] > 1,
    `it STARTS above full brightness (${brightness[0]}) — a flare, not a fade up from dim`);
  ui.check(brightness[brightness.length - 1] === 1,
    `and settles at 1 (${brightness[brightness.length - 1]})`);
  ui.check(brightness[0] > brightness[1] && brightness[1] > 1,
    `falling through a midpoint still above 1 (${brightness[1]})`);
  ui.check(timing.duration === 360, `360ms (${timing.duration})`);
  ui.check(timing.easing === 'ease-out', `ease-out (${timing.easing})`);
  // THE OPACITY RISE IS THERE TOO, but it is not what distinguishes this from
  // the stale fade — the brightness is. Asserted so a future edit cannot drop
  // it and leave a row popping in at full.
  ui.check(Number(frames[0].opacity) === 0, `it starts transparent (${frames[0].opacity})`);
  void px;
})()
