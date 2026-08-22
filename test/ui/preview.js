// A LOOK AT THE SEND-TO-SEVEN PANEL WITH NO INSTRUMENT ATTACHED.
//
//     SEVEN_UI_TEST=test/ui/preview.js npm start
//
// The real flow is behind a connected Seven — sendPatchToSlot refuses without
// one, and it should — so there was no way to LOOK at the four states without
// standing at the instrument. This opens them, live and clickable, and stays
// open: the script never resolves, so the harness never reaches its app.exit.
//
// IT WRITES NOTHING. No transfer, no MIDI, no library call — the whole point
// is that it can be run with the Seven unplugged, or plugged in and untouched.
//
// THE PANEL ITSELF IS NOT A COPY. Every lamp, cap and legend comes from
// SevenModalPanel, the same module the app uses, drawing the same
// assets/seven-panel.svg. What IS duplicated here is the small amount of modal
// wiring around it — which face shows, when NEXT wakes up — and that can drift
// from app.js's chooseDestination. So this is for LOOKING at the panel, and
// the assertions about behaviour live where they can fail:
// test/ui/scenarios/modal-panel-choose.js and hold-panel.js.
(async () => {
  const panelSvg = (opts) => SevenModalPanel.buildPanel(window.sevenAPI.getPanelSvg(), opts);

  // ── STATES 1-3: choosing ────────────────────────────────────────────────
  const chooser = SevenModal.open({
    title: 'Send to Seven',
    bodyHtml:
      '<p class="tx-step-name">Felt Piano</p>' +
      '<p class="tx-step-where mp-where">BANK 0 · PRESET 0</p>' +
      panelSvg({}) +
      '<div class="tx-slot mp-slot">' +
        '<div class="tx-face" data-face="pick">' +
          '<p class="tx-note">Select the target bank and preset, then ‘next’ below</p>' +
        '</div>' +
        '<div class="tx-face is-off" data-face="bank1">' +
          '<p class="tx-note">Bank 1 is reserved for factory presets</p>' +
        '</div>' +
      '</div>',
    confirmLabel: 'Next …',
    cancelLabel: 'Close',
    tone: 'is-transfer',
  });

  const svg = chooser.body.querySelector('svg.modal-panel');
  const where = chooser.body.querySelector('.mp-where');
  const pickFace = chooser.body.querySelector('[data-face="pick"]');
  const bank1Face = chooser.body.querySelector('[data-face="bank1"]');
  const nextBtn = chooser.body.parentElement.querySelector('.seven-modal-ok');

  let bank = null;
  let preset = null;
  const paint = () => {
    SevenModalPanel.setBank(svg, bank);
    SevenModalPanel.setPreset(svg, preset);
    SevenModalPanel.setStage(svg, preset ? 'chosen' : (bank ? 'preset' : 'bank'));
    where.textContent = `BANK ${bank || 0} · PRESET ${preset || 0}`;
    pickFace.classList.toggle('is-off', bank === 1);
    bank1Face.classList.toggle('is-off', bank !== 1);
    if (nextBtn) nextBtn.disabled = !(bank && bank !== 1 && preset);
  };
  paint();

  svg.addEventListener('click', (e) => {
    if (e.target.closest('[data-mp-bank]')) { bank = SevenModalPanel.nextBank(bank); paint(); return; }
    const hit = e.target.closest('[data-mp-hit]');
    if (!hit || !bank) return;
    const g = hit.closest('[data-mp-preset]');
    if (g) { preset = Number(g.dataset.mpPreset); paint(); }
  });

  const advanced = await chooser.action();
  chooser.close();
  if (!advanced) return new Promise(() => {});   // Close: stay open, do nothing

  // ── STATE 4: the hold ───────────────────────────────────────────────────
  //
  // The walk steps preset by preset through a bank, so the preview steps too:
  // the legend and the blinking light travel the row rather than being redrawn
  // somewhere else, which is the part a still picture cannot show.
  const hold = SevenModal.open({
    title: 'Send to Seven',
    bodyHtml:
      '<p class="tx-step-name">Felt Piano</p>' +
      '<p class="tx-step-hear">(you can hear it now)</p>' +
      '<p class="tx-step-where"></p>' +
      panelSvg({ brackets: false }) +
      '<div class="tx-slot">' +
        '<div class="tx-face" data-face="hold">' +
          '<p class="tx-note">Hold for 3 seconds.</p>' +
          '<p class="tx-note">Your Seven lights will run indicating the sound is saved.</p>' +
        '</div>' +
      '</div>',
    confirmLabel: 'Held it — next',
    denyLabel: 'Stop',
    cancelLabel: 'Stop',
    tone: 'is-transfer',
  });
  const holdSvg = hold.body.querySelector('svg.modal-panel');
  const holdWhere = hold.body.querySelector('.tx-step-where');
  let n = preset;
  let live = true;
  const point = () => {
    SevenModalPanel.setBank(holdSvg, bank);
    SevenModalPanel.setPreset(holdSvg, n);
    SevenModalPanel.setStage(holdSvg, 'hold');
    holdWhere.textContent = `Bank ${bank} · Preset ${n}`;
  };
  point();
  (async () => {
    while (live) {
      await ui.sleep(2600);
      n = (n % 8) + 1;
      if (live) point();
    }
  })();
  await hold.action();
  live = false;
  hold.close();
  return new Promise(() => {});
})()
