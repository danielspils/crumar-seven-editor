// @env SEVEN_NO_DEVICE=1
//
// THE TRANSFER MODAL DOES NOT CHANGE SIZE AS THE WALK STEPS.
//
// Daniel ran a bank send where seven of eight presets already matched. It
// stored one and auto-advanced through the rest, and he could not follow what
// was happening — not because the app was silent, but because the modal
// shrank and grew between states and his eye could not hold onto the text.
// The message was there; the resizing hid it.
//
// The two message states used to be paragraphs that were `hidden` — display:
// none — on a skipped preset. Now both live in one grid cell, so the slot is
// the height of the taller and neither state can collapse into it.
//
// MEASURED, not asserted from CSS: a rule that is present but overridden
// passes a style check and still jumps on screen. That is not hypothetical in
// this repo — it happened to the instrument-picture slot the same week.
//
// The real walk needs a connected instrument, so this builds the modal from
// the same pieces. That the APP still builds it that way is checked from
// source in test/source-wiring.test.js — the two halves together.
(async () => {
  const body =
    '<p class="tx-step-name">Tine Piano</p>' +
    '<p class="tx-step-hear">(you can hear it now)</p>' +
    '<p class="tx-step-where">Bank 3 · Preset 5</p>' +
    SevenModalPanel.buildPanel(window.sevenAPI.getPanelSvg(), { brackets: false }) +
    '<div class="tx-slot">' +
      '<div class="tx-face" data-face="hold">' +
        '<p class="tx-note">Hold for 3 seconds.</p>' +
        '<p class="tx-note tx-hold-line">Hold the button on the Seven itself — this is a picture of it.</p>' +
      '</div>' +
      '<div class="tx-face is-off" data-face="skip">' +
        '<p class="tx-note tx-skip-line">Preset 5 already holds this patch.</p>' +
        '<p class="tx-note tx-aside">auto-advancing</p>' +
      '</div>' +
    '</div>';

  const m = SevenModal.open({
    title: 'Send to Seven', bodyHtml: body,
    confirmLabel: 'Held it — next', denyLabel: 'Stop', cancelLabel: 'Stop',
    tone: 'is-transfer',
  });
  await ui.sleep(400);
  const dialog = m.body.closest('.seven-modal');
  const hold = m.body.querySelector('[data-face="hold"]');
  const skip = m.body.querySelector('[data-face="skip"]');
  const art = m.body.querySelector('svg.modal-panel');
  if (art) {
    SevenModalPanel.setBank(art, 3);
    SevenModalPanel.setPreset(art, 5);
    SevenModalPanel.setStage(art, 'hold');
  }
  ui.check(!!dialog && !!hold && !!skip && !!art, 'the modal, both faces and the panel are there');
  if (!dialog) return;

  const face = (which) => {
    hold.classList.toggle('is-off', which !== 'hold');
    skip.classList.toggle('is-off', which !== 'skip');
  };
  const measure = async (which, label) => {
    face(which);
    await ui.sleep(250);
    const d = dialog.getBoundingClientRect();
    const a = art.getBoundingClientRect();
    ui.note(`${label}: modal ${Math.round(d.width)}x${Math.round(d.height)}  panel top ${Math.round(a.top)}`);
    return { w: Math.round(d.width), h: Math.round(d.height), top: Math.round(a.top) };
  };

  const holdState = await measure('hold', 'needs a hold');
  const skipState = await measure('skip', 'already holds');
  const backAgain = await measure('hold', 'and back    ');

  ui.check(holdState.h === skipState.h,
    `SAME HEIGHT in both states (${holdState.h} vs ${skipState.h})`);

  // AND THE SAME HEIGHT WHEN THE PICTURE ANSWERS A PRESS. That line carries
  // two different sentences — the standing instruction and the correction for
  // somebody holding the drawing — and it sits directly under the button they
  // have their finger on. A dialog that resized under them would be worse than
  // saying nothing.
  face('hold');
  await ui.sleep(200);
  const line = m.body.querySelector('.tx-hold-line');
  const before = Math.round(dialog.getBoundingClientRect().height);
  const wasText = line.textContent;
  // BOTH the sentence actually swapped in and a SHORT one. Today's correction
  // happens to wrap to two lines like the instruction it replaces, so it alone
  // proves nothing — remove the reserved height and it still passes. The short
  // string is the real hazard the reservation exists for, and it is the one
  // that makes this assertion able to fail (measured: it does).
  for (const text of ['Hold the button on the Seven itself (not this fake button!)', 'Hold it there.']) {
    line.textContent = text;
    await ui.sleep(250);
    const during = Math.round(dialog.getBoundingClientRect().height);
    ui.note(`line → "${text.slice(0, 24)}…"  height ${before} → ${during}`);
    ui.check(before === during,
      `the dialog does not move when the line changes (${before} vs ${during})`);
  }
  line.textContent = wasText;
  ui.check(holdState.w === skipState.w,
    `and the same width (${holdState.w} vs ${skipState.w})`);
  ui.check(holdState.top === skipState.top,
    `THE PANEL DOES NOT MOVE (${holdState.top} vs ${skipState.top})`);
  ui.check(backAgain.h === holdState.h, 'stepping back is stable too');

  // ── and each face says what it should ──────────────────────────────────
  face('skip');
  await ui.sleep(150);
  const skipText = skip.textContent.replace(/\s+/g, ' ').trim();
  ui.note(`skip face: "${skipText}"`);
  ui.check(/already holds this patch/.test(skipText),
    'a skipped preset says so — the same sentence as the subtitle, on purpose');
  ui.check(/auto-advancing/.test(skipText),
    'AND that the dialog is about to move on by itself');
  ui.check(getComputedStyle(hold).visibility === 'hidden'
    && getComputedStyle(hold).display !== 'none',
    'the hidden face keeps its space rather than being removed');

  face('hold');
  await ui.sleep(150);
  const holdText = hold.textContent.replace(/\s+/g, ' ').trim();
  ui.note(`hold face: "${holdText}"`);
  ui.check(/Hold for 3 seconds/.test(holdText) && /a picture of it/.test(holdText),
    'a preset that needs a hold shows the instructions in the same slot');

  m.close();
})()
