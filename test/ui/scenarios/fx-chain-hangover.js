// A: THE FX CHAIN SHOWS WHAT THE APP BELIEVES, NOT WHAT THE SEVEN IS RUNNING.
//
// ESTABLISHING IT, NOT FIXING IT. Reported from a dev-build session: pick a
// model from the carousel with nothing selected in the library, and the
// previous model's effects correctly hang over on the instrument — audibly
// running — while the app draws every block in EFFECTS CHAIN as OFF.
//
// WHAT THIS ASKS, in order:
//
//   1. does the INSTRUMENT keep its effects across a sound change (0x46)?
//      That is the premise of the whole report and it is cheap to check.
//   2. does the PANEL still agree with the instrument afterwards?
//   3. and what does a read cost, if the answer is that the app has to ask?
//
// IT ALSO MEASURES THE READ, because item A says to measure rather than
// assume: a single parameter is ~13ms (param-read-cost.js), so six switches
// and the whole 39-parameter chain are both arithmetic — but arithmetic that
// has been wrong here before, and the port is right there.
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };
  const api = window.sevenAPI.midi;

  // One switch per FX section, in the order the chain draws them.
  const SWITCHES = [
    ['efx_veq', 'veq_byp'], ['efx_fx1', 'fx1_sw'], ['efx_fx2', 'fx2_sw'],
    ['efx_amp', 'amp_sw'], ['efx_rev', 'rev_sw'], ['efx_pad', 'pad_sw'],
  ];
  const CHAIN = [
    'veq_vol', 'veq_bas', 'veq_trb', 'veq_mid', 'veq_mdf', 'veq_byp',
    'fx1_sw', 'fx1_md', 'fx1_dp', 'fx1_sp',
    'fx2_sw', 'fx2_md', 'fx2_dp', 'fx2_sp',
    'pha_st', 'pha_of', 'pha_fb', 'pha_mx',
    'dly_mf', 'dly_ml', 'dly_sp',
    'amp_sw', 'amp_dr', 'amp_mo', 'amp_bs', 'amp_md', 'amp_tr',
    'rev_sw', 'rev_lv', 'rev_dc', 'rev_dm', 'rev_df', 'rev_pd', 'rev_sz',
    'rev_hs', 'rev_ls',
    'pad_sw', 'pad_lv', 'pad_bl',
  ];

  // The pill a section shows. Read as TEXT, because that is what the player
  // sees — a class would be the app agreeing with itself.
  const pillOf = (group) => {
    const sec = ui.$(`#detail .fx-section[data-group="${group}"]`);
    const b = sec && sec.querySelector('.fx-state');
    return b ? b.textContent.trim() : null;
  };
  const readOne = async (key) => {
    const r = await api.readParam(key);
    return r && r.ok ? r.value : null;
  };
  const compare = async (label) => {
    ui.note(`--- ${label} ---`);
    ui.note('section     key        device  pill   agree');
    let disagreed = 0;
    for (const [group, key] of SWITCHES) {
      const v = await readOne(key);
      const pill = pillOf(group);
      // veq_byp is a BYPASS, so its sense is inverted against the others —
      // the renderer knows that and this has to as well, or every run would
      // report one false disagreement.
      const on = key === 'veq_byp' ? v === 0 : v === 1;
      const agrees = pill == null ? null : (pill === 'ON') === on;
      if (agrees === false) disagreed += 1;
      ui.note(`${group.padEnd(11)} ${key.padEnd(10)} ${String(v).padStart(6)}`
        + `  ${String(pill).padEnd(5)}  ${agrees == null ? '—' : agrees ? 'yes' : 'NO'}`);
    }
    return disagreed;
  };

  // ---- 0. START FROM NOTHING SELECTED, AND PROVE IT ---------------------
  //
  // THE DEFECT IS THE NO-SELECTION STATE ONLY. With a patch selected the
  // chain carries correctly — confirmed on hardware, dev build, 16 Nov: FX1
  // ON (LFO Wha-Wha 87/63) and FX2 ON (Flanger 78/25) drew correctly and
  // matched the instrument. Run this scenario with a selection and it PASSES
  // AND PROVES NOTHING, which is worse than no probe at all.
  //
  // The state is reached by selecting a bank slot that has NO backup record:
  // `currentPatch()` is then null, so the pane draws "No backup for Bank N ·
  // Preset M" — and the deviceSel branch still supplies `canPickSound`, so
  // the carousel is on screen with no patch behind it. That is the reported
  // state: a wheel to turn and nothing selected.
  await ui.selectTab('seven');
  await ui.sleep(800);
  // ALL FOUR BANKS, because which bank holds an un-backed-up slot is a
  // property of this library and not of the app. Bank 1 is fully backed up
  // here, so taking the current tab would have skipped the whole scenario.
  const tabs = ui.$$('#bank-tabs .bank-tab');
  let emptyIdx = -1;
  for (let b = 0; b < Math.max(1, tabs.length); b += 1) {
    if (tabs[b]) {
      ui.$$('#bank-tabs .bank-tab')[b].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await ui.sleep(700);
    }
    const here = ui.$$('#patch-list .patch-row');
    const i = here.findIndex((r) => r.classList.contains('empty-slot'));
    ui.note(`bank ${b + 1}: ${here.length} rows,`
      + ` ${here.filter((r) => r.classList.contains('empty-slot')).length} with no backup`);
    if (i >= 0) { emptyIdx = i; break; }
  }
  if (emptyIdx >= 0) {
    ui.note(`selecting preset ${emptyIdx + 1}, which has no backup record`);
    ui.$$('#patch-list .patch-row')[emptyIdx].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await ui.sleep(2800);
  } else {
    // THE ROUTE THE REPORT ACTUALLY CAME FROM. Every slot in this library is
    // backed up, so there is no un-backed-up bank row to land on — but the
    // original report was "a setlist with all eight slots empty and nothing
    // selected", which reaches the same place by a different door.
    ui.note('every bank slot has a backup — taking the setlist route instead');
    await ui.selectTab('setlists');
    const got = await ui.waitFor(() => ui.$$('.lib-setlist-row').length > 0,
      { timeout: 8000, what: 'the setlist list' }).then(() => true).catch(() => false);
    if (!got) { ui.note('no setlists in this library either'); return; }
    let opened = false;
    const lists = ui.$$('.lib-setlist-row');
    ui.note(`setlists: ${lists.length}`);
    for (let i = 0; i < lists.length; i += 1) {
      // ui.click, not a synthetic MouseEvent: the harness's click hit-tests
      // and presses the real target. A bare dispatchEvent on this row opened
      // nothing — 0 slots every time — which would have read as "no all-empty
      // setlist exists" in a library whose first setlist is eight empty slots.
      ui.click(ui.$$('.lib-setlist-row')[i], `setlist ${i + 1}`);
      // A FIXED SETTLE, NOT A waitFor ON `.lib-slot`. The previous setlist's
      // rows are still on screen when the click lands, so a wait for "slots
      // exist" returns instantly and measures the setlist BEFORE this one —
      // which is how this probe reported "no all-empty setlist" in a library
      // whose first setlist is eight empty slots.
      await ui.sleep(700);
      const slots = ui.$$('.lib-slot');
      const empties = slots.filter((s) => s.classList.contains('lib-slot-empty')).length;
      ui.note(`  setlist ${i + 1}: ${slots.length} slots, ${empties} empty`);
      if (slots.length > 0 && empties === slots.length) { opened = true; break; }
    }
    if (!opened) { ui.note('no all-empty setlist to reach the no-selection state with'); return; }
    await ui.sleep(900);
  }

  // ASSERT THE CLEARING WORKED, before anything else runs.
  const liveRows = ui.$$('#detail .param.is-live').length;
  const emptyNote = ui.$('#detail .panel-reach, #detail .detail-empty');
  const noteText = (ui.$('#detail') || {}).textContent || '';
  ui.note(`live parameter rows: ${liveRows} (want 0)`);
  ui.note(`the pane says: "${noteText.replace(/\s+/g, ' ').slice(0, 70)}"`);
  void emptyNote;
  ui.check(liveRows === 0,
    `nothing is live, so liveParams() has nothing to return (${liveRows} live rows)`);
  if (liveRows !== 0) return;
  // AND THERE IS A WHEEL TO TURN. Without one this state cannot reproduce
  // the report at all, and the rest of the scenario would be measuring a
  // pane that offers no way in.
  const haveWheel = !!ui.$('#detail .engine-carousel');
  ui.note(`a carousel is on screen: ${haveWheel}`);
  ui.check(haveWheel,
    'the no-selection state still offers the carousel — which is what makes'
    + ' the reported gesture possible');
  if (!haveWheel) return;

  // ---- 1. GIVE THE INSTRUMENT A CHAIN WORTH HANGING OVER ----------------
  //
  // Turned on through the app so the app believes them too — the divergence
  // has to be created by the SOUND CHANGE, not by the setup.
  for (const key of ['fx1_sw', 'amp_sw', 'rev_sw']) {
    const w = await api.setParam(key, 1);
    ui.note(`setting ${key} = 1 -> echoed ${w && w.value}`);
    await ui.sleep(160);
  }
  await ui.sleep(600);
  const before = await compare('BEFORE: the chain the instrument is running');

  // ---- 2. PICK A MODEL FROM THE CAROUSEL --------------------------------
  const car = ui.$('#detail .engine-carousel');
  if (!car) { ui.note('no carousel on screen — cannot reproduce'); return; }
  car.classList.add('is-open');
  await ui.sleep(300);
  const peek = ui.$('#detail .car-face.is-peek.is-prev')
    || ui.$('#detail .engine-carousel [data-car-step="-1"]');
  if (!peek) { ui.note('no way to turn the wheel at this width'); return; }
  const wasHero = ui.$('#detail .car-face.is-hero');
  const wasName = wasHero && wasHero.dataset.carName;
  peek.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await ui.sleep(1200);
  const nowHero = ui.$('#detail .car-face.is-hero');
  const nowName = nowHero && nowHero.dataset.carName;
  ui.note(`the wheel turned: "${wasName}" -> "${nowName}"`);
  // CHOOSING is the hero click — turning alone sends nothing.
  if (nowHero) {
    nowHero.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await ui.sleep(2600);
  }

  const after = await compare('AFTER: a model was chosen from the carousel');

  // ---- DOES A SESSION EVEN OPEN? ----------------------------------------
  //
  // This decides where a read would have to go, and it is the question
  // "once per session, not per carousel step" turns on. beginLiveForTarget
  // returns false before assigning `liveEdit` when there is no target or no
  // patch — so in THIS state no session is created at all, and the next
  // choice would arrive with nothing to carry all over again.
  const liveAfter = ui.$$('#detail .param.is-live').length;
  ui.note(`live parameter rows after choosing: ${liveAfter}`);
  ui.note(liveAfter === 0
    ? '  NO SESSION OPENED — a read here would fire on EVERY choice, not once'
    : '  a session opened — a second choice would have a snapshot to carry');

  ui.note(`switches disagreeing — before ${before}, after ${after}`);
  // THE REPORT, AS AN ASSERTION. It is expected to FAIL today: that is what
  // "establish it" means. If it passes, the reproduction is wrong and the
  // real path has to be found before anything is changed.
  ui.check(after === 0,
    `after choosing a model the panel still agrees with the instrument`
    + ` (${after} of ${SWITCHES.length} switches disagree)`);

  // ---- 3. WHAT A READ WOULD COST ----------------------------------------
  //
  // Measured rather than modelled. Item A's point is that a chain-sized read
  // is probably cheap; "probably" is what this project keeps being wrong
  // about.
  const timeIt = async (keys, label) => {
    const t0 = performance.now();
    let got = 0;
    for (const k of keys) { if ((await readOne(k)) != null) got += 1; }
    const ms = performance.now() - t0;
    ui.note(`${label}: ${keys.length} parameters in ${Math.round(ms)}ms`
      + ` (${Math.round(ms / keys.length)}ms each, ${got} answered)`);
    return ms;
  };
  await timeIt(SWITCHES.map(([, k]) => k), 'the six section switches');
  await timeIt(CHAIN, 'the whole effects chain');
})()
