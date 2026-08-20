// A REAL STORE ONTO THE INSTRUMENT, and back again.
//
//   SEVEN_UI_SIGNAL=/tmp/seven-signal SEVEN_WRITE_BANK=3 \
//     npm run test:ui transfer-hold-roundtrip
//
// THE ONLY SCENARIO THAT CAN CHANGE WHAT IS ON THE SEVEN, and it is opt-in
// twice over: it refuses without SEVEN_WRITE_BANK, and even then it cannot
// write anything by itself. A store needs a physical three-second hold — the
// app only loads the edit buffer and watches. Decline the hold and the preset
// is untouched.
//
// WHAT IT GUARDS: a store announces NOTHING of its own. The runner infers one
// from the recall burst that follows it carrying a changed fingerprint
// (transfer-runner.js). That inference is the whole basis of the transfer
// walk's auto-advance, and nothing had ever tested it against a real hold.
//
// ROUND TRIP, so the net change is zero: send something different, you hold,
// then send the original back and hold again. The bank ends where it started —
// and the original is on disk in the backup either way.
//
// ONE PRESET, not eight: startSlot builds a plan of eight slots with seven
// empty and hands it to the same walk, so every rule still applies (Bank 1
// refused, sound resolved by name against this instrument, slot recalled
// before it is written) with a fraction of the blast radius.
(async () => {
  const BANK = Number(ui.env('SEVEN_WRITE_BANK') || 0);
  if (!BANK) return { skipped: 'SEVEN_WRITE_BANK not set — this scenario writes to the instrument' };
  const PRESET = 1;
  const AWAY = 'shapes-clav-2.sevenlib.json';                    // clearly different: a Clavi
  const HOME = 'bank-3-preset-1-tine-piano-3.sevenlib.json';     // what the bank held

  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };

  // Watch for the runner's own detection, which is the thing under test. It
  // fires from the recall burst, not from anything the operator clicks.
  let detected = null;
  window.sevenAPI.midi.onEvent((ev) => {
    if (ev && ev.type === 'transfer-stored') detected = ev;
  });

  async function sendAndHold(ref, label) {
    detected = null;
    const started = await window.sevenAPI.transfer.startSlot(BANK, PRESET, ref);
    if (!ui.check(started && started.ok !== false,
      `the walk starts for ${label} (${(started && started.error) || 'ok'})`)) return null;

    const step = await window.sevenAPI.transfer.next();
    if (!ui.check(step && step.instruction,
      `${label} is loaded and the app says what to do: ${step && step.instruction}`)) return null;
    ui.note(`LOADED: ${label} → Bank ${BANK} preset ${PRESET}`);

    const got = await ui.waitForHuman(
      `HOLD PRESET ${PRESET} on Bank ${BANK} for three seconds to store "${label}". ` +
      `Or don't, and signal anyway — declining is a valid outcome and this checks that too.`,
      { timeout: 240000 }
    );
    if (!got) { await window.sevenAPI.transfer.cancel(); return null; }

    // Give the recall burst room to arrive and be read.
    await ui.waitFor(() => !!detected, { timeout: 6000, what: 'the runner to notice a store' });
    const report = await window.sevenAPI.transfer.confirm();
    return { report, detected };
  }

  // ── out ──────────────────────────────────────────────────────────────
  const away = await sendAndHold(AWAY, 'Shapes Clav');
  if (!away) return;
  ui.note(`store detected by the app: ${away.detected ? 'yes' : 'no'}`);
  ui.check(!!away.detected,
    'the runner SAW the hold land — inferred from the recall burst, since a store announces nothing');
  ui.check(away.report && away.report.confirmed.includes(PRESET),
    `preset ${PRESET} is reported stored (${away.report && JSON.stringify(away.report.confirmed)})`);

  // ── and home again ───────────────────────────────────────────────────
  const home = await sendAndHold(HOME, 'Bank 3 Preset 1 — Tine Piano');
  if (!home) {
    ui.check(false, 'THE BANK WAS NOT RESTORED — send it back by hand from the backup setlist');
    return;
  }
  ui.check(!!home.detected, 'the restore was seen landing too');
  ui.check(home.report && home.report.confirmed.includes(PRESET),
    `preset ${PRESET} is back to what it held (${home.report && JSON.stringify(home.report.confirmed)})`);
  ui.note('Bank 3 preset 1 is back where it started');
})()
