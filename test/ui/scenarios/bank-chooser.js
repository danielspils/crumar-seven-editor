// @env SEVEN_NO_DEVICE=1
//
// CHOOSING A BANK FOR A WHOLE SETLIST, on the panel.
//
// It was four green buttons labelled Bank 1-4 — the last generic chooser in
// the send path. They worked, and they asked the question in a vocabulary the
// player was not looking at: the instrument has ONE bank button that cycles
// and a column of lamps that says where it is.
//
// What separates this from the single-patch chooser is what the eight presets
// MEAN. There, they are eight things to pick from. Here they are the
// destination — every one of them is about to be written — so they light and
// none of them answers a click. That difference is the whole reason this
// scenario exists, and it is asserted by CLICKING one.
//
// The real flow needs a connected Seven (sendSetlist refuses without one), so
// the modal is built from the same pieces and driven through the same state
// functions. That the APP still builds it this way is checked from source in
// test/source-wiring.test.js — the two halves together.
(async () => {
  const m = SevenModal.open({
    title: 'Send to Seven',
    bodyHtml:
      '<p class="tx-step-name"><em>Bank 3 setlist (2026-08-19)</em></p>'
      + SevenModalPanel.buildPanel(window.sevenAPI.getPanelSvg(), { brackets: ['bank'] })
      + '<div class="tx-slot mp-slot">'
        + '<div class="tx-face" data-face="pick">'
          + '<p class="tx-note">Select which bank to send, then ‘next’ below</p>'
        + '</div>'
        + '<div class="tx-face is-off" data-face="bank1">'
          + '<p class="tx-note">Bank 1 is for factory presets</p>'
        + '</div>'
      + '</div>',
    confirmLabel: 'Next …', cancelLabel: 'Close', tone: 'is-transfer',
  });
  await ui.sleep(450);
  const svg = m.body.querySelector('svg.modal-panel');
  const pickFace = m.body.querySelector('[data-face="pick"]');
  const bank1Face = m.body.querySelector('[data-face="bank1"]');
  const nextBtn = m.body.parentElement.querySelector('.seven-modal-ok');
  ui.check(!!svg && !!nextBtn, 'the panel and the action are there');
  if (!svg) { m.close(); return; }

  let bank = null;
  const paint = () => {
    SevenModalPanel.setBank(svg, bank);
    SevenModalPanel.setStage(svg, bank ? 'row' : 'bank');
    pickFace.classList.toggle('is-off', bank === 1);
    bank1Face.classList.toggle('is-off', bank !== 1);
    nextBtn.disabled = !(bank && bank !== 1);
  };
  paint();

  const lampsOn = () => [...svg.querySelectorAll('[id^="mp-led-bank-"].on')].map((e) => e.id.slice(-1));
  const ledsOn = () => svg.querySelectorAll('[data-mp-preset] .led.on').length;
  const capOf = (w) => svg.querySelector(`[data-mp-cap="${w}"]`).textContent;
  const size = (label) => {
    const d = m.body.closest('.seven-modal').getBoundingClientRect();
    ui.note(`${label}: modal ${Math.round(d.width)}x${Math.round(d.height)}`);
    return Math.round(d.height);
  };

  // ── ONE QUESTION, and only one bracket to answer it ────────────────────
  ui.check(!!svg.querySelector('[data-mp-cap="bank"]'), 'the bank bracket is there');
  ui.check(!svg.querySelector('[data-mp-cap="preset"]'),
    'and there is NO preset bracket — no preset is being chosen');
  ui.check(capOf('bank') === 'Bank: —', `it starts with nothing chosen ("${capOf('bank')}")`);
  ui.check(svg.querySelector('.mp-heading').textContent === 'SELECT BANK',
    'the panel asks for a bank');

  // ── NOTHING CHOSEN ────────────────────────────────────────────────────
  ui.check(lampsOn().length === 0, `no lamp lit yet (${lampsOn()})`);
  ui.check(ledsOn() === 0, `and the row is dark (${ledsOn()})`);
  ui.check(nextBtn.disabled, 'NEXT is dim');
  const h0 = size('nothing  ');

  // ── THE BANK CONTROL CYCLES, by real clicks ───────────────────────────
  const bankHit = svg.querySelector('[data-mp-bank]');
  ui.check(getComputedStyle(bankHit).pointerEvents === 'auto', 'the BANK control is live');
  const seen = [];
  for (let i = 0; i < 5; i += 1) {
    if (!ui.click(bankHit, 'the BANK control')) break;
    bank = SevenModalPanel.nextBank(bank);
    paint();
    await ui.sleep(120);
    seen.push(lampsOn().join('') || '-');
  }
  ui.note(`five presses → lamps ${seen.join(' → ')}`);
  ui.check(seen.join(',') === '2,3,4,1,2', `it cycles as the instrument's own does (${seen.join(' → ')})`);

  // ── BANK 1 IS NOT A DESTINATION ───────────────────────────────────────
  bank = 1; paint(); await ui.sleep(150);
  ui.check(lampsOn().join('') === '1', 'Bank 1 lights, because the instrument can be there');
  ui.check(getComputedStyle(bank1Face).visibility === 'visible'
    && getComputedStyle(pickFace).visibility === 'hidden',
    'and the message says it is for factory presets');
  ui.check(nextBtn.disabled, 'NEXT stays dim on Bank 1');
  const h1 = size('bank 1   ');

  // ── A BANK CHOSEN: THE ROW IS THE DESTINATION, NOT A MENU ─────────────
  bank = 3; paint(); await ui.sleep(200);
  ui.check(lampsOn().join('') === '3', `lamp 3 lit (${lampsOn()})`);
  ui.check(capOf('bank') === 'Bank: 3', `the bracket follows ("${capOf('bank')}")`);
  ui.check(ledsOn() === 8, `all eight light — every one of them is about to be written (${ledsOn()})`);
  ui.check(!nextBtn.disabled, 'and NEXT wakes up');
  const h3 = size('bank 3   ');

  // THE PART THAT MATTERS. In the single-patch chooser this same lit row is a
  // menu. Here it is a report, and clicking it must do NOTHING — a preset that
  // answered here would imply a choice the flow does not have.
  const hit = svg.querySelector('[data-mp-preset="6"] [data-mp-hit]');
  ui.check(getComputedStyle(hit).pointerEvents === 'none',
    'no preset answers the mouse — the row is a destination, not a menu');
  const before = { lamps: lampsOn().join(''), leds: ledsOn(), chosen: !!svg.querySelector('.is-chosen') };
  hit.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await ui.sleep(200);
  ui.check(lampsOn().join('') === before.lamps && ledsOn() === before.leds
    && !!svg.querySelector('.is-chosen') === before.chosen,
    'and clicking one changes nothing at all');

  // ── ONE SIZE THROUGHOUT ───────────────────────────────────────────────
  const heights = new Set([h0, h1, h3]);
  ui.check(heights.size === 1, `the modal is ONE HEIGHT in every state (${[...heights].join(', ')})`);
  m.close();
})()
