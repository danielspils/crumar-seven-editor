// @env SEVEN_NO_DEVICE=1
//
// AT MOST ONE NAVIGABLE LIST IS ON SCREEN. Across every tab, every transition,
// and during a backup run.
//
// THIS REPLACES arrow-ownership-open.js, which is retired rather than deleted.
// That scenario reproduced a state the two-tray layout allowed: a backup run
// left open BEHIND the collapsed library, still answering both arrow axes
// while the list you were watching did not move (Daniel, on 1.4.0,
// 2026-08-20). It existed because a comment in arrow-ownership.js had declared
// that state unreachable — the measurement behind the comment was right and
// the conclusion drawn from it was wrong, and the comment is why nobody
// looked.
//
// Four tabs make that state UNCONSTRUCTABLE, so its assertion would assert
// nothing. The RISK it encoded is not gone: it is the risk that two lists are
// live at once and the keyboard has to guess between them. Arrow ownership is
// now derived from the selected tab — one source of truth, deliberately not
// kept alongside the old focus-derived answer, because two answers to "who
// owns the arrows" IS the bug class. That derivation is only sound while the
// premise holds, and the premise is what this asserts.
//
// Offline on purpose: nothing here needs an instrument, and a scenario's
// starting state must be chosen rather than inherited.
(async () => {
  // THE LISTS, by the containers the arrow keys actually drive (app.js
  // focusedRegion -> moveLibrarySelection / the bank tabs and rows).
  const LISTS = [
    ['the Seven’s slot rows', '#patch-list .patch-row'],
    ['the library’s rows', '#library .lib-list .lib-row, #library .lib-list .lib-slot'],
  ];

  // VISIBLE MEANS IN THE LAYOUT, not merely styled quietly. offsetParent is
  // null for display:none and for anything inside it, which is the test that
  // matters here: a list that is only transparent or zero-height is still
  // clickable and still arrowable, and that is the state being ruled out.
  const liveLists = () => LISTS.filter(([, sel]) => {
    const el = document.querySelector(sel);
    return !!(el && el.offsetParent !== null);
  }).map(([name]) => name);

  const report = (where) => {
    const live = liveLists();
    ui.note(`${where}: ${live.length ? live.join(' + ') : 'no list'}`);
    ui.check(live.length <= 1, `${where}: at most one navigable list (${live.length})`);
    return live;
  };

  // ── every tab, and the transitions between them ─────────────────────────
  const order = ['seven', 'patches', 'setlists', 'backups', 'seven', 'backups', 'patches'];
  for (const tab of order) {
    await ui.selectTab(tab);
    report(`on ${tab}`);
    // AND THE ARROWS AGREE WITH THE SCREEN. The derivation is only honest if
    // the region it names is the one showing.
    const owned = tab === 'seven' ? 'the Seven’s slot rows' : 'the library’s rows';
    const live = liveLists();
    if (live.length === 1) {
      ui.check(live[0] === owned,
        `on ${tab}: the list on screen is the one the tab names (${live[0]})`);
    }
  }

  // ── MID-TRANSITION, not just at rest ────────────────────────────────────
  //
  // The two-tray swap animated one region open as the other closed, so for
  // ~360ms BOTH were on screen — which is exactly when a keypress had two
  // candidates. Sampled across a switch rather than after it, because "at
  // most one" is a claim about every frame, not about the resting state.
  await ui.selectTab('seven');
  const tab = document.querySelector('#top-tabs .top-tab[data-view="patches"]');
  tab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  let worst = 0;
  for (let i = 0; i < 12; i++) {
    worst = Math.max(worst, liveLists().length);
    await ui.sleep(30);
  }
  ui.note(`across the switch, the most lists live at once: ${worst}`);
  ui.check(worst <= 1, `no frame of the switch shows two lists (${worst})`);

  // ── DURING A BACKUP RUN ─────────────────────────────────────────────────
  //
  // The case the retired scenario was built from. A run opens inside the
  // Backups tab, so the question is whether opening one can put a second list
  // on screen — or leave the Seven's rows reachable behind it.
  await ui.selectTab('backups');
  const run = ui.$$('.lib-setlist[data-backup]')[0];
  if (!run) {
    ui.note('this library has no backup run to open — that half not checked');
  } else {
    ui.click(run.querySelector('.patch-name') || run, 'the newest backup run');
    await ui.waitFor(() => ui.$$('#library .lib-list .lib-row, #library .lib-list .lib-slot').length > 0,
      { what: "the run's rows" });
    report('inside a backup run');
    // AND THE SEVEN'S ROWS ARE NOT MERELY HIDDEN BEHIND IT. Querying them
    // directly is the point: the old failure was a list that was present and
    // reachable while something else was being looked at.
    const slots = ui.$('#patch-list .patch-row');
    ui.check(!slots || slots.offsetParent === null,
      'and the Seven’s rows are out of the layout, not merely covered');
  }

  // ── EVERY CHILD HAS A COLUMN ────────────────────────────────────────────
  //
  // THE PREVIEW'S LESSON, carried into the real lists. A Seven row there had
  // four children — number, name, sound, chevron — against a three-column
  // grid, and a grid puts the overflow on a new IMPLICIT row at column 1: the
  // chevron appeared on a second line at the row's far left rather than
  // overlapping or vanishing (Daniel, 14 Nov 2026).
  //
  // Stated as the property, not the numbers, because the two lists have
  // different shapes and will gain cells. A row may have FEWER children than
  // columns — the Seven's rows do, since renderer.js emits an empty
  // .patch-sound cell — and that is harmless. More children than columns is
  // the wrap.
  const gridRows = [
    ['seven', '#patch-list .patch-row'],
    ['patches', '#library .lib-list .lib-row'],
  ];
  for (const [tab, sel] of gridRows) {
    await ui.selectTab(tab);
    await ui.sleep(350);
    const row = ui.$(sel);
    if (!row) { ui.note(`${tab}: no row to measure`); continue; }
    const cs = getComputedStyle(row);
    if (cs.display !== 'grid') { ui.note(`${tab}: rows are ${cs.display}, not a grid`); continue; }
    const cols = cs.gridTemplateColumns.trim().split(/\s+/).length;
    const kids = row.children.length;
    const h = Math.round(row.getBoundingClientRect().height);
    ui.note(`${tab}: ${kids} children, ${cols} columns, row ${h}px`);
    ui.check(kids <= cols, `${tab}: every child has a column (${kids} in ${cols})`);
    ui.check(h <= 48, `${tab}: the row is ONE line (${h}px)`);
  }

  // ── AND THE FRESHNESS CAVEAT IS NOT A FIFTH TAB ─────────────────────────
  //
  // The other preview lesson. It sat inside the tab strip with margin-left
  // auto, bottom-aligned on the tabs' own line in the same dim uppercase, and
  // read as a fifth bank tab — the type was already the 10/700 micro-label, so
  // it was the shared LINE that did it, not the size.
  await ui.selectTab('seven');
  const fresh = ui.$('#bank-asof');
  const aTab = ui.$('#bank-tabs .bank-tab');
  ui.check(!!fresh, 'the freshness caveat is on screen');
  if (fresh && aTab) {
    const fs = getComputedStyle(fresh);
    const ts = getComputedStyle(aTab);
    const fr = fresh.getBoundingClientRect();
    const tr = aTab.getBoundingClientRect();
    ui.note(`caveat ${fs.fontSize}/${fs.letterSpacing} bottom ${Math.round(fr.bottom)}`
      + ` · bank tab ${ts.fontSize}/${ts.letterSpacing} bottom ${Math.round(tr.bottom)}`);
    ui.check(fresh.tagName.toLowerCase() !== 'button', 'it is not a button');
    ui.check(!fresh.closest('#bank-tabs'), 'and not inside the tab strip');
    ui.check(fr.top >= tr.bottom - 1,
      `it sits BELOW the tabs rather than on their line `
      + `(${Math.round(fr.top)} vs ${Math.round(tr.bottom)})`);
    ui.check(parseFloat(fs.fontSize) === 10,
      `at the type ladder's 10px micro-label (${fs.fontSize})`);
  }

  // Put the tray back where a bank-region scenario expects to find it.
  await ui.selectTab('seven');
  report('back on the Seven');
})()
