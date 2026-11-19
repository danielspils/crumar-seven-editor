// THE ROW THE PEDAL DRIVES SHOWS WHERE THE PEDAL IS PUTTING IT.
//
// TIER 2 (Daniel, 18 Nov 2026), asked for after living with Tier 1 — the mark
// on the pedal's own range bar. With the pedal on FX 2 Rate, the Speed row
// should move as he rocks it.
//
// WHAT IS ASSERTED HERE IS THE APP'S BEHAVIOUR, NOT THE INSTRUMENT'S. That
// distinction is the reason this scenario stays in the device pass while
// pedal-position-probe and pedal-cc-scaling went behind SEVEN_PEDAL_PROBE
// (CLAUDE.md, "a test the code cannot fail is a record, not a test"). The
// MARK'S POSITION IS MODELLED and the model is unverifiable from here, so what
// can be checked is that the app draws what it claims to draw:
//
//   - the mark lands where the formula says, from the stored exp_mn/exp_mx and
//     the last CC 11 — the same arithmetic, independently evaluated here
//   - it is DOTTED, where the stored value's own mark is solid: the drawing
//     has to admit it is a guess (docs/DESIGN.md)
//   - THE STORED VALUE DOES NOT MOVE. Its knob stays put and the number on the
//     right stays the stored value. The pedal modulates; it does not edit, and
//     a bar that followed it would make Save patch write a lie.
//   - it takes no press
//   - and ~140 messages still cost ONE render
//
// IT ARRANGES THROUGH THE UI, NOT THROUGH api.setParam, and that is not a
// style choice. The estimate is computed from the APP'S copy of the patch, so
// a write that goes straight down the wire changes the instrument and leaves
// the app believing the old assignment — the mark would then be drawn on the
// row the pedal USED to drive, and the scenario would be measuring a state
// that no player can reach. pedal-range-edit.js and range-handle-marks.js both
// shipped with exactly that fault on 18 Nov and reported handles 86.6px apart
// in a state where they should have coincided.
//
// SO: exp_fn moves by its dropdown and the range by dragging its handles, then
// the achieved values are READ BACK and the arithmetic is checked against
// those. Nothing here demands an exact number from a drag.
//
// Restoring at the end DOES go down the wire, deliberately: by then the only
// thing that matters is that the instrument is left as it was found, and the
// app is about to be closed. Nothing is stored to a preset either way.
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };

  const api = window.sevenAPI.midi;
  const px = (n) => Math.round(n * 10) / 10;
  const FX2_RATE = 5;          // exp_fn index — "FX 2 Rate", device's own label
  const DEST = 'fx2_sp';       // …which is the parameter labelled "Speed"

  let lastCc = null;
  let ccCount = 0;
  api.onEvent((ev) => {
    if (ev && ev.type === 'panel-cc' && ev.cc === 11) { lastCc = ev.value; ccCount += 1; }
  });

  const read = async (key) => {
    const r = await api.readParam(key);
    return r && r.ok ? r.value : null;
  };
  const write = async (key, v) => {
    const r = await api.setParam(key, v);
    return !!(r && r.ok && r.value === v);
  };

  await ui.openLibrary();
  await ui.sleep(400);
  const patchRow = ui.$('#library .lib-row.lib-patch, #library [data-file]');
  if (!patchRow) return { skipped: 'this library holds no patch to make live' };
  ui.click(patchRow, 'a patch');
  await ui.sleep(2500);
  if (!ui.check(await ui.live(), 'a live session is open')) return;

  // ---- ARRANGE, AND REMEMBER WHAT TO PUT BACK ----------------------------
  const was = {
    exp_fn: await read('exp_fn'), exp_mn: await read('exp_mn'), exp_mx: await read('exp_mx'),
  };
  if (!ui.check(was.exp_fn != null && was.exp_mn != null && was.exp_mx != null,
    `the pedal's own parameters read back (fn ${was.exp_fn}, ${was.exp_mn}→${was.exp_mx})`)) return;

  const restore = async () => {
    for (const k of ['exp_fn', 'exp_mn', 'exp_mx']) {
      if (was[k] != null) await write(k, was[k]);
    }
    ui.note(`put back: exp_fn ${was.exp_fn}, range ${was.exp_mn}→${was.exp_mx}`);
  };

  // A real press-drag-release on a range handle, in the pane's own
  // coordinates — the same shape pedal-range-edit.js uses.
  const dragRange = async (end, fraction) => {
    const grip = ui.$(`#detail .range-handle[data-range-end="${end}"]`);
    if (!grip) return false;
    const track = grip.closest('.param-rangebar');
    const rect = track.getBoundingClientRect();
    const gb = grip.getBoundingClientRect();
    const y = rect.top + rect.height / 2;
    const ev = (type, x, target) => target.dispatchEvent(
      new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1 })
    );
    ev('pointerdown', gb.left + gb.width / 2, grip);
    await ui.sleep(220);                       // the read-before-drag round trip
    ev('pointermove', rect.left + rect.width * fraction, window);
    await ui.sleep(260);
    ev('pointerup', rect.left + rect.width * fraction, window);
    await ui.sleep(900);
    return true;
  };

  try {
    // ---- exp_fn BY ITS DROPDOWN, so the app's own copy moves with it -----
    const pedalSection = ui.$('#detail .fx-section[data-group="pdl_exp"]');
    if (pedalSection && pedalSection.classList.contains('collapsed')) {
      ui.click(pedalSection.querySelector('.fx-head'), 'the Expression Pedal section');
      await ui.sleep(500);
    }
    const sel = ui.$('#detail .param.is-live[data-key="exp_fn"] .param-select');
    if (!ui.check(!!sel, 'the pedal Function dropdown is live on screen')) return;
    sel.value = String(FX2_RATE);
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await ui.sleep(1200);
    ui.check(await read('exp_fn') === FX2_RATE,
      `the pedal is assigned to FX 2 Rate (exp_fn ${await read('exp_fn')})`);

    // ---- A RANGE WIDE ENOUGH TO MEASURE, BY DRAGGING --------------------
    //
    // The fractions are approximate on purpose; what matters is that the two
    // ends end up far apart, and the achieved numbers are read back below and
    // used for the arithmetic. An equal range would disarm the pedal — correct
    // behaviour, and nothing to measure a travelling mark against.
    await dragRange('min', 0.25);
    await dragRange('max', 0.8);
    const LO = await read('exp_mn');
    const HI = await read('exp_mx');
    ui.note(`range dragged to ${LO}→${HI}`);
    if (!ui.check(LO != null && HI != null && Math.abs(HI - LO) >= 20,
      `the range is wide enough to measure against (${LO}→${HI})`)) return;

    // The FX2 section has to be open for the Speed row to exist at all.
    const section = ui.$('#detail .fx-section[data-group="fx2"]');
    if (section && section.classList.contains('collapsed')) {
      ui.click(section.querySelector('.fx-head'), 'the FX 2 section');
      await ui.sleep(500);
    }
    const row = () => ui.$(`#detail .param[data-key="${DEST}"]`);
    if (!ui.check(!!row(), 'the FX 2 Speed row is on screen')) return;
    row().scrollIntoView({ block: 'center' });
    await ui.sleep(300);

    const storedBefore = await read(DEST);
    const numberBefore = ui.$(`#detail .param[data-key="${DEST}"] .param-value`).textContent.trim();
    const knobBefore = row().querySelector('.param-bar-knob').getBoundingClientRect().left;
    ui.note(`stored ${DEST} = ${storedBefore}, the row reads "${numberBefore}"`);

    // ---- COUNT THE RENDERS, as pedal-live-mark does ----------------------
    //
    // WHAT TO EXPECT DEPENDS ON WHETHER THE PEDAL HAS ALREADY SPOKEN. The
    // first CC 11 of a session renders once, because the class and the hatch
    // cannot be moved into existence; every message after that moves the fill.
    // If the pedal was nudged while this scenario was arranging — easy, with a
    // foot resting on it, and it is what happened on the 18 Nov run — that
    // render has already happened and the sweep should cost NONE. So the
    // expectation is read off the screen rather than assumed, and either way
    // the claim is the same: NOT one render per message.
    //
    // READ THE CLASS, NOT A MARK. This asked for `.pedal-est` for one run
    // after the drawing changed from a dotted line to the row's own fill — a
    // selector for an element that no longer exists answers false forever, so
    // it quietly hard-coded the expectation to 1 and failed a correct 0.
    const markedBefore = row().classList.contains('is-pedal');
    const wantRenders = markedBefore ? 0 : 1;
    ui.note(`the estimate mark ${markedBefore ? 'is already' : 'is not yet'} drawn,`
      + ` so the sweep should cost ${wantRenders} render(s)`);
    let renders = 0;
    const obs = new MutationObserver((recs) => {
      for (const m of recs) if (m.removedNodes.length) renders += 1;
    });
    obs.observe(ui.$('#detail'), { childList: true });

    const rocked = await ui.waitForHuman(
      `The pedal is now on FX 2 Rate with the range ${LO}→${HI}. ROCK IT heel `
      + 'to toe and back, once or twice, then LEAVE YOUR FOOT STILL and signal. '
      + 'The reading is taken after the signal.',
      { timeout: 180000 }
    );
    if (!rocked) {
      obs.disconnect();
      return { skipped: 'nobody moved the pedal — nothing was measured', hand: true };
    }
    await ui.sleep(500);
    obs.disconnect();

    ui.note(`CC 11 messages: ${ccCount} · last value ${lastCc}`);
    if (!ui.check(ccCount > 0 && lastCc != null,
      `the Seven reported the pedal moving (${ccCount} messages)`)) return;

    // ---- 1. THE FILL IS WHERE THE FORMULA PUTS IT ------------------------
    if (!ui.check(row().classList.contains('is-pedal'),
      'the driven row is marked as driven')) return;
    // Evaluated here from the stored range and the observed CC, deliberately
    // independent of the renderer's own call — the point is that the drawing
    // agrees with the formula, not that one function agrees with itself.
    const want = Math.round(LO + (lastCc / 127) * (HI - LO));
    const bar = row().querySelector('.param-bar');
    const fill = row().querySelector('.param-bar-fill');
    const br = bar.getBoundingClientRect();
    const fr = fill.getBoundingClientRect();
    const max = Number(row().getAttribute('data-max'));
    const wantW = br.width * (want / max);
    ui.note(`cc ${lastCc} of 127 over ${LO}→${HI} = about ${want} of ${max}`
      + ` → wants a fill ${px(wantW)}px wide, it is ${px(fr.width)}px (bar ${px(br.width)}px)`);
    ui.check(Math.abs(fr.width - wantW) <= 2,
      `the fill reaches where the model says (${px(Math.abs(fr.width - wantW))}px off)`);
    ui.check(/estimated/.test(bar.getAttribute('title') || ''),
      'and the bar\'s tooltip says the number is estimated, not read');

    // ---- 2. IT IS DRAWN AS A GUESS --------------------------------------
    //
    // HATCHED, NOT SOLID. A solid fill is the most authoritative-looking thing
    // on the row and this value was never read off the instrument, so the
    // texture is the hedge (docs/DESIGN.md). A repeating gradient is that
    // texture, so the check is that the painted background REPEATS.
    const bg = getComputedStyle(fill).backgroundImage;
    ui.note(`the driven fill's background-image: ${bg.slice(0, 80)}`);
    ui.check(/repeating-linear-gradient/.test(bg),
      'the fill is hatched while the pedal owns it — the drawing admits a model');

    // AND IN BOTH VALUE STATES, because whether this row is at its factory
    // value is an accident of whichever patch the library handed us. The hatch
    // was wiped on CHANGED rows only — `.param.is-changed .param-bar-fill`
    // uses the `background` SHORTHAND, which resets background-image, and it
    // sits later in the stylesheet at the same specificity — so a run against
    // a row that happened to be at default would have passed with the bug in.
    // Toggling the class reads the CASCADE, and changes nothing that outlives
    // the next render.
    const el = row();
    const had = { def: el.classList.contains('is-default'), ch: el.classList.contains('is-changed') };
    for (const state of ['is-default', 'is-changed']) {
      el.classList.remove('is-default', 'is-changed');
      el.classList.add(state);
      const painted = getComputedStyle(el.querySelector('.param-bar-fill')).backgroundImage;
      ui.check(/repeating-linear-gradient/.test(painted),
        `the hatch survives on a ${state.replace('is-', '')} row`);
    }
    el.classList.remove('is-default', 'is-changed');
    if (had.def) el.classList.add('is-default');
    if (had.ch) el.classList.add('is-changed');

    // ---- 3. THE CIRCLE STILL HOLDS THE STORED VALUE ----------------------
    //
    // THE ONE THAT MATTERS FOR THE FILE. If the pedal edited the patch, Save
    // would write a value the player never chose. With the fill now showing
    // the pedal, THE CIRCLE IS THE ONLY THING LEFT SAYING WHAT IS STORED — so
    // it has to be both unmoved AND visible. It is opacity: 0 until the bar is
    // hovered, and an invisible marker would leave the estimate as the only
    // number on the row.
    const storedAfter = await read(DEST);
    const numberAfter = ui.$(`#detail .param[data-key="${DEST}"] .param-value`).textContent.trim();
    const knob = row().querySelector('.param-bar-knob');
    const knobAfter = knob.getBoundingClientRect().left;
    const knobOpacity = Number(getComputedStyle(knob).opacity);
    ui.note(`stored ${DEST} ${storedBefore} → ${storedAfter}; row "${numberBefore}" → "${numberAfter}";`
      + ` circle opacity ${knobOpacity}`);
    ui.check(storedAfter === storedBefore,
      `the instrument's stored value is untouched (${storedBefore} → ${storedAfter})`);
    ui.check(numberAfter === numberBefore,
      `the row still shows the STORED value, not the estimate (${numberAfter})`);
    ui.check(Math.abs(knobAfter - knobBefore) <= 0.5,
      `the circle has not moved (${px(Math.abs(knobAfter - knobBefore))}px)`);
    ui.check(knobOpacity === 1,
      `and it is visible without hovering (opacity ${knobOpacity})`);

    // ---- 4. THE FILL IS NOT A SECOND CONTROL ----------------------------
    //
    // The track owns the drag; the circle and the fill are both drawings. A
    // driven row is still editable — the pedal modulating a parameter does not
    // lock it — so this checks the row stayed live rather than that nothing
    // can be pressed.
    ui.check(row().classList.contains('is-live'),
      'the row is still editable while the pedal drives it');

    // ---- 5. ONE RENDER FOR THE WHOLE SWEEP ------------------------------
    //
    // THIS COUNT IS NOT ONLY ABOUT SPEED — it is the only assertion here that
    // can catch the live-move path reading a DIFFERENT patch object than the
    // render does. It did exactly that on 18 Nov 2026: movePedalMark asked
    // currentPatch() and got the file's exp_fn while the pane was rendering
    // the live working copy's, so its estimate lookup missed on every message
    // and asked for a render each time. Every other check here passed — the
    // mark was in the right place, dotted, over an untouched stored value —
    // because the re-render drew it correctly. 133 renders for 133 messages
    // was the only visible symptom.
    ui.note(`renders of the detail pane during ${ccCount} messages: ${renders}`);
    ui.check(renders === wantRenders,
      `${wantRenders} render for ${ccCount} messages — the marks are moved in`
      + ` place, not redrawn (${renders} renders)`);
  } finally {
    await restore();
  }
})()
