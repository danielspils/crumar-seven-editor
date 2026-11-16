// INVESTIGATION, second half. B5 in out/next-1.5.7.md.
//
// fx2-delay-map.js asked what the INSTRUMENT does with a write and found the
// mapping clean. That probe went through sevenAPI.midi.setParam(key, …) — the
// seam — and so it could not have seen the bug CODE actually proposed: "one
// control writing its neighbour's id". The control is a row on screen, and a
// row writes whatever its own data-key says (audition.js reads
// el.closest('.param').dataset.key). If the Delay rows are emitted with the
// wrong keys, every write is faithful to a key that belongs to another label,
// and a by-the-seam probe sails straight past it.
//
// So this one reads the rendered rows: the LABEL a player sees against the KEY
// that label will write. No ears, no writes except the mode change needed to
// put the Delay rows on screen at all — and that goes through the real select
// handler, which is itself one of the things worth checking.
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };

  const ID = {
    fx2_sw: 78, fx2_md: 79, fx2_dp: 80, fx2_sp: 81,
    pha_st: 82, pha_of: 83, pha_fb: 84, pha_mx: 85,
    dly_mf: 86, dly_ml: 87, dly_sp: 88,
  };

  await ui.selectTab('seven');
  await ui.sleep(800);
  const rows = ui.$$('#patch-list .patch-row');
  if (!rows.length) { ui.note('no bank rows'); return; }
  rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await ui.sleep(2600);

  const fx2 = ui.$('#detail .fx-section[data-group="efx_fx2"]');
  if (!fx2) { ui.check(false, 'the FX2 section is on screen'); return; }

  // Mode to Delay through the REAL control, not the seam: this is how a
  // player gets here, and the select's own wiring is part of what is in
  // question. The rows for the mode's sub-parameters are rendered by
  // renderer.js off patch.params.fx2_md, so nothing appears without it.
  const modeSel = fx2.querySelector('select.param-select[data-key="fx2_md"]');
  ui.check(!!modeSel, 'the FX2 Mode select carries data-key="fx2_md"');
  if (!modeSel) return;
  ui.note(`mode select options: ${[...modeSel.options].map((o, i) => `${i}:${o.textContent}`).join(' ')}`);
  modeSel.value = '3';
  modeSel.dispatchEvent(new Event('change', { bubbles: true }));
  await ui.sleep(1600);

  const fx2Now = ui.$('#detail .fx-section[data-group="efx_fx2"]');
  const label = (row) => (row.querySelector('.param-label') || {}).textContent || '';
  const value = (row) => (row.querySelector('.param-value') || {}).textContent || '';
  const allRows = [...fx2Now.querySelectorAll('.param[data-key]')];

  ui.note('--- rows rendered under FX2 with Mode = Delay ---');
  ui.note('label | data-key | id | shown');
  for (const r of allRows) {
    const k = r.dataset.key;
    ui.note(`${label(r).trim().padEnd(16)} | ${String(k).padEnd(8)}`
      + ` | ${String(ID[k] === undefined ? '?' : ID[k]).padStart(3)}`
      + ` | ${value(r).trim()}`);
  }

  // THE ASSERTION THAT MATTERS: the label a player reads and the key it writes
  // describe the same parameter. Written as an explicit expected pairing
  // rather than "the keys are in the schema", because every wrong pairing
  // CODE proposed is made of keys that ARE in the schema.
  const EXPECT = [
    ['Depth', 'fx2_dp'],
    ['Speed', 'fx2_sp'],
    ['Max Feedback', 'dly_mf'],
    ['Max Level', 'dly_ml'],
    ['Stereo Spread', 'dly_sp'],
  ];
  for (const [text, key] of EXPECT) {
    const row = allRows.find((r) => label(r).trim() === text);
    ui.check(!!row, `a row labelled "${text}" is on screen in Delay mode`);
    if (!row) continue;
    ui.check(row.dataset.key === key,
      `the row labelled "${text}" writes ${key} (id ${ID[key]}),`
      + ` not ${row.dataset.key} (id ${ID[row.dataset.key]})`);
  }

  // AND NO PHASER ROW IS ON SCREEN IN DELAY. The two sub-groups are adjacent
  // in the id space (82-85 then 86-88), so rendering the wrong group is the
  // cheapest way to produce exactly the symptom reported.
  const strays = allRows.filter((r) => /^pha_/.test(r.dataset.key));
  ui.check(strays.length === 0,
    `no phaser row is rendered in Delay mode (${strays.map((r) => r.dataset.key).join(', ') || 'none'})`);

  // The dimming Daniel described, recorded rather than asserted: it is the
  // at-default muting, not a disabled control, and it is worth having in the
  // same table so the next reader does not read "dimmed" as "inactive".
  for (const r of allRows) {
    const dim = r.classList.contains('at-default') || r.classList.contains('dimmed')
      || getComputedStyle(r).opacity !== '1';
    if (dim) ui.note(`  "${label(r).trim()}" renders dimmed (class="${r.className}")`);
  }
})()
