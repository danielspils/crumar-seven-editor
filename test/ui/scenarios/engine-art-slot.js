// @env SEVEN_NO_DEVICE=1
//
// THE INSTRUMENT PICTURE SITS IN A SLOT, and the slot does not change size.
//
// The drawings differ wildly in shape — a stacked combo organ against a full
// grand — and the panel used to size itself to whichever it held. Measured at
// the rendered width of 128px, across all nineteen:
//
//     combo.png            512x192   ->  48.0px   <- shortest
//     bechstein_piano.png  363x512   -> 180.5px   <- tallest
//
// A 132.5px spread, all of it landing on whatever sits below — which is how
// Combo Piano pushed the parameter list up into the save button.
//
// MEASURED IN THE RUNNING APP, not read out of the stylesheet: a rule that is
// present but overridden passes a style check and still collides on screen.
// That is not hypothetical here — the first version of this fix WAS overridden,
// by the carousel's own `height: 128px`, and only measuring showed it.
//
// The carousel is a different case and is deliberately left alone: it solved
// this its own way on 2026-08-12, with a fixed box and each instrument fitted
// inside. This covers the PLAIN variant, which a library patch gets.
(async () => {
  await ui.openLibrary();
  ui.click(await ui.waitEl('.seg-btn[data-tab="patches"]', 'the Patches tab'), 'Patches');
  await ui.sleep(600);
  const row = ui.$('#library .lib-row.lib-patch');
  ui.check(!!row, 'a patch of your own to select');
  if (!row) return;
  ui.click(row.querySelector('.patch-name') || row, 'a patch');
  await ui.sleep(800);

  const art = ui.$('#detail .engine-art');
  ui.check(!!art, 'the detail panel has an instrument slot');
  if (!art) return;
  ui.check(!art.classList.contains('engine-carousel'),
    `and it is the plain variant, not the carousel (${art.className})`);
  if (art.classList.contains('engine-carousel')) return;

  const save = () => ui.$('#save-live-btn');
  const firstParam = () => ui.$('#detail .param');
  const restore = art.innerHTML;

  // ── every shape, in the real slot ───────────────────────────────────────
  const heights = new Set();
  const saveTops = new Set();
  const rowTops = new Set();
  const over = [];
  // Shortest and tallest are the ones that matter; the rest are the spread
  // between them.
  for (const name of ['Combo Piano', 'MKS Synth Piano', 'Clavi Piano',
                      'Vibraphone', 'Tine Piano', 'Reed Piano', 'Venice Grand Open']) {
    art.innerHTML = SevenSoundArt.iconFor(name, false);
    await ui.sleep(150);
    const slot = art.getBoundingClientRect();
    const img = art.querySelector('img, svg');
    const ih = img ? img.getBoundingClientRect().height : 0;
    heights.add(Math.round(slot.height));
    if (save()) saveTops.add(Math.round(save().getBoundingClientRect().top));
    if (firstParam()) rowTops.add(Math.round(firstParam().getBoundingClientRect().top));
    if (ih > slot.height + 1) over.push(`${name} ${Math.round(ih)}>${Math.round(slot.height)}`);
    ui.note(`${name.padEnd(20)} slot ${Math.round(slot.width)}x${Math.round(slot.height)} image ${Math.round(ih)}px`);
  }

  ui.check(heights.size === 1,
    `ONE slot height for every instrument (${[...heights].join(', ')})`);
  // If this fails the SLOT is wrong, not the image — the ratio is the tallest
  // drawing's own, so a taller one being added is what would break it.
  ui.check(over.length === 0,
    `no image exceeds the slot${over.length ? ` — ${over.join(', ')}` : ''}`);
  ui.check(saveTops.size <= 1,
    `THE SAVE BUTTON NEVER MOVES (${[...saveTops].join(', ') || 'not shown'})`);
  ui.check(rowTops.size === 1,
    `nor does the first parameter row (${[...rowTops].join(', ')})`);

  // ── and it survives a narrow panel ──────────────────────────────────────
  //
  // A fixed pixel height would trade one bug for another here. The height is
  // derived from the width by aspect-ratio, so it tracks whatever width the
  // panel gives it instead of overflowing.
  const detail = ui.$('#detail');
  const before = detail.style.cssText;
  for (const w of [420, 320, 260]) {
    detail.style.cssText = `flex: 0 0 ${w}px; width: ${w}px; max-width: ${w}px;`;
    await ui.sleep(200);
    const slot = art.getBoundingClientRect();
    const panel = detail.getBoundingClientRect();
    const img = art.querySelector('img, svg');
    const ih = img ? img.getBoundingClientRect().height : 0;
    ui.note(`panel ${Math.round(panel.width)}px -> slot ${Math.round(slot.width)}x${Math.round(slot.height)} image ${Math.round(ih)}px`);
    ui.check(ih <= slot.height + 1, `at ${w}px the image stays inside the slot`);
    ui.check(slot.right <= panel.right + 1, `and the slot stays inside the panel at ${w}px`);
  }
  detail.style.cssText = before;
  art.innerHTML = restore;
})()
