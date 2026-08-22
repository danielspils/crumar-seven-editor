'use strict';

// THE MODAL PANEL — the Seven's bank and preset row, cut from the drawing the
// dashboard already uses.
//
// It used to be a second drawing: src/panel-mini.js built its own SVG in JS,
// with its own coordinates, its own flatter caps and its own idea of what the
// panel contains. That is how it came to have the four bank lamps and NO BANK
// BUTTON for eleven days — nobody comparing the two noticed, because there was
// nothing that compared them.
//
// So there is one drawing now. This takes `assets/seven-panel.svg` — the same
// text the dashboard inlines — and returns the bank-and-presets part of it,
// cropped by viewBox. Everything the instrument has, this has, because it IS
// the instrument's drawing. Add a control to the panel and it appears here
// without anyone remembering to.
//
// WHAT IT CHANGES, and nothing else:
//
//   - IDS ARE PREFIXED. The dashboard is in the same document, and 65 ids
//     would otherwise exist twice — including the gradients the caps paint
//     with, where a duplicate silently repoints every reference.
//   - THE FACTORY LEGENDS GO. The panel is labelled TINES, REEDS, GRAND …
//     which are Bank 1's factory presets and are wrong for banks 2-4. The
//     NUMERALS are already in the drawing (`.lbl-num`), so this hides one and
//     keeps the other rather than overlaying anything.
//   - THE HIT TARGETS KEEP THEIR JOB. `.btn-hit` rects are already there,
//     transparent and sized to the bezel, because `button svg` in this app has
//     pointer-events: none and SVG children never receive clicks. They are
//     given data-attributes so the modal can tell which one was pressed.
//
// Pure and string-in string-out, so `npm test` can reach all of it: the
// renderer half of a panel cannot be unit-tested at all.

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SevenModalPanel = api;
})(typeof window !== 'undefined' ? window : null, function () {
  // The crop, in the full panel's own coordinates. Bank bezel starts at x 686;
  // preset 8's bezel ends at 1313. The labels sit at y 30 and 48, the bezels
  // span 56-148. A little margin on each side.
  // The crop, in the full panel's own coordinates. Bank bezel starts at x 686;
  // preset 8's bezel ends at 1313. The bezels span y 56-148 and the drawing's
  // own labels sit at y 30 and 48.
  //
  // It reaches ABOVE the artwork (y -26) for one reason: the stage heading.
  // The instrument has no such legend — this is the app asking a question, not
  // the panel saying something — so it lives in a strip of backdrop above the
  // drawing rather than on top of it.
  const VIEW = { x: 678, y: -26, w: 645, h: 168 };
  const PREFIX = 'mp-';

  const section = (svg, id) => {
    const open = svg.indexOf(`<g id="${id}">`);
    if (open < 0) return '';
    // Group nesting is one deep in this file; walk to the matching close.
    let i = open;
    let depth = 0;
    while (i < svg.length) {
      const nextOpen = svg.indexOf('<g', i + 1);
      const nextClose = svg.indexOf('</g>', i + 1);
      if (nextClose < 0) break;
      if (nextOpen >= 0 && nextOpen < nextClose) { depth += 1; i = nextOpen; continue; }
      if (depth === 0) return svg.slice(open, nextClose + 4);
      depth -= 1;
      i = nextClose;
    }
    return '';
  };

  const block = (svg, tag) => {
    const open = svg.indexOf(`<${tag}`);
    if (open < 0) return '';
    const close = svg.indexOf(`</${tag}>`, open);
    return close < 0 ? '' : svg.slice(open, close + tag.length + 3);
  };

  // Every id, and every reference to one. Missing the references would leave
  // the caps painting with a gradient that belongs to the other copy.
  const prefixIds = (markup) => markup
    .replace(/id="([^"]+)"/g, (_, id) => `id="${PREFIX}${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${PREFIX}${id})`)
    .replace(/href="#([^"]+)"/g, (_, id) => `href="#${PREFIX}${id}"`);

  // WHICH control a click landed on. The rects are already in the drawing; this
  // only labels them, so a click handler never has to know panel geometry.
  const tagHits = (markup) => markup
    .replace(/<rect class="btn-hit" data-hit="bank"([^>]*)\/>/,
      '<rect class="btn-hit" data-mp-bank$1/>')
    .replace(/<g id="mp-preset-(\d)">/g, '<g id="mp-preset-$1" data-mp-preset="$1">')
    .replace(/(<rect class="btn-hit")( x="\d+" y="56")/g, '$1 data-mp-hit$2');

  // The aria labels name Bank 1's factory presets ("Select preset 1 (Tines)"),
  // which is wrong in a modal choosing a destination in banks 2-4.
  const relabel = (markup) => markup
    .replace(/aria-label="Select preset (\d)[^"]*"/g, 'aria-label="Select preset $1"')
    .replace(/aria-label="Cycle preset bank"/, 'aria-label="Cycle bank"');

  function buildPanel(fullSvg, { bank = null, preset = null } = {}) {
    if (typeof fullSvg !== 'string' || !fullSvg) return '';
    // The same strip preload does for the dashboard: the SVG's @font-face
    // points at a path relative to assets/, which resolves against src/ once
    // inlined and 404s, masking the face the app supplies document-wide.
    const style = block(fullSvg, 'style').replace(/@font-face\s*{[^}]*}\s*/g, '');
    const defs = block(fullSvg, 'defs');
    // NOTHING IS LIT TO BEGIN WITH. The drawing ships with bank 1 and preset 1
    // `on`, because that is a plausible resting state for a picture of an
    // instrument — and wrong for a modal whose first stage is "nothing chosen
    // yet". The app does not pre-select a bank, so the panel must not imply
    // one (Daniel, 2026-08-22).
    const dark = (markup) => markup
      .replace(/class="led amber on"/g, 'class="led amber"')
      .replace(/class="led on"/g, 'class="led"')
      .replace(/class="btn btn-face on"/g, 'class="btn btn-face"');
    const parts = prefixIds(dark(section(fullSvg, 'sec-bank') + section(fullSvg, 'sec-presets')));
    const body = relabel(tagHits(parts));

    // THE PANEL'S OWN BACKDROP. `.panel-bg` is a single rect at the top of the
    // full drawing, outside both sections — so cropping to the sections
    // dropped it, and the panel's white legends ended up on the modal's own
    // background. Invisible in light mode, which is how it was found (Daniel,
    // 2026-08-22). Same class, so it takes the same colour as the dashboard's.
    const bg = `<rect class="panel-bg" x="${VIEW.x}" y="${VIEW.y}" `
      + `width="${VIEW.w}" height="${VIEW.h}" rx="6"/>`;
    // The question the modal is asking, in the panel's own label face. Centred
    // on the crop, in the strip above the artwork.
    const heading = `<text class="mp-heading" x="${VIEW.x + VIEW.w / 2}" `
      + `y="${VIEW.y + 20}" text-anchor="middle">SELECT BANK</text>`;

    return `<svg class="modal-panel" viewBox="${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}" `
      + 'width="100%" role="group" aria-label="Bank and preset on the Seven">'
      + prefixIds(style) + prefixIds(defs) + bg + heading + body
      + '</svg>';
  }

  // ---- state -----------------------------------------------------------
  //
  // Applied to a LIVE panel rather than re-rendered, so a change of bank or
  // preset cannot lose focus or restart an animation mid-choice.

  // 'bank' | 'preset' | 'chosen' | 'hold' — see the modal that drives it.
  function setStage(svg, stage) {
    if (!svg) return;
    for (const s of ['bank', 'preset', 'chosen', 'hold']) {
      svg.classList.toggle(`is-${s}`, s === stage);
    }
    // The heading names what is being asked for RIGHT NOW. Once a bank is
    // chosen the question is the preset, and it stays that way while the
    // player changes their mind — the lamps say what is chosen, this says
    // what to do.
    const h = svg.querySelector('.mp-heading');
    if (h) h.textContent = stage === 'bank' ? 'SELECT BANK' : 'SELECT PRESET';
  }

  // The lamps mirror the INSTRUMENT, including Bank 1. The player can put the
  // Seven on any bank from its own panel and this picture must agree with what
  // is in front of them — a lamp that refused to show Bank 1 would be lying
  // about the machine (Daniel, 2026-08-22). Whether Bank 1 can be a
  // destination is a separate question, answered by the modal.
  function setBank(svg, bank) {
    if (!svg) return;
    for (let b = 1; b <= 4; b += 1) {
      const led = svg.querySelector(`#${PREFIX}led-bank-${b}`);
      if (led) led.classList.toggle('on', b === bank);
    }
    svg.dataset.bank = bank == null ? '' : String(bank);
  }

  function setPreset(svg, preset) {
    if (!svg) return;
    for (let n = 1; n <= 8; n += 1) {
      const g = svg.querySelector(`[data-mp-preset="${n}"]`);
      if (!g) continue;
      const chosen = n === preset;
      g.classList.toggle('is-chosen', chosen);
      const led = g.querySelector('.led');
      // The LED is the instrument's own indicator, so it is what says which
      // preset is chosen — every other light goes out.
      if (led) led.classList.toggle('on', chosen);
      const face = g.querySelector('.btn-face');
      if (face) face.classList.toggle('on', chosen);
    }
    svg.dataset.preset = preset == null ? '' : String(preset);
  }

  // Cycles 1 → 2 → 3 → 4 → 1, exactly as the instrument's own BANK button
  // does. Bank 1 is included on purpose: the button on the Seven passes
  // through it, and a control that skipped it would behave differently from
  // the one beside the player's hands. It cannot be SENT to — the modal dims
  // its action and says why — but it can be landed on.
  const nextBank = (bank) => (bank == null ? 2 : (bank % 4) + 1);

  return { buildPanel, setStage, setBank, setPreset, nextBank, PREFIX, VIEW };
});
