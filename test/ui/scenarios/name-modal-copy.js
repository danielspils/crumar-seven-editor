// @env SEVEN_NO_DEVICE=1
//
// THE NAMING MODAL SAYS WHERE THE PATCH GOES, and its button says what it does.
//
//     Save to Patches tab
//     [ Felt Piano                 ]
//     [ Save as new patch ]
//
// It read "Save as new patch" over a bare "Save": the heading described the
// thing without saying where it landed, and the button did not say what kind
// of save it was. This modal is reached from a backup record, from a bank slot
// with no file behind it, and from the send flow's "Save edits to new patch" —
// all three end in the library's Patches tab, so the heading can name it
// (Daniel, 2026-08-23).
//
// "Patches" is emphasised. A title is already 700 weight so emphasis cannot be
// weight; it takes --amber, which is what the ACTIVE TAB LABEL wears — the
// heading names a tab the player can go and click, and the word looks like the
// thing it names.
//
// EMPHASIS IS NOT MARKUP. The modal escapes its title on purpose, because
// patch names go through there elsewhere. The caller names one WORD and
// askForName splits the title around it, escaping all three pieces — so the
// last check here is the one that matters most: a title carrying something
// tag-shaped comes out as text.
(async () => {
  const open = (opts) => SevenModal.open({
    bodyHtml: '<input class="name-input" type="text" spellcheck="false" value="Felt Piano">'
      + '<p class="name-taken" hidden></p>',
    cancelLabel: 'Cancel', ...opts,
  });
  // The same split askForName does. Asserted through a copy of it because the
  // real one is inside app.js's closure; that the CALLER passes this title and
  // this label is pinned in test/source-wiring.test.js.
  const esc = (t) => { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; };
  const emphasise = (el, title, em) => {
    const at = title.indexOf(em);
    if (at >= 0) el.innerHTML = esc(title.slice(0, at)) + `<strong>${esc(em)}</strong>` + esc(title.slice(at + em.length));
  };

  const m = open({ title: 'Save to Patches tab', confirmLabel: 'Save as new patch' });
  await ui.sleep(400);
  const dialog = m.body.closest('.seven-modal');
  const titleEl = dialog.querySelector('.seven-modal-title');
  const okBtn = dialog.querySelector('.seven-modal-ok');
  emphasise(titleEl, 'Save to Patches tab', 'Patches');
  await ui.sleep(200);

  const box = () => {
    const r = dialog.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  };
  const after = box();
  ui.note(`heading "${titleEl.textContent}" · button "${okBtn.textContent.trim()}" · modal ${after.w}x${after.h}`);

  ui.check(titleEl.textContent === 'Save to Patches tab',
    `the heading names where it goes ("${titleEl.textContent}")`);
  ui.check(okBtn.textContent.trim() === 'Save as new patch',
    `and the button carries the action ("${okBtn.textContent.trim()}")`);

  // ── "Patches" IS EMPHASISED, and visibly so ────────────────────────────
  const em = titleEl.querySelector('strong');
  ui.check(!!em && em.textContent === 'Patches', 'the word "Patches" is the emphasised one');
  if (em) {
    const emColour = getComputedStyle(em).color;
    const titleColour = getComputedStyle(titleEl).color;
    ui.note(`emphasis ${emColour} against title ${titleColour}`);
    ui.check(emColour !== titleColour,
      `it reads differently from the rest of the heading (${emColour} vs ${titleColour})`);
  }

  // ── THE BOX DOES NOT MOVE ──────────────────────────────────────────────
  //
  // Measured against the old copy rather than asserted from a number typed
  // here: the button's label is more than twice as long and the heading is
  // longer, and neither may change the dialog.
  m.close();
  await ui.sleep(250);
  const old = open({ title: 'Save as new patch', confirmLabel: 'Save' });
  await ui.sleep(400);
  const oldDialog = old.body.closest('.seven-modal');
  const oldBtn = oldDialog.querySelector('.seven-modal-ok').getBoundingClientRect();
  const oldBox = oldDialog.getBoundingClientRect();
  ui.note(`old copy: modal ${Math.round(oldBox.width)}x${Math.round(oldBox.height)} · button ${Math.round(oldBtn.width)}px wide`);
  ui.check(Math.round(oldBox.width) === after.w && Math.round(oldBox.height) === after.h,
    `the longer copy does not change the box (${Math.round(oldBox.width)}x${Math.round(oldBox.height)} vs ${after.w}x${after.h})`);
  old.close();
  await ui.sleep(250);

  // ── A TITLE IS NEVER MARKUP ────────────────────────────────────────────
  //
  // The reason `em` is a word rather than an HTML string. Patch names reach
  // titles elsewhere, and a file called "<img src=x onerror=…>" must arrive as
  // characters on screen.
  const nasty = 'Save <img src=x onerror="1"> tab';
  const m3 = open({ title: nasty, confirmLabel: 'Save as new patch' });
  await ui.sleep(350);
  const t3 = m3.body.closest('.seven-modal').querySelector('.seven-modal-title');
  emphasise(t3, nasty, '<img src=x onerror="1">');
  await ui.sleep(150);
  ui.note(`hostile title renders as: "${t3.textContent}"`);
  ui.check(!t3.querySelector('img'), 'a tag in a title stays text, even inside the emphasis');
  ui.check(t3.textContent === nasty, 'and every character survives');
  m3.close();
})()
