// INVESTIGATION, not a regression test yet. B5 in docs/next-1.5.7.md.
//
// Daniel, playing the instrument 15 Nov 2026, FX2 with Mode = Delay: moving
// DEPTH changes what sounds like feedback, and moving MAX FEEDBACK appears to
// change nothing.
//
// The question this answers, and the only one: when the app writes parameter
// K, which parameter actually MOVES on the instrument? Settled by writing a
// distinctive value and reading the whole edit buffer back, never by ear.
//
// TWO HYPOTHESES, and they need different fixes, which is why the table comes
// before any change:
//
//   OFFSET   the app writes id X and id Y moves — one control writing its
//            neighbour's id. The delay sub-params (86-88) sit just past the
//            phaser block (82-85), which is the adjacency an off-by-n would
//            exploit.
//   SEMANTIC the app writes id X, id X moves, and the LABEL is simply generic
//            across modes — fx2_dp is "Depth" because that is what the device
//            calls it for all four modes, and in Delay the thing it drives may
//            genuinely be feedback. Then nothing is mis-wired and the defect
//            is in what the screen promises.
//
// A read-back that shows only the written key moving rules the first out.
//
// NOTHING IS STORED. Every write here is to the edit buffer, which was proven
// on hardware (twice, 2026-09-08) not to persist into a slot without a
// three-second panel hold. The patch on the instrument is left as found.
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };
  const api = window.sevenAPI.midi;

  // The ids are printed beside the keys so the table can be read against
  // schema/seven-1.37.json without a second lookup.
  const ID = {
    fx2_sw: 78, fx2_md: 79, fx2_dp: 80, fx2_sp: 81,
    pha_st: 82, pha_of: 83, pha_fb: 84, pha_mx: 85,
    dly_mf: 86, dly_ml: 87, dly_sp: 88,
    fx1_dp: 76, fx1_sp: 77, amp_sw: 89, amp_dr: 90,
  };
  const WATCH = Object.keys(ID);
  const show = (k) => `${k}(${ID[k]})`;

  await ui.selectTab('seven');
  await ui.sleep(800);
  const rows = ui.$$('#patch-list .patch-row');
  if (!rows.length) { ui.note('no bank rows'); return; }
  rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await ui.sleep(2600);

  const readAll = async () => {
    const r = await api.readBuffer();
    if (!r || !r.ok) {
      ui.check(false, `the edit buffer could not be read: ${(r && r.error) || 'no answer'}`);
      return null;
    }
    return r.params || r.values || r;
  };

  // FX2 ON and in Delay, or the sub-params are not the ones in play.
  for (const [key, val] of [['fx2_sw', 1], ['fx2_md', 3]]) {
    const w = await api.setParam(key, val);
    ui.note(`setup ${show(key)} = ${val} -> echoed ${w && w.value}`);
    ui.check(!!w && w.ok && w.value === val,
      `${show(key)} took the setup value ${val}`);
    await ui.sleep(260);
  }

  let prev = await readAll();
  if (!prev) return;
  ui.note(`baseline: ${WATCH.map((k) => `${k}=${prev[k]}`).join(' ')}`);

  // Far from whatever is there, so a change cannot be missed and cannot be
  // confused with a neighbouring value that happens to match.
  const distinctive = (cur) => (Number(cur) > 63 ? 11 : 119);

  const sweep = async (keys, label) => {
    ui.note(`--- ${label} ---`);
    ui.note('intended | value | echoed | ids that MOVED');
    for (const key of keys) {
      const want = distinctive(prev[key]);
      const w = await api.setParam(key, want);
      await ui.sleep(220);
      const now = await readAll();
      if (!now) return;
      const moved = WATCH.filter((k) => now[k] !== prev[k]);
      const detail = moved.map((k) => `${show(k)} ${prev[k]}->${now[k]}`).join(', ');
      ui.note(`${show(key).padEnd(12)} | ${String(want).padStart(3)}`
        + ` | ${String(w && w.ok ? w.value : 'REFUSED').padStart(7)}`
        + ` | ${detail || 'NOTHING MOVED'}`);
      // THE WHOLE FINDING, as an assertion rather than a line to read: the
      // key written is the key that moved, and no other watched id did.
      ui.check(moved.length === 1 && moved[0] === key,
        `writing ${show(key)} moved ${show(key)} and nothing else`
        + ` (moved: ${moved.length ? moved.map(show).join(', ') : 'nothing'})`);
      prev = now;
    }
  };

  await sweep(['fx2_dp', 'fx2_sp', 'dly_mf', 'dly_ml', 'dly_sp'], 'FX2 mode 3 (Delay)');

  // WHICH MODES ARE AFFECTED changes the size of the fix: a mode-specific
  // table error is a different bug from a whole-section one.
  for (const [md, name] of [[0, 'Chorus'], [1, 'Phaser'], [2, 'Flanger']]) {
    const w = await api.setParam('fx2_md', md);
    await ui.sleep(260);
    ui.check(!!w && w.ok && w.value === md, `FX2 mode took ${md} (${name})`);
    prev = await readAll();
    if (!prev) return;
    const keys = md === 1
      ? ['fx2_dp', 'fx2_sp', 'pha_st', 'pha_of', 'pha_fb', 'pha_mx']
      : ['fx2_dp', 'fx2_sp'];
    await sweep(keys, `FX2 mode ${md} (${name})`);
  }

  // Put the mode back where it was found. The VALUES are deliberately left
  // where the sweep put them: they are edit-buffer only, the patch on disk was
  // never touched, and re-selecting the preset reloads it.
  await api.setParam('fx2_md', 3);
  ui.note('mode returned to Delay; values left in the edit buffer, nothing stored');
})()
