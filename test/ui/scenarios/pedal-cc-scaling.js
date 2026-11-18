// IS THE PEDAL'S CC THE RAW POSITION, OR ALREADY SCALED BY exp_mn/exp_mx?
//
// WHY THIS IS A SEPARATE PROBE (Daniel, 18 Nov 2026). pedal-position-probe.js
// established that the stored parameter is NOT modulated — reading veq_vol
// gave 127 with the pedal up and 127 held down — and that the Seven transmits
// CC 11, the MIDI Expression Controller, 140 messages spanning 0..127.
//
// BUT IT MEASURED THAT WITH THE RANGE AT 0 → 127, where two completely
// different mechanisms produce identical numbers:
//
//   RAW        the CC is the pedal's physical position, 0..127 whatever the
//              range says. The app would have to interpolate between exp_mn
//              and exp_mx itself, and track the range as it changes.
//   SCALED     the CC is the value actually being applied, already mapped
//              into the range. The app can use it directly.
//
// A NARROW RANGE SEPARATES THEM. With exp_mn/exp_mx at 40/80: raw still spans
// 0..127, scaled spans about 40..80. That is the whole experiment, and it
// decides whether the live-position feature is cheap or fragile.
//
// IT PUTS THE RANGE BACK. The values are read first and restored at the end,
// and nothing is stored to a preset — this writes to the edit buffer only.
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };

  const api = window.sevenAPI.midi;
  const LO = 40;
  const HI = 80;

  const read = async (key) => {
    const r = await api.readParam(key);
    return r && r.ok ? r.value : null;
  };

  const seen = new Map();
  const watch = (ev) => {
    if (!ev || ev.type !== 'panel-cc') return;
    const e = seen.get(ev.cc) || { count: 0, min: 127, max: 0 };
    e.count += 1;
    e.min = Math.min(e.min, ev.value);
    e.max = Math.max(e.max, ev.value);
    seen.set(ev.cc, e);
  };
  api.onEvent(watch);

  await ui.openLibrary();
  await ui.sleep(400);
  const patchRow = ui.$('#library .lib-row.lib-patch, #library [data-file]');
  if (!patchRow) return { skipped: 'this library holds no patch to make live' };
  ui.click(patchRow, 'a patch');
  await ui.sleep(2500);
  ui.check(await ui.live(), 'a live session is open');

  const homeMin = await read('exp_mn');
  const homeMax = await read('exp_mx');
  const fn = await read('exp_fn');
  ui.note(`starting range ${homeMin} → ${homeMax} · assignment exp_fn=${fn}`);

  await api.setParam('exp_mn', LO);
  await api.setParam('exp_mx', HI);
  await ui.sleep(600);
  const setMin = await read('exp_mn');
  const setMax = await read('exp_mx');
  ui.note(`narrowed to ${setMin} → ${setMax}`);
  if (!ui.check(setMin === LO && setMax === HI,
    `the instrument took the narrow range (${setMin} → ${setMax})`)) {
    await api.setParam('exp_mn', homeMin);
    await api.setParam('exp_mx', homeMax);
    return;
  }

  seen.clear();
  const rocked = await ui.waitForHuman(
    `ROCK THE PEDAL SLOWLY THROUGH ITS WHOLE TRAVEL, heel to toe and back, `
    + `two or three times. The range is now ${LO}-${HI}. Then signal.`,
    { timeout: 180000 }
  );
  if (!rocked) {
    await api.setParam('exp_mn', homeMin);
    await api.setParam('exp_mx', homeMax);
    return { skipped: 'nobody rocked the pedal — nothing was measured', hand: true };
  }
  await ui.sleep(400);

  ui.note('');
  ui.note(`with the range at ${LO} → ${HI}, the Seven transmitted:`);
  ui.note('    cc  | messages |  low |  high');
  for (const [cc, e] of [...seen].sort((a, b) => b[1].count - a[1].count)) {
    ui.note(`    ${String(cc).padStart(3)} | ${String(e.count).padStart(8)}`
      + ` | ${String(e.min).padStart(4)} | ${String(e.max).padStart(5)}`);
  }

  const pedal = [...seen].find(([, e]) => e.count > 8 && (e.max - e.min) > 20);
  ui.note('');
  if (!pedal) {
    ui.note('>>> NO PEDAL SWEEP SEEN. Nothing spanning a useful range arrived,');
    ui.note('    so this run measured nothing and neither answer is supported.');
  } else {
    const [cc, e] = pedal;
    const looksScaled = e.min >= LO - 4 && e.max <= HI + 4;
    const looksRaw = e.min <= 4 && e.max >= 123;
    ui.note(looksScaled
      ? `>>> SCALED. CC ${cc} spanned ${e.min}..${e.max}, inside the ${LO}-${HI}`
        + ' range — the Seven is sending the value it is APPLYING, so the app'
        + ' can use it directly and does not have to interpolate.'
      : looksRaw
        ? `>>> RAW. CC ${cc} spanned ${e.min}..${e.max}, the full travel`
          + ` regardless of the ${LO}-${HI} range — the app would have to`
          + ' interpolate between exp_mn and exp_mx itself.'
        : `>>> NEITHER CLEANLY. CC ${cc} spanned ${e.min}..${e.max} against a`
          + ` range of ${LO}-${HI}. Reported as measured rather than forced`
          + ' into one of the two answers.');
  }

  // ---- PUT IT BACK --------------------------------------------------------
  await api.setParam('exp_mn', homeMin);
  await api.setParam('exp_mx', homeMax);
  await ui.sleep(400);
  const backMin = await read('exp_mn');
  const backMax = await read('exp_mx');
  ui.note(`restored to ${backMin} → ${backMax}`);
  ui.check(backMin === homeMin && backMax === homeMax,
    `the range was put back (${backMin} → ${backMax}, was ${homeMin} → ${homeMax})`);
})()
