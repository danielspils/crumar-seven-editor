// THE PANEL AGAINST THE INSTRUMENT, for the FX2 Delay parameters.
// protocol.md open item 5b, final paragraph. INVESTIGATION — changes nothing.
//
// 5b records, from 2026-08-12: the app's panel showed Speed, Max Feedback and
// Max Level all as 0 while the instrument reported 72, 113 and 127. Depth and
// Stereo Spread matched, so it was never the whole section. The standing
// instruction is to establish WHICH PANEL STATE produced that before
// attributing anything to the delay, and nobody has.
//
// It matters because it supplies a second cause for "I moved it and nothing
// happened" that has nothing to do with the instrument: the drag handler
// derives its value from POINTER POSITION, not from the number on screen
// (audition.js, intentFrom — pct * max). So if the bar is DRAWN at 0 while
// the device holds 113, a small nudge does not nudge: it writes ~5, and the
// player has silently dropped the parameter by a hundred counts while
// believing they raised it slightly.
//
// Two questions, from CODE, and this file exists to answer only these:
//   1. Is the 0 display reproducible, and what triggers it?
//   2. When the panel shows 0 and the device holds 113, what does a drag
//      actually write?
//
// Nothing is renamed, hidden or remapped. Writes go to the edit buffer, which
// was proven on hardware twice (2026-09-08) not to persist into a slot
// without a three-second panel hold.
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };
  const api = window.sevenAPI.midi;
  const KEYS = ['fx2_dp', 'fx2_sp', 'dly_mf', 'dly_ml', 'dly_sp'];
  const ID = { fx2_dp: 80, fx2_sp: 81, dly_mf: 86, dly_ml: 87, dly_sp: 88 };

  const panelOf = (key) => {
    const row = ui.$(`#detail .param[data-key="${key}"]`);
    if (!row) return { shown: null, live: false, missing: true };
    const el = row.querySelector('.param-value');
    const txt = el ? el.textContent.trim() : '';
    return {
      shown: txt === '' ? null : Number(txt),
      live: row.classList.contains('is-live'),
      missing: false,
    };
  };

  const deviceAll = async () => {
    const r = await api.readBuffer();
    if (!r || !r.ok) {
      ui.check(false, `the edit buffer could not be read: ${(r && r.error) || 'no answer'}`);
      return null;
    }
    return r.params || r.values || r;
  };

  // The comparison, in one place, so every phase reports the same way and a
  // disagreement cannot be described differently depending on where it turned
  // up. Returns the keys that disagreed.
  // `expect` is 'agree' where the panel SHOULD match, and 'known-stale' for
  // the one phase that deliberately moves the instrument behind the panel's
  // back. The second kind pins behaviour that is WRONG, which this project has
  // been bitten by four times — so it is labelled, it is the only such
  // assertion here, and it says what to do when the bug is fixed: invert it in
  // the same commit, as test/library-store.test.js had to be.
  const compare = async (phase, expect) => {
    const dev = await deviceAll();
    if (!dev) return null;
    ui.note(`--- ${phase} ---`);
    ui.note('key(id)      | panel | device | live | verdict');
    const bad = [];
    for (const key of KEYS) {
      const p = panelOf(key);
      const d = dev[key];
      const agree = p.shown === d;
      if (!agree) bad.push({ key, panel: p.shown, device: d });
      ui.note(`${`${key}(${ID[key]})`.padEnd(12)} | ${String(p.shown).padStart(5)}`
        + ` | ${String(d).padStart(6)} | ${p.live ? 'yes ' : 'no  '}`
        + ` | ${p.missing ? 'NO ROW ON SCREEN' : agree ? 'agree' : 'DISAGREE'}`);
    }
    const detail = bad.map((b) => `${b.key} panel ${b.panel} vs device ${b.device}`).join('; ');
    if (expect === 'agree') {
      ui.check(bad.length === 0,
        `${phase}: the panel shows what the instrument holds`
        + (bad.length ? ` — ${detail}` : ''));
    } else {
      ui.check(bad.length > 0,
        `${phase}: the panel has gone STALE, which is open item 5b reproduced`
        + ` on demand — ${detail || 'but it did not, so either the bug is fixed'
          + ' or this scenario no longer induces it; find out which before'
          + ' deleting anything'}`);
    }
    return { dev, bad };
  };

  const openFx2Delay = async () => {
    const fx2 = ui.$('#detail .fx-section[data-group="efx_fx2"]');
    if (!fx2) return false;
    if (fx2.classList.contains('collapsed')) {
      const head = fx2.querySelector('.fx-head');
      if (head) head.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await ui.sleep(420);
    }
    const sel = ui.$('#detail select.param-select[data-key="fx2_md"]');
    if (sel && sel.value !== '3') {
      sel.value = '3';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      await ui.sleep(1600);
    }
    return true;
  };

  const pickRow = async (i) => {
    const rows = ui.$$('#patch-list .patch-row');
    if (!rows[i]) return false;
    rows[i].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await ui.sleep(2800);
    return true;
  };

  await ui.selectTab('seven');
  await ui.sleep(800);
  if (!(await pickRow(0))) { ui.note('no bank rows'); return; }
  if (!(await openFx2Delay())) { ui.check(false, 'the FX2 section is on screen'); return; }

  // PHASE 1 — ON ARRIVING AT THE PATCH. This is the state 5b was looking at.
  const first = await compare('phase 1: on arriving at the patch', 'agree');
  if (!first) return;

  // PHASE 2 — LEAVE AND COME BACK. Selecting a slot SENDS the patch, so the
  // second arrival is a different code path from the first in one respect
  // that matters here: the instrument already holds these values.
  await pickRow(1);
  await pickRow(0);
  await openFx2Delay();
  const second = await compare('phase 2: after leaving and returning', 'agree');
  if (!second) return;

  // PHASE 3 — DIVERGENCE, MADE ON PURPOSE. Write to the INSTRUMENT behind the
  // panel's back, exactly reproducing 5b's numbers, and look at what the
  // screen says afterwards. This is the only way to ask question 2 without
  // waiting for the condition to turn up by itself.
  ui.note('--- inducing 5b\'s numbers on the device, panel untouched ---');
  for (const [key, val] of [['dly_mf', 113], ['dly_ml', 127], ['fx2_sp', 72]]) {
    const w = await api.setParam(key, val);
    ui.note(`  device ${key}(${ID[key]}) := ${val} -> echoed ${w && w.value}`);
    ui.check(!!w && w.ok && w.value === val, `the device took ${key} = ${val}`);
    await ui.sleep(220);
  }
  const third = await compare('phase 3: device moved behind the panel', 'known-stale');
  if (!third) return;

  // PHASE 4 — WHAT A DRAG ACTUALLY WRITES, from whatever the panel is showing
  // now. The pointer is put at a known fraction of the bar, so the value the
  // handler should derive is arithmetic rather than a guess.
  const key = 'dly_mf';
  const row = ui.$(`#detail .param[data-key="${key}"]`);
  const bar = row && row.querySelector('.param-bar');
  if (!row || !bar) {
    ui.check(false, `there is a ${key} bar to drag`);
    return;
  }
  ui.check(row.classList.contains('is-live'),
    `the ${key} row is live, so a drag is accepted (class="${row.className}")`);

  const rect = bar.getBoundingClientRect();
  const FRAC = 0.25;
  const max = Number(row.dataset.max);
  const expected = Math.round(FRAC * max);
  const x = rect.left + rect.width * FRAC;
  const y = rect.top + rect.height / 2;
  const before = (await deviceAll())[key];
  const shownBefore = panelOf(key).shown;
  ui.note(`--- dragging ${key} to ${Math.round(FRAC * 100)}% of its track ---`);
  ui.note(`  panel shows ${shownBefore}, device holds ${before},`
    + ` pointer fraction ${FRAC} of max ${max} => ${expected}`);

  const pd = (type) => new PointerEvent(type, {
    bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, button: 0,
  });
  bar.dispatchEvent(pd('pointerdown'));
  await ui.sleep(120);
  bar.dispatchEvent(pd('pointermove'));
  await ui.sleep(120);
  bar.dispatchEvent(pd('pointerup'));
  await ui.sleep(1200);

  const after = (await deviceAll())[key];
  const shownAfter = panelOf(key).shown;
  ui.note(`  after the drag: device ${before} -> ${after}, panel ${shownBefore} -> ${shownAfter}`);
  ui.check(after === expected,
    `the drag wrote the POINTER's value (${expected}), not something derived`
    + ` from the stale display — device went ${before} -> ${after}`);
  ui.check(shownAfter === after,
    `after a drag the panel agrees with the instrument (panel ${shownAfter},`
    + ` device ${after})`);

  // THE CONSEQUENCE, stated as a number rather than left to the reader: how
  // far the instrument moved versus how far the player asked it to move from
  // what they could see.
  //
  // READ THIS LINE AS HISTORY, NOT AS WHAT THE APP DOES NOW (16 Nov 2026).
  // `shownBefore` is sampled BEFORE the press, and since B7 was fixed the
  // grab itself reads the parameter and puts the true value on screen — so
  // the number the player actually sees at the moment they aim is the
  // instrument's, not this one. The sequence is stale -> TRUE -> dragged, and
  // a before/after sample cannot see the middle of it.
  //
  // This scenario is kept as the MECHANISM's record: that a bar writes the
  // pointer's absolute position, which is still true and is what made the
  // stale display dangerous. The fix is proved by
  // test/ui/scenarios/grab-reads-param.js, which samples through the gesture.
  if (shownBefore !== null && before !== null) {
    ui.note(`  BEFORE THE FIX this read: the player saw ${shownBefore} and aimed`
      + ` at ${expected} (a move of ${expected - shownBefore});`
      + ` the instrument moved ${after - before}`);
    ui.note('  NOW the grab reads first, so what they see when they aim is the'
      + ' instrument\'s own value — see grab-reads-param.js');
  }
})()
