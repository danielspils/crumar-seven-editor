// DOES THE SLOW-MOTION SCALING ACTUALLY WORK?
//
// The claim is that SEVEN_REEL_SLOWMO=4 makes the card stack's 0.3s
// transition take 1.2s. That is a measurement, not an assumption, and it is
// the one number the whole rig rests on: if the app is not actually slowed,
// every shot is four frames of teleporting and the timings in NOTES.md are a
// fiction.
//
// It measures the REAL transition rather than a synthetic one — the stack's
// own `transform .3s cubic-bezier(.22,.68,.24,1)` — by watching the
// Animation objects the browser creates for it.
(async () => {
  await ui.openLibrary();
  await ui.sleep(400);
  const row = ui.$('#library .lib-row.lib-patch, #library [data-file]');
  if (row) { ui.click(row, 'a patch'); await ui.sleep(2200); }

  const k = window.__REEL_SLOWMO || 1;
  ui.note(`slowmo factor in the page: ${k}`);

  const step = ui.$('#detail .engine-carousel .is-step-next');
  if (!step) { ui.check(false, 'the stack is on screen to turn'); return; }

  // WATCH THE ANIMATIONS THEMSELVES. getAnimations() hands back the running
  // CSS transitions; each carries the duration the browser is using and the
  // playbackRate the rig set. effectiveDuration = duration / playbackRate is
  // what a viewer actually sees.
  // WALL CLOCK, NOT playbackRate. The first version read the rate off the
  // Animation objects and reported "NOT SCALED" while the rig was working —
  // it caught a 300ms transition in the instant BEFORE the hook reached it
  // ("300ms @1" and "300ms @0.25" in the same run) and happened to report the
  // unslowed one. What matters is not the number on the object, it is how
  // long the movement takes on screen, so this waits for the animations to
  // FINISH and times that.
  const t0 = performance.now();
  ui.click(step, 'turning the stack');
  await new Promise((r) => requestAnimationFrame(() => r()));
  // THE TARGET DURATION MOVES WITH THE SCALING, which the first version of
  // this did not allow for: it looked for a 300ms transition, found none
  // under slowmo 4 because the shipped 0.3s is now 1.2s, and reported "NOT
  // 4x" for a rig that was working. The thing to look for is the stack's
  // transition AT ITS SCALED LENGTH.
  const want = 300 * k;
  const running = document.getAnimations()
    .filter((a) => {
      const t = a.effect && a.effect.getTiming ? a.effect.getTiming() : null;
      return t && Math.abs(Number(t.duration) - want) < 2;
    });
  const rates = running.map((a) => a.playbackRate);
  await Promise.all(running.map((a) => a.finished.catch(() => {})));
  const elapsed = performance.now() - t0;

  return {
    slowmo: k,
    transitionsFound: running.length,
    playbackRates: rates,
    shippedMs: 300,
    onScreenMs: Math.round(elapsed),
    verdict: Math.abs(elapsed - 300 * k) < 250
      ? `OK: the shipped 0.3s took ${Math.round(elapsed)}ms on screen, about ${k}x`
      : `NOT ${k}x: the shipped 0.3s took ${Math.round(elapsed)}ms`,
  };
})()
