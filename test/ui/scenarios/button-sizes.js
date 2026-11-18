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
    // THE TYPE STILL MATCHES, and that is what this file was written for:
    // the button's size must not depend on where it is mounted.
    for (const k of ['fontSize', 'lineHeight']) {
      ui.check(backup[k] === conn[k], `  ${k}: ${backup[k]} === ${conn[k]}`);
    }
    ui.check(backup.radius === conn.radius,
      `  radius: ${backup.radius} === ${conn.radius}`);
    // THE PADDING AND THE HEIGHT NO LONGER MATCH, BY DECISION (Daniel,
    // 18 Nov 2026, second brief the same day). This asserted equality when
    // the task was "match the other two"; the later call made the backup
    // button a filled primary action at 4px 12px, against the connection
    // row's 2px 10px. Reported rather than asserted, because a test that
    // pins the earlier decision would fight the later one — which is the
    // exact shape CLAUDE.md warns about.
    ui.note('');
    ui.note(`Back up Seven ${backup.h}px tall at ${backup.padT} ${backup.padL};`
      + ` Connect ${conn.h}px at ${conn.padT} ${conn.padL}`);
    ui.note('  they differ ON PURPOSE: the backup button is the app\'s one'
      + ' filled primary action and carries the heavier padding Daniel set.');
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

  // ---- THE FILL, AND WHETHER ITS LABEL CAN BE READ ON IT ----------------
  //
  // "Back up Seven" is a FILLED GREEN button since 18 Nov 2026 — backing up
  // is the most important action in the app and an outlined felt-red one
  // read as incidental. The green is --action, the same one the filled Save
  // patch (.is-ready) uses, so "the same green" is a shared token and not a
  // matched literal.
  //
  // CONTRAST IS COMPUTED HERE, not trusted to a palette note. The brief
  // asked for a WHITE label; --action-ink is near-white in light and
  // near-black in dark, and it has to be — on dark's light sage green a
  // literal white measures 3.03:1 and fails AA at 12px. Reading the ratio
  // off the rendered colours is the only way to know the token still
  // answers that correctly after a palette change.
  const relLum = (rgb) => {
    const m = /(\d+),\s*(\d+),\s*(\d+)/.exec(rgb || '');
    if (!m) return null;
    const f = [1, 2, 3].map((i) => {
      const c = Number(m[i]) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  };
  const ratio = (a, b) => {
    const la = relLum(a);
    const lb = relLum(b);
    if (la == null || lb == null) return null;
    return Math.round(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)) * 100) / 100;
  };

  const btn = ui.$('#backup-button');
  const save = ui.$('#save-live-btn');
  if (btn) {
    // ENABLED, WHICH OFFLINE MEANS FORCING IT. The button is disabled with
    // nothing connected, and its disabled state is a deliberately quiet
    // --line fill — so reading the colours as found measured the GREY, not
    // the green, and reported 3.82:1 for a label/fill pair that is not the
    // one under test. The first version of this did exactly that.
    const wasDisabled = btn.disabled;
    btn.disabled = false;
    await ui.sleep(220);
    const cs = (() => {
      const c = getComputedStyle(btn);
      return { backgroundColor: c.backgroundColor, color: c.color,
        borderTopColor: c.borderTopColor };
    })();
    btn.disabled = wasDisabled;
    // THE PANE BEHIND IT. #bank-region is transparent — it inherits — so
    // walk up until something actually paints, or the comparison is against
    // rgba(0,0,0,0) and means nothing. That is what the first run reported.
    const paintedBg = (el) => {
      let n = el;
      while (n && n !== document.documentElement) {
        const c = getComputedStyle(n).backgroundColor;
        if (c && !/^(transparent|rgba\(0, 0, 0, 0\))$/.test(c)) return c;
        n = n.parentElement;
      }
      return getComputedStyle(document.body).backgroundColor;
    };
    const pane = paintedBg(btn.parentElement || btn);
    ui.note('');
    ui.note(`the backup button: background ${cs.backgroundColor}`);
    ui.note(`                   label      ${cs.color}`);
    ui.note(`                   border     ${cs.borderTopColor}`);
    // FILLED, which is the change. A transparent background would mean the
    // outline survived.
    ui.check(!/^(transparent|rgba\(0, 0, 0, 0\))$/.test(cs.backgroundColor),
      `it is filled, not outlined (${cs.backgroundColor})`);
    const onFill = ratio(cs.color, cs.backgroundColor);
    ui.note(`label on fill: ${onFill}:1`);
    ui.check(onFill != null && onFill >= 4.5,
      `the label reads on the fill at 12px (${onFill}:1, AA needs 4.5)`);
    // AND THE FILL AGAINST THE PANE. The brief asked for this to be said
    // rather than worked around if it failed.
    const onPane = ratio(cs.backgroundColor, pane);
    ui.note(`fill against the pane (${pane}): ${onPane}:1`);
    ui.check(onPane != null && onPane >= 3,
      `the green is distinguishable from the pane (${onPane}:1)`);
    // THE SAME GREEN AS SAVE PATCH, asked of the rendered colour rather
    // than of the stylesheet: a token can be right in the file and shadowed
    // on screen.
    // AGAINST THE TOKEN, not against Save patch's rendered border. Save
    // patch has three states and two of them (.is-quiet, and the base
    // outlined one) do not paint --action at all — its border reads --line
    // when quiet, which is what the first run compared against and "matched"
    // only because the backup button was ALSO showing its disabled --line.
    // Two greys agreeing is not two greens agreeing.
    const token = getComputedStyle(document.documentElement)
      .getPropertyValue('--action').trim();
    const swatch = document.createElement('span');
    swatch.style.color = token;
    document.body.appendChild(swatch);
    const tokenRgb = getComputedStyle(swatch).color;
    swatch.remove();
    ui.note(`--action is ${token} = ${tokenRgb}`);
    ui.check(cs.backgroundColor === tokenRgb,
      `the fill IS --action, the same green Save patch fills with`
      + ` (${cs.backgroundColor} / ${tokenRgb})`);
    if (save) {
      ui.note(`Save patch right now: border ${getComputedStyle(save).borderTopColor}`
        + ` · background ${getComputedStyle(save).backgroundColor}`
        + '  (its quiet state paints --line, not --action)');
    }
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
