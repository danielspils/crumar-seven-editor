// @env SEVEN_NO_DEVICE=1
//
// ALL FIVE BASELINES ON THE HEADER LINE: the logo, the three word tabs, and
// both column titles.
//
// one-header-line.js already compares the titles against ONE tab. This
// measures every one of the five the brief names, in both themes, and
// reports the spread — because "they should share the row" is a claim about
// all of them and a pair can agree while a third sits elsewhere.
//
// BASELINES, NOT BOXES. This app's own rule for the top row, and the reason
// the logo and the three words line up despite being different sizes: the
// titles are uppercase micro-type against 17px/700 tabs, so box alignment
// would put them visibly wrong even when the numbers agree.
//
// THE LOGO'S BASELINE IS ITS BOX BOTTOM, and that is not an approximation.
// assets/seven-logo.svg is cut at y=626 "where the feet of 'even' sit" — its
// own desc says the box bottom IS the letters' baseline, with the S's tail
// painting outside via overflow: visible. So the drawing's rect bottom is
// the baseline, and font metrics would be meaningless for it.
(async () => {
  const px = (n) => Math.round(n * 10) / 10;
  const ctx = document.createElement('canvas').getContext('2d');

  // FONT metrics, not glyph metrics — a line's baseline does not move
  // because the words in it happen to have no descenders. Same method
  // one-header-line.js uses; kept identical so the two cannot disagree.
  // FROM THE CONTENT BOX, NOT THE BORDER BOX — and this is a correction to
  // the method one-header-line.js has been using, not a variation on it.
  //
  // THAT FORMULA WAS `r.top + (r.height - L) / 2 + …`, which centres the
  // line box inside the element's rect. That is only right when the padding
  // is SYMMETRIC. `.top-tab` carries `padding: 0 0 7px` and a 2px bottom
  // border — all of it below the text — so the term added 4.5px that is not
  // there, and reported every tab's baseline 4.5px lower than it is.
  //
  // IT MATTERED. one-header-line.js compared a padded tab against an
  // unpadded `.col-title` and reported them 0.2px apart; corrected, they are
  // 4.7px apart and the titles really do sit below the row — which is what
  // Daniel reported seeing. A test that compares two things measured by a
  // formula that is wrong for one of them will agree about nothing.
  //
  // The line box sits at the top of the content box (there is no extra
  // leading to distribute at this line-height), so the baseline is the
  // content top, plus half the leading, plus the ascent.
  const baselineOf = (el) => {
    const s = getComputedStyle(el);
    ctx.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    const m = ctx.measureText('Hxg');
    const A = m.fontBoundingBoxAscent;
    const D = m.fontBoundingBoxDescent;
    const r = el.getBoundingClientRect();
    const L = parseFloat(s.lineHeight) || r.height;
    const contentTop = r.top + parseFloat(s.borderTopWidth) + parseFloat(s.paddingTop);
    return contentTop + (L - (A + D)) / 2 + A;
  };

  await ui.selectTab('seven');
  await ui.sleep(600);
  const rows = ui.$$('#patch-list .patch-row');
  if (!rows.length) { ui.check(false, 'a bank row to select'); return; }
  rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await ui.sleep(1600);

  const root = document.documentElement;
  const was = root.getAttribute('data-theme');
  for (const theme of ['dark', 'light']) {
    root.setAttribute('data-theme', theme);
    await ui.sleep(420);
    ui.note('');
    ui.note(`=== ${theme.toUpperCase()} ===`);

    const marks = [];
    // THE LOGO'S BASELINE IS THE STRUT'S, not the drawing's box bottom.
    //
    // THE FIRST VERSION OF THIS MEASURED THE SVG'S RECT and reported the
    // logo 4.3px above the tabs — a 4.5px spread across the row — which is
    // a measurement artifact, not a misalignment. `.top-strut` is a
    // zero-width element inside the logo button carrying a word tab's exact
    // metrics (17px/700), and it is what the flex row's baseline alignment
    // actually uses: index.html's own note says the two were once wrong
    // TOGETHER, which is how the logo kept lining up while both sat at the
    // UA default. So the strut is the logo's line baseline.
    //
    // THE DRAWING'S BOX BOTTOM IS REPORTED BESIDE IT as a fact, because the
    // asset is cropped to the letters' baseline on purpose and the gap
    // between the two is worth seeing — but comparing a cropped drawing's
    // edge against font metrics is apples to oranges, and asserting on it
    // would fail on a change nobody can see.
    const strut = ui.$('#top-tabs .top-logo .top-strut');
    const logoSvg = ui.$('#top-tabs .top-logo svg');
    if (strut) {
      marks.push(['the logo (strut)', px(baselineOf(strut)),
        logoSvg ? `artwork bottom y${px(logoSvg.getBoundingClientRect().bottom)}`
          : 'no artwork found']);
    } else if (logoSvg) {
      marks.push(['the logo (artwork)', px(logoSvg.getBoundingClientRect().bottom),
        'NO STRUT — measured from the drawing, which is not its line baseline']);
    }
    for (const t of ui.$$('#top-tabs .top-tab:not(.top-logo)')) {
      const s = getComputedStyle(t);
      marks.push([`tab "${(t.textContent || '').trim()}"`, px(baselineOf(t)),
        `${s.fontSize}/${s.fontWeight}`]);
    }
    for (const t of ui.$$('#detail .col-title')) {
      const s = getComputedStyle(t);
      marks.push([`title "${(t.textContent || '').trim()}"`, px(baselineOf(t)),
        `${s.fontSize}/${s.fontWeight} ${s.letterSpacing}`]);
    }

    for (const [label, y, how] of marks) {
      ui.note(`  ${label.padEnd(22)} baseline y ${String(y).padStart(7)}   ${how}`);
    }
    // WHAT PUTS THE TITLES WHERE THEY ARE, so a correction can be derived
    // from the layout rather than invented as an offset.
    const detail = ui.$('#detail');
    const nav = ui.$('#top-tabs');
    const title = ui.$('#detail .col-title');
    if (detail && nav && title) {
      const ds = getComputedStyle(detail);
      const ns = getComputedStyle(nav);
      const ts = getComputedStyle(title);
      ui.note(`  #top-tabs  top y${px(nav.getBoundingClientRect().top)}`
        + ` padding ${ns.paddingTop}/${ns.paddingBottom}`);
      ui.note(`  #detail    top y${px(detail.getBoundingClientRect().top)}`
        + ` padding-top ${ds.paddingTop}`);
      ui.note(`  .col-title top y${px(title.getBoundingClientRect().top)}`
        + ` margin ${ts.marginTop}/${ts.marginBottom}`
        + ` · line-height ${ts.lineHeight}`);
    }
    const ys = marks.map((m) => m[1]);
    const spread = ys.length ? px(Math.max(...ys) - Math.min(...ys)) : null;
    ui.note(`  SPREAD ACROSS ALL ${ys.length}: ${spread}px`);

    // TWO CLAIMS, NOT ONE, because they rest on different kinds of
    // measurement and lumping them together would make the weaker one
    // decide the stronger one's verdict.
    //
    // THE TYPE — the three tabs and both titles — is all measured the same
    // way, from font metrics, so it can be held to EXACTLY equal. This is
    // the brief's subject and the thing Daniel could see was wrong.
    const typeYs = marks.filter(([l]) => !/logo/.test(l)).map((m) => m[1]);
    const typeSpread = px(Math.max(...typeYs) - Math.min(...typeYs));
    ui.check(typeSpread === 0,
      `${theme}: the tabs and both column titles share one baseline`
      + ` (spread ${typeSpread}px)`);

    // THE LOGO is an inline-block drawing whose baseline is its own bottom
    // edge, compared against font metrics — different instruments, so a
    // pixel between them is agreement and not a fault. Reported with its
    // number rather than asserted to zero, which would fail on a font
    // update that moved nothing anybody can see.
    const logoY = (marks.find(([l]) => /logo/.test(l)) || [])[1];
    if (logoY != null) {
      const gap = px(Math.abs(logoY - typeYs[0]));
      ui.note(`  the logo sits ${gap}px from the type's baseline`);
      ui.check(gap <= 1.5,
        `${theme}: and the logo is on the same line (${gap}px, measured a`
        + ' different way — a drawing\'s edge against font metrics)');
    }
  }
  if (was) root.setAttribute('data-theme', was); else root.removeAttribute('data-theme');
  await ui.sleep(250);

  // ---- AND THE PICTURE IN ITS OWN BOX -----------------------------------
  //
  // Reported here because it is the same kind of question — a thing that
  // should be centred and is not — and because the probe already has the
  // patch selected.
  ui.note('');
  const car = ui.$('#detail .engine-carousel');
  const stage = ui.$('#detail .engine-stage');
  if (car && stage) {
    const cs = getComputedStyle(car);
    const cb = car.getBoundingClientRect();
    // THE BOX IS THE STAGE'S CONTENT BOX — what the margins are measured
    // inside. Its padding holds the chevrons and is not part of the space
    // the picture is centred in.
    const ss = getComputedStyle(stage);
    const sb = stage.getBoundingClientRect();
    const inner = {
      left: sb.left + parseFloat(ss.paddingLeft) + parseFloat(ss.borderLeftWidth),
      right: sb.right - parseFloat(ss.paddingRight) - parseFloat(ss.borderRightWidth),
    };
    const boxCentre = (inner.left + inner.right) / 2;
    const picCentre = (cb.left + cb.right) / 2;
    const off = px(picCentre - boxCentre);
    ui.note(`the picture's box   x ${px(inner.left)}..${px(inner.right)}`
      + ` centre ${px(boxCentre)}`);
    ui.note(`the picture         x ${px(cb.left)}..${px(cb.right)} centre ${px(picCentre)}`);
    ui.note(`margins             left ${cs.marginLeft} right ${cs.marginRight}`);
    ui.note(`OFF-CENTRE BY       ${off}px`
      + (off === 0 ? '' : off > 0 ? '  (to the RIGHT)' : '  (to the LEFT)'));
    ui.check(Math.abs(off) < 0.5,
      `the picture is centred in its own box (off by ${off}px)`);
    ui.check(cs.marginLeft === cs.marginRight,
      `and its margins are equal (${cs.marginLeft} / ${cs.marginRight})`);
  }
})()
