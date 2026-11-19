// OPENING AN FX TRAY BRINGS IT INTO VIEW.
//
// Daniel, 18 Nov 2026: "similar to JUNO-Xtra, when I open an FX tray I should
// anchor down to that tray." Opening a section low in the pane put its
// contents below the fold, so the gesture appeared to do nothing.
//
// TWO THINGS WERE WRONG AND ONLY ONE WAS MISSING.
//
//   1. setSectionCollapsed has taken a { scroll: true } option all along, and
//      ONLY the panel-knob path passed it. Navigating to a section from the
//      instrument's drawing brought it into view; opening the very same
//      section by its own header did not.
//   2. The option's own check measured the section AT THAT INSTANT, which is
//      the COLLAPSED height — the body is still grid-template-rows: 0fr. A
//      header sitting visible near the bottom passed both tests and then
//      opened its contents off the end of the pane, which is precisely the
//      case being reported. It now measures the section it is ABOUT TO BE,
//      from `.fx-body-inner`'s scrollHeight, which is the content's natural
//      height even while its box is zero.
//
// WHAT IS ASSERTED IS THAT THE CONTENTS ARRIVE ON SCREEN, not that the header
// reaches any particular line. MEASURED FIRST (tray-probe, same day): with
// every section collapsed the pane does not scroll at all — seven headers fit
// in 531px with room over — so the only sections that can overflow when opened
// are the ones near the bottom, and the last one CANNOT reach the top of the
// pane because there is nothing below it to scroll against. An assertion that
// its header lands at the pane's top would be false for the very case the
// feature exists to fix.
//
// NO INSTRUMENT. This is layout, and nothing here asks the Seven anything, so
// it costs no hands and runs in an ordinary pass.
(async () => {
  const px = (n) => Math.round(n * 10) / 10;
  const detail = () => ui.$('#detail');
  // RE-QUERIED, NEVER HELD. The detail pane re-renders on its own schedule
  // while a patch loads, and a node captured before that is DETACHED after
  // it — which reports a rect of all zeros and a scrollHeight of 0 rather
  // than failing. The first version of this scenario held one across a sleep
  // and reported a section at y0 whose body would grow by 0px, both of which
  // are the signature of measuring something no longer in the document.
  const sec = (group) => ui.$(`#detail .fx-section[data-group="${group}"]`);
  const head = (group) => ui.$(`#detail .fx-section[data-group="${group}"] .fx-head`);
  const inner = (group) => ui.$(`#detail .fx-section[data-group="${group}"] .fx-body-inner`);

  await ui.openLibrary();
  await ui.sleep(400);
  const patchRow = ui.$('#library .lib-row.lib-patch, #library [data-file]');
  if (!patchRow) return { skipped: 'this library holds no patch to open' };
  ui.click(patchRow, 'a patch');
  // Long enough for the load AND any re-render that follows it. A short wait
  // here is what detached the node last time.
  await ui.sleep(2500);

  if (!ui.check(!!detail(), 'the detail pane is on screen')) return;
  const all = () => Array.from(detail().querySelectorAll('.fx-section'));
  if (!ui.check(all().length >= 5,
    `the effects chain rendered its sections (${all().length})`)) return;
  for (const s of all()) {
    if (!s.classList.contains('collapsed')) {
      ui.click(s.querySelector('.fx-head'), 'closing a section');
      await ui.sleep(400);
    }
  }
  detail().scrollTop = 0;
  await ui.sleep(300);

  // ---- 1. DANIEL'S ACTUAL GESTURE --------------------------------------
  //
  // "does it work when a bunch of trays are open and I open Reverb or Volume
  // at the bottom? Those often open but you can't see that the tray has been
  // opened unless you think to manually scroll down." (18 Nov 2026)
  //
  // So the state is not a cold start with everything collapsed — that was the
  // first version of this scenario and it is the weaker case. It is a pane
  // already made long by open trays, scrolled down to a header near the
  // bottom, which is then opened.
  const OPEN_FIRST = ['efx_veq', 'efx_fx1', 'efx_fx2', 'efx_amp'];
  for (const g of OPEN_FIRST) {
    if (!sec(g)) continue;
    // SCROLLED INTO REACH FIRST, so the setup cannot fail on its own account.
    // Without it this loop depends on the very behaviour under test: with the
    // fix removed, each tray it opens pushes the next header off the pane and
    // the setup's own clicks start landing on nothing. The run then reports
    // two failures for one cause, and the second one is noise.
    sec(g).scrollIntoView({ block: 'center' });
    await ui.sleep(200);
    ui.click(head(g), `opening ${g}`);
    await ui.sleep(450);
  }
  const TARGET = 'efx_rev';                 // Reverb, one of the two he named
  if (!ui.check(!!sec(TARGET), 'the Reverb section is there')) return;

  // Put its header low in the pane but still genuinely visible — his position
  // when he clicks it.
  const want = detail().getBoundingClientRect().bottom - 60;
  detail().scrollTop += sec(TARGET).getBoundingClientRect().top - want;
  await ui.sleep(400);

  const d0 = detail().getBoundingClientRect();
  const s0 = sec(TARGET).getBoundingClientRect();
  const grows = inner(TARGET).scrollHeight;
  const scrollBefore = detail().scrollTop;
  ui.note(`${OPEN_FIRST.length} trays already open; pane y${px(d0.top)}..${px(d0.bottom)},`
    + ` content ${px(detail().scrollHeight)} scrolled to ${px(scrollBefore)}`);
  ui.note(`${TARGET} sits at y${px(s0.top)} and its body will add ${px(grows)}px`
    + ` → y${px(s0.bottom + grows)}`);
  // THE PRECONDITION THIS SCENARIO RESTS ON. If the opened body already fitted
  // there would be nothing to scroll to, and a passing run would prove nothing
  // — the fixture would be incapable of expressing the thing under test.
  if (!ui.check(s0.top < d0.bottom && s0.bottom + grows > d0.bottom,
    'its header is visible but its contents would open below the fold')) return;
  // AND THE CLICK IS A REAL ONE. ui.click dispatches at the node, which ignores
  // whether anything could actually reach it — the trap that let an earlier
  // scenario pass with pointer-events: none. If the header is not what answers
  // at its own centre, this is not the gesture being reported.
  const hit = ui.hitTarget(head(TARGET));
  ui.check(!!hit && head(TARGET).contains(hit),
    'and a press at the header actually lands on it');

  ui.click(head(TARGET), 'opening the Reverb tray');
  await ui.sleep(1000);                     // the 180ms open + the smooth scroll

  const d1 = detail().getBoundingClientRect();
  const s1 = sec(TARGET).getBoundingClientRect();
  const el = detail();
  const maxScroll = el.scrollHeight - el.clientHeight;
  ui.note(`after opening: section y${px(s1.top)}..${px(s1.bottom)}, pane ends y${px(d1.bottom)};`
    + ` scrollTop ${px(scrollBefore)} → ${px(el.scrollTop)} of ${px(maxScroll)}`);

  ui.check(!sec(TARGET).classList.contains('collapsed'), 'the tray is open');
  ui.check(el.scrollTop > scrollBefore,
    `the pane scrolled to it (${px(scrollBefore)} → ${px(el.scrollTop)})`);
  // EITHER IT FITS, OR THE PANE IS AS FAR DOWN AS IT GOES. The last section
  // cannot reach the top of the pane — there is nothing below it to scroll
  // against — so "it fits" is the claim, and running out of scroll is the
  // honest alternative rather than a failure.
  const fits = s1.bottom <= d1.bottom + 2;
  const atEnd = Math.abs(el.scrollTop - maxScroll) <= 2;
  ui.check(fits || atEnd,
    `its contents are on screen (fits ${fits}, pane at its end ${atEnd})`);
  ui.check(s1.top >= d1.top - 2,
    'and it was not scrolled off the top in the process');

  // ---- 2. CLOSING DOES NOT SCROLL --------------------------------------
  //
  // Nothing arrived to look at, and a pane that jumps when you dismiss
  // something is worse than one that never moved.
  const beforeClose = detail().scrollTop;
  ui.click(head(TARGET), 'closing the Reverb tray');
  await ui.sleep(1000);
  ui.note(`scrollTop on close: ${px(beforeClose)} → ${px(detail().scrollTop)}`);
  // Closing shrinks the content, so the browser may clamp scrollTop to the new
  // maximum. That is the layout, not a scroll of ours — what must not happen
  // is the pane moving to some OTHER place.
  const clamped = detail().scrollHeight - detail().clientHeight;
  ui.check(Math.abs(detail().scrollTop - Math.min(beforeClose, clamped)) <= 2,
    'closing a tray does not scroll anywhere of its own accord');

  // ---- 3. A TRAY THAT ALREADY FITS DOES NOT MOVE THE PANE --------------
  //
  // The scroll is for sections that need it. The first section opens well
  // inside the pane, and a gesture that twitched the view every time would be
  // worse than the bug.
  detail().scrollTop = 0;
  await ui.sleep(300);
  const FIRST = all()[0].dataset.group;
  const fr = sec(FIRST).getBoundingClientRect();
  const fgrow = inner(FIRST).scrollHeight;
  const fd = detail().getBoundingClientRect();
  ui.note(`${FIRST} opens to y${px(fr.bottom + fgrow)} with the pane ending at y${px(fd.bottom)}`);
  if (ui.check(fr.bottom + fgrow <= fd.bottom,
    `${FIRST} fits without scrolling, so nothing should move`)) {
    ui.click(head(FIRST), 'opening the first tray');
    await ui.sleep(1000);
    ui.note(`scrollTop after opening ${FIRST}: ${px(detail().scrollTop)}`);
    ui.check(detail().scrollTop <= 1,
      'opening a tray that already fits leaves the pane where it was');
  }
})()
