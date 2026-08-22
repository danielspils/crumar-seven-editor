// @env SEVEN_NO_DEVICE=1
//
// THE HOLD SCREEN IS THE SAME DRAWING AS EVERYTHING ELSE.
//
// It used to be its own picture — src/panel-mini.js, a second SVG built in JS
// with its own coordinates and its own flatter caps. That is how it came to be
// missing the BANK button for eleven days: two hand-maintained copies and
// nothing that could compare them. Both panels now come out of
// assets/seven-panel.svg, so a control added to the instrument's drawing
// appears on both without anyone remembering to.
//
// The properties that survived the fold, and are asserted here rather than
// assumed:
//
//   the BANK control is present, in the instrument's own left-to-right order
//   HOLD sits over the button to press, and TRAVELS when the walk steps
//   the one lit LED is the one to hold
//   nothing is being CHOSEN, so the choosing furniture is absent
//
// The real walk needs a connected instrument, so the panel is built and driven
// directly. That the APP still builds it this way is checked from source in
// test/source-wiring.test.js — the two halves together.
(async () => {
  const m = SevenModal.open({
    title: 'Send to Seven',
    bodyHtml: '<p class="tx-step-name">Tine Piano</p>'
      + SevenModalPanel.buildPanel(window.sevenAPI.getPanelSvg(), { brackets: false }),
    confirmLabel: 'Held it — next', cancelLabel: 'Stop', tone: 'is-transfer',
  });
  await ui.sleep(450);
  const svg = m.body.querySelector('svg.modal-panel');
  ui.check(!!svg, 'the panel picture renders');
  if (!svg) { m.close(); return; }

  SevenModalPanel.setBank(svg, 3);
  SevenModalPanel.setPreset(svg, 5);
  SevenModalPanel.setStage(svg, 'hold');
  await ui.sleep(450);

  const box = (sel, root) => (root || svg).querySelector(sel).getBoundingClientRect();

  // ── THE BANK CONTROL IS THERE, in the instrument's own order ───────────
  const bankBtn = svg.querySelector('[data-mp-bank]');
  ui.check(!!bankBtn, 'THE BANK CONTROL IS THERE');
  if (!bankBtn) { m.close(); return; }
  const bankBox = bankBtn.getBoundingClientRect();
  const lamp = box('#mp-led-bank-1');
  const preset1 = box('[data-mp-preset="1"] [data-mp-hit]');
  ui.note(`bank ${Math.round(bankBox.left)}..${Math.round(bankBox.right)}  `
    + `lamp ${Math.round(lamp.left)}..${Math.round(lamp.right)}  `
    + `preset1 ${Math.round(preset1.left)}..${Math.round(preset1.right)}`);
  ui.check(bankBox.right <= lamp.left, 'the BANK button is left of the lamps, as on the panel');
  ui.check(lamp.right <= preset1.left, 'and the lamps are left of the presets');
  ui.check(Math.abs(bankBox.width - preset1.width) < 1.5
    && Math.abs(bankBox.height - preset1.height) < 1.5,
    `it is the same cap as a preset (${Math.round(bankBox.width)}x${Math.round(bankBox.height)} `
    + `vs ${Math.round(preset1.width)}x${Math.round(preset1.height)})`);

  // ── IT IS A PICTURE, NOT A CHOOSER ────────────────────────────────────
  //
  // The walk has already sent the patch and moved the instrument. A bank
  // control that answered a click here would move it somewhere else, mid-walk.
  ui.check(getComputedStyle(bankBtn).pointerEvents === 'none',
    'and nothing on it can be pressed — the choosing is over');
  ui.check(!svg.querySelector('.mp-brackets'),
    'no bottom brackets: they caption a choice, and nothing is being chosen');
  ui.check(getComputedStyle(svg.querySelector('.mp-heading')).visibility === 'hidden',
    'and no SELECT PRESET competing with the legend');

  // ── HOLD IS OVER THE BUTTON TO PRESS ──────────────────────────────────
  const word = svg.querySelector('.mp-hold-word');
  ui.check(!!word && getComputedStyle(svg.querySelector('.mp-hold')).opacity === '1',
    'the HOLD legend is showing');
  const centreOf = (n) => {
    const b = box(`[data-mp-preset="${n}"] [data-mp-hit]`);
    return b.left + b.width / 2;
  };
  const wordCentre = () => {
    const b = word.getBoundingClientRect();
    return b.left + b.width / 2;
  };
  const at5 = wordCentre();
  ui.note(`HOLD centre ${Math.round(at5)} · preset 5 centre ${Math.round(centreOf(5))}`);
  ui.check(Math.abs(at5 - centreOf(5)) < 4,
    `HOLD is centred over preset 5, not near it (${Math.round(at5)} vs ${Math.round(centreOf(5))})`);
  ui.check(word.getBoundingClientRect().bottom <= box('[data-mp-preset="5"] [data-mp-hit]').top,
    'and above the button rather than on it');

  // ── THE ONE LIT LED IS THE ONE TO HOLD ────────────────────────────────
  const lit = () => [...svg.querySelectorAll('[data-mp-preset]')]
    .filter((g) => g.querySelector('.led.on'))
    .map((g) => g.dataset.mpPreset);
  ui.check(lit().join(',') === '5', `only preset 5 is lit (${lit().join(',') || 'none'})`);
  ui.check(svg.querySelector('[data-mp-preset="5"]').classList.contains('is-chosen'),
    'and its cap is up');
  const lampsOn = [...svg.querySelectorAll('[id^="mp-led-bank-"].on')]
    .map((el) => el.id.slice(-1));
  ui.check(lampsOn.join(',') === '3', `the bank lamp says 3 (${lampsOn.join(',') || 'none'})`);

  // ── AND IT TRAVELS ────────────────────────────────────────────────────
  //
  // The walk steps preset by preset through a bank. The legend moving is the
  // move the player's own hand is about to make; a legend redrawn somewhere
  // else is a new instruction they have to find.
  SevenModalPanel.setPreset(svg, 2);
  await ui.sleep(500);
  const at2 = wordCentre();
  ui.note(`stepped to preset 2 → HOLD centre ${Math.round(at2)} · preset 2 centre ${Math.round(centreOf(2))}`);
  ui.check(Math.abs(at2 - centreOf(2)) < 4,
    `HOLD followed to preset 2 (${Math.round(at2)} vs ${Math.round(centreOf(2))})`);
  ui.check(at2 < at5, 'it moved left along the row');
  ui.check(lit().join(',') === '2', `and the light came with it (${lit().join(',') || 'none'})`);

  // The instruction exists for somebody who cannot see the picture.
  ui.note(`aria: "${svg.getAttribute('aria-label')}"`);
  ui.check(/hold preset 2 in bank 3/i.test(svg.getAttribute('aria-label') || ''),
    'the picture says in words which button it is pointing at');

  m.close();
})()
