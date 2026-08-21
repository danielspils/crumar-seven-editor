// @env SEVEN_NO_DEVICE=1
//
// CLICKING A WARNING OPENS THE SOUNDS LIST. One branch of app.js's document
// router, matching three elements that all mean the same thing:
//
//   .badge-warn          the library row's "⚠ Not installed"
//   .sound-tag.is-warn   the setlist slot's inline warning
//   .warn-banner         the detail panel's banner
//
// A patch naming a sound this instrument lacks is exactly when the expansion
// list is worth reading, so the warning is the way in.
//
// NOT ROUTED THROUGH A REASON, deliberately. The obvious way to reach this
// branch today is to view a patch whose sound is not in the schema with nothing
// attached — which is Rich's bug, the one the pending badge fix removes. A test
// that got here that way would break when the fix lands, or worse, be
// "adjusted" to keep passing and end up defending the thing we fixed. That is
// test/library-store.test.js:924 with a deadline attached.
//
// The branch under test is "clicking a warning opens the modal". It has nothing
// to do with WHY the warning is on screen. So the warning is put on screen
// directly and clicked. Real element, real click, real delegated handler — and
// it survives the badge fix untouched, because the badge fix changes when a
// warning appears, not what clicking one does.
//
// That the RENDERERS emit these classes is a separate question, and a covered
// one: test/library-view.test.js renders a row with missing:true and asserts
// the badge. Neither test can drift without the other noticing.
(async () => {
  const modal = () => ui.$('.seven-modal.is-expansions');
  const closeModal = async () => {
    const x = modal() && modal().querySelector('.seven-modal-cancel, .seven-modal-ok');
    if (x) ui.click(x, 'close the Sounds modal');
    await ui.waitFor(() => !modal(), { timeout: 3000, what: 'the modal to close' });
  };

  // A place to put the warnings that is inside the app's own layout, so the
  // delegated listener on `document` sees them exactly as it sees real ones.
  const host = document.createElement('div');
  host.id = 'warn-probe';
  document.body.appendChild(host);

  const cases = [
    ['.badge-warn', '<span class="badge badge-warn">⚠ Not installed</span>'],
    ['.sound-tag.is-warn', '<span class="sound-tag is-warn">⚠</span>'],
    ['.warn-banner', '<div class="warn-banner">⚠ This sound is not installed</div>'],
  ];

  for (const [selector, html] of cases) {
    ui.check(!modal(), `no Sounds modal open before clicking ${selector}`);
    host.innerHTML = html;
    const el = host.firstElementChild;
    ui.check(!!el && el.matches(selector), `the ${selector} element is on screen`);

    ui.click(el, `the warning (${selector})`);
    const opened = await ui.waitFor(() => !!modal(), { timeout: 4000, what: `the Sounds modal from ${selector}` });
    ui.check(opened, `clicking ${selector} opens the Sounds list`);
    if (!opened) return;

    // It is the SOUNDS modal, not just any dialog — the class the guard in
    // openSoundsModal keys on, which is what makes "already open" detectable.
    ui.check(modal().classList.contains('is-expansions'),
      `and it is the expansions modal (${modal().className})`);

    await closeModal();
  }

  // Clicking something that is NOT a warning must not open it. Without this the
  // three checks above would pass just as well against a handler that opened
  // the modal on every click anywhere.
  host.innerHTML = '<span class="badge badge-modeled">Model</span>';
  ui.click(host.firstElementChild, 'an ordinary badge');
  await ui.sleep(500);
  ui.check(!modal(), 'an ordinary badge opens nothing');

  host.remove();
})()
