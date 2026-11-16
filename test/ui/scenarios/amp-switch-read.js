// B9: THE AMP SIMULATOR READS OFF WHEN THE SEVEN HAS IT ON.
//
// Daniel, 16 Nov 2026, Bank 2 / Preset 5 "Tine Piano": the instrument has the
// amp simulator ON, the app shows OFF, and refreshing did not change it. What
// narrows it is that FX1 read ON correctly and the amp's TYPE (TWIN) came
// through — so the section is being read and one field inside it is not.
//
// INVESTIGATION. Nothing is changed. Three things have to be told apart and a
// single comparison cannot do it, so this takes three readings of the same
// moment:
//
//   DEVICE    what a 0x22 read of the edit buffer says right now
//   PATCH     what the app believes the patch holds (its rendered rows)
//   PILL      what the section header draws, ON or OFF
//
// read / parse / render, in that order: DEVICE != PATCH is a read or a parse;
// PATCH != PILL is a render. And every section's switch is compared, not just
// the amp's — if it is general the scope is different, and that is worth
// knowing before anything is fixed.
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };
  const api = window.sevenAPI.midi;

  const SWITCHES = [
    ['efx_veq', 'veq_byp', 73], ['efx_fx1', 'fx1_sw', 74], ['efx_fx2', 'fx2_sw', 78],
    ['efx_amp', 'amp_sw', 89], ['efx_rev', 'rev_sw', 95], ['efx_pad', 'pad_sw', 104],
  ];
  const AMP = [['amp_sw', 89], ['amp_dr', 90], ['amp_mo', 91],
    ['amp_bs', 92], ['amp_md', 93], ['amp_tr', 94]];

  await ui.selectTab('seven');
  await ui.sleep(800);

  // BANK 2 PRESET 5, the patch he reported. Bank tabs are buttons; the rows
  // are the eight presets of whichever bank is showing.
  const bank2 = ui.$$('#patch-list .bank-tab, .bank-tab').find((b) => /2/.test(b.textContent));
  if (bank2) { bank2.dispatchEvent(new MouseEvent('click', { bubbles: true })); await ui.sleep(700); }
  const rows = ui.$$('#patch-list .patch-row');
  ui.note(`bank rows on screen: ${rows.length}`);
  const target = rows[4] || rows[0];
  if (!target) { ui.check(false, 'a preset row to open'); return; }
  ui.note(`opening: "${target.textContent.trim().replace(/\s+/g, ' ').slice(0, 60)}"`);
  target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await ui.sleep(2800);

  const dev = await api.readBuffer();
  if (!dev || !dev.ok) {
    ui.check(false, `the edit buffer could not be read: ${(dev && dev.error) || 'no answer'}`);
    return;
  }
  const D = dev.params || dev.values || dev;

  const pillOf = (group) => {
    const sec = ui.$(`#detail .fx-section[data-group="${group}"]`);
    const pill = sec && sec.querySelector('.fx-state');
    return pill ? { text: pill.textContent.trim(), pressed: pill.getAttribute('aria-pressed') } : null;
  };
  const rowValue = (key) => {
    const row = ui.$(`#detail .param[data-key="${key}"]`);
    if (!row) return null;
    const v = row.querySelector('.param-value');
    return v ? v.textContent.trim() : null;
  };

  // ---- 1. EVERY SECTION'S SWITCH ------------------------------------------
  ui.note('--- every section switch: DEVICE vs PILL ---');
  ui.note('group      key(id)      | device | pill | agree');
  const disagree = [];
  for (const [group, key, id] of SWITCHES) {
    const pill = pillOf(group);
    const d = D[key];
    // veq_byp is INVERTED: it is EQ *Bypass*, so 1 means the EQ is off. The
    // pill reads the opposite way by design (renderer.js), and comparing it
    // naively would invent a seventh bug.
    const expectedOn = key === 'veq_byp' ? d === 0 : d === 1;
    const shown = pill ? pill.text === 'ON' : null;
    const ok = pill ? shown === expectedOn : null;
    if (pill && !ok) disagree.push(`${key}: device ${d} -> expected ${expectedOn ? 'ON' : 'OFF'}, pill ${pill.text}`);
    ui.note(`${group.padEnd(10)} ${`${key}(${id})`.padEnd(12)} | ${String(d).padStart(6)}`
      + ` | ${(pill ? pill.text : 'NO PILL').padStart(4)} | ${ok === null ? '?' : ok ? 'yes' : 'NO'}`);
  }
  ui.note(disagree.length
    ? `SWITCHES THAT DISAGREE: ${disagree.join(' · ')}`
    : 'every section switch agrees with the instrument');

  // ---- 2. THE WHOLE AMP SECTION, FIELD BY FIELD ---------------------------
  ui.note('--- the amp section: DEVICE vs what the app renders ---');
  ui.note('key(id)      | device | rendered');
  for (const [key, id] of AMP) {
    ui.note(`${`${key}(${id})`.padEnd(12)} | ${String(D[key]).padStart(6)}`
      + ` | ${String(key === 'amp_sw' ? (pillOf('efx_amp') || {}).text : rowValue(key))}`);
  }

  // ---- 3. IS IT A STALE VIEW, OR A LIVE DISAGREEMENT? ---------------------
  //
  // B7 is a cached panel: the app shows what it last knew, and an instrument
  // moved behind its back leaves it stale. If THAT is the mechanism here,
  // re-reading the buffer and comparing again will show the same device value
  // both times while the pill never moves — and the question becomes what
  // "refresh" actually re-reads.
  const again = await api.readBuffer();
  const D2 = (again && again.ok && (again.params || again.values)) || {};
  ui.note(`amp_sw on a second read: ${D2.amp_sw} (first read ${D.amp_sw})`);
  ui.check(D2.amp_sw === D.amp_sw,
    'the instrument is steady between two reads — so any disagreement is the'
    + ' app\'s, not the device changing underneath');

  // THE HEADLINE, as an assertion so a future run says it plainly.
  const ampPill = pillOf('efx_amp');
  if (ampPill) {
    ui.check((ampPill.text === 'ON') === (D.amp_sw === 1),
      `the amp pill matches the instrument (device amp_sw=${D.amp_sw},`
      + ` pill "${ampPill.text}")`);
  }

  // ---- 4. THE STATE DANIEL WAS IN ----------------------------------------
  //
  // Everything above agrees, and the reason matters: SELECTING a patch sends
  // it, so by the time anything is compared the instrument has been made to
  // match the app. That is the opposite order from his report, where the
  // instrument was changed and the app did not follow.
  //
  // So the divergence is induced the way the panel would: the device is moved
  // behind the app's back and nothing is told. If the pill follows, the app
  // tracks the instrument and B9 is something else. If it does not, this is
  // B7's mechanism reaching a CC-mapped parameter.
  const before = (pillOf('efx_amp') || {}).text;
  const flip = D.amp_sw === 1 ? 0 : 1;
  ui.note(`--- moving the device behind the app's back: amp_sw -> ${flip} ---`);
  const w = await api.setParam('amp_sw', flip);
  ui.check(!!w && w.ok && w.value === flip, `the device took amp_sw = ${flip}`);
  await ui.sleep(1400);

  const after = (pillOf('efx_amp') || {}).text;
  const check1 = await api.readBuffer();
  const live1 = (check1 && check1.ok && (check1.params || check1.values)) || {};
  ui.note(`device amp_sw=${live1.amp_sw} · pill "${before}" -> "${after}"`);
  const followed = (after === 'ON') === (live1.amp_sw === 1);
  ui.check(true, `the pill ${followed ? 'FOLLOWED' : 'DID NOT FOLLOW'} the instrument`
    + ` — device ${live1.amp_sw}, pill "${after}"`);

  // ---- 5. WHAT DOES A REFRESH DO? ----------------------------------------
  //
  // He refreshed and it still read OFF. Re-selecting the patch is the gesture
  // nearest to that, and it is worth knowing which way it resolves the
  // disagreement: does the app re-read the instrument, or does it SEND its
  // own belief and make the instrument agree with the screen?
  const again2 = ui.$$('#patch-list .patch-row')[4] || ui.$$('#patch-list .patch-row')[0];
  if (again2) {
    again2.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await ui.sleep(2800);
    const post = await api.readBuffer();
    const P = (post && post.ok && (post.params || post.values)) || {};
    const pill2 = (pillOf('efx_amp') || {}).text;
    ui.note(`AFTER RE-SELECTING: device amp_sw=${P.amp_sw} · pill "${pill2}"`);
    ui.note(P.amp_sw === flip
      ? '  the instrument KEPT the change — a refresh did not overwrite it'
      : '  the instrument was SENT the app\'s value — the refresh pushed, it did not pull');
  }

  // ---- 6. THE TWO THINGS A PANEL MOVE DEPENDS ON -------------------------
  //
  // My induced change emitted no CC — the app made it, so nothing arrived on
  // the wire. A REAL panel move is a different path: amp_sw carries CC 28, so
  // the instrument announces it and audition.js's onPanelCc reads the value
  // back. That path has two preconditions and neither has been checked here,
  // so they are recorded rather than assumed.
  ui.note('--- what a real panel move would depend on ---');
  ui.note(`a live session is open: ${ui.live ? await ui.live() : 'unknown'}`
    + '  (onPanelCc returns early unless one is)');
  const g = await api.globals();
  if (g && g.ok && g.fields) {
    const row = g.fields.map((f, i) => `${f.label || f.key || i}=${g.glb[i]}`).join(' · ');
    ui.note(`globals: ${row}`);
  } else {
    ui.note('globals unavailable');
  }
})()
