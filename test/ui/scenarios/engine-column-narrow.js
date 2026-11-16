// @env SEVEN_WINDOW_WIDTH=800
//
// B6: AT A NARROW WIDTH THE TWO COLUMNS LAND ON EACH OTHER'S CONTROLS.
//
// Measured 16 Nov 2026, and PROVEN INDEPENDENT of the carousel work that
// found it: the no-peek rule's breakpoint was temporarily dropped to 1px so
// no face was hidden, and the same two elements covered the same two controls
// at the same width. It is the two-column grid and the engine heading.
//
//     "save-live-btn" at 25%, 50% and 75% across is covered by
//                     <div class="engine-head-text">
//     "picker"        at 50% and 75% across is covered by
//                     <div class="fx-section dimmed collapsed">
//
// So the Sound Engine heading block lands on top of Save patch, and the
// EFFECTS CHAIN column lands on top of the Type picker. `elementFromPoint`
// returns the covering element at every one of those points, so these are
// presses that would not land.
//
// WHO MEETS IT. main.js sets `minWidth: Math.min(1280, work.width)`, so the
// window only goes below 1280 on a DISPLAY narrower than that, where the
// minimum collapses to the screen width — a small or scaled panel, a portrait
// tablet reporting 800x1280. Daniel's work area is 1147, so his default is
// his floor and he cannot reach this at all. Nobody has reported it.
//
// THE PRESS IS THE TEST, NOT THE OVERLAP. A box can overlap a control and
// still let the press through — a far face parked at opacity 0 with
// pointer-events none does exactly that, and an unscoped overlap check fails
// on it while nothing is wrong. `elementFromPoint` is the honest question.
//
// THREE POINTS ACROSS, NOT THE CENTRE. Measured during the carousel work: a
// picture can sit on a button's right-hand END while its centre stays clear,
// and a centre-only probe walked straight through that bug.
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };
  const px = (n) => Math.round(n * 10) / 10;
  const box = (el) => (el ? el.getBoundingClientRect() : null);

  const vw = document.documentElement.clientWidth;
  ui.note(`viewport ${vw}px`);

  await ui.selectTab('seven');
  await ui.sleep(800);
  const rows = ui.$$('#patch-list .patch-row');
  if (!rows.length) { ui.note('no bank rows'); return; }
  rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await ui.sleep(2600);

  const cols = ui.$('#detail .detail-cols');
  if (!cols) { ui.check(false, 'the two-column detail block is on screen'); return; }
  const engine = ui.$('#detail .col-engine');
  const chain = ui.$('#detail .col-chain') || ui.$('#detail .detail-cols > .col:last-child');
  ui.note(`columns: ${getComputedStyle(cols).gridTemplateColumns}`);
  if (engine) ui.note(`engine x${px(box(engine).left)}..${px(box(engine).right)}`);
  if (chain) ui.note(`chain  x${px(box(chain).left)}..${px(box(chain).right)}`);

  // THE COLUMNS MUST NOT OVERLAP EACH OTHER. If they do, every control in one
  // of them is reachable only by luck.
  if (engine && chain) {
    const e = box(engine);
    const c = box(chain);
    const apart = c.left >= e.right - 1 || e.left >= c.right - 1 || c.top >= e.bottom - 1
      || e.top >= c.bottom - 1;
    ui.note(`the columns are ${apart ? 'apart' : 'OVERLAPPING'}`);
    ui.check(apart, `the two columns do not overlap at ${vw}px`);
  }

  // HOW MUCH ROOM THE ENGINE COLUMN ACTUALLY NEEDS. The threshold for
  // stacking is derived from this rather than picked: the column is
  // `minmax(0, 1fr)` so it will shrink to nothing, and its contents — a fixed
  // 128px carousel with its step buttons hanging ±22px outside, the picker,
  // Save patch — do not shrink with it. What spills is what lands on the
  // other column.
  if (engine) {
    const e = box(engine);
    const widest = ui.$$('#detail .col-engine *')
      .map((el) => box(el))
      .filter((r) => r.width > 0)
      .reduce((acc, r) => ({
        left: Math.min(acc.left, r.left), right: Math.max(acc.right, r.right),
      }), { left: Infinity, right: -Infinity });
    ui.note(`engine column box     ${px(e.width)}px (x${px(e.left)}..${px(e.right)})`);
    ui.note(`engine content spans  ${px(widest.right - widest.left)}px`
      + ` (x${px(widest.left)}..${px(widest.right)})`);
    ui.note(`  scrollWidth ${engine.scrollWidth} vs clientWidth ${engine.clientWidth}`);
    const over = widest.right - e.right;
    ui.note(`  the content runs ${px(over)}px past the column's right edge`);
    ui.note(`  so the column needs about ${px(widest.right - widest.left)}px,`
      + ` and the window would need ${px(vw + (widest.right - widest.left) - e.width)}px`
      + ' for the grid to give it that');
  }

  // EVERY INTERACTIVE CONTROL IN THE DETAIL BLOCK, pressed at three points.
  // Named rather than listed, so a control added later is covered by this
  // without anybody remembering to add it.
  const controls = ui.$$('#detail .detail-cols button, #detail .detail-cols select, '
    + '#detail .detail-cols input, #detail .detail-cols [role="button"]')
    .filter((el) => {
      const r = box(el);
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden'
        && cs.display !== 'none' && Number(cs.opacity) > 0;
    });
  ui.note(`interactive controls on screen: ${controls.length}`);
  ui.check(controls.length > 0,
    'there are controls to press — otherwise this proves nothing');

  // ONLY WHAT IS INSIDE THE VIEWPORT. `elementFromPoint` answers about the
  // visible rectangle and returns null for anything outside it — so a control
  // scrolled below the fold reads as "covered by nothing", which is a
  // SCROLL POSITION and not an occlusion. The stacked layout is taller than
  // the window by design, so without this the fix looks like 54 new failures.
  // Counted rather than silently dropped: a run where everything was
  // off-screen would otherwise pass by testing nothing.
  const vh = document.documentElement.clientHeight;
  const onScreen = (r) => r.top >= 0 && r.bottom <= vh && r.left >= 0 && r.right <= vw;
  const visible = controls.filter((el) => onScreen(box(el)));
  ui.note(`of those, inside the viewport right now: ${visible.length}`
    + ` (${controls.length - visible.length} are scrolled out of view, which is`
    + ' a different question)');
  ui.check(visible.length > 0, 'there are controls in view to press');

  const blocked = [];
  for (const el of visible) {
    const r = box(el);
    const name = (el.id || String(el.className).split(/\s+/)[0] || el.tagName).trim();
    for (const frac of [0.25, 0.5, 0.75]) {
      const x = r.left + r.width * frac;
      const y = r.top + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      const reaches = !!hit && (hit === el || el.contains(hit) || hit.contains(el));
      if (!reaches) {
        const by = hit ? `<${hit.tagName.toLowerCase()} class="${hit.className}">` : 'nothing';
        blocked.push(`"${name}" at ${Math.round(frac * 100)}% is covered by ${by}`);
      }
    }
  }
  for (const line of blocked) ui.note(`  ${line}`);
  ui.check(blocked.length === 0,
    `every control in the detail block can be pressed at ${vw}px`
    + (blocked.length ? ` — ${blocked.length} cannot: ${blocked[0]}` : ''));
})()
