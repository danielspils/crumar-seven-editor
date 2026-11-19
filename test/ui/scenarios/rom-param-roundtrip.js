// DO THE FIVE SILENT SAMPLE-PLAYER PARAMETERS REACH THE INSTRUMENT?
//
// THE AUDIBLE HALF IS ALREADY ESTABLISHED (Daniel, hardware, 18 Nov 2026):
// Filter (rom_p03), Velocity (rom_p04), Piano Harp (rom_p05), Rel. Smp. Level
// (rom_p08) and Ped. Smp. Level (rom_p09) have NO AUDIBLE EFFECT on either
// Sampled Tine Piano or Sampled Reed Piano, at 0 or at 127, with the sound
// reloaded in between. Two sample sets, both silent — which rules out the two
// explanations that were standing: not a thin sample set, and not a load-time
// parameter.
//
// WHAT THIS ANSWERS, AND IT IS THE ONLY THING IT ANSWERS: whether the
// INSTRUMENT is holding those values or the app is showing its own. A slider
// that survives a sound change is consistent with either.
//
//   WRITE  -> the 0x23 the device echoes back    (did it accept it?)
//   READ   -> a fresh 0x22 afterwards            (is it holding it?)
//
// Both, at 0 and at 127, because one value could coincide with whatever was
// already there.
//
// IT PROVES THE ID TOO, which is the other half of the question. rom_p06 and
// rom_p07 do not exist — the KEYS jump from rom_p05 to rom_p08 — so a naive
// reader might expect a gap. The schema has none: the ids run 60..67 straight
// through, rom_p08 is 66 and rom_p09 is 67. An off-by-two would land on 68 and
// 69, which are veq_vol and veq_bas — Volume and Bass, which nobody could
// write a 0 to without hearing it. And the app resolves a key to its id by
// direct lookup (main.js: parameters.find(p => p.key === key)), never by
// parsing the name, while seven-midi.js's reply matchers VALIDATE THE ECHOED
// ID — so an accepted echo is itself evidence the right parameter was
// addressed.
//
// NOTHING IS STORED. These are 0x20 writes to the edit buffer; the originals
// are read first and put back at the end, and keeping a preset needs a
// three-second panel hold that this never performs.
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };

  const api = window.sevenAPI.midi;
  const KEYS = [
    ['rom_p03', 'Filter', 63],
    ['rom_p04', 'Velocity', 64],
    ['rom_p05', 'Piano Harp', 65],
    ['rom_p08', 'Rel. Smp. Level', 66],
    ['rom_p09', 'Ped. Smp. Level', 67],
  ];
  // THE CONTROL. rom_p00 "Level" is in the same group, addressed the same way,
  // and is not among the five Daniel reports as silent. If the round trip
  // looked identical for a parameter nobody doubts, that is what makes this
  // measurement mean something — and if the control BEHAVED DIFFERENTLY, the
  // five would be the interesting ones rather than the method being wrong.
  const CONTROL = ['rom_p00', 'Level', 60];

  const read = async (key) => {
    const r = await api.readParam(key);
    return r && r.ok ? r.value : null;
  };
  const write = async (key, v) => {
    const r = await api.setParam(key, v);
    return r && r.ok ? r.value : null;     // the device's own echo
  };

  await ui.openLibrary();
  await ui.sleep(400);
  const rowsAvailable = ui.$$('#library .lib-row.lib-patch, #library [data-file]');
  if (!rowsAvailable.length) return { skipped: 'this library holds no patch to make live' };

  // A SAMPLED SOUND, NOT WHICHEVER PATCH IS FIRST. These are the SAMPLE
  // PLAYER's parameters, and Daniel's audible half was measured on two sampled
  // sets — so a round trip taken with a modeled engine in the buffer would be
  // answering a slightly different question than the one asked. The tell is
  // whether the detail pane drew the rom_ rows at all: engineGroupFor picks
  // the engine's group from the sound, so their presence IS the statement that
  // the sample player is what is loaded.
  let opened = null;
  for (let i = 0; i < Math.min(rowsAvailable.length, 8); i += 1) {
    const fresh = ui.$$('#library .lib-row.lib-patch, #library [data-file]')[i];
    if (!fresh) break;
    ui.click(fresh, 'a patch');
    await ui.sleep(2500);
    if (ui.$('#detail .param[data-key="rom_p03"]')) { opened = i; break; }
  }
  if (opened == null) {
    return { skipped: 'no patch in this library loads a sampled sound — the rom_ rows never rendered' };
  }
  ui.note(`opened library patch #${opened + 1}, which loads a sampled sound`);
  if (!ui.check(await ui.live(), 'a live session is open')) return;

  // WHICH SOUND IS IN THE BUFFER, recorded because Daniel's audible test was
  // two sample sets out of sixteen and this one is a single sound. The round
  // trip should not depend on it; saying which it was is how a later reader
  // can tell whether that assumption was ever checked.
  // THE FRONT CARD CARRIES IT AS data-car-name, which is how a click knows
  // which sound it means — a more reliable handle than any text node.
  const front = ui.$('#detail .engine-carousel .car-face.is-front');
  const soundName = front ? front.getAttribute('data-car-name') : null;
  ui.note(`sound in the buffer: ${soundName || 'NOT READ — the record below cannot name it'}`);
  ui.check(!!soundName, 'the loaded sound is named, so the record says what this was measured on');

  const rows = [];
  const originals = new Map();
  try {
    for (const [key, label, id] of [...KEYS, CONTROL]) {
      const was = await read(key);
      originals.set(key, was);
      const row = { key, label, id, was, results: [] };
      for (const v of [0, 127]) {
        const echo = await write(key, v);
        await ui.sleep(120);
        const back = await read(key);
        row.results.push({ v, echo, back });
      }
      rows.push(row);
    }

    // ---- THE TABLE --------------------------------------------------------
    for (const r of rows) {
      const parts = r.results.map((x) =>
        `set ${String(x.v).padStart(3)} → echo ${String(x.echo).padStart(4)} → read ${String(x.back).padStart(4)}`);
      ui.note(`${r.key} (id ${r.id}, ${r.label}) was ${r.was} | ${parts.join('  |  ')}`);
    }

    // ---- WHAT IT SHOWS ----------------------------------------------------
    const holds = (r) => r.results.every((x) => x.echo === x.v && x.back === x.v);
    const five = rows.filter((r) => r.key !== CONTROL[0]);
    const control = rows.find((r) => r.key === CONTROL[0]);
    const kept = five.filter(holds);
    ui.note(`${kept.length} of ${five.length} silent parameters took, echoed AND held both values`);
    ui.note(`the control ${CONTROL[0]} (${CONTROL[1]}) ${control && holds(control) ? 'behaves identically' : 'DID NOT behave identically'}`);

    for (const r of five) {
      ui.check(holds(r),
        `${r.key} (id ${r.id}) echoes and holds what it is sent`
        + ` — ${r.results.map((x) => `${x.v}→${x.echo}/${x.back}`).join(' ')}`);
    }
    // THE CONTROL HAS TO BEHAVE THE SAME, or the five prove nothing about
    // inaudibility and quite a lot about the method.
    ui.check(!!control && holds(control),
      `the control ${CONTROL[0]} round-trips the same way, so the method is sound`);

    // The id question, answered by the echo rather than by reading the schema
    // back to itself: a write that reached veq_vol would not echo as rom_p08.
    ui.check(five.every((r) => r.results.every((x) => x.echo === x.v)),
      'every write was echoed for the parameter it addressed — no off-by-two');
  } finally {
    for (const [key, was] of originals) {
      if (was != null) await write(key, was);
    }
    ui.note(`restored: ${[...originals].map(([k, v]) => `${k}=${v}`).join(', ')}`);
  }
})()
