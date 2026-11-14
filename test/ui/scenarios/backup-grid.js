// @env SEVEN_NO_DEVICE=1
//
// THE BACKUP GRID, IN A REAL WINDOW, IN BOTH THEMES.
//
// A backup run is 32 slots and roughly 48 seconds of ~3,600 round trips. The
// Seven's own 32 buttons light as the run reaches each slot (Daniel,
// 2026-11-13: "the 4x8 panel buttons we use for the Crumar picker on
// Juno-Xtra … each lights up as it is saved. In the end, all 32 buttons are
// lit").
//
// NO INSTRUMENT IS NEEDED AND NONE IS SKIPPED FOR. The real run needs a Seven
// and 48 seconds; the picture does not. The grid is built and painted directly
// here, exactly as src/app.js builds and paints it — and that the APP still
// does it this way is asserted from source in test/source-wiring.test.js. The
// two halves together; neither on its own is a guard.
//
// WHAT ONLY A REAL WINDOW CAN ANSWER, and why this file exists at all:
//
//   the 32 cells are laid out 4 banks down by 8 presets across
//   a lit button is VISIBLY different from an unlit one — measured, in both
//     themes, because a lit state is precisely the hazard that left the select
//     chevron invisible in light mode for weeks
//   the panel's backdrop is painted in both themes, so the drawing's own white
//     legends never land on the dialog's background (the way that one was
//     found)
//   the furniture around the picture DOES change with the theme, which is the
//     other half of the same rule: the machine keeps its colours, the app's
//     text takes the app's tokens
(async () => {
  const root = document.documentElement;
  const startingTheme = root.dataset.theme || '';
  const setTheme = async (t) => {
    if (t) root.dataset.theme = t; else delete root.dataset.theme;
    await ui.sleep(220);
  };

  const m = SevenModal.open({
    title: 'Backing up',
    bodyHtml:
      `<div class="bk-grid">${SevenModalPanel.buildGrid(window.sevenAPI.getPanelSvg())}</div>`
      + '<p class="bk-now" role="status"><span class="bk-where">Starting</span>'
      + '<span class="bk-name">Recalling the first preset…</span></p>'
      + '<p class="bk-count">0 of 32</p>',
    confirmLabel: '', cancelLabel: 'Cancel backup', tone: 'is-backup',
  });
  await ui.sleep(400);
  // Read before anything else can move it: the app re-renders on a timer and
  // a focus assertion made later would be asking a different question.
  const focusedAtOpen = document.activeElement;

  const grid = m.body.querySelector('.bk-grid');
  ui.check(!!grid, 'the grid renders');
  if (!grid) { m.close(); await setTheme(startingTheme); return; }

  const cells = [...grid.querySelectorAll('[data-bk-preset]')];
  const rows = [...grid.querySelectorAll('.bk-row')];
  ui.check(rows.length === 4, `four bank rows (${rows.length})`);
  ui.check(cells.length === 32, `thirty-two buttons (${cells.length})`);

  // ── 4 DOWN BY 8 ACROSS, and actually on screen ────────────────────────
  const box = (el) => el.getBoundingClientRect();
  const onScreen = rows.every((r) => box(r).width > 40 && box(r).height > 10);
  ui.note(rows.map((r) => `${Math.round(box(r).width)}x${Math.round(box(r).height)}`).join('  '));
  ui.check(onScreen, 'every row has real size on screen');

  const bankOf = (c) => Number(c.closest('.bk-row').dataset.bkBank);
  const rowTops = rows.map((r) => Math.round(box(r).top));
  ui.check(rowTops.every((t, i) => i === 0 || t > rowTops[i - 1]),
    `the banks stack downward (${rowTops.join(', ')})`);
  const firstRow = cells.filter((c) => bankOf(c) === 1).map((c) => Math.round(box(c).left));
  ui.check(firstRow.every((x, i) => i === 0 || x > firstRow[i - 1]),
    `and the eight presets run left to right (${firstRow.join(', ')})`);

  // ── THE PANEL'S OWN HEADER, ON THE ROW IT IS TRUE OF ──────────────────
  //
  // Number above name, TINES REEDS EGRAND …, as the artwork prints it
  // (Daniel, 2026-11-13: "Just use mine"). The transfer chooser hides those
  // legends because they name BANK 1's presets and it may be pointing at
  // banks 2-4; here the top row IS bank 1. Rows 2-4 start below them, so the
  // eight names appear once rather than four times — measured, because
  // "cropped out" and "rendered invisibly" look identical in the markup.
  const legendsIn = (bank) => [...grid.querySelectorAll(
    `.bk-row[data-bk-bank="${bank}"] .lbl-preset`
  )].filter((t) => {
    const b = box(t);
    const r = box(t.closest('.bk-row'));
    return getComputedStyle(t).display !== 'none' && b.top >= r.top - 0.5 && b.bottom <= r.bottom + 0.5;
  }).map((t) => t.textContent);
  ui.note(`row 1 legends: ${legendsIn(1).join(' ') || 'none'}`);
  ui.check(legendsIn(1).join(' ') === 'TINES REEDS EGRAND CLAVI DX EP MKS EP VIBES GRAND',
    `the top row carries the panel's own eight legends (${legendsIn(1).length})`);
  for (const b of [2, 3, 4]) {
    ui.check(legendsIn(b).length === 0,
      `row ${b} does not repeat bank 1's names (${legendsIn(b).join(' ') || 'none'})`);
  }
  const numerals = (bank) => [...grid.querySelectorAll(
    `.bk-row[data-bk-bank="${bank}"] .lbl-num`
  )].filter((t) => box(t).top >= box(t.closest('.bk-row')).top - 0.5).map((t) => t.textContent);
  ui.check(numerals(1).join('') === '12345678', `and the numbers above them (${numerals(1).join('')})`);

  // ── A BANK INDICATOR, NOT FOUR BANK BUTTONS ───────────────────────────
  //
  // The instrument has ONE bank button, and four of them was a column of
  // identical blank caps saying nothing (Daniel, seeing the running app:
  // "We don't need that"). What is kept is what the panel uses to say which
  // bank is live — the numeral and its lamp.
  ui.check(!grid.querySelector('[id$="btn-bank"]'), 'no bank button is rendered');
  const lampX = box(grid.querySelector('.led.amber.is-own')).left;
  const firstCapX = box(grid.querySelector('[data-bk-preset="1"]')).left;
  ui.check(lampX < firstCapX, `the indicator sits left of the caps (${Math.round(lampX)} < ${Math.round(firstCapX)})`);
  // IT LINES UP WITH THE CAPS, which is the thing that was wrong before: the
  // drawing stacks the four bank lamps at cy 64, 88, 112 and 136, so one lamp
  // per row put each row's at a different height and the column drifted down
  // the picture. Measured against the CAPS, not against the row — row 1 is
  // taller than the rest because it carries the header, so an offset from the
  // row's own top is a different number in row 1 by construction and would
  // pass or fail for the wrong reason.
  const centreGap = rows.map((r) => {
    const lamp = box(r.querySelector('.led.amber.is-own'));
    // The CAP, not the preset group — the group's box also contains the
    // numeral and the legend above it, so its centre is not the button's.
    const cap = box(r.querySelector('[data-bk-preset="1"] .btn-face'));
    return Math.round((lamp.top + lamp.height / 2) - (cap.top + cap.height / 2));
  });
  ui.note(`lamp centre vs cap centre, per row: ${centreGap.join(', ')}`);
  ui.check(centreGap.every((d) => Math.abs(d) <= 2),
    `the lamp sits on the caps' centre line in every row (${centreGap.join(', ')})`);

  // ── NOTHING IS LIT UNTIL THE RUN LIGHTS IT ────────────────────────────
  const lit = () => cells.filter((c) => c.querySelector('.led.on')).length;
  const pressed = () => cells
    .map((c, i) => (c.querySelector('.btn-face.on') ? i : -1))
    .filter((i) => i >= 0);
  SevenModalPanel.paintBackup(grid, { saved: 0, current: null });
  await ui.sleep(300);
  ui.check(lit() === 0, `the grid starts dark (${lit()} lit)`);

  // ── MID-RUN: lit says how far, the pressed cap says where ─────────────
  SevenModalPanel.paintBackup(grid, { saved: 11, current: 11 });
  await ui.sleep(300);
  ui.check(lit() === 12, `twelve lit at slot 12 — eleven finished plus the one in hand (${lit()})`);
  ui.check(pressed().join(',') === '11', `and one cap is down, on that slot (${pressed().join(',') || 'none'})`);
  const lampsOn = rows.filter((r) => r.querySelector('.led.amber.is-own.on'))
    .map((r) => r.dataset.bkBank);
  ui.check(lampsOn.join(',') === '2', `the bank lamp follows the run (${lampsOn.join(',') || 'none'})`);
  // The numeral comes up with the lamp, set by the same call — "the active
  // row's number lit and its lamp". One without the other is half an
  // indicator, and the two used to be settable apart.
  const numFill = (b) => getComputedStyle(
    grid.querySelector(`.bk-row[data-bk-bank="${b}"] .lbl-bank-num.is-own`)
  ).fill;
  ui.note(`bank numeral fills: ${[1, 2, 3, 4].map((b) => `${b}=${numFill(b)}`).join('  ')}`);
  ui.check(numFill(2) !== numFill(1) && numFill(1) === numFill(3) && numFill(3) === numFill(4),
    'bank 2\'s numeral is lit and the other three are not');

  // ── THE LIT STATE, IN BOTH THEMES ─────────────────────────────────────
  //
  // THIS IS THE ONE THE PROJECT HAS BEEN BITTEN BY. A colour that exists in
  // one theme is invisible in the other until somebody switches, which is how
  // the dropdown chevron stayed unreadable in light mode for weeks — a stroke
  // baked into one theme's idea of bright.
  //
  // The answer here is not a second token: it is that NOTHING INVENTED A LIT
  // COLOUR. The light is the drawing's own `.led.on`, and the panel strip is
  // deliberately not themed (DESIGN.md, "What is NOT themed") because it is a
  // picture of a machine, and a machine's LED does not change colour when the
  // room lights do. So the test is that it is IDENTICAL in both themes, and
  // clearly different from an unlit one in both.
  const litLed = cells[0].querySelector('.led');
  const darkLed = cells[20].querySelector('.led');
  const fillsIn = async (theme) => {
    await setTheme(theme);
    return {
      lit: getComputedStyle(litLed).fill,
      unlit: getComputedStyle(darkLed).fill,
      backdrop: getComputedStyle(rows[0].querySelector('.panel-bg')).fill,
      count: getComputedStyle(m.body.querySelector('.bk-count')).color,
    };
  };
  const dark = await fillsIn('');
  const light = await fillsIn('light');
  ui.note(`dark  lit ${dark.lit} · unlit ${dark.unlit} · backdrop ${dark.backdrop} · count ${dark.count}`);
  ui.note(`light lit ${light.lit} · unlit ${light.unlit} · backdrop ${light.backdrop} · count ${light.count}`);

  for (const [name, t] of [['dark', dark], ['light', light]]) {
    ui.check(t.lit !== t.unlit, `${name}: a lit button differs from an unlit one (${t.lit} vs ${t.unlit})`);
    ui.check(/^rgba?\(/.test(t.lit) && !/rgba\([^)]*,\s*0\)/.test(t.lit),
      `${name}: the lit colour is a real, non-transparent fill (${t.lit})`);
    // The backdrop is what keeps the panel's white legends off the dialog's
    // own background. Transparent here is the light-mode bug, exactly.
    ui.check(/^rgba?\(/.test(t.backdrop) && !/rgba\([^)]*,\s*0\)/.test(t.backdrop),
      `${name}: the panel's backdrop is painted (${t.backdrop})`);
  }
  ui.check(dark.lit === light.lit,
    `the lit colour is the instrument's, not the theme's — identical in both (${dark.lit})`);
  ui.check(dark.unlit === light.unlit,
    `and so is the unlit one (${dark.unlit})`);
  // The other half of the rule: the app's own text is themed. If this ever
  // stops being true, the furniture has been painted into the picture.
  ui.check(dark.count !== light.count,
    `while the app's own text DOES follow the theme (${dark.count} vs ${light.count})`);

  await setTheme(startingTheme);

  // ── THE END: ALL 32 LIT ───────────────────────────────────────────────
  //
  // The run's last progress event fires when slot 32 STARTS reading, so the
  // grid is complete only when the final count arrives. A SLOT THAT WAS
  // ALREADY UP TO DATE STILL LIGHTS: a typical run is mostly "unchanged" (30
  // of 32 on 2026-11-13), and a cell staying dark because nothing needed
  // writing would read as a failure. Dark never means done.
  SevenModalPanel.paintBackup(grid, { saved: 32, current: null });
  await ui.sleep(300);
  ui.check(lit() === 32, `all thirty-two lit at the end (${lit()})`);
  ui.check(pressed().length === 0, 'and nothing is being read any more');

  // ── THE X IS THE ONLY WAY OUT, AND IT HAS TO SAY SO ──────────────────
  //
  // There is no button: the only answer this dialog takes is "stop", and the
  // corner X already is it (Daniel, 2026-11-13). Which means the X is the one
  // visible way to stop a 48-second run, so its accessible name carries the
  // whole meaning — "Close" would be a dialog that cannot be closed doing it
  // under a name that does not mention the run.
  const card = document.querySelector('.seven-modal.is-backup');
  ui.check(!card.querySelector('.seven-modal-ok'), 'no affirmative button is rendered');
  const actions = card.querySelector('.seven-modal-actions');
  ui.check(getComputedStyle(actions).display === 'none',
    'and the empty actions row takes no space');
  const x = card.querySelector('.seven-modal-cancel');
  ui.note(`X aria-label "${x.getAttribute('aria-label')}" · title "${x.getAttribute('title')}"`);
  ui.check(/cancel backup/i.test(x.getAttribute('aria-label') || ''),
    'the X says it cancels the backup, not that it closes something');
  ui.check(focusedAtOpen === x,
    `the keyboard starts on it, since it is the only control (${focusedAtOpen.className || focusedAtOpen.tagName})`);

  // AND THE COMPLETION DIALOG IS A SEPARATE MOMENT. The grid is the during
  // view; "Backup completato!" is the after view (a deliberate nod to
  // Castelfidardo that Daniel has confirmed he wants kept). Nothing here may
  // grow into it.
  ui.check(!/completato/i.test(m.body.textContent),
    'the during view does not try to be the completion dialog');

  m.close();
  await setTheme(startingTheme);
})()
