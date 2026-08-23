// @env SEVEN_NO_DEVICE=1
//
// "NOT THIS FAKE BUTTON" — the hold screen answers a mistaken press.
//
// During the hold the on-screen preset is inert, and some players will press
// it anyway: it looks like a button, and they have been clicking things for
// the last two screens. The app can see that click, so it answers it.
//
// A CLICK, NOT A HOVER. A mouse crosses this panel constantly and usually
// means nothing; a line that changed every time the cursor passed would read
// as a fault rather than a hint (Daniel, 2026-08-22).
//
// THE CORRECTION STANDS; THE BLINK ENDS. Three blinks, then rest — a hint that
// ends is a hint, one that never stops is an error state. Press again and it
// blinks again, because a second press means the first answer was not read.
//
// The real walk needs a connected Seven, so the dialog is built from the same
// pieces and the same handler shape. That the WALK wires it is pinned from
// source in test/source-wiring.test.js — the two halves together.
(async () => {
  const DEFAULT_LINE = 'Your Seven lights will run indicating the sound is saved.';
  const MISTAKE_LINE = 'Hold the button on the Seven itself (not this fake button!)';
  const BLINK_MS = 3 * 520;

  const m = SevenModal.open({
    title: 'Send to Seven',
    bodyHtml:
      '<p class="tx-step-name">Tine Piano</p>'
      + '<p class="tx-step-where">Bank 3 · Preset 5</p>'
      + SevenModalPanel.buildPanel(window.sevenAPI.getPanelSvg(), { brackets: false })
      + '<div class="tx-slot"><div class="tx-face" data-face="hold">'
        + '<p class="tx-note">Hold for 3 seconds.</p>'
        + `<p class="tx-note tx-hold-line">${DEFAULT_LINE}</p>`
      + '</div></div>',
    confirmLabel: 'Held it — next', denyLabel: 'Stop', cancelLabel: 'Stop',
    tone: 'is-transfer',
  });
  await ui.sleep(400);
  const panel = m.body.querySelector('svg.modal-panel');
  const line = m.body.querySelector('.tx-hold-line');
  const dialog = m.body.closest('.seven-modal');
  ui.check(!!panel && !!line, 'the panel and the line are there');
  if (!panel || !line) { m.close(); return; }

  SevenModalPanel.setBank(panel, 3);
  SevenModalPanel.setPreset(panel, 5);
  SevenModalPanel.setStage(panel, 'hold');
  await ui.sleep(250);

  // The same handler the walk installs. Kept in step with app.js by the
  // source-wiring test, which pins the strings and the shape.
  let hintTimer = null;
  panel.addEventListener('click', (e) => {
    if (!e.target.closest('[data-mp-preset]')) return;
    line.textContent = MISTAKE_LINE;
    line.classList.add('tx-alarm-soft');
    line.classList.remove('tx-blink');
    void line.offsetWidth;
    line.classList.add('tx-blink');
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { line.classList.remove('tx-blink'); hintTimer = null; }, BLINK_MS);
  });

  const height = () => Math.round(dialog.getBoundingClientRect().height);
  const blinking = () => line.getAnimations().some((a) => a.playState === 'running');
  const hit = panel.querySelector('[data-mp-preset="3"] [data-mp-hit]');
  ui.check(!!hit, 'a preset on the picture to press');
  if (!hit) { m.close(); return; }

  // ── BEFORE ─────────────────────────────────────────────────────────────
  const h0 = height();
  ui.note(`default line, modal ${Math.round(dialog.getBoundingClientRect().width)}x${h0}`);
  ui.check(line.textContent === DEFAULT_LINE, 'it starts on the default line');
  ui.check(!blinking(), 'and nothing is blinking');

  // ── HOVER DOES NOTHING ─────────────────────────────────────────────────
  //
  // Asserted before the click, so a passing hover check cannot be the click's
  // leftovers.
  hit.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  hit.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
  hit.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
  await ui.sleep(400);
  ui.check(line.textContent === DEFAULT_LINE, 'hovering the fake button changes nothing');
  ui.check(!blinking(), 'and starts no blink');

  // ── THE MISTAKEN PRESS ─────────────────────────────────────────────────
  const bank = panel.dataset.bank;
  const preset = panel.dataset.preset;
  ui.click(hit, 'preset 3 on the picture');
  await ui.sleep(120);
  ui.note(`after the press: "${line.textContent}"`);
  ui.check(line.textContent === MISTAKE_LINE, 'the line answers the press');
  ui.check(blinking(), 'and it blinks');
  const h1 = height();
  ui.note(`corrected line, modal height ${h0} → ${h1}`);
  ui.check(h0 === h1, `the modal is the same height with either line (${h0} vs ${h1})`);

  // ── AND NOTHING ELSE HAPPENS ───────────────────────────────────────────
  //
  // The press must not retarget the walk or advance it. This is a picture.
  ui.check(panel.dataset.bank === bank && panel.dataset.preset === preset,
    `the destination is untouched (bank ${panel.dataset.bank}, preset ${panel.dataset.preset})`);
  ui.check(!!panel.querySelector('[data-mp-preset="5"].is-chosen')
    && !panel.querySelector('[data-mp-preset="3"].is-chosen'),
    'and preset 5 is still the one being held');
  ui.check(!!ui.$('.seven-modal'), 'the dialog is still open — a press advances nothing');

  // ── THE BLINK STOPS ON ITS OWN ─────────────────────────────────────────
  const stopped = await ui.waitFor(() => !blinking(),
    { timeout: BLINK_MS + 2000, step: 100, what: 'the blink to finish' });
  ui.check(stopped, 'the blink ends by itself — a hint, not an error state');
  ui.check(line.textContent === MISTAKE_LINE,
    'and the correction stands after it: what ended was the blinking');

  // ── PRESS AGAIN AND IT BLINKS AGAIN ────────────────────────────────────
  //
  // Restarting a finite animation needs the class off, a reflow, then on. Get
  // that wrong and a second press on an already-marked line changes nothing —
  // which is the failure this assertion exists for.
  ui.click(panel.querySelector('[data-mp-preset="6"] [data-mp-hit]'), 'preset 6, pressing again');
  await ui.sleep(120);
  ui.check(blinking(), 'a second press blinks again');
  ui.check(height() === h0, `still the same height (${height()})`);

  m.close();
})()
