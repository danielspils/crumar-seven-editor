// THE TWO RANGE HANDLES ARE TELLABLE APART: min filled, max a ring.
//
// WHY (Daniel, 18 Nov 2026). The expression pedal's range became draggable,
// and two identical dots gave no way to know which parameter you were
// holding. THE SYMBOL TRAVELS WITH THE PARAMETER, NOT THE POSITION: when the
// range is reversed — min above max, which the manual says flips the pedal's
// direction — the FILLED handle crosses to the right-hand side, and that
// crossing is how a player sees what they have got hold of.
//
// WHAT THIS MEASURES RATHER THAN EYEBALLS:
//   - the mark is keyed to the PARAMETER, proven by reversing the range and
//     checking the filled one moved to the right
//   - the ring is actually hollow, and visible, IN BOTH THEMES — a ring on a
//     dark ground can go faint, and a handle you cannot see is worse than two
//     you cannot tell apart
//   - at min == max the filled dot is ON TOP of the ring rather than hidden
//     inside it
//   - the hit area each handle already had is unchanged
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };

  const api = window.sevenAPI.midi;
  const MIN_KEY = 'exp_mn';
  const MAX_KEY = 'exp_mx';
  const px = (n) => Math.round(n * 10) / 10;

  const row = () => ui.$('#detail .param.param-range');
  const handle = (end) => ui.$(`#detail .param.param-range .range-handle[data-range-end="${end}"]`);
  const centreOf = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  // DRAGGED, NOT setParam. A first version wrote the values with
  // api.setParam, which reaches the instrument without going through
  // sendEdit — so the pane never re-rendered and every position below was
  // measured on stale DOM. It reported the filled handle still on the LEFT
  // after a reversal, and the two handles 86.6px apart in a state where they
  // should have been 0 apart. The numbers were honest about a page that had
  // not changed.
  const dragTo = async (end, value) => {
    const grip = handle(end);
    if (!grip) return false;
    const track = grip.closest('.param-rangebar');
    const rect = track.getBoundingClientRect();
    const gb = grip.getBoundingClientRect();
    const y = rect.top + rect.height / 2;
    // The track spans 0..127 across its width, so a value maps straight onto
    // a fraction of it: round((v/127) * 127) === v.
    const toX = rect.left + rect.width * (value / 127);
    const ev = (type, x, target) => target.dispatchEvent(
      new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1 })
    );
    ev('pointerdown', gb.left + gb.width / 2, grip);
    await ui.sleep(220);
    ev('pointermove', toX, window);
    await ui.sleep(260);
    ev('pointerup', toX, window);
    await ui.sleep(900);
    return true;
  };

  // WCAG relative luminance, on rgb() strings as getComputedStyle returns
  // them. The ring's visibility is a contrast question and "it looks fine" is
  // not a measurement.
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const lum = (rgb) => {
    const m = /(\d+),\s*(\d+),\s*(\d+)/.exec(rgb || '');
    if (!m) return null;
    const [r, g, b] = [1, 2, 3].map((i) => Number(m[i]));
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };
  // --bg is stored as a hex; getComputedStyle hands back rgb() for a painted
  // colour. lum() wants one shape.
  const hexToRgb = (h) => {
    const s = String(h || '').replace('#', '');
    if (s.length < 6) return h;
    return `rgb(${parseInt(s.slice(0, 2), 16)}, ${parseInt(s.slice(2, 4), 16)},`
      + ` ${parseInt(s.slice(4, 6), 16)})`;
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)];
    if (x == null || y == null) return null;
    const [hi, lo] = x > y ? [x, y] : [y, x];
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
  };

  await ui.openLibrary();
  await ui.sleep(400);
  const patchRow = ui.$('#library .lib-row.lib-patch, #library [data-file]');
  if (!patchRow) return { skipped: 'this library holds no patch to make live' };
  ui.click(patchRow, 'a patch');
  await ui.sleep(2500);
  if (!ui.check(await ui.live(), 'a live session is open')) return;

  // The pedal's section renders collapsed, so its row has a zero-height box
  // until it is opened — see pedal-range-edit.js for what that does to a
  // hit test.
  const section = ui.$('#detail .fx-section[data-group="pdl_exp"]');
  if (section && section.classList.contains('collapsed')) {
    ui.click(section.querySelector('.fx-head'), 'the Expression Pedal section');
    await ui.sleep(500);
  }
  if (!ui.check(!!row(), 'the pedal range row is on screen')) return;
  row().scrollIntoView({ block: 'center' });
  await ui.sleep(400);

  const startMin = await api.readParam(MIN_KEY);
  const startMax = await api.readParam(MAX_KEY);
  const homeMin = startMin && startMin.ok ? startMin.value : 0;
  const homeMax = startMax && startMax.ok ? startMax.value : 127;

  // ---- 1. ONE IS FILLED AND ONE IS HOLLOW, IN BOTH THEMES ----------------
  for (const theme of ['dark', 'light']) {
    // The app's own switch, not a media-query override.
    document.documentElement.setAttribute('data-theme', theme);
    await ui.sleep(350);

    const mn = handle('min');
    const mx = handle('max');
    if (!ui.check(!!mn && !!mx, `${theme}: both handles are on screen`)) continue;

    const mnCs = getComputedStyle(mn);
    const mxCs = getComputedStyle(mx);
    const track = getComputedStyle(mn.closest('.param-rangebar')).backgroundColor;
    // THE HALO, NOT "THE PANE". #detail has no background of its own, so
    // getComputedStyle returns rgba(0, 0, 0, 0) — and a luminance routine
    // reading three numbers out of that treats it as BLACK. The first version
    // printed "vs the pane: 7:1" in dark and 3.85:1 in light, and both were
    // contrast against black rather than against anything on screen.
    //
    // What actually sits around the handle is its own box-shadow ring, which
    // is var(--bg). That is the colour the ring has to separate from, and it
    // is a real painted value rather than a transparent one.
    const halo = getComputedStyle(document.documentElement)
      .getPropertyValue('--bg').trim();

    ui.note('');
    ui.note(`################  ${theme.toUpperCase()}  ################`);
    ui.note(`  min   background ${mnCs.backgroundColor} · border ${mxCs.borderTopWidth === '0px' ? 'none' : mnCs.borderTopWidth}`);
    ui.note(`  max   background ${mxCs.backgroundColor} · border `
      + `${mxCs.borderTopWidth} ${mxCs.borderTopColor}`);
    ui.note(`  behind them: track ${track} · halo ${halo}`);

    // FILLED means a background that actually paints.
    const mnPaints = mnCs.backgroundColor !== 'rgba(0, 0, 0, 0)'
      && mnCs.backgroundColor !== 'transparent';
    ui.check(mnPaints, `${theme}: the MIN handle is filled (${mnCs.backgroundColor})`);

    // HOLLOW means it does not.
    const mxHollow = mxCs.backgroundColor === 'rgba(0, 0, 0, 0)'
      || mxCs.backgroundColor === 'transparent';
    ui.check(mxHollow, `${theme}: the MAX handle is hollow (${mxCs.backgroundColor})`);

    const stroke = Number.parseFloat(mxCs.borderTopWidth);
    ui.check(stroke >= 1.5,
      `${theme}: and its ring has a stroke to see (${mxCs.borderTopWidth})`);

    // THE RING AGAINST WHAT IS BEHIND IT. The handle sits on the track, and
    // its box-shadow halo separates it from the pane, so both matter.
    const vsTrack = ratio(mxCs.borderTopColor, track);
    const vsHalo = ratio(mxCs.borderTopColor, hexToRgb(halo));
    ui.note(`  the ring's stroke vs the track: ${vsTrack}:1 · vs the halo: ${vsHalo}:1`);
    // 3:1 is what a non-text mark is asked to clear. Reported either way, so
    // a faint ring in one theme is a number rather than an impression.
    ui.check(vsTrack != null && vsTrack >= 3,
      `${theme}: the ring reads against the track (${vsTrack}:1, wants 3:1)`);
    ui.check(vsHalo != null && vsHalo >= 3,
      `${theme}: and against its own halo (${vsHalo}:1, wants 3:1)`);

    // THE HIT AREA IS UNCHANGED — this was appearance only.
    for (const end of ['min', 'max']) {
      const g = handle(end);
      const hit = ui.hitTarget(g);
      ui.check(hit === g || g.contains(hit),
        `${theme}: a real press still lands on the ${end} handle`);
    }
  }
  document.documentElement.removeAttribute('data-theme');
  await ui.sleep(300);

  // ---- 2. THE MARK FOLLOWS THE PARAMETER ACROSS A REVERSAL ---------------
  //
  // This is the claim that matters, and position cannot be used to fake it:
  // put min ABOVE max and the filled handle must end up on the RIGHT.
  await dragTo('max', 20);
  await dragTo('min', 110);
  // The pane re-renders from the device echo; re-query rather than reusing
  // nodes from before the write.
  const revMin = handle('min');
  const revMax = handle('max');
  if (ui.check(!!revMin && !!revMax, 'both handles survive a reversed range')) {
    const mnX = px(centreOf(revMin).x);
    const mxX = px(centreOf(revMax).x);
    ui.note(`reversed (110 → 20): the FILLED handle is at x${mnX}, the ring at x${mxX}`);
    ui.check(mnX > mxX,
      `the filled handle crossed to the right — the mark follows the PARAMETER,`
      + ` not the position (min x${mnX} > max x${mxX})`);
    const stillHollow = getComputedStyle(revMax).backgroundColor;
    ui.check(stillHollow === 'rgba(0, 0, 0, 0)' || stillHollow === 'transparent',
      `and the ring is still the ring after crossing (${stillHollow})`);
  }

  // ---- 3. AT EQUALITY: A RING AROUND A DOT, DOT ON TOP -------------------
  await dragTo('max', 64);
  await dragTo('min', 64);
  const eqMin = handle('min');
  const eqMax = handle('max');
  if (ui.check(!!eqMin && !!eqMax, 'both handles are still drawn at min == max')) {
    const a = centreOf(eqMin);
    const b = centreOf(eqMax);
    ui.note(`equal (64 → 64): min at x${px(a.x)}, max at x${px(b.x)}`
      + ` — ${px(Math.abs(a.x - b.x))}px apart`);
    ui.check(Math.abs(a.x - b.x) < 1,
      `they sit on top of each other (${px(Math.abs(a.x - b.x))}px apart)`);

    // THE FILLED ONE IS ON TOP. DOM order puts max second, so without a
    // z-index the ring paints over the dot and hides it inside itself.
    // elementFromPoint at the shared centre is what settles it: it reports
    // what a press would hit, which is the topmost painted thing there.
    const top = document.elementFromPoint(a.x, a.y);
    const which = top && top.dataset ? top.dataset.rangeEnd : null;
    ui.note(`  the topmost thing at that point is the ${which || '(not a handle)'} handle`);
    ui.check(which === 'min',
      `the filled dot is ON TOP of the ring, not hidden inside it (${which})`);
  }

  // ---- PUT IT BACK --------------------------------------------------------
  await api.setParam(MIN_KEY, homeMin);
  await api.setParam(MAX_KEY, homeMax);
  await ui.sleep(400);
  ui.note(`restored to ${homeMin} → ${homeMax}`);
})()
