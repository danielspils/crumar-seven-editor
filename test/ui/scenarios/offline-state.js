// THE DISCONNECTED APP, ON PURPOSE.
//
//   SEVEN_NO_DEVICE=1 npm run test:ui offline-state
//
// WHY THIS EXISTS. Ten of seventeen scenarios don't call requireDevice(), so
// they run in whatever state the desk happens to be in — and on the only desk
// here the Seven is always plugged in. Every automated run this repo has done
// was a CONNECTED run. The disconnected UI had never been observed by a test at
// all, which is how three bugs in that state reached a user: the expansion
// double-listing, the 10-versus-11 heading, and "⚠ Not installed" on a sound
// the owner has installed (Rich Olivieri, 2026-08-19 and -20).
//
// A state nobody chooses is a state nobody tests. This scenario chooses it.
//
// SCOPE, deliberately narrow: it pins THE FLAG'S OWN CONTRACT and nothing else.
// It does not assert what the library rows say offline, because today they say
// something wrong — and a test written now to match that would be one more test
// defending a bug (CLAUDE.md). Those assertions arrive with the fix, in the
// commit that makes them pass.
(async () => {
  if (!ui.env('SEVEN_NO_DEVICE')) {
    // A precondition this scenario cannot control, which is the only kind of
    // skip allowed here: without the flag the app may well have a real
    // instrument attached, and every check below would be meaningless.
    return { skipped: 'SEVEN_NO_DEVICE not set — this scenario needs the app forced offline' };
  }

  // The flag lies at the port lookup and nowhere else, so these are the real
  // no-instrument answers, not a synthesised state.
  const present = await window.sevenAPI.midi.present();
  ui.check(present === false, `no port is visible to the app (present=${present})`);

  const status = await window.sevenAPI.midi.status();
  ui.note(`status: state=${status && status.state} firmware=${status && status.firmware}`);
  ui.check(status && status.state !== 'connected',
    `the app is not connected (state=${status && status.state})`);
  ui.check(!status || !status.soundTable,
    'and holds no sound table — there is no instrument to have read one from');

  // Connecting must FAIL, and fail the ordinary way. If this ever succeeds the
  // flag has stopped working and every offline assertion built on it is void.
  const res = await window.sevenAPI.midi.connect().catch((err) => ({ error: String(err.message || err) }));
  ui.note(`connect() answered: ${JSON.stringify(res).slice(0, 160)}`);
  ui.check(!res || res.state !== 'connected',
    'connect() does not reach connected with the flag set');

  // The UI has to agree with the seam. A connection row that says otherwise
  // would mean the renderer keeps its own idea of liveness.
  await ui.sleep(600);
  const conn = ui.$('#connection-text');
  const text = conn ? conn.textContent.trim() : '';
  ui.note(`connection row reads: "${text}"`);
  ui.check(!!conn && !/^connected/i.test(text),
    `the connection row does not claim an instrument ("${text}")`);

  // Sanity: the library still works with nothing attached. Offline is a normal
  // way to use this app — most owners are not at the instrument when they are
  // organising patches — so nothing here may depend on a device.
  await ui.openLibrary();
  await ui.sleep(500);
  const rows = ui.$$('#library .lib-row').length;
  ui.note(`library rendered ${rows} rows with no instrument`);
  ui.check(rows > 0 || !!ui.$('#library .lib-empty'),
    'the library renders offline — either rows or its own empty state');
})()
