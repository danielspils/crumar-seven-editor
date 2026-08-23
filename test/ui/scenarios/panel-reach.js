// @env SEVEN_NO_DEVICE=1
//
// THE PANEL DIMS WHEN IT IS DESCRIBING SOMETHING YOU CANNOT SEE.
//
// Select a patch in Patches, switch to Backups, and the right-hand columns go
// on describing it — a panel about a patch that is nowhere in the list in
// front of you (Daniel, 2026-08-23).
//
// ONE RULE: is the row for the thing being described rendered right now. Tabs,
// bank tabs, search, clearing the search, picking a search result — none of
// those appear in the code, and this scenario is what says the single lookup
// really does cover them.
//
// WHAT IT IS NOT is as important. Dimming touches nothing on the instrument:
// the patch stays in the Seven's buffer and stays audible, and the columns go
// on REPORTING what is live. Dimmed does not mean frozen; it means you cannot
// drive it from here. The half of that which needs an instrument is in
// panel-cc-follow.js and skips without one; the half that does not is here.
(async () => {
  const cols = () => ui.$('#detail .detail-cols');
  const dimmed = () => !!cols() && cols().classList.contains('out-of-view');
  const overlay = () => ui.$('#detail .panel-reach');
  const tab = async (name, label) => {
    ui.click(await ui.waitEl(`.seg-btn[data-tab="${name}"]`, `the ${label} tab`), label);
    await ui.sleep(600);
  };

  await ui.openLibrary();
  await ui.sleep(400);
  await tab('patches', 'Patches');
  const row = await ui.waitClickable('#library .lib-row.lib-patch', 'a patch row');
  ui.check(!!row, 'the library has a patch to select');
  if (!row) return;
  const file = row.dataset.file;
  ui.click(row.querySelector('.patch-name') || row, 'a patch');
  await ui.waitFor(() => !!cols(), { timeout: 4000, what: 'the detail panel' });

  // ── SELECTED AND ON SCREEN: nothing dims ───────────────────────────────
  ui.check(!dimmed(), 'a patch you can see is not dimmed');
  ui.check(!overlay(), 'and there is no overlay over it');

  // ── ANOTHER TAB: it dims ───────────────────────────────────────────────
  await tab('backups', 'Backups');
  ui.check(dimmed(), 'switching tabs dims the columns — the patch is not in this list');
  ui.check(!!overlay(), 'and the overlay appears');
  if (overlay()) {
    const text = overlay().textContent.replace(/\s+/g, ' ').trim();
    ui.note(`overlay reads: "${text}"`);
    // THE WHOLE SENTENCE, verb included. This asserted only the tail, so the
    // verb was pinned by nothing at all — "activate" became "refresh" with the
    // test green either way (Daniel, 2026-08-23). Copy that nothing pins is
    // copy that drifts.
    ui.check(text === 'select patchto refresh sound engine & effects chain',
      `saying what to do, in the words that were chosen ("${text}")`);
    ui.check(!!overlay().querySelector('.reach-arrow'), 'with an arrow');
  }
  // ── THE NUDGE STOPS ON ITS OWN ─────────────────────────────────────────
  //
  // Asserted HERE, at the moment the state is entered, because that is the
  // only moment it plays. A few nudges toward the list, then rest: the same
  // rule as the hold screen's blink — a hint that ends is a hint, one that
  // never stops reads as an error state.
  const arrow = overlay() && overlay().querySelector('.reach-arrow');
  ui.check(!!arrow, 'the arrow is there');
  if (arrow) {
    const running = () => arrow.getAnimations().some((a) => a.playState === 'running');
    ui.note(`nudging on arrival: ${running()}`);
    ui.check(running(), 'it nudges when the panel goes out of reach');
    const stopped = await ui.waitFor(() => !running(),
      { timeout: 6000, step: 100, what: 'the nudge to finish' });
    ui.check(stopped, 'and it stops on its own');
  }

  // BOTH columns, because they describe the same patch.
  for (const col of ui.$$('#detail .detail-cols > .col')) {
    const o = Number(getComputedStyle(col).opacity);
    ui.check(o < 0.5, `a column is dimmed (opacity ${o})`);
  }

  // ── A DIMMED CONTROL DOES NOT ANSWER A CLICK ───────────────────────────
  //
  // The overlay is the barrier. The columns beneath it take no pointer events
  // at all, so a press cannot reach a control through a "select patch"
  // message — which would be worse than showing no message.
  const control = ui.$('#detail .detail-cols .fx-head, #detail .detail-cols .param-bar');
  ui.check(!!control, 'there is a control in the dimmed area to try');
  if (control) {
    ui.check(getComputedStyle(control).pointerEvents === 'none',
      'a dimmed control takes no pointer events');
    const r = control.getBoundingClientRect();
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    ui.note(`a click in the columns lands on <${at && at.className}>`);
    ui.check(!!at && !!at.closest('.panel-reach'),
      'and a press at its centre is caught by the overlay, not by anything behind it');
  }
  // The save control is in that column too, so it is covered by the same
  // barrier rather than by a rule of its own.
  const save = ui.$('#detail .detail-cols #save-live-btn');
  if (save) {
    ui.check(getComputedStyle(save).pointerEvents === 'none', 'so is the save button');
  } else {
    ui.note('no save button on this patch — nothing to save, so nothing to make inert');
  }

  // ── DIMMED IS NOT FROZEN ───────────────────────────────────────────────
  //
  // The panel repaints while dimmed; what it loses is the ability to be driven
  // from here. Proven by making it repaint — a bank tab is a render of the
  // whole panel — and checking the parameter rows are NEW NODES afterwards
  // rather than a frozen picture. That a live value from the instrument
  // arrives this way needs the cable and is asserted in panel-cc-follow.js.
  // A repaint, forced without changing what is selected: a bank tab is a
  // render of the whole panel. The tray has to be closed for one to be
  // reachable — with the library open, "On the Seven" is a collapsed strip.
  //
  // CLOSING THE TRAY UNDIMS, and that is deliberate. Hiding a whole region is
  // not "you are looking at a different list", and dimming there would put the
  // panel's controls out of reach whenever the tray moved — a behaviour
  // change, where this is a visual cue.
  await ui.closeLibrary();
  ui.check(!dimmed(), 'closing the tray undims: hiding the list is not looking at another one');
  // So dim it again the way the rule is about — a bank tab that is not the
  // selection's bank — and check the repaint under THAT.
  const before = ui.$('#detail .detail-cols .param');
  ui.check(!!before, 'a parameter row to watch');
  const otherBank = ui.$$('.bank-tab').find((b) => !b.classList.contains('active'));
  if (before && otherBank) {
    ui.click(await ui.waitClickable(otherBank, 'another bank tab'), 'another bank tab, forcing a repaint');
    await ui.sleep(600);
    const after = ui.$('#detail .detail-cols .param');
    ui.check(!!after, 'the parameters are still there');
    ui.check(after !== before, 'and they were REPAINTED — the panel is not frozen, only out of reach');
  }
  await ui.openLibrary();
  await ui.sleep(300);

  // ── BACK AGAIN: it undims ──────────────────────────────────────────────
  await tab('patches', 'Patches');
  ui.check(!dimmed(), 'switching back undims');
  ui.check(!overlay(), 'and the overlay goes');

  // ── SEARCH IT OUT OF THE LIST, then clear ──────────────────────────────
  // The field is behind a button until it is asked for.
  const opener = ui.$('#library [data-search-open]');
  if (opener) { ui.click(opener, 'the search control'); await ui.sleep(400); }
  const search = ui.$('#library .lib-search');
  ui.check(!!search, 'there is a search field');
  if (search) {
    search.value = 'zzzz-no-patch-is-called-this';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await ui.sleep(600);
    ui.check(!ui.$(`#library [data-file="${CSS.escape(file)}"]`),
      'the selected patch is filtered out of the list');
    ui.check(dimmed(), 'searching it out of view dims the panel');
    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await ui.sleep(600);
    ui.check(!dimmed(), 'and clearing the search undims it');
  }

  // ── SELECTING A RESULT FROM A SEARCH ───────────────────────────────────
  //
  // Search for something ELSE, so the selection is out of view and the panel
  // dimmed; then click a result. Loading it undims, because now the patch on
  // screen is the patch being described.
  if (search) {
    const other = ui.$$('#library .lib-row.lib-patch').map((r) => r.dataset.file).find((f) => f !== file);
    const name = other && ui.$(`#library [data-file="${CSS.escape(other)}"] .patch-name`);
    const term = name ? name.textContent.trim().slice(0, 4) : null;
    if (term) {
      search.value = term;
      search.dispatchEvent(new Event('input', { bubbles: true }));
      await ui.sleep(600);
      ui.note(`searched "${term}" · dimmed=${dimmed()}`);
      const hit = ui.$('#library .lib-row.lib-patch');
      if (hit) {
        ui.click(hit.querySelector('.patch-name') || hit, 'a search result');
        await ui.sleep(600);
        ui.check(!dimmed(), 'selecting a result undims — it IS what you are looking at');
      }
      search.value = '';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      await ui.sleep(400);
    }
  }
})()
