// THE DROPDOWN CARET IS GEOMETRY, NOT A CHARACTER.
//
// It was textContent '⌄' (U+2304). No UI text font carries that glyph, so each
// platform falls through to a different one and inherits its metrics. On
// Windows it rendered small, thin and below the midline of the value beside it
// (Daniel's QA on 1.5.4, FX1 and FX2 Mode); on macOS the fallback happened to
// sit acceptably, which is the only reason it shipped. Not a 1.5.4 regression —
// it has looked like that since the picker landed.
//
// `.fx-chevron` had already been through exactly this and its rule still says
// so: "a font glyph's ink sat below centre regardless of box alignment". The
// section headers were fixed with an inline SVG and the picker was not.
//
// WHY THIS ASSERTS THE SHAPE AND NOT JUST THE ALIGNMENT: the alignment check
// PASSED on macOS with the bug in place, because the glyph landed close enough
// here. A measurement taken on the one platform that was never broken cannot
// guard the platform that was. What is portable is the property that made the
// difference — the caret does not depend on a font — and that is checkable
// anywhere.
(async () => {
  // A patch, so the detail panel has enum rows to dress.
  await ui.openLibrary();
  ui.click(await ui.waitEl('.seg-btn[data-tab="patches"]', 'the Patches tab'), 'Patches');
  await ui.sleep(700);
  const row = ui.$('#library .lib-row.lib-patch, #library [data-file]');
  if (!ui.check(!!row, 'a patch to select')) return;
  ui.click(row, 'a patch');
  await ui.sleep(1500);
  await ui.closeLibrary();
  await ui.sleep(600);

  const carets = ui.$$('.picker-caret');
  if (!ui.check(carets.length > 0, `enum rows are dressed with pickers (${carets.length} carets)`)) return;

  // 1. SHAPE. Every caret draws an SVG and carries no text of its own.
  const withSvg = carets.filter((c) => c.querySelector('svg')).length;
  ui.check(withSvg === carets.length,
    `every caret draws an SVG (${withSvg}/${carets.length})`);
  const withText = carets.filter((c) => (c.textContent || '').trim() !== '');
  ui.check(withText.length === 0,
    `no caret renders a text glyph (${withText.length} do: ${withText.map((c) => JSON.stringify(c.textContent)).join(', ') || 'none'})`);

  // 2. COLOUR. It inherits the button's, the way the header chevrons inherit
  // their heading's — a caret with a colour of its own was the other half of
  // looking like a different control.
  const btn = carets[0].closest('.picker');
  ui.check(
    getComputedStyle(carets[0]).color === getComputedStyle(btn).color,
    `the caret takes the button's colour (${getComputedStyle(carets[0]).color})`
  );

  // 3. ALIGNMENT, measured. Weak on macOS by construction — see the note above
  // — but it is the thing a Windows run would catch, and this scenario has
  // never been run there.
  const mid = (el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; };
  let worst = 0, worstLabel = '';
  for (const c of carets) {
    const svg = c.querySelector('svg');
    const text = c.closest('.picker')?.querySelector('.picker-text');
    if (!svg || !text) continue;
    const off = Math.abs(mid(svg) - mid(text));
    if (off > worst) { worst = off; worstLabel = text.textContent.trim(); }
  }
  ui.check(worst <= 1.5,
    `every caret sits on its value's midline (worst ${worst.toFixed(2)}px, on "${worstLabel}")`);
})()
