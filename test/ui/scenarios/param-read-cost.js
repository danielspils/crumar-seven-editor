// WHAT DOES ONE PARAMETER READ COST?
//
// Pricing input for the B7 fix options. The only figure on record is
// readBuffer's 1363ms median (CLAUDE.md, 2026-11-14) for all 110 parameters,
// and dividing it by 110 is not a measurement — it would ignore whatever is
// fixed per call and whatever is per parameter, which is exactly the
// distinction a "read one on pointerdown" option stands or falls on.
//
// Timed around the IPC call rather than inside the main process, deliberately:
// the bridge is part of what a player waits through before the slider moves.
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };
  const api = window.sevenAPI.midi;

  await ui.selectTab('seven');
  await ui.sleep(800);
  const rows = ui.$$('#patch-list .patch-row');
  if (!rows.length) { ui.note('no bank rows'); return; }
  rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await ui.sleep(2600);

  const stats = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    return {
      min: s[0], max: s[s.length - 1],
      med: s[Math.floor(s.length / 2)],
      mean: Math.round(s.reduce((a, b) => a + b, 0) / s.length),
    };
  };

  // Several different ids, so a result cannot be an artifact of one
  // parameter, and several rounds each.
  const KEYS = ['fx2_dp', 'dly_mf', 'rho_atk', 'rev_lv', 'veq_vol'];
  const each = [];
  ui.note('key      | reads (ms)');
  for (const key of KEYS) {
    const ts = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      const r = await api.readParam(key);
      const dt = performance.now() - t0;
      if (!r || !r.ok) { ui.check(false, `readParam("${key}") answered`); return; }
      ts.push(Math.round(dt));
      each.push(dt);
      await ui.sleep(40);
    }
    const st = stats(ts);
    ui.note(`${key.padEnd(8)} | ${ts.join(' ')}  -> median ${st.med}`);
  }
  const one = stats(each);
  ui.note(`ONE PARAMETER: min ${one.min} · median ${one.med} · max ${one.max}`
    + ` · mean ${one.mean}  (n=${each.length})`);

  // The whole-buffer figure, re-taken rather than quoted: CLAUDE.md's 1363ms
  // is from 2026-11-14 and a number carried forward without a date is the
  // shape this project has been wrong about twice.
  const buf = [];
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    const r = await api.readBuffer();
    const dt = performance.now() - t0;
    if (!r || !r.ok) { ui.check(false, 'readBuffer answered'); return; }
    buf.push(Math.round(dt));
    await ui.sleep(120);
  }
  const all = stats(buf);
  ui.note(`WHOLE BUFFER: ${buf.join(' ')} -> median ${all.med}ms`
    + ` (CLAUDE.md records 1363ms on 2026-11-14)`);
  ui.note(`per-parameter if divided: ${Math.round(all.med / 110)}ms`
    + ` — against ${one.med}ms measured for a single read`);

  // A SINGLE READ MUST BE WELL UNDER A BUFFER READ, or "read one on
  // pointerdown" is not a cheaper option and the pricing is wrong.
  ui.check(one.med < all.med / 4,
    `a single read (${one.med}ms) is far cheaper than the whole buffer`
    + ` (${all.med}ms)`);
  // 100ms is the usual bar for a gesture feeling immediate. Stated as an
  // assertion so the option is priced against something rather than admired.
  ui.check(one.med < 100,
    `a single read (${one.med}ms) is inside the 100ms a press can absorb`
    + ' without feeling laggy');
})()
