// @env SEVEN_NO_DEVICE=1
//
// CHOOSING A DESTINATION ON A PICTURE OF THE PANEL.
//
// The send flow used to be three screens: four generic bank buttons, then
// eight generic preset buttons, and only then a picture of the instrument —
// so the player chose with controls that looked nothing like the thing in
// front of them. The panel is the choosing surface now, drawn once and never
// redrawn; what changes is which parts are live and which are lit.
//
// The panel comes from assets/seven-panel.svg — the SAME drawing the dashboard
// inlines — so it cannot drift from the instrument the way a second
// hand-maintained copy did.
//
// Every control is proven by CLICKING IT and watching something happen. Both
// of this week's dead controls passed an existence check.
(async () => {
  const MP = SevenModalPanel;
  const panel = MP.buildPanel(window.sevenAPI.getPanelSvg(), {});
  const m = SevenModal.open({
    title: 'Send to Seven',
    bodyHtml: '<p class="tx-step-name">Sampled Vibraphone</p>'
      + '<p class="tx-step-where mp-where">BANK 0 · PRESET 0</p>' + panel
      + '<div class="tx-slot mp-slot">'
      + '<div class="tx-face" data-face="pick"><p class="tx-note">Select the target bank and preset, then ‘next’ below</p></div>'
      + '<div class="tx-face is-off" data-face="bank1"><p class="tx-note">Bank 1 is reserved for factory presets</p></div>'
      + '</div>',
    confirmLabel: 'Next …', cancelLabel: 'Close', tone: 'is-transfer',
  });
  await ui.sleep(450);

  const svg = m.body.querySelector('svg.modal-panel');
  const dialog = m.body.closest('.seven-modal');
  const nextBtn = m.body.parentElement.querySelector('.seven-modal-ok');
  const pickFace = m.body.querySelector('[data-face="pick"]');
  const bank1Face = m.body.querySelector('[data-face="bank1"]');
  const where = m.body.querySelector('.mp-where');
  ui.check(!!svg && !!nextBtn, 'the panel and the NEXT button are there');
  if (!svg) { m.close(); return; }

  const lampsOn = () => [...svg.querySelectorAll('[id^="mp-led-bank-"]')]
    .filter((l) => l.classList.contains('on')).map((l) => Number(l.id.slice(-1)));
  const ledsOn = () => [...svg.querySelectorAll('[data-mp-preset] .led')]
    .filter((l) => l.classList.contains('on')).length;

  let bank = null;
  let preset = null;
  const paint = () => {
    MP.setBank(svg, bank);
    MP.setPreset(svg, preset);
    MP.setStage(svg, preset ? 'chosen' : (bank ? 'preset' : 'bank'));
    where.textContent = `BANK ${bank || 0} · PRESET ${preset || 0}`;
    pickFace.classList.toggle('is-off', bank === 1);
    bank1Face.classList.toggle('is-off', bank !== 1);
    nextBtn.disabled = !(bank && bank !== 1 && preset);
  };
  paint();

  const size = (label) => {
    const d = dialog.getBoundingClientRect();
    const p = svg.getBoundingClientRect();
    ui.note(`${label}: modal ${Math.round(d.width)}x${Math.round(d.height)} · panel top ${Math.round(p.top)}`);
    return { h: Math.round(d.height), w: Math.round(d.width), top: Math.round(p.top) };
  };

  // ── THE PANEL HAS ITS OWN BACKDROP, IN BOTH THEMES ─────────────────────
  //
  // .panel-bg is one rect at the top of the full drawing, outside both of the
  // sections this crops — so it was dropped, and the panel's white legends
  // rendered onto the modal's own background. Invisible in light mode, which
  // is how it was found. The drawing's colours are literal in both themes:
  // it is a photograph of a machine, not part of the interface's palette.
  const themed = [];
  for (const theme of ['dark', 'light']) {
    document.documentElement.dataset.theme = theme;
    await ui.sleep(200);
    const bg = svg.querySelector('.panel-bg');
    const head = svg.querySelector('.mp-heading');
    ui.check(!!bg, `${theme}: the panel keeps its backdrop`);
    ui.check(!!head && head.getBoundingClientRect().height > 0, `${theme}: the heading is drawn`);
    if (bg && head) {
      const b = bg.getBoundingClientRect();
      const h = head.getBoundingClientRect();
      ui.check(h.top >= b.top - 1 && h.bottom <= b.bottom + 1,
        `${theme}: the heading sits ON the panel, not on the dialog behind it`);
    }
    ui.note(`${theme}: panel-bg ${getComputedStyle(bg).fill} · heading ${getComputedStyle(head).fill}`);

    // THE BRACKETS ARE THE OPPOSITE CASE. They belong to the interface, not to
    // the machine, so they must CHANGE with the theme where everything above
    // them stays literal. A bracket that kept one colour would be a mark from
    // the drawing that had wandered off it.
    const rule = svg.querySelector('.mp-bracket');
    const cap = svg.querySelector('[data-mp-cap="bank"]');
    ui.note(`${theme}: bracket ${getComputedStyle(rule).stroke} · caption ${getComputedStyle(cap).fill}`);
    themed.push(`${getComputedStyle(rule).stroke}|${getComputedStyle(cap).fill}`);
  }
  ui.check(themed[0] !== themed[1],
    `the brackets take the theme's own tokens, not the panel's (${themed.join('  vs  ')})`);
  document.documentElement.dataset.theme = 'dark';
  await ui.sleep(200);

  // The heading names what is being ASKED FOR, and follows the stage.
  ui.check(svg.querySelector('.mp-heading').textContent === 'SELECT BANK',
    'with nothing chosen it asks for a bank');
  const headBank = svg.querySelector('.mp-heading').getBoundingClientRect().left;

  // THE BRACKETS. Two rules under the panel, each captioned with what is
  // chosen in the cluster above it, and each SPANNING that cluster — a caption
  // centred under the wrong controls would point at the wrong thing.
  const capOf = (which) => svg.querySelector(`[data-mp-cap="${which}"]`).textContent;

  // NOTHING IS CUT OFF. The crop is a viewBox over a bigger drawing, so a
  // height that is one number too small silently slices the bottom off the
  // caps — which is exactly what shipped: the bezels end at y 148 in a crop
  // that stopped at 142, and the bank's own "4" went with them (Daniel,
  // 2026-08-22). Measured against the backdrop rather than eyeballed.
  {
    const panel = svg.querySelector('.panel-bg').getBoundingClientRect();
    const lowest = [
      ...svg.querySelectorAll('[data-mp-preset] .btn-bezel'),
      svg.querySelector('#mp-btn-bank'),
      ...svg.querySelectorAll('.lbl-bank-num'),
    ].filter(Boolean).map((el) => el.getBoundingClientRect().bottom);
    const worst = Math.max(...lowest);
    ui.note(`lowest drawn edge ${worst.toFixed(1)} · panel bottom ${panel.bottom.toFixed(1)}`);
    ui.check(worst <= panel.bottom,
      `every cap and lamp numeral finishes INSIDE the panel (${worst.toFixed(1)} <= ${panel.bottom.toFixed(1)})`);
  }
  ui.check(capOf('bank') === 'Bank: —' && capOf('preset') === 'Preset: —',
    `both brackets say nothing is chosen ("${capOf('bank')}" / "${capOf('preset')}")`);
  for (const which of ['bank', 'preset']) {
    const rule = svg.querySelectorAll('.mp-bracket')[which === 'bank' ? 0 : 1].getBoundingClientRect();
    const cap = svg.querySelector(`[data-mp-cap="${which}"]`).getBoundingClientRect();
    const panel = svg.querySelector('.panel-bg').getBoundingClientRect();
    ui.note(`${which} bracket ${Math.round(rule.left)}–${Math.round(rule.right)} · caption centre ${Math.round(cap.left + cap.width / 2)}`);
    ui.check(rule.top >= panel.bottom - 1,
      `the ${which} bracket sits BELOW the panel, not on it`);
    ui.check(cap.left + cap.width / 2 > rule.left && cap.left + cap.width / 2 < rule.right,
      `and its caption is centred inside its own bracket`);
    ui.check(cap.top >= rule.bottom - 1, `with the caption under the rule`);
  }
  {
    const bankRule = svg.querySelectorAll('.mp-bracket')[0].getBoundingClientRect();
    const presetRule = svg.querySelectorAll('.mp-bracket')[1].getBoundingClientRect();
    const bankBtn = svg.querySelector('[data-mp-bank]').getBoundingClientRect();
    const p1 = svg.querySelector('[data-mp-preset="1"] [data-mp-hit]').getBoundingClientRect();
    const p8 = svg.querySelector('[data-mp-preset="8"] [data-mp-hit]').getBoundingClientRect();
    ui.check(bankRule.left <= bankBtn.left + 1 && bankRule.right < p1.left,
      'the bank bracket spans the bank control and stops short of preset 1');
    ui.check(presetRule.left <= p1.left + 1 && presetRule.right >= p8.right - 1,
      'the preset bracket spans presets 1 through 8');
    ui.check(bankRule.right < presetRule.left, 'and the two do not touch');
  }

  // ── STATE 1: nothing chosen ────────────────────────────────────────────
  ui.check(lampsOn().length === 0, `no bank lamp is lit before anything is chosen (${lampsOn()})`);
  ui.check(ledsOn() === 0, `and no preset LED (${ledsOn()})`);
  ui.check(where.textContent === 'BANK 0 · PRESET 0', `it claims no destination: "${where.textContent}"`);
  ui.check(nextBtn.disabled, 'NEXT is dim');
  const s1 = size('state 1  ');

  // The presets do not answer a click yet — proven by clicking one.
  const hit4 = svg.querySelector('[data-mp-preset="4"] [data-mp-hit]');
  ui.check(!!hit4, 'preset 4 has a hit target');
  const before = { lamps: lampsOn().length, leds: ledsOn() };
  hit4.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await ui.sleep(150);
  ui.check(ledsOn() === before.leds,
    'clicking a preset with no bank chosen does nothing');
  ui.check(getComputedStyle(hit4).pointerEvents === 'none',
    'because the row is not live yet');

  // ── THE BANK CONTROL CYCLES, by real clicks ────────────────────────────
  const bankHit = svg.querySelector('[data-mp-bank]');
  ui.check(getComputedStyle(bankHit).pointerEvents === 'auto', 'the BANK control is live');
  const seen = [];
  for (let i = 0; i < 5; i += 1) {
    if (!ui.click(bankHit, 'the BANK control')) break;
    bank = MP.nextBank(bank);
    paint();
    await ui.sleep(120);
    seen.push(lampsOn().join('') || '-');
  }
  ui.note(`five presses → lamps ${seen.join(' → ')}`);
  ui.check(seen.join(',') === '2,3,4,1,2',
    `it cycles 2 → 3 → 4 → 1 → 2, mirroring the instrument's own button (${seen.join(' → ')})`);

  // ── BANK 1 IS NOT A DESTINATION ────────────────────────────────────────
  bank = 1; preset = 5; paint(); await ui.sleep(150);
  ui.check(lampsOn().join('') === '1', 'Bank 1 lights, because the instrument can be there');
  ui.check(getComputedStyle(bank1Face).visibility === 'visible'
    && getComputedStyle(pickFace).visibility === 'hidden',
    'and the message says it is reserved for factory presets');
  ui.check(nextBtn.disabled, 'NEXT stays dim on Bank 1, even with a preset chosen');
  const sBank1 = size('bank 1   ');

  // ── STATE 2: a bank chosen wakes the presets ───────────────────────────
  bank = 3; preset = null; paint(); await ui.sleep(150);
  ui.check(lampsOn().join('') === '3', `lamp 3 lit (${lampsOn()})`);
  // THE LEDS ARE THE OFFER. Eight lit lights are the eight things that can
  // be picked — which is why choosing one puts them ALL out below.
  ui.check(ledsOn() === 8, `all eight preset LEDs light — these are the choices (${ledsOn()})`);
  ui.check(getComputedStyle(svg.querySelector('[data-mp-preset="4"] [data-mp-hit]')).pointerEvents === 'auto',
    'ALL EIGHT presets are live now');
  ui.check(nextBtn.disabled, 'NEXT still dim with no preset');
  ui.check(svg.querySelector('.mp-heading').textContent === 'SELECT PRESET',
    'and the heading moves on to the preset');
  // …and it MOVES, from over the bank control to over the preset row. Where
  // the words are is half of what they say.
  const headAt = () => svg.querySelector('.mp-heading').getBoundingClientRect();
  const headPreset = headAt().left;
  ui.check(headPreset > headBank + 40,
    `the heading moved right, over the preset row (${Math.round(headBank)} → ${Math.round(headPreset)})`);
  ui.check(capOf('bank') === 'Bank: 3', `the bank bracket is captioned "${capOf('bank')}"`);
  ui.check(capOf('preset') === 'Preset: —', `and the preset bracket waits: "${capOf('preset')}"`);
  const s2 = size('state 2  ');

  // ── STATE 3: choosing a preset, by clicking it ─────────────────────────
  const hit7 = svg.querySelector('[data-mp-preset="7"] [data-mp-hit]');
  if (ui.click(hit7, 'preset 7')) { preset = 7; paint(); }
  await ui.sleep(180);
  // Every LED goes out: the offer is over, and the raised outlined CAP is
  // what now says which one was taken.
  ui.check(ledsOn() === 0, `the offer is withdrawn — all LEDs out (${ledsOn()})`);
  ui.check(svg.querySelector('[data-mp-preset="7"]').classList.contains('is-chosen'),
    'and it is the one that was clicked');
  ui.check(svg.querySelector('[data-mp-preset="7"] .btn-face').classList.contains('on'),
    'the cap carries the choice');
  ui.check(capOf('preset') === 'Preset: 7', `the preset bracket follows: "${capOf('preset')}"`);
  ui.check(where.textContent === 'BANK 3 · PRESET 7', `the readout follows: "${where.textContent}"`);
  ui.check(!nextBtn.disabled, 'NEXT wakes up once both are chosen');
  const s3 = size('state 3  ');

  // ── HOVER STAYS LIVE after a preset is chosen ──────────────────────────
  ui.check(getComputedStyle(hit4).pointerEvents === 'auto',
    'the other presets still answer — the player may change their mind');
  ui.check(getComputedStyle(bankHit).pointerEvents === 'auto',
    'and so does the bank control');
  if (ui.click(hit4, 'preset 4, changing their mind')) { preset = 4; paint(); }
  await ui.sleep(180);
  ui.check(svg.querySelector('[data-mp-preset="4"]').classList.contains('is-chosen')
    && !svg.querySelector('[data-mp-preset="7"]').classList.contains('is-chosen'),
    'choosing another extinguishes the first');
  ui.check(capOf('preset') === 'Preset: 4', `and so does the caption: "${capOf('preset')}"`);

  // ── ONE SIZE THROUGHOUT ────────────────────────────────────────────────
  const heights = new Set([s1.h, sBank1.h, s2.h, s3.h]);
  const tops = new Set([s1.top, sBank1.top, s2.top, s3.top]);
  ui.check(heights.size === 1, `the modal is ONE HEIGHT in every state (${[...heights].join(', ')})`);
  ui.check(tops.size === 1, `and the panel never moves (${[...tops].join(', ')})`);
  m.close();
})()
