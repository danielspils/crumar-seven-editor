// @env SEVEN_NO_DEVICE=1
//
// #fresh-line DOES NOT MOVE WHEN THE CABLE DOES.
//
// "Back up instrument" lives in that line. It used to be `hidden` with
// nothing connected, so the line's contents changed between connected and
// disconnected — and the line sits directly under the eight bank rows, so
// everything below it moved too. Daniel, 18 Nov 2026: the same jumpiness
// taken out of the rest of the pane. It is disabled and present now.
//
// MEASURED IN BOTH STATES RATHER THAN REASONED ABOUT. This runs OFFLINE, so
// the disconnected half is the real path (SEVEN_NO_DEVICE lies in exactly one
// place, _findPort in seven-midi.js, and everything downstream is the code a
// player without an instrument runs). The connected half cannot be reached
// without a Seven, so it is SYNTHESISED HERE — the button is enabled by hand
// and the line re-measured, which answers the geometry question exactly:
// whether the line's box depends on the button's disabled state.
//
// WHAT THAT DOES AND DOES NOT PROVE, said plainly: it proves the layout is
// identical disabled and enabled, which is the whole of the change. It does
// not exercise a real connect, and it cannot — a claim about hardware needs
// hardware. The in-progress label swap is a different state again and is left
// to the hardware suite.
(async () => {
  const px = (n) => Math.round(n * 10) / 10;
  const box = (el) => (el ? el.getBoundingClientRect() : null);

  await ui.selectTab('seven');
  await ui.sleep(700);
  // Bank 2: Bank 1 is the factory's and its caveat is deliberately blank, so
  // the line has one fewer thing in it there — a difference that has nothing
  // to do with the button.
  const b2 = ui.$$('#bank-tabs .bank-tab')[1];
  if (b2) { ui.click(b2, 'bank 2'); await ui.sleep(600); }

  const line = ui.$('#fresh-line');
  const btn = ui.$('#backup-button');
  ui.check(!!line, '#fresh-line is on screen');
  ui.check(!!btn, 'the backup button is on screen');
  if (!line || !btn) return;

  // ---- DISCONNECTED, which is the real state this run is in -------------
  const read = (label) => {
    const l = box(line);
    const b = box(btn);
    const first = ui.$('#patch-list .patch-row');
    const caveat = ui.$('#bank-asof');
    const cs = getComputedStyle(btn);
    ui.note('');
    ui.note(`=== ${label} ===`);
    ui.note(`  button   hidden ${btn.hidden} · disabled ${btn.disabled}`
      + ` · "${(btn.textContent || '').trim()}"`);
    ui.note(`  its box  ${px(b.width)}x${px(b.height)} at x${px(b.left)} y${px(b.top)}`);
    ui.note(`  colour   ${cs.color} · border ${cs.borderTopColor} · cursor ${cs.cursor}`);
    ui.note(`  the line ${px(l.width)}x${px(l.height)} at y${px(l.top)}..${px(l.bottom)}`);
    ui.note(`  caveat   right ${caveat ? px(box(caveat).right) : '—'}`);
    ui.note(`  row 1    y${first ? px(box(first).top) : '—'}`);
    return {
      lineTop: px(l.top), lineH: px(l.height), lineBottom: px(l.bottom),
      btnW: px(b.width), btnH: px(b.height), btnLeft: px(b.left), btnTop: px(b.top),
      caveatRight: caveat ? px(box(caveat).right) : null,
      rowTop: first ? px(box(first).top) : null,
    };
  };

  const off = read('DISCONNECTED (the real state, SEVEN_NO_DEVICE=1)');
  ui.check(btn.hidden === false, 'the button is present with nothing connected');
  ui.check(btn.disabled === true, 'and disabled rather than hidden');
  ui.check(box(btn).width > 0, 'it occupies space, which is the point');

  // ---- AND THE SAME LINE WITH THE BUTTON LIVE ---------------------------
  //
  // Only `disabled` is changed: that is the one property the connection
  // render touches here, so flipping it reproduces the layout difference the
  // two states would have and nothing else.
  btn.disabled = false;
  await ui.sleep(260);
  const on = read('WITH THE BUTTON ENABLED (synthesised)');
  btn.disabled = off.btnW > 0 ? true : btn.disabled;
  await ui.sleep(120);

  // ---- THE ANSWER -------------------------------------------------------
  ui.note('');
  const same = [];
  const moved = [];
  for (const k of ['lineTop', 'lineH', 'lineBottom', 'btnW', 'btnH', 'btnLeft',
    'btnTop', 'caveatRight', 'rowTop']) {
    if (off[k] === on[k]) same.push(`${k} ${off[k]}`);
    else moved.push(`${k} ${off[k]} -> ${on[k]}`);
  }
  ui.note(`unchanged: ${same.join(' · ')}`);
  ui.note(`moved:     ${moved.length ? moved.join(' · ') : 'nothing'}`);
  ui.check(moved.length === 0,
    moved.length ? `the line changes geometry between the two states: ${moved.join('; ')}`
      : 'the line\'s geometry is identical disabled and enabled');

  // ---- AND IT LOOKS DISABLED --------------------------------------------
  //
  // A control that cannot be pressed and does not say so is worse than one
  // that is absent: it reads as broken rather than as unavailable.
  // COPIED OUT, NOT HELD. getComputedStyle returns a LIVE declaration, not a
  // snapshot: holding one across a state change and reading it afterwards
  // reports the NEW state twice. The first version of this did exactly that
  // and compared the disabled ink against itself, which passes trivially in
  // one direction and fails confusingly in the other.
  const inkOf = () => {
    const cs = getComputedStyle(btn);
    return { color: cs.color, border: cs.borderTopColor, cursor: cs.cursor };
  };
  btn.disabled = true;
  await ui.sleep(200);
  const dim = inkOf();
  btn.disabled = false;
  await ui.sleep(200);
  const live = inkOf();
  btn.disabled = true;
  ui.note('');
  ui.note(`disabled ink ${dim.color} / border ${dim.border} / ${dim.cursor}`);
  ui.note(`enabled  ink ${live.color} / border ${live.border} / ${live.cursor}`);
  ui.check(dim.color !== live.color,
    `the two states are told apart by ink (${dim.color} vs ${live.color})`);
  ui.check(dim.cursor === 'not-allowed',
    `and the pointer says it cannot be pressed (${dim.cursor})`);
  ui.check(live.cursor === 'pointer',
    `while the enabled one invites a press (${live.cursor})`);
})()
