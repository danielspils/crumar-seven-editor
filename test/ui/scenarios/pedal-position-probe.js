// WHERE CAN THE EXPRESSION PEDAL'S POSITION BE READ?
//
// THE QUESTION (Daniel, 18 Nov 2026). With the pedal assigned to Amp Drive,
// rocking it changes the sound and the app shows nothing. Before any feature
// is built, the mechanism has to be established — nothing in the manual, the
// schema or docs/ answers this, and the two candidates need different code:
//
//   (a) THE INSTRUMENT REPORTS THE MODULATED VALUE. Read the destination
//       parameter while the pedal is down and the number differs from the
//       stored one. The app could then just read it.
//
//   (b) IT DOES NOT. The pedal applies downstream and the stored parameter is
//       untouched, so the only signal is whatever the Seven TRANSMITS as the
//       pedal moves. The app would have to interpolate that CC between
//       exp_mn and exp_mx itself — a different and more fragile feature.
//
// THIS PROBE ANSWERS BOTH, IN ONE SITTING, AND ASSERTS ALMOST NOTHING. It is
// an investigation: what it owes is an accurate reading, not a verdict. The
// checks here are only that a reading was actually taken, so that a silent
// failure cannot be mistaken for evidence of (b).
//
// IT READS AND LISTENS ONLY. Nothing is written to the instrument.
//
// BEHIND SEVEN_PEDAL_PROBE BECAUSE IT IS A RECORD, NOT A TEST (Daniel,
// 18 Nov 2026). It says so itself three paragraphs up — "it is an
// investigation" that "asserts almost nothing" — and what it established is a
// fact about the INSTRUMENT'S FIRMWARE: the destination parameter is not
// modulated, so the position cannot be read back. No change to this app can
// make that fail. The answer is committed in docs/DEVICE.md, which says how to
// re-run this. See the rule in CLAUDE.md: a scenario that establishes a fact
// about the instrument goes behind a probe flag; one that asserts what this
// app does stays in the pass.
(async () => {
  if (!ui.env('SEVEN_PEDAL_PROBE')) {
    return { skipped: 'SEVEN_PEDAL_PROBE not set — this probe re-establishes a firmware fact' };
  }
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };

  const api = window.sevenAPI.midi;
  const FUNCTIONS = ['Volume', 'FX 1 Depth', 'FX 2 Depth', 'FX 1 + 2 Depth',
    'FX 1 Rate', 'FX 2 Rate', 'FX 1 + 2 Rate', 'Amp Drive', 'Pad Level', 'Pad Blend'];
  // exp_fn's value is an index into the list above; this maps it to the
  // parameter the pedal is actually driving. The two nulls drive TWO rows each
  // and this probe only needed one.
  //
  // CORRECTED 18 Nov 2026: entries 4 and 5 said `fx1_rt`/`fx2_rt`, which exist
  // nowhere in the schema — the function list says "Rate", the parameters are
  // `fx1_sp`/`fx2_sp` labelled "Speed". Nothing noticed because this probe only
  // ever ran with exp_fn=0, so those entries were never looked up: a map whose
  // wrong half is unreachable. The live version lives in `pedalEstimates`
  // (src/renderer.js) and a unit test now walks every exp_fn against the
  // schema's own key list, which is the guard that would have caught it.
  const DEST = {
    0: 'veq_vol', 1: 'fx1_dp', 2: 'fx2_dp', 3: null,
    4: 'fx1_sp', 5: 'fx2_sp', 6: null, 7: 'amp_dr', 8: 'pad_lv', 9: 'pad_bl',
  };

  const read = async (key) => {
    const r = await api.readParam(key);
    return r && r.ok ? r.value : null;
  };

  // ---- EVERY CC THE SEVEN SENDS, FROM NOW ON -----------------------------
  //
  // seven-midi.js emits every 0xB0 as `panel-cc`, so this sees the raw
  // traffic rather than the app's interpretation of it.
  const seen = new Map();   // cc -> { count, min, max, first, last }
  api.onEvent((ev) => {
    if (!ev || ev.type !== 'panel-cc') return;
    const e = seen.get(ev.cc) || { count: 0, min: 127, max: 0, first: ev.value, last: ev.value };
    e.count += 1;
    e.min = Math.min(e.min, ev.value);
    e.max = Math.max(e.max, ev.value);
    e.last = ev.value;
    seen.set(ev.cc, e);
  });

  await ui.openLibrary();
  await ui.sleep(400);
  const patchRow = ui.$('#library .lib-row.lib-patch, #library [data-file]');
  if (!patchRow) return { skipped: 'this library holds no patch to make live' };
  ui.click(patchRow, 'a patch');
  await ui.sleep(2500);
  ui.check(await ui.live(), 'a live session is open');

  const fn = await read('exp_fn');
  const mn = await read('exp_mn');
  const mx = await read('exp_mx');
  const destKey = fn == null ? null : DEST[fn];
  ui.note(`the pedal is assigned to: ${fn == null ? '(unreadable)' : FUNCTIONS[fn]}`
    + ` (exp_fn=${fn}) · range ${mn} → ${mx}`);
  ui.note(`its destination parameter is: ${destKey || '(a pair, or unmapped)'}`);

  if (!ui.check(destKey != null,
    `the assignment maps to a single parameter this probe can read (${destKey})`)) {
    ui.note('set the pedal to Volume or Amp Drive and run this again');
    return;
  }

  // ---- CANDIDATE (a): DOES THE STORED PARAMETER MOVE? --------------------
  const atRest = await read(destKey);
  ui.note('');
  ui.note(`${destKey} with the pedal UP: ${atRest}`);

  const held = await ui.waitForHuman(
    `PUSH THE EXPRESSION PEDAL ALL THE WAY DOWN AND HOLD IT THERE. `
    + `Keep holding while you signal — the reading is taken after the signal, `
    + `so letting go first measures nothing.`,
    { timeout: 180000 }
  );
  if (!held) {
    return { skipped: 'nobody held the pedal down — nothing was measured', hand: true };
  }
  const downValues = [];
  for (let i = 0; i < 3; i += 1) {
    downValues.push(await read(destKey));
    await ui.sleep(250);
  }
  const atDown = downValues[0];
  ui.note(`${destKey} with the pedal DOWN: ${downValues.join(', ')}`);
  const moved = atRest != null && atDown != null && atRest !== atDown;

  ui.note('');
  ui.note(moved
    ? `>>> CANDIDATE (a): THE INSTRUMENT REPORTS THE MODULATED VALUE.`
      + ` ${destKey} read ${atRest} up and ${atDown} down.`
    : `>>> CANDIDATE (a) IS OUT: ${destKey} read ${atRest} both up and down,`
      + ` so the stored parameter is NOT modulated by the pedal.`);

  // ---- CANDIDATE (b): WHAT DOES IT TRANSMIT? -----------------------------
  seen.clear();
  const rocked = await ui.waitForHuman(
    `NOW ROCK THE PEDAL SLOWLY THROUGH ITS WHOLE TRAVEL, two or three times, `
    + `heel to toe and back. Then signal.`,
    { timeout: 180000 }
  );
  if (!rocked) {
    return { skipped: 'nobody rocked the pedal — the transmit side was not measured', hand: true };
  }
  await ui.sleep(400);

  ui.note('');
  if (seen.size === 0) {
    ui.note('>>> CANDIDATE (b): THE SEVEN TRANSMITTED NOTHING while the pedal moved.');
    ui.note('    No CC arrived at all, so neither mechanism is available and the');
    ui.note('    feature cannot be built from this side of the cable.');
  } else {
    ui.note(`>>> CANDIDATE (b): the Seven transmitted ${seen.size} distinct CC number(s):`);
    ui.note('    cc  | messages |  low |  high | last');
    for (const [cc, e] of [...seen].sort((a, b) => b[1].count - a[1].count)) {
      ui.note(`    ${String(cc).padStart(3)} | ${String(e.count).padStart(8)}`
        + ` | ${String(e.min).padStart(4)} | ${String(e.max).padStart(5)} | ${e.last}`);
    }
    // A pedal sweep is a stream of values across most of the range, which is
    // what tells it apart from a knob nudge or a switch.
    const sweeper = [...seen].find(([, e]) => e.count > 8 && (e.max - e.min) > 60);
    ui.note(sweeper
      ? `    the pedal is almost certainly CC ${sweeper[0]} —`
        + ` ${sweeper[1].count} messages spanning ${sweeper[1].min}..${sweeper[1].max}`
      : '    none of these looks like a pedal sweep (many messages over a wide span)');
  }

  // The reading is the deliverable, so the only thing asserted is that one
  // was taken. A probe that silently measured nothing must not read as
  // evidence for either answer.
  ui.check(atRest != null && atDown != null,
    `the destination parameter was readable in both positions (${atRest} / ${atDown})`);
})()
