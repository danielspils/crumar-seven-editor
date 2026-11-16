// WHERE DOES THE SAVE PATCH BUTTON BELONG?
//
// Daniel: "looks floating out in space." The diagnosis is proximity, not
// alignment — its left edge is already shared with the name, the sub-line and
// Bank · Preset above it. What strands it is that the gap ABOVE and the gap
// BELOW are about equal, so it reads as belonging to neither the identity
// block nor the parameter list.
//
// This measures both gaps, every spacing value already in use in the column
// (so a fix can be derived from them rather than invented), the two button
// states' footprints, and whether the grid rows are being stretched by the
// picture beside them.
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };
  const px = (n) => Math.round(n * 10) / 10;
  const box = (el) => (el ? el.getBoundingClientRect() : null);

  await ui.selectTab('seven');
  await ui.sleep(800);
  const rows = ui.$$('#patch-list .patch-row');
  if (!rows.length) { ui.note('no bank rows'); return; }
  rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await ui.sleep(2600);

  const head = ui.$('#detail .engine-head-text');
  if (!head) { ui.check(false, 'the engine head is on screen'); return; }
  const cs = getComputedStyle(head);
  ui.note(`.engine-head-text row-gap "${cs.rowGap}" column-gap "${cs.columnGap}"`);
  ui.note(`  rows: "${cs.gridTemplateRows}"`);

  const parts = [
    ['.engine-sound', ui.$('#detail .engine-sound')],
    ['.engine-sub', ui.$('#detail .engine-sub')],
    ['.engine-pos', ui.$('#detail .engine-pos')],
    ['.save-slot', ui.$('#detail .save-slot')],
    ['.engine-stage', ui.$('#detail .engine-stage')],
  ];
  ui.note('element        | top    bottom height | margin t/b');
  for (const [name, el] of parts) {
    if (!el) { ui.note(`${name.padEnd(14)} | NOT ON SCREEN`); continue; }
    const r = box(el);
    const s = getComputedStyle(el);
    ui.note(`${name.padEnd(14)} | ${String(px(r.top)).padStart(6)}`
      + ` ${String(px(r.bottom)).padStart(6)} ${String(px(r.height)).padStart(6)}`
      + ` | ${s.marginTop} / ${s.marginBottom}`);
  }

  // THE TWO GAPS, which is the whole question.
  const pos = box(ui.$('#detail .engine-pos'));
  const save = box(ui.$('#detail .save-slot'));
  // The first thing BELOW the identity block: whatever the parameter list
  // starts with in this column.
  const firstParam = ui.$('#detail .col-engine .param');
  const fp = box(firstParam);
  // THE GAPS THAT MATTER ARE AROUND THE BUTTON, not around its slot. The slot
  // is a grid cell and is stretched by the picture beside it, so its box says
  // nothing about what the eye sees.
  const bar0 = ui.$('#detail .save-slot .audition-bar');
  const btn0 = ui.$('#save-live-btn') || ui.$('#detail .save-slot button');
  const bb = box(btn0);
  const br = box(bar0);
  if (pos && save && fp && bb) {
    ui.note(`.audition-bar  | ${String(px(br.top)).padStart(6)}`
      + ` ${String(px(br.bottom)).padStart(6)} ${String(px(br.height)).padStart(6)}`
      + ` | padding ${getComputedStyle(bar0).padding}`);
    ui.note(`button         | ${String(px(bb.top)).padStart(6)}`
      + ` ${String(px(bb.bottom)).padStart(6)} ${String(px(bb.height)).padStart(6)}`);
    ui.note(`slot slack: ${px(save.height - br.height)}px of the`
      + ` ${px(save.height)}px cell is empty`);
    ui.note(`  above the bar inside the cell: ${px(br.top - save.top)}px`);
    ui.note(`  below the bar inside the cell: ${px(save.bottom - br.bottom)}px`);
    const above = bb.top - pos.bottom;
    const below = fp.top - bb.bottom;
    ui.note(`GAP ABOVE the BUTTON (Bank·Preset -> button): ${px(above)}px`);
    ui.note(`GAP BELOW the BUTTON (button -> first param): ${px(below)}px`);
    ui.note(`  ratio below/above: ${px(below / above)}`
      + `  — equal-ish is the complaint; one should be clearly larger`);
    ui.note(`  first param is "${(firstParam.querySelector('.param-label') || {}).textContent || '?'}"`);
  }

  // EVERY SPACING VALUE ALREADY IN THE COLUMN, so the fix uses one of these.
  const seen = new Map();
  for (const el of ui.$$('#detail .col-engine *')) {
    const s = getComputedStyle(el);
    for (const [prop, val] of [['margin-top', s.marginTop], ['margin-bottom', s.marginBottom],
      ['padding-top', s.paddingTop], ['padding-bottom', s.paddingBottom], ['row-gap', s.rowGap]]) {
      const n = parseFloat(val);
      if (!n || Number.isNaN(n)) continue;
      const k = `${prop}: ${val}`;
      seen.set(k, (seen.get(k) || 0) + 1);
    }
  }
  ui.note('vertical spacing values already in use in this column:');
  for (const [k, n] of [...seen].sort((a, b) => b[1] - a[1]).slice(0, 14)) {
    ui.note(`  ${k}  (x${n})`);
  }

  // IS THE PICTURE STRETCHING THE ROWS IT SPANS? .engine-stage spans rows
  // 2-4 with align-self:start, so if it is TALLER than those three rows'
  // own content the grid grows them — and the air around Save patch is part
  // of what grows. This is the check for "has the column gained air".
  const stage = box(ui.$('#detail .engine-stage'));
  const sub = box(ui.$('#detail .engine-sub'));
  if (stage && sub && save) {
    const spanned = save.bottom - sub.top;
    ui.note(`rows 2-4 span ${px(spanned)}px; the stage beside them is ${px(stage.height)}px`);
    ui.check(true, `stage ${px(stage.height)} vs spanned rows ${px(spanned)}`
      + ` — ${stage.height > spanned ? 'THE PICTURE IS THE TALLER ONE and sets the height'
        : 'the text rows are taller, so the picture is not adding air'}`);
  }

  // BOTH BUTTON STATES MUST HAVE THE SAME FOOTPRINT. Outlined when nothing
  // has changed, solid once there are edits, and both clickable
  // (out/save-what-you-hear.md §3). If the solid state is taller, the
  // parameter list below it moves the moment a patch becomes dirty — a new
  // version of the jump Daniel caught on the carousel.
  const bar = ui.$('#detail .save-slot .audition-bar');
  const btn = ui.$('#save-live-btn') || ui.$('#detail .save-slot button');
  if (bar && btn) {
    const idle = { slot: box(ui.$('#detail .save-slot')), btn: box(btn) };
    ui.note(`IDLE  slot h${px(idle.slot.height)} · button`
      + ` ${px(idle.btn.width)}x${px(idle.btn.height)} · bar class "${bar.className}"`);
    // Force the live/dirty look without editing anything on the instrument:
    // the class is what the renderer swaps, so this measures the same CSS the
    // real state uses. Nothing is sent and nothing is stored.
    const had = bar.className;
    bar.classList.remove('is-idle');
    bar.classList.add('is-live');
    await ui.sleep(260);
    const live = { slot: box(ui.$('#detail .save-slot')), btn: box(btn) };
    ui.note(`LIVE  slot h${px(live.slot.height)} · button`
      + ` ${px(live.btn.width)}x${px(live.btn.height)} · bar class "${bar.className}"`);
    ui.check(Math.abs(live.slot.height - idle.slot.height) < 0.5,
      `the save slot is the same height in both states`
      + ` (idle ${px(idle.slot.height)}, live ${px(live.slot.height)})`);
    ui.check(Math.abs(live.btn.height - idle.btn.height) < 0.5,
      `the button is the same height in both states`
      + ` (idle ${px(idle.btn.height)}, live ${px(live.btn.height)})`);
    ui.check(Math.abs(live.btn.top - idle.btn.top) < 0.5,
      `the button does not move when the patch becomes dirty`
      + ` (top ${px(idle.btn.top)} -> ${px(live.btn.top)})`);
    bar.className = had;
  }
})()
