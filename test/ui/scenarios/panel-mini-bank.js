// @env SEVEN_NO_DEVICE=1
//
// THE PANEL PICTURE HAS THE BANK CONTROL, in the place the instrument puts it.
//
// panel-mini drew the four bank lamps and eight preset caps, and nothing to
// change the bank with — it said WHICH bank was current and offered no way to
// choose one. That was right for a transfer, where the app moves the
// instrument itself (transfer-runner's selectBank), and wrong for any flow
// where the player chooses.
//
// The whole value of this picture is that pressing what you see matches
// pressing what is in front of you, so this asserts POSITION AND SIZE against
// the instrument's own arrangement rather than against a number someone typed:
//
//     BANK button  →  the four lamps  →  the eight presets
//
// and the bank cap is the same size as a preset cap, because on the panel it
// is one — 54x92 there, beside preset caps of 54x92.
(async () => {
  const m = SevenModal.open({
    title: 'Send to Seven',
    bodyHtml: '<p class="tx-step-name">Tine Piano</p>' + SevenPanelMini.render(3, 5),
    confirmLabel: 'Held it — next', cancelLabel: 'Stop', tone: 'is-transfer',
  });
  await ui.sleep(450);
  const svg = m.body.querySelector('svg.panel-mini');
  ui.check(!!svg, 'the panel picture renders');
  if (!svg) { m.close(); return; }

  const bank = svg.querySelector('.pm-bank');
  ui.check(!!bank, 'THE BANK CONTROL IS THERE');
  if (!bank) { m.close(); return; }

  const bankBox = bank.querySelector('.pm-bezel').getBoundingClientRect();
  const presetBox = svg.querySelector('.pm-btn[data-preset="1"] .pm-bezel').getBoundingClientRect();
  const lamp = svg.querySelectorAll('circle')[0].getBoundingClientRect();
  ui.note(`bank ${Math.round(bankBox.left)}..${Math.round(bankBox.right)}  `
    + `lamp ${Math.round(lamp.left)}..${Math.round(lamp.right)}  `
    + `preset1 ${Math.round(presetBox.left)}..${Math.round(presetBox.right)}`);

  // ── the instrument's own order, left to right ──────────────────────────
  ui.check(bankBox.right <= lamp.left,
    'the BANK button is left of the lamps, as on the panel');
  ui.check(lamp.right <= presetBox.left,
    'and the lamps are left of the presets');

  // ── the same cap, not a smaller one ────────────────────────────────────
  ui.check(Math.abs(bankBox.width - presetBox.width) < 1.5
    && Math.abs(bankBox.height - presetBox.height) < 1.5,
    `same size as a preset cap (${Math.round(bankBox.width)}x${Math.round(bankBox.height)} `
    + `vs ${Math.round(presetBox.width)}x${Math.round(presetBox.height)})`);

  // ── no LED, and that is faithful ───────────────────────────────────────
  //
  // The panel's bank button never lights: a bank is always current, so the
  // lamps indicate and the button does not. Adding one here would be inventing
  // behaviour the instrument does not have.
  ui.check(!bank.querySelector('.pm-led'),
    'it carries no LED, because the real one does not');
  ui.check(bank.querySelector('.pm-idx').textContent === 'BANK',
    'and it is labelled the way the panel labels it');

  // ── the presets still work as before ───────────────────────────────────
  ui.check(svg.querySelectorAll('.pm-btn[data-preset]').length === 8, 'all eight presets');
  ui.check(!!svg.querySelector('.pm-btn[data-preset="5"].pm-active'),
    'and the one to press is still singled out');
  m.close();
})()
