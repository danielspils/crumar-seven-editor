// THE PEDAL'S LIVE POSITION SHOWS ON ITS OWN RANGE BAR.
//
// WHY THIS SHAPE (Daniel, 18 Nov 2026). He asked to see the assigned
// parameter move in real time. Measured on hardware first: the destination
// parameter is NOT modulated, and the Seven sends only CC 11 carrying the
// pedal's RAW position, 0..127, ignoring exp_mn/exp_mx entirely. So a mark on
// the DESTINATION's bar would have to interpolate between the range ends —
// a model of the instrument's behaviour that cannot be read back or checked
// from this side of the cable.
//
// THIS IS THE TIER THAT INFERS NOTHING. The pedal's own range track is
// already 0..127, so its position is placed by the same arithmetic as the two
// handles. What is drawn is a reading, not an estimate.
//
// WHAT IT ASSERTS:
//   - nothing is drawn before the pedal has spoken (null is not zero)
//   - the mark appears once it has, at the position the LAST CC 11 reported
//   - it is a reading and not a control: it takes no press
//   - and moving it does NOT re-render the pane, which at ~140 messages a
//     sweep would be 140 full renders
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };

  const api = window.sevenAPI.midi;
  const px = (n) => Math.round(n * 10) / 10;

  let lastCc = null;
  let ccCount = 0;
  api.onEvent((ev) => {
    if (ev && ev.type === 'panel-cc' && ev.cc === 11) { lastCc = ev.value; ccCount += 1; }
  });

  const row = () => ui.$('#detail .param.param-range');
  const mark = () => ui.$('#detail .param.param-range .pedal-pos');

  await ui.openLibrary();
  await ui.sleep(400);
  const patchRow = ui.$('#library .lib-row.lib-patch, #library [data-file]');
  if (!patchRow) return { skipped: 'this library holds no patch to make live' };
  ui.click(patchRow, 'a patch');
  await ui.sleep(2500);
  ui.check(await ui.live(), 'a live session is open');

  const section = ui.$('#detail .fx-section[data-group="pdl_exp"]');
  if (section && section.classList.contains('collapsed')) {
    ui.click(section.querySelector('.fx-head'), 'the Expression Pedal section');
    await ui.sleep(500);
  }
  if (!ui.check(!!row(), 'the pedal range row is on screen')) return;
  row().scrollIntoView({ block: 'center' });
  await ui.sleep(300);

  // ---- 1. NOTHING BEFORE THE PEDAL HAS SPOKEN ----------------------------
  //
  // A pedal that has sent nothing is in a position the app does not know, and
  // drawing it at the heel would be a claim rather than a reading.
  ui.note(`CC 11 messages seen so far: ${ccCount}`);
  if (ccCount === 0) {
    ui.check(!mark(),
      'no pedal mark before the pedal has moved — null is not zero');
  } else {
    ui.note('the pedal already moved before this check — not asserted');
  }

  // COUNT THE RENDERS. renderDetail assigns detailEl.innerHTML, which arrives
  // here as one record carrying removed nodes — so this counts rebuilds of the
  // pane, and the number is the whole point of section 4 below.
  //
  // WHAT TO EXPECT DEPENDS ON WHETHER THE MARK IS ALREADY DRAWN. The first
  // CC 11 of a session renders once, because the mark cannot be moved into
  // existence; every message after that moves it. If the pedal was nudged
  // before this point — easy, with a foot resting on it, and it is what
  // happened on the 18 Nov device pass — that render has already happened and
  // the sweep should cost NONE. Hard-coding 1 failed a correct 0 while every
  // other assertion passed, including a mark landing 0px from where the
  // formula put it. Read off the screen rather than assumed; either way the
  // claim is the same: NOT one render per message.
  const markedBefore = !!mark();
  const wantRenders = markedBefore ? 0 : 1;
  ui.note(`the pedal mark ${markedBefore ? 'is already' : 'is not yet'} drawn,`
    + ` so the sweep should cost ${wantRenders} render(s)`);
  let renders = 0;
  const obs = new MutationObserver((recs) => {
    for (const m of recs) if (m.removedNodes.length) renders += 1;
  });
  obs.observe(ui.$('#detail'), { childList: true });

  const rocked = await ui.waitForHuman(
    'ROCK THE EXPRESSION PEDAL slowly from heel to toe and back, once or '
    + 'twice, then LEAVE YOUR FOOT STILL and signal. The reading is taken '
    + 'after the signal, so the mark should match where you left it.',
    { timeout: 180000 }
  );
  if (!rocked) {
    obs.disconnect();
    return { skipped: 'nobody moved the pedal — nothing was measured', hand: true };
  }
  await ui.sleep(500);
  obs.disconnect();

  // ---- 2. THE MARK IS THERE, AT THE LAST REPORTED POSITION ---------------
  ui.note(`CC 11 messages during the sweep: ${ccCount} · last value ${lastCc}`);
  if (!ui.check(ccCount > 0 && lastCc != null,
    `the Seven reported the pedal moving (${ccCount} messages)`)) return;

  const m = mark();
  if (!ui.check(!!m, 'the pedal mark is drawn once the pedal has spoken')) return;

  const track = m.closest('.param-rangebar');
  const tr = track.getBoundingClientRect();
  const mr = m.getBoundingClientRect();
  const markCentre = mr.left + mr.width / 2;
  const wanted = tr.left + tr.width * (lastCc / 127);
  ui.note(`last CC ${lastCc} of 127 → wants x${px(wanted)}, the mark is at x${px(markCentre)}`
    + ` (track x${px(tr.left)}..${px(tr.right)})`);
  // Two pixels of slack: the mark is 2px wide and its left is set as a
  // percentage, so rounding lands within a pixel either way.
  ui.check(Math.abs(markCentre - wanted) <= 2,
    `the mark sits where the pedal last reported (${px(Math.abs(markCentre - wanted))}px off)`);

  // ---- 3. IT IS A READING, NOT A CONTROL ---------------------------------
  const pe = getComputedStyle(m).pointerEvents;
  ui.note(`the mark's pointer-events: ${pe}`);
  ui.check(pe === 'none',
    `it takes no press — the handles are the controls (${pe})`);
  const hit = ui.hitTarget(m);
  ui.check(!hit || !m.contains(hit) || hit !== m,
    'and a press at it falls through to whatever is behind');

  // ---- 4. ONE RENDER FOR THE WHOLE SWEEP ---------------------------------
  //
  // ~140 messages a sweep, and a render per message would rebuild the pane
  // 140 times and fight the scroll position it works to preserve.
  //
  // IT IS ONE AND NOT NONE, and the difference is a bug that was measured
  // rather than reasoned about. The span is only drawn when the position is
  // known, so while it is unknown there is no node to move — suppressing
  // every render left the mark unable to be born, and 95 messages produced
  // nothing on screen (18 Nov 2026). The FIRST message renders; the rest
  // move the node in place.
  ui.note(`renders of the detail pane during ${ccCount} messages: ${renders}`);
  ui.check(renders === 1,
    `one render for the whole sweep — the first message draws the mark and the`
    + ` other ${ccCount - 1} move it (${renders} renders)`);
})()
