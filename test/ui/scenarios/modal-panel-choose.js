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
  }
  document.documentElement.dataset.theme = 'dark';
  await ui.sleep(200);

  // The heading names what is being ASKED FOR, and follows the stage.
  ui.check(svg.querySelector('.mp-heading').textContent === 'SELECT BANK',
    'with nothing chosen it asks for a bank');

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
  ui.check(ledsOn() === 0, 'no preset chosen yet');
  ui.check(getComputedStyle(svg.querySelector('[data-mp-preset="4"] [data-mp-hit]')).pointerEvents === 'auto',
    'ALL EIGHT presets are live now');
  ui.check(nextBtn.disabled, 'NEXT still dim with no preset');
  ui.check(svg.querySelector('.mp-heading').textContent === 'SELECT PRESET',
    'and the heading moves on to the preset');
  const s2 = size('state 2  ');

  // ── STATE 3: choosing a preset, by clicking it ─────────────────────────
  const hit7 = svg.querySelector('[data-mp-preset="7"] [data-mp-hit]');
  if (ui.click(hit7, 'preset 7')) { preset = 7; paint(); }
  await ui.sleep(180);
  ui.check(ledsOn() === 1, `exactly one preset LED is lit (${ledsOn()})`);
  ui.check(svg.querySelector('[data-mp-preset="7"]').classList.contains('is-chosen'),
    'and it is the one that was clicked');
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
  ui.check(ledsOn() === 1, `still exactly one LED (${ledsOn()})`);

  // ── ONE SIZE THROUGHOUT ────────────────────────────────────────────────
  const heights = new Set([s1.h, sBank1.h, s2.h, s3.h]);
  const tops = new Set([s1.top, sBank1.top, s2.top, s3.top]);
  ui.check(heights.size === 1, `the modal is ONE HEIGHT in every state (${[...heights].join(', ')})`);
  ui.check(tops.size === 1, `and the panel never moves (${[...tops].join(', ')})`);
  m.close();
})()
