// @env SEVEN_NO_DEVICE=1
//
// THREE BUTTONS THAT SHOULD BE THE SAME SIZE.
//
// "Back up Seven" (#backup-button, in #fresh-line under the Seven tab's
// rows), Connect/Disconnect (#conn-button) and Settings (#settings-button),
// both in the connection row.
//
// IT ALSO CHECKS THE DIAGNOSIS, not just the outcome. The brief says the
// cause is `font: inherit` picking up #fresh-line's 10px/700 freshness type
// after the button moved there. That is a claim about what the button
// INHERITS, and it is testable: this prints each button's computed font and
// the font of its parent chain, so the report says whether the cause was
// what it was thought to be rather than only that the sizes now agree.
//
// EVERY NUMBER IS READ, none derived. A button's height is
// line-height + padding + border and all three are printed, so a mismatch
// says which term is wrong instead of only that one exists.
(async () => {
  const px = (n) => Math.round(n * 100) / 100;
  const box = (el) => (el ? el.getBoundingClientRect() : null);

  await ui.selectTab('seven');
  await ui.sleep(700);
  // Bank 2: Bank 1's caveat is blank and its note is long, which changes what
  // else is in the line but not the button.
  const b2 = ui.$$('#bank-tabs .bank-tab')[1];
  if (b2) { ui.click(b2, 'bank 2'); await ui.sleep(600); }

  const read = (sel, label) => {
    const el = ui.$(sel);
    if (!el) { ui.note(`${label.padEnd(16)} NOT ON SCREEN (${sel})`); return null; }
    const cs = getComputedStyle(el);
    const b = box(el);
    const parent = el.parentElement;
    const ps = parent ? getComputedStyle(parent) : null;
    const out = {
      label,
      w: px(b.width),
      h: px(b.height),
      fontSize: cs.fontSize,
      lineHeight: cs.lineHeight,
      fontWeight: cs.fontWeight,
      padT: cs.paddingTop,
      padB: cs.paddingBottom,
      padL: cs.paddingLeft,
      padR: cs.paddingRight,
      border: cs.borderTopWidth,
      radius: cs.borderTopLeftRadius,
      parentFont: ps ? `${ps.fontSize}/${ps.lineHeight} ${ps.fontWeight}` : '—',
      parentId: parent ? (parent.id || parent.className || parent.tagName) : '—',
      text: (el.textContent || '').trim(),
    };
    ui.note('');
    ui.note(`${label}  "${out.text}"`);
    ui.note(`  box      ${out.w} x ${out.h}`);
    ui.note(`  type     ${out.fontSize} / ${out.lineHeight} / ${out.fontWeight}`);
    ui.note(`  padding  ${out.padT} ${out.padR} ${out.padB} ${out.padL}`);
    ui.note(`  border   ${out.border} · radius ${out.radius}`);
    ui.note(`  parent   <${out.parentId}> at ${out.parentFont}`);
    // THE HEIGHT, ADDED UP. If this does not reconcile, something else is
    // contributing — a min-height, a stretched flex item — and that is worth
    // seeing rather than inferring from a total.
    const sum = px(parseFloat(out.lineHeight) + parseFloat(out.padT)
      + parseFloat(out.padB) + 2 * parseFloat(out.border));
    ui.note(`  line-height + padding + border = ${sum}`
      + (Math.abs(sum - out.h) < 0.6 ? '  (reconciles)' : `  BUT THE BOX IS ${out.h}`));
    return out;
  };

  const backup = read('#backup-button', 'BACK UP');
  const conn = read('#conn-button', 'CONNECT');
  const settings = read('#settings-button', 'SETTINGS');

  // ---- DO THEY MATCH? ---------------------------------------------------
  ui.note('');
  const all = [backup, conn, settings].filter(Boolean);
  ui.note('WHAT            height   font-size  line-height  padding      radius');
  for (const b of all) {
    ui.note(`  ${b.label.padEnd(14)}${String(b.h).padStart(6)}`
      + `${b.fontSize.padStart(11)}${b.lineHeight.padStart(13)}`
      + `  ${(b.padT + ' ' + b.padL).padEnd(12)}${b.radius}`);
  }

  if (backup && conn) {
    ui.check(backup.h === conn.h,
      `Back up Seven and Connect are the same height (${backup.h} vs ${conn.h})`);
    for (const k of ['fontSize', 'lineHeight', 'padT', 'padB', 'padL', 'padR']) {
      ui.check(backup[k] === conn[k], `  ${k}: ${backup[k]} === ${conn[k]}`);
    }
    // THE RADIUS IS ASKED SEPARATELY because the two it is matching do not
    // agree with each other — see the note below.
    ui.check(backup.radius === conn.radius,
      `  radius: ${backup.radius} === ${conn.radius}`);
  }
  if (backup && settings) {
    ui.check(backup.h === settings.h,
      `Back up Seven and Settings are the same height (${backup.h} vs ${settings.h})`);
  }
  if (conn && settings) {
    // REPORTED, NOT ASSERTED. These two were already in the app and already
    // differ; the brief is about the backup button matching them, and which
    // of the two is right about the corner is Daniel's call.
    ui.note('');
    ui.note(`#conn-button radius ${conn.radius} vs #settings-button ${settings.radius}`
      + (conn.radius === settings.radius ? ' — they agree'
        : ' — THEY DO NOT AGREE WITH EACH OTHER, and did not before this change'));
  }

  // ---- AND THE LINE IT SITS IN -----------------------------------------
  //
  // Daniel has accepted that #fresh-line gets taller, so this reports the
  // height rather than holding it to a number. What must NOT move is row 1,
  // which is checked below.
  const line = ui.$('#fresh-line');
  if (line) {
    const l = box(line);
    ui.note('');
    ui.note(`#fresh-line ${px(l.width)} x ${px(l.height)} at y${px(l.top)}..${px(l.bottom)}`);
  }

  // ---- ROW 1 DOES NOT MOVE ---------------------------------------------
  //
  // #fresh-line sits BELOW the eight bank rows, so a taller line should push
  // nothing above it. That is the claim, and claims about layout get
  // measured: 0px of spread across the four tabs is the number item 9
  // established and the one nothing since has been allowed to break.
  const TABS = ['seven', 'patches', 'setlists', 'backups'];
  const ROW = '#patch-list .patch-row, #library .lib-row, #library .lib-slot';
  const ys = [];
  ui.note('');
  for (const tab of TABS) {
    await ui.selectTab(tab);
    await ui.sleep(650);
    const first = ui.$$(ROW).find((r) => {
      const b = r.getBoundingClientRect();
      return b.height > 0 && b.width > 0;
    });
    const y = first ? px(box(first).top) : null;
    ys.push(y);
    ui.note(`  ${tab.padEnd(9)} row 1 y ${y}`);
  }
  const seen = ys.filter((v) => v != null);
  const spread = seen.length ? px(Math.max(...seen) - Math.min(...seen)) : null;
  ui.note(`ROW 1 y SPREAD ACROSS THE FOUR TABS: ${spread}px`);
  ui.check(spread === 0,
    `the taller line did not move the rows above it (spread ${spread}px)`);
})()
