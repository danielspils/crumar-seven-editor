// THE JOBS THAT ARE FUNCTION RATHER THAN TASTE CLEAR THEIR BARS.
//
// WHY THIS EXISTS (18 Nov 2026). `--amber` became the Seven's script colour in
// both themes, which is right for the active-tab underline it was changed for
// and took everything else with it — in the LIGHT theme to 1.88:1 on `--bg`,
// 1.65:1 on `--bg-panel` and 1.53:1 on `--page`. Nobody noticed, because the
// contrast decision and the look decision were made in different places.
//
// The underlines stay on `--amber` by Daniel's explicit call, twice, with the
// exception recorded in docs/DESIGN.md. **THIS SCENARIO IS ABOUT THE OTHERS**,
// which are not taste:
//
//   - FOUR FOCUS RINGS. A ring nobody can see is a keyboard user stuck.
//   - THE REVERSED-RANGE READOUT, which tells a player their pedal is
//     inverted. It is TEXT, so its bar is 4.5:1, not 3:1.
//   - .tx-alarm-soft, the transfer warning. Also text.
//
// IT MEASURES THE GROUND IT ACTUALLY SITS ON, by walking up the ancestors for
// the first non-transparent background. Reading the token's value against a
// ground chosen by hand is how the 3.37:1 figure came to be quoted for a mark
// that was 1.53:1 where it really sat — `rgba(0,0,0,0)` parsed as black would
// do the same thing one step further.
(async () => {
  const px = (n) => Math.round(n * 100) / 100;
  const rgb = (s) => {
    const m = String(s).match(/(\d+(?:\.\d+)?)/g);
    return m && m.length >= 3 ? m.slice(0, 3).map(Number) : null;
  };
  const alpha = (s) => {
    const m = String(s).match(/rgba?\([^)]*,\s*([\d.]+)\s*\)/);
    return m ? Number(m[1]) : 1;
  };
  const lum = (c) => {
    const [r, g, b] = c.map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => {
    const l1 = lum(a); const l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  // LET THE BROWSER RESOLVE THE TOKEN. The first version of this read
  // getPropertyValue('--mark-amber') — which returns the literal string
  // " #8a5d00" — and ran it through a digit regex, which extracted 8, 5 and 0
  // and measured rgb(8,5,0). Nearly black against pale paper reads 15:1, so
  // every check PASSED while measuring nothing, and the dark value #c9a25e
  // failed to parse at all because it contains letters. A probe element makes
  // the browser do the conversion, which is the only way the number is real.
  const resolve = (expr) => {
    const probe = document.createElement('span');
    probe.style.color = expr;
    probe.style.position = 'absolute';
    probe.style.opacity = '0';
    document.body.appendChild(probe);
    const out = getComputedStyle(probe).color;
    probe.remove();
    return out;
  };

  // THE FIRST ANCESTOR THAT ACTUALLY PAINTS. A transparent background is not a
  // colour — treating one as black is a measurement of nothing.
  const groundOf = (el) => {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      if (alpha(bg) > 0) return { el: n, bg };
    }
    const bg = getComputedStyle(document.body).backgroundColor;
    return { el: document.body, bg };
  };

  await ui.openLibrary();
  await ui.sleep(400);
  const patchRow = ui.$('#library .lib-row.lib-patch, #library [data-file]');
  if (patchRow) { ui.click(patchRow, 'a patch'); await ui.sleep(2000); }

  // key, selector, bar, what it is. 3:1 for a non-text mark, 4.5:1 for text.
  const JOBS = [
    ['focus ring · search', '.lib-search-wrap', 3, 'outlineColor'],
    ['focus ring · folder', '.lib-folder', 3, 'outlineColor'],
    ['focus ring · fx state', '.fx-state', 3, 'outlineColor'],
    ['focus ring · param select', '.param-select', 3, 'outlineColor'],
    ['reversed-range readout', '.param-value.range-reversed', 4.5, 'color'],
    ['transfer warning', '.tx-alarm-soft', 4.5, 'color'],
  ];

  for (const theme of ['light', 'dark']) {
    document.documentElement.setAttribute('data-theme', theme);
    await ui.sleep(350);
    ui.note(`################  ${theme.toUpperCase()}  ################`);
    const markInk = rgb(resolve('var(--mark-amber)'));
    ui.note(`  --mark-amber resolves to rgb(${markInk})`);
    for (const [label, sel, bar, prop] of JOBS) {
      let el = ui.$(sel);
      let temporary = null;
      // THE READOUT ONLY EXISTS WHEN A RANGE IS REVERSED, which no ordinary
      // patch is. Borrow a real .param-value and give it the class, so the
      // REAL rule paints it, then put it back. Measuring the token against a
      // ground picked by hand is what produced the wrong figure this whole
      // entry is about.
      if (!el && sel === '.param-value.range-reversed') {
        // A CHANGED ROW, NOT ANY ROW. `.param.is-default .param-value` paints
        // --text-dim and outranks `.param-value.range-reversed`, so borrowing
        // the first .param-value measured the dim colour and passed at 5.01:1
        // without ever touching the rule under test — the same error as the
        // regex above, one level further in. A reversed range is by definition
        // not at its default, so a changed row is also the truthful host.
        const host = ui.$('#detail .param.is-changed .param-value')
          || ui.$('#detail .param:not(.is-default) .param-value');
        if (host) { host.classList.add('range-reversed'); temporary = host; el = host; }
      }
      if (!el) { ui.note(`  ${label.padEnd(26)} not on screen in this state — not measured`); continue; }
      // A :focus-visible outline has no resolved colour until focus lands, so
      // for rings the ink is the token the rule uses; for text it is the
      // element's own painted colour.
      const cs = getComputedStyle(el);
      const ink = prop === 'outlineColor' ? markInk : rgb(cs[prop]);
      const g = groundOf(el);
      const ground = rgb(g.bg);
      if (!ink || !ground) { ui.note(`  ${label} — could not read a colour`); continue; }
      const r = ratio(ink, ground);
      ui.note(`  ${label.padEnd(26)} ${px(r)}:1  (bar ${bar}:1)  ink rgb(${ink}) on ${g.bg}`);
      ui.check(r >= bar, `${theme}: ${label} clears ${bar}:1 (${px(r)}:1)`);
      // AND IT IS THE TOKEN DOING THE WORK, not something that happens to be
      // dark enough. Without this a rule losing the cascade reads as a pass:
      // the readout measured --text-dim at 5.01:1 for exactly that reason.
      if (prop === 'color') {
        ui.check(String(ink) === String(markInk),
          `${theme}: ${label} is actually painted with --mark-amber`
          + ` (rgb(${ink}) vs rgb(${markInk}))`);
      }
      if (temporary) temporary.classList.remove('range-reversed');
    }
  }
  document.documentElement.removeAttribute('data-theme');
  await ui.sleep(200);
})()
