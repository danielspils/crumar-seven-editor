// B7: GRABBING A SLIDER ASKS THE INSTRUMENT FIRST.
//
// THE BUG (measured 15 Nov 2026, fx2-delay-display.js). A bar writes the
// pointer's ABSOLUTE position. When the instrument has moved without the app
// originating the change, the number on screen is stale — so a player who
// sees 0 and aims for 32 moves the device from 113 to 32: the opposite
// direction from what they asked, by 81. It self-corrects on the write that
// does the damage, which is why three sessions on B5 walked past it.
//
// THE FIX (Daniel, 16 Nov 2026): read that ONE parameter at the moment the
// slider is grabbed, put the true value on screen, and let the drag start
// from there.
//
// WHAT THIS CAN ACTUALLY OBSERVE, and it is worth being exact about, because
// the obvious assertion proves nothing. BOTH the fixed and the unfixed app
// end the gesture with the panel and the device agreeing on the dragged-to
// value — that is what "it self-corrects on the write that does the damage"
// means. The end state is identical.
//
// What differs is what the panel shows DURING the gesture. Fixed, the
// sequence is stale -> TRUE -> dragged. Unfixed, it is stale -> dragged, and
// the true value never appears at all. So this samples the rendered number
// through the press and asserts that the instrument's real value was on
// screen at some point in it.
//
// Sampling rather than a single check, deliberately: the read is ~13ms and
// the echo of the write follows it, so the true value is on screen for a few
// frames. A test that looked once would be a race.
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };
  const api = window.sevenAPI.midi;

  // A CONTINUOUS, CC-LESS PARAMETER is the honest subject: `cc: -1` means
  // nothing announces a panel move, which is the condition B7 lives in. This
  // one is also the parameter the original measurement used.
  const KEY = 'dly_mf';
  const STALE = 0;      // what the panel will be showing
  const TRUE_VALUE = 113;  // what the instrument will really hold

  const rowOf = () => ui.$(`#detail .param[data-key="${KEY}"]`);
  const shownOf = () => {
    const r = rowOf();
    const v = r && r.querySelector('.param-value');
    return v ? Number(v.textContent) : null;
  };

  const openFx2Delay = async () => {
    const head = ui.$('#detail .fx-head[data-group="efx_fx2"]');
    if (head && head.closest('.fx-section').classList.contains('collapsed')) {
      head.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await ui.sleep(420);
    }
    const sel = ui.$('#detail select.param-select[data-key="fx2_md"]');
    if (sel && sel.value !== '3') {
      sel.value = '3';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      await ui.sleep(1600);
    }
    return !!rowOf();
  };

  await ui.selectTab('seven');
  await ui.sleep(800);
  const rows = ui.$$('#patch-list .patch-row');
  if (!rows.length) { ui.note('no bank rows'); return; }
  rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await ui.sleep(2800);
  if (!(await openFx2Delay())) { ui.check(false, 'the FX2 Delay rows are on screen'); return; }

  const row = rowOf();
  ui.check(row.classList.contains('is-live'),
    `the ${KEY} row is live, so a drag is accepted (class="${row.className}")`);
  if (!row.classList.contains('is-live')) return;

  // ---- SET THE PANEL, THEN MOVE THE DEVICE BEHIND ITS BACK --------------
  //
  // The panel is put at a known value through the app, so the app believes
  // it; then the instrument is written directly, which the app is never told
  // about. That is the divergence, reproduced on demand rather than waited
  // for — the real route is the physical panel, and for a cc:-1 parameter
  // that route is unobservable to the app by construction.
  const wrote = await api.setParam(KEY, STALE);
  ui.check(!!wrote && wrote.ok, `the panel is put at ${STALE} through the app`);
  await ui.sleep(400);
  // Re-select so the app's working copy holds the stale value as its belief.
  const beforePanel = shownOf();
  ui.note(`panel believes ${KEY} = ${beforePanel}`);

  const moved = await api.setParam(KEY, TRUE_VALUE);
  ui.note(`device ${KEY} := ${TRUE_VALUE} -> echoed ${moved && moved.value}`);
  ui.check(!!moved && moved.ok && moved.value === TRUE_VALUE,
    `the instrument really holds ${TRUE_VALUE}`);
  await ui.sleep(300);

  const stalePanel = shownOf();
  ui.note(`panel still shows ${stalePanel} while the device holds ${TRUE_VALUE}`);
  ui.check(stalePanel === STALE,
    `the panel is stale before the grab (${stalePanel}) — otherwise something`
    + ' else refreshed it and this proves nothing');
  if (stalePanel !== STALE) return;

  // ---- GRAB IT, AND WATCH WHAT THE NUMBER DOES --------------------------
  const bar = rowOf().querySelector('.param-bar');
  const rect = bar.getBoundingClientRect();
  const FRAC = 0.25;
  const max = Number(rowOf().dataset.max);
  const aimed = Math.round(FRAC * max);
  const x = rect.left + rect.width * FRAC;
  const y = rect.top + rect.height / 2;
  ui.note(`grabbing at ${Math.round(FRAC * 100)}% of the track => ${aimed}`);

  const seen = [];
  const sample = () => {
    const v = shownOf();
    if (v !== null && seen[seen.length - 1] !== v) seen.push(v);
  };
  sample();

  bar.dispatchEvent(new PointerEvent('pointerdown', {
    bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, button: 0,
  }));
  // Through the read, the correction, the write and its echo. 5ms steps: the
  // read is ~13ms, so a coarser sample could step straight over the corrected
  // frame and report a fix as missing.
  for (let i = 0; i < 80; i += 1) { sample(); await ui.sleep(5); }
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
  await ui.sleep(400);
  sample();

  ui.note(`the number went: ${seen.join(' -> ')}`);

  // THE ASSERTION. The instrument's real value appeared on screen during the
  // gesture — which can only happen if the grab asked the instrument.
  ui.check(seen.includes(TRUE_VALUE),
    `the true value ${TRUE_VALUE} was shown during the grab`
    + ` (saw ${seen.join(' -> ')}) — the slider asked the instrument before`
    + ' it wrote');

  // AND THE DRAG STILL WORKS. The read must not swallow the gesture: the
  // press still writes the position it was aimed at.
  const after = await api.readParam(KEY);
  ui.note(`after the grab: device ${KEY} = ${after && after.value}, aimed ${aimed}`);
  ui.check(!!after && after.ok && Math.abs(after.value - aimed) <= 1,
    `the press still wrote what it was aimed at (${after && after.value} vs ${aimed})`);
  ui.check(shownOf() === (after && after.value),
    `and the panel agrees with the instrument afterwards`
    + ` (panel ${shownOf()}, device ${after && after.value})`);
})()
