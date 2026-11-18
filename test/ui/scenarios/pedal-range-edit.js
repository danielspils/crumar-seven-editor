// THE EXPRESSION PEDAL'S RANGE IS EDITABLE, AND BOTH ODD STATES SURVIVE.
//
// WHY IT MATTERED (Daniel, 18 Nov 2026). This row was built as a readout —
// "an amber min→max display instead of a broken-looking pair of bars" — and
// never wired, which left it the only parameter row in the app that could not
// be changed. The manual gives no front-panel route to the pedal's Function or
// Range, so they are editor-only parameters: until this, the only way to
// change the range was Crumar's web editor, which is the thing this app
// exists to replace.
//
// IT DRAGS THE HANDLES rather than calling setParam, because setParam would
// prove the instrument accepts the values and say nothing about whether the
// row can be operated — which is the entire defect. A synthetic pointer
// sequence on the handle is the gesture a player makes.
//
// TWO STATES THAT MUST SURVIVE A ROUND TRIP:
//   min > max   the manual says it REVERSES the pedal's direction, and the
//               row surfaces that with the amber readout
//   min == max  no travel, so the pedal cannot move its destination — how you
//               disarm a volume pedal before a show. THE MANUAL SAYS NOTHING
//               ABOUT THIS ONE. Settled on hardware 18 Nov 2026: the Seven
//               stores it (this scenario), AND it genuinely silences the
//               assignment — pedal on Volume, range 95 → 95, full travel, no
//               change in volume, confirmed by ear. See docs/DEVICE.md.
//
//               WHAT THIS SCENARIO CAN AND CANNOT SHOW: it proves the round
//               trip. It cannot hear anything, so the disarming half rests on
//               Daniel's ear and is recorded in DEVICE.md rather than
//               asserted here. A green run is not evidence the pedal went
//               quiet.
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };

  const api = window.sevenAPI.midi;
  const MIN_KEY = 'exp_mn';
  const MAX_KEY = 'exp_mx';

  const row = () => ui.$('#detail .param.param-range');
  const handle = (end) => ui.$(`#detail .param.param-range .range-handle[data-range-end="${end}"]`);
  const readout = () => {
    const v = ui.$('#detail .param.param-range .param-value');
    return v ? v.textContent.trim() : null;
  };
  const onDevice = async (key) => {
    const r = await api.readParam(key);
    return r && r.ok ? r.value : null;
  };

  // A real press-drag-release on a handle, in the pane's own coordinates.
  const dragTo = async (end, fraction) => {
    const grip = handle(end);
    if (!grip) return false;
    const track = grip.closest('.param-rangebar');
    const rect = track.getBoundingClientRect();
    const gb = grip.getBoundingClientRect();
    const fromX = gb.left + gb.width / 2;
    const toX = rect.left + rect.width * fraction;
    const y = rect.top + rect.height / 2;
    const ev = (type, x, target) => target.dispatchEvent(
      new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1 })
    );
    ev('pointerdown', fromX, grip);
    await ui.sleep(220);           // the read-before-drag round trip
    ev('pointermove', toX, window);
    await ui.sleep(260);
    ev('pointerup', toX, window);
    await ui.sleep(900);
    return true;
  };

  await ui.openLibrary();
  await ui.sleep(400);
  const patchRow = ui.$('#library .lib-row.lib-patch, #library [data-file]');
  if (!patchRow) return { skipped: 'this library holds no patch to make live' };
  ui.click(patchRow, 'a patch');
  await ui.sleep(2500);

  if (!ui.check(await ui.live(), 'a live session is open')) return;
  if (!ui.check(!!row(), 'the pedal range row is on screen')) return;
  ui.check(row().classList.contains('is-live'),
    `and it is marked live like every other row (${row().className})`);

  const startMin = await onDevice(MIN_KEY);
  const startMax = await onDevice(MAX_KEY);
  ui.note(`the instrument starts at ${startMin} → ${startMax} · the row reads "${readout()}"`);

  // ---- 1. EACH HANDLE WRITES ITS OWN PARAMETER ---------------------------
  if (!ui.check(!!handle('min') && !!handle('max'),
    'both handles are in the DOM and carry their own key')) return;

  // AND A REAL PRESS WOULD REACH THEM.
  //
  // dragTo dispatches PointerEvents straight AT the handle, which ignores
  // pointer-events completely — so every assertion below would pass on a
  // handle no mouse could touch. Proven by mutation: with
  // `.range-handle { pointer-events: none }` the whole scenario stayed green
  // until this check existed. The track is deliberately pointer-events: none
  // and the handles opt back in, so this is exactly the line that can be
  // deleted by accident.
  //
  // elementFromPoint at the handle's centre is what the browser would do with
  // a real press, which is the only instrument that cannot be fooled here.
  // SCROLLED INTO VIEW FIRST. The expression pedal is the LAST section in the
  // detail pane, so its handles sit below the fold on an unscrolled pane —
  // and elementFromPoint returns null for a point outside the viewport. The
  // first version of this check read "a press lands on nothing" with
  // pointer-events: auto and the handle perfectly reachable: it was measuring
  // whether the row was on screen, not whether it could be pressed.
  // AND THE SECTION OPENED, the way a player would. The pedal's section
  // renders COLLAPSED by default: `.fx-section.collapsed .fx-body` is
  // grid-template-rows 0fr, so the row is in the DOM with a zero-height box
  // and a press at its "centre" lands on the section header above it. The
  // check reported exactly that — "a press lands on <div class='fx-head'>" —
  // which is the app behaving correctly and the scenario asking in the wrong
  // state.
  const section = ui.$('#detail .fx-section[data-group="pdl_exp"]');
  if (section && section.classList.contains('collapsed')) {
    const head = section.querySelector('.fx-head');
    ui.click(head, 'the Expression Pedal section header');
    await ui.sleep(500);
  }
  ui.check(!!section && !section.classList.contains('collapsed'),
    `the pedal section is open (${section ? section.className : 'no section'})`);

  row().scrollIntoView({ block: 'center' });
  await ui.sleep(400);

  for (const end of ['min', 'max']) {
    const grip = handle(end);
    const pe = getComputedStyle(grip).pointerEvents;
    const hit = ui.hitTarget(grip);
    const name = hit ? `<${hit.tagName.toLowerCase()} class="${hit.className}">` : 'nothing';
    ui.note(`the ${end} handle: pointer-events ${pe} · a press at its centre lands on ${name}`);
    ui.check(hit === grip || grip.contains(hit),
      `a real press lands on the ${end} handle, not ${name}`);
  }

  await dragTo('min', 0.25);
  const minAfter = await onDevice(MIN_KEY);
  const maxUnmoved = await onDevice(MAX_KEY);
  ui.note(`after dragging MIN to ~25%: device ${minAfter} → ${maxUnmoved}`);
  ui.check(minAfter !== startMin,
    `dragging the min handle wrote exp_mn (${startMin} → ${minAfter})`);
  ui.check(maxUnmoved === startMax,
    `and left exp_mx alone (${startMax} → ${maxUnmoved}) — they are independent`);

  await dragTo('max', 0.75);
  const maxAfter = await onDevice(MAX_KEY);
  ui.note(`after dragging MAX to ~75%: device ${await onDevice(MIN_KEY)} → ${maxAfter}`);
  ui.check(maxAfter !== maxUnmoved,
    `dragging the max handle wrote exp_mx (${maxUnmoved} → ${maxAfter})`);

  // ---- 2. MIN ABOVE MAX SURVIVES -----------------------------------------
  //
  // Documented in the manual as reversing the pedal. The handles are NOT
  // clamped to each other, so this has to be reachable by dragging.
  await dragTo('min', 0.9);
  const revMin = await onDevice(MIN_KEY);
  const revMax = await onDevice(MAX_KEY);
  ui.note(`reversed attempt: device ${revMin} → ${revMax} · the row reads "${readout()}"`);
  ui.check(revMin > revMax,
    `min above max survived the round trip (${revMin} > ${revMax}) — not clamped`);
  const rev = ui.$('#detail .param.param-range .param-value.range-reversed');
  ui.check(!!rev, `and the row says so (${rev ? `"${rev.textContent.trim()}"` : 'no marker'})`);

  // ---- 3. MIN EQUAL TO MAX ------------------------------------------------
  //
  // DANIEL WANTS THIS REACHABLE: with no travel the pedal cannot move its
  // destination, which is how you disarm a volume pedal before a show.
  //
  // WHAT THE INSTRUMENT DOES WITH IT IS UNPROVEN. The manual documents
  // min > max and says nothing about min == max, so this REPORTS the round
  // trip rather than assuming the Seven stores it. If the values come back
  // equal the state is real; if the Seven adjusts one of them, that is the
  // finding and the note below is the evidence.
  // REACHED BY DRAGGING, not by setParam. A first version called setParam
  // directly and proved the wrong thing: that the INSTRUMENT accepts equal
  // values, which was never in doubt. Daniel's requirement is that the state
  // is REACHABLE — a player with a mouse has to be able to land on it — and
  // a direct write also bypasses the re-render, which is why the row still
  // read "114→95" while the device held 95/95.
  //
  // The track is 0..127 over its width, so dragging min to max's own fraction
  // lands on exactly max's value: round((v/127) * 127) === v.
  const target = revMax;
  await dragTo('min', target / 127);
  const eqMin = await onDevice(MIN_KEY);
  const eqMax = await onDevice(MAX_KEY);
  ui.note(`EQUAL ATTEMPT (dragged): aimed at ${target} → ${target};`
    + ` the instrument reports ${eqMin} → ${eqMax} · the row reads "${readout()}"`);
  ui.check(readout() === `${eqMin}→${eqMax}`,
    `and the row followed the instrument rather than its own idea`
    + ` ("${readout()}" vs ${eqMin}→${eqMax})`);
  ui.check(eqMin === eqMax,
    `min EQUAL to max survived the round trip (${eqMin} === ${eqMax})`
    + ' — the pedal can be left with no travel');
  // Reported either way, because "what does the Seven do with no travel" is a
  // device fact this project records rather than infers.
  ui.note(eqMin === eqMax
    ? '  the Seven stores min == max as asked — docs/DEVICE.md updated'
    : `  THE SEVEN DID NOT KEEP IT: asked ${target}/${target}, got ${eqMin}/${eqMax}`);

  // ---- PUT IT BACK --------------------------------------------------------
  // This scenario writes to the instrument's buffer, not to a preset, so
  // nothing is stored — but leaving a player's pedal reversed is still rude.
  await api.setParam(MIN_KEY, startMin);
  await api.setParam(MAX_KEY, startMax);
  await ui.sleep(400);
  ui.note(`restored to ${await onDevice(MIN_KEY)} → ${await onDevice(MAX_KEY)}`);
})()
