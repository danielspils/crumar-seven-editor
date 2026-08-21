// @env SEVEN_NO_DEVICE=1
//
// TWO BRANCHES OF THE DETAIL PANEL'S CLICK ROUTER, neither of which any suite
// reached until now (app.js, the detailEl listener):
//
//   .fx-head   → collapse or expand that section
//   .fx-state  → the state pill, which is NOT a collapse control
//
// The pill sits inside the header it must not toggle. That is the whole reason
// the two share a router and the pill is tested first: a click landing on the
// pill and falling through to the header would collapse the section the user
// was trying to switch, and nothing else in the suite would notice.
//
// SEVEN_NO_DEVICE is declared, not assumed. Both assertions are about the
// no-instrument behaviour, and this repo's desk always has a Seven attached —
// so without the flag the pill would take its LIVE branch here and its OFFLINE
// branch on anyone else's machine, which is a test whose meaning depends on
// whose desk it runs on. The flag makes the state chosen instead of inherited.
(async () => {
  const section = () => ui.$('#detail .fx-section[data-group]');

  // A patch has to be on screen for the detail panel to render at all.
  await ui.openLibrary();
  await ui.sleep(400);
  ui.click(await ui.waitEl('.seg-btn[data-tab="patches"]', 'the Patches tab'), 'Patches');
  await ui.sleep(500);
  const row = ui.$('#library .lib-row.lib-patch');
  ui.check(!!row, 'the library has a patch to select — no patch, no detail panel, no test');
  if (!row) return;
  ui.click(row.querySelector('.patch-name') || row, 'a patch');
  await ui.waitFor(() => !!section(), { timeout: 4000, what: 'the detail panel' });

  // ── .fx-head: the header collapses its own section ──────────────────────
  const sec = section();
  const group = sec.dataset.group;
  const head = sec.querySelector('.fx-head');
  ui.check(!!head, `the section "${group}" has a header to click`);
  if (!head) return;

  const collapsed = () => section().classList.contains('collapsed');
  const before = collapsed();
  ui.click(head, `the "${group}" section header`);
  await ui.sleep(300);
  ui.check(collapsed() !== before,
    `clicking the header toggles the section (${before} → ${collapsed()})`);

  ui.click(head, 'the same header again');
  await ui.sleep(300);
  ui.check(collapsed() === before,
    `and toggles it back (${collapsed()}) — a header is a toggle, not a one-way close`);

  // ── .fx-state: the pill is its own control ──────────────────────────────
  const pill = ui.$('#detail .fx-section .fx-state');
  if (!pill) {
    // NOT a skip. Every engine section this app renders carries a switch pill,
    // so its absence means the render changed shape and this branch can no
    // longer be reached by the gesture it exists for.
    ui.check(false, 'no .fx-state pill is rendered — the branch is unreachable by its own gesture');
    return;
  }

  const openState = collapsed();
  ui.click(pill, 'the state pill');
  await ui.sleep(150);

  // THE THING THAT WOULD OTHERWISE GO UNNOTICED: the pill lives inside the
  // header, so a missing early return in the router collapses the section.
  ui.check(collapsed() === openState,
    `the pill does NOT collapse the section it sits in (${openState} → ${collapsed()})`);

  // …and with nothing attached it says so, rather than doing nothing at all.
  // A control that silently ignores you is the failure this replaced: reaching
  // for a knob IS the request to edit, so it answers every time.
  // The toast auto-hides, so read it as soon as it is SHOWN rather than
  // sleeping past it — RESULT_MS is short by design.
  const toastEl = () => ui.$('#undo-toast.shown');
  await ui.waitFor(() => !!toastEl(), { timeout: 3000, what: 'the toast' });
  const said = toastEl() ? toastEl().textContent.trim() : '';
  ui.note(`the pill answered: "${said}"`);
  ui.check(/connect the seven/i.test(said),
    `offline, the pill asks for the instrument instead of failing quietly ("${said}")`);
})()
