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
  //
  // AND IT REACHES BELOW THE ARTWORK for the two brackets — a rule under the
  // bank cluster and another under the preset row, each captioned with what is
  // chosen there. They are drawn INSIDE this SVG, in the panel's own
  // coordinates, because their whole job is to line up with specific controls;
  // a caption in HTML beneath the picture would go crooked the moment the
  // drawing moved a bezel (Daniel's drawing, 2026-08-22).
  const VIEW = { x: 678, y: -26, w: 645, h: 231 };
  const PANEL_H = 184;              // the dark backdrop: y -26 → 158
  const PREFIX = 'mp-';

  // WHERE EACH CLUSTER IS, in the drawing's coordinates. The bank control's
  // bezel starts at x 686 and its lamp numerals end around 810; preset 1's
  // bezel starts at 832 and preset 8's ends at 1313. Everything that has to
  // point AT a cluster — the heading above, the bracket below — is positioned
  // from these, so the two can never disagree about where a cluster is.
  const CLUSTER = {
    bank: { x1: 682, x2: 816, cx: 749 },
    preset: { x1: 828, x2: 1317, cx: 1072.5 },
  };
  const BRACKET = { y: 172, tick: 10, caption: 200 };

  // Preset n's centre line, from the drawing: preset 1's numeral sits at 859
  // and each one after it is 61 further along. The HOLD legend is placed and
  // moved with this, so it lands ON the button rather than near it.
  const PRESET_PITCH = 61;
  const PRESET_CX = (n) => 859 + (n - 1) * PRESET_PITCH;

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
  //
  // A PREFIX PER COPY, rather than closing over the constant. One panel in the
  // document can use the module's own; the backup grid puts FOUR in, and four
  // copies of `mp-cap-grad` do not fail loudly — `url(#mp-cap-grad)` resolves
  // document-wide to whichever came first, so every reference in rows 2-4
  // silently points into row 1. Each row gets its own namespace instead.
  const prefixIds = (markup, prefix = PREFIX) => markup
    .replace(/id="([^"]+)"/g, (_, id) => `id="${prefix}${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${prefix}${id})`)
    .replace(/href="#([^"]+)"/g, (_, id) => `href="#${prefix}${id}"`);

  // NOTHING IS LIT TO BEGIN WITH. The drawing ships with bank 1 and preset 1
  // `on`, because that is a plausible resting state for a picture of an
  // instrument — and wrong for a modal whose first stage is "nothing chosen
  // yet", and wrong for a backup that has not read a slot yet.
  const dark = (markup) => markup
    .replace(/class="led amber on"/g, 'class="led amber"')
    .replace(/class="led on"/g, 'class="led"')
    .replace(/class="btn btn-face on"/g, 'class="btn btn-face"');

  // WHICH control a click landed on. The rects are already in the drawing; this
  // only labels them, so a click handler never has to know panel geometry.
  const tagHits = (markup) => markup
    .replace(/<rect class="btn-hit" data-hit="bank"([^>]*)\/>/,
      '<rect class="btn-hit" data-mp-bank tabindex="0"$1/>')
    .replace(/<g id="mp-preset-(\d)">/g, '<g id="mp-preset-$1" data-mp-preset="$1">')
    .replace(/(<rect class="btn-hit")( x="\d+" y="56")/g, '$1 data-mp-hit$2');

  // The aria labels name Bank 1's factory presets ("Select preset 1 (Tines)"),
  // which is wrong in a modal choosing a destination in banks 2-4.
  const relabel = (markup) => markup
    .replace(/aria-label="Select preset (\d)[^"]*"/g, 'aria-label="Select preset $1"')
    .replace(/aria-label="Cycle preset bank"/, 'aria-label="Cycle bank"');

  // `brackets` is true for both, false for neither, or a list — ['bank'] for
  // a whole-bank send, where the bank is the only thing being chosen and a
  // second empty caption would be pointing at a question nobody asked.
  function buildPanel(fullSvg, { brackets = true } = {}) {
    if (typeof fullSvg !== 'string' || !fullSvg) return '';
    // The same strip preload does for the dashboard: the SVG's @font-face
    // points at a path relative to assets/, which resolves against src/ once
    // inlined and 404s, masking the face the app supplies document-wide.
    const style = block(fullSvg, 'style').replace(/@font-face\s*{[^}]*}\s*/g, '');
    const defs = block(fullSvg, 'defs');
    // The app does not pre-select a bank, so the panel must not imply one
    // (Daniel, 2026-08-22) — see `dark` above.
    const parts = prefixIds(dark(section(fullSvg, 'sec-bank') + section(fullSvg, 'sec-presets')));
    const body = relabel(tagHits(parts));

    // THE PANEL'S OWN BACKDROP. `.panel-bg` is a single rect at the top of the
    // full drawing, outside both sections — so cropping to the sections
    // dropped it, and the panel's white legends ended up on the modal's own
    // background. Invisible in light mode, which is how it was found (Daniel,
    // 2026-08-22). Same class, so it takes the same colour as the dashboard's.
    const bg = `<rect class="panel-bg" x="${VIEW.x}" y="${VIEW.y}" `
      + `width="${VIEW.w}" height="${PANEL_H}" rx="6"/>`;
    // The question the modal is asking, in the panel's own label face — and it
    // sits OVER THE CLUSTER IT IS ASKING ABOUT rather than over the middle of
    // the panel. Where the words are is half of what they say.
    const heading = `<text class="mp-heading" x="${CLUSTER.bank.cx}" `
      + `y="${VIEW.y + 20}" text-anchor="middle">SELECT BANK</text>`;

    // The brackets. A RULE ALONG THE BOTTOM WITH ITS TICKS RISING, so the
    // bracket embraces the controls ABOVE it — which are what it is describing.
    // Ticks the other way point at the caption, which needs no pointing at:
    // it is directly beneath and it is the only thing there (Daniel,
    // 2026-08-22). Same rule governs the HOLD bracket, pointing the other way
    // for the same reason.
    const rule = ({ x1, x2 }) => `<path class="mp-bracket" d="M${x1} ${BRACKET.y} `
      + `L${x1} ${BRACKET.y + BRACKET.tick} L${x2} ${BRACKET.y + BRACKET.tick} `
      + `L${x2} ${BRACKET.y}"/>`;
    const caption = (which, text) => `<text class="mp-cap" data-mp-cap="${which}" `
      + `x="${CLUSTER[which].cx}" y="${BRACKET.caption}" text-anchor="middle">${text}</text>`;
    // THE BRACKETS BELONG TO CHOOSING. They caption what has been picked so
    // far, so a screen where nothing is being picked — the hold — leaves them
    // out rather than showing two empty captions. Left out, the crop ends at
    // the panel and the picture is shorter by exactly that strip.
    const want = brackets === true ? ['bank', 'preset']
      : (Array.isArray(brackets) ? brackets : []);
    const captions = !want.length ? '' : '<g class="mp-brackets" aria-hidden="true">'
      + want.map((w) => rule(CLUSTER[w])
        + caption(w, `${w === 'bank' ? 'Bank' : 'Preset'}: —`)).join('')
      + '</g>';

    // THE HOLD LEGEND, in the panel's own CLAVI TABS yellow and bracketed the
    // way the panel brackets a legend: word, rule, then the thing itself. It
    // is drawn over preset 1 and TRANSLATED to the one being held, so stepping
    // through a bank SLIDES it along the row — the move the player's own hand
    // is about to make, rather than a legend blinking out and back in
    // somewhere else.
    const hx = PRESET_CX(1);
    const hold = '<g class="mp-hold" transform="translate(0,0)">'
      + `<text class="mp-hold-word" x="${hx}" y="2" text-anchor="middle">HOLD</text>`
      // TICKS DOWN here: this one describes the BUTTON BELOW it, not the word
      // above. Word, rule, then the thing itself — the way the panel labels
      // CLAVI TABS. Written in absolute coordinates like the brackets below,
      // so both can be read the same way by anything checking which way they
      // point; `v-6 h44 v6` draws the identical shape and cannot be.
      + `<path class="mp-hold-rule" d="M${hx - 22} 14 L${hx - 22} 8 `
      + `L${hx + 22} 8 L${hx + 22} 14"/>`
      + '</g>';

    const h = want.length ? VIEW.h : PANEL_H;
    return `<svg class="modal-panel" viewBox="${VIEW.x} ${VIEW.y} ${VIEW.w} ${h}" `
      + 'width="100%" role="group" aria-label="Bank and preset on the Seven">'
      + prefixIds(style) + prefixIds(defs) + bg + heading + body + hold + captions
      + '</svg>';
  }

  // ---- state -----------------------------------------------------------
  //
  // Applied to a LIVE panel rather than re-rendered, so a change of bank or
  // preset cannot lose focus or restart an animation mid-choice.

  // 'bank' | 'row' | 'preset' | 'chosen' | 'hold' — see the modal that drives
  // it. `row` is the whole-bank send: bank still to choose, all eight presets
  // lit as the destination and none of them pickable.
  function setStage(svg, stage) {
    if (!svg) return;
    for (const s of ['bank', 'row', 'preset', 'chosen', 'hold']) {
      svg.classList.toggle(`is-${s}`, s === stage);
    }
    // The heading names what is being asked for RIGHT NOW, and MOVES to sit
    // over the cluster it is asking about. SELECT BANK appears once, over the
    // bank control; the first press of that control replaces it with SELECT
    // PRESET over the preset row, and that is what stays until NEXT is
    // pressed — the lamps say what is chosen, this says what to do (Daniel's
    // drawings, 2026-08-22).
    //
    // AND IT GOES QUIET AT THE HOLD (CSS). Nothing is being selected there —
    // the patch is already in the instrument and the only thing left is a
    // physical press — so the HOLD legend over the button is the whole
    // message, and a second instruction beside it would compete with it.
    //
    // `row` NEVER LEAVES THE BANK. A whole-bank send has one question and it
    // is answered by the bank control; the eight presets below are the
    // destination, not a choice, so the heading stays where the choosing is.
    // FOCUSABLE ONLY WHILE IT IS A CONTROL. At the hold the panel takes a
    // press in order to say "not this one, the real one" — that is an answer,
    // not an action, and it has no business in the tab order.
    const bankHit = svg.querySelector('[data-mp-bank]');
    if (bankHit) {
      if (stage === 'hold') bankHit.removeAttribute('tabindex');
      else bankHit.setAttribute('tabindex', '0');
    }

    const onBank = stage === 'bank' || stage === 'row';
    const h = svg.querySelector('.mp-heading');
    if (h) {
      h.textContent = onBank ? 'SELECT BANK' : 'SELECT PRESET';
      h.setAttribute('x', String(onBank ? CLUSTER.bank.cx : CLUSTER.preset.cx));
    }

    paintLeds(svg);
  }

  // THE LEDS ARE THE OFFER, NOT THE ANSWER — and ONE function decides them.
  //
  //   choosing a preset  all eight light: those are the choices
  //   one chosen         they collapse to ONE — the offer becomes the answer
  //   holding            that one also BLINKS, because the player is looking
  //                      at the instrument and the picture has to point
  //                      rather than to record
  //
  // A CHOSEN PRESET'S LED IS LIT, and that is the drawing's own contract, not
  // a preference: "Selected = the button's two tones swap (face goes
  // near-black, inset goes lighter) and the LED lights. The hardware's preset
  // buttons are plain black plastic with an LED — the face never illuminates"
  // (assets/seven-panel.svg). It shipped for a day with the chosen LED DARK,
  // because I read a mockup as saying the cap alone carries the choice and did
  // not check it against the stylesheet that defines what `on` means. The dark
  // cap was right and the dark LED was half a selection (Daniel, 2026-08-22).
  //
  // It reads the stage off the element's own classes and the preset off its
  // dataset, so setStage and setPreset can be called in either order without
  // one undoing the other. That hazard is not hypothetical: the LEDs were the
  // one thing both functions wrote.
  function paintLeds(svg) {
    const chosen = svg.dataset.preset ? Number(svg.dataset.preset) : null;
    // `row` lights all eight for a different reason than `preset` does — they
    // are what is about to be WRITTEN rather than what can be picked — and the
    // difference is carried by which of them answer a click, not by the light.
    const offering = svg.classList.contains('is-preset') || svg.classList.contains('is-row');
    for (let n = 1; n <= 8; n += 1) {
      const g = svg.querySelector(`[data-mp-preset="${n}"]`);
      const led = g && g.querySelector('.led');
      if (led) led.classList.toggle('on', offering || n === chosen);
    }
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
    caption(svg, 'bank', bank);
  }

  // The bracket caption under a cluster. It is written HERE, beside the lamps
  // it describes, so the number under the bracket and the lit lamp cannot come
  // apart — they are set by the same call.
  function caption(svg, which, value) {
    const el = svg.querySelector(`[data-mp-cap="${which}"]`);
    if (!el) return;
    const label = which === 'bank' ? 'Bank' : 'Preset';
    el.textContent = `${label}: ${value == null ? '—' : value}`;
  }

  function setPreset(svg, preset) {
    if (!svg) return;
    for (let n = 1; n <= 8; n += 1) {
      const g = svg.querySelector(`[data-mp-preset="${n}"]`);
      if (!g) continue;
      const chosen = n === preset;
      g.classList.toggle('is-chosen', chosen);
      // The CAP is what says which preset is chosen: raised and outlined, the
      // way the drawing shows a pressed button. The LEDs are the offer and are
      // set by setStage — see the note there.
      const face = g.querySelector('.btn-face');
      if (face) face.classList.toggle('on', chosen);
    }
    svg.dataset.preset = preset == null ? '' : String(preset);
    caption(svg, 'preset', preset);
    // The legend TRAVELS to the new button rather than being redrawn over it.
    const hold = svg.querySelector('.mp-hold');
    if (hold) {
      hold.setAttribute('transform', `translate(${((preset || 1) - 1) * PRESET_PITCH},0)`);
    }
    // The picture is the instruction, so the instruction has to exist for
    // anyone who cannot see it.
    if (svg.classList.contains('is-hold') && svg.dataset.bank && preset) {
      svg.setAttribute('aria-label',
        `Hold preset ${preset} in bank ${svg.dataset.bank} on the Seven`);
    }
    paintLeds(svg);
  }

  // Cycles 1 → 2 → 3 → 4 → 1, exactly as the instrument's own BANK button
  // does. Bank 1 is included on purpose: the button on the Seven passes
  // through it, and a control that skipped it would behave differently from
  // the one beside the player's hands. It cannot be SENT to — the modal dims
  // its action and says why — but it can be landed on.
  const nextBank = (bank) => (bank == null ? 2 : (bank % 4) + 1);

  // THE KEYBOARD. A dialog that opens with focus on a disabled button leaves
  // a keyboard user with nothing at all — which is what both choosers did,
  // measured as an empty activeElement — so focus starts on the bank control,
  // the thing that has to be pressed first (Daniel, 2026-08-22).
  //
  // SPACE, not Enter. Enter belongs to the dialog and already means "confirm";
  // the modal takes it on the document in the CAPTURE phase, so it never
  // reaches here anyway. Space is what a focused button answers.
  //
  // An SVG rect is not a <button>: focus needs tabindex and Space produces no
  // click of its own, so this makes one — which means the choosers' existing
  // click handling covers the keyboard with no second copy of the logic.
  function focusControl(svg) {
    const el = svg && svg.querySelector('[data-mp-bank]');
    if (el) el.focus();
    return !!el;
  }

  function bindKeys(svg) {
    if (!svg) return;
    svg.addEventListener('keydown', (e) => {
      if (e.key !== ' ' && e.key !== 'Spacebar') return;
      const hit = e.target.closest && e.target.closest('[data-mp-bank], [data-mp-hit]');
      if (!hit) return;
      e.preventDefault();          // or the page scrolls under the dialog
      hit.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  }

  // ---- the backup grid ---------------------------------------------------
  //
  // THE SEVEN'S OWN 32 BUTTONS, all four banks at once, as the progress view
  // of a backup run. The same shape the JUNO-X editor's Crumar picker uses
  // (Daniel, 2026-11-13: "the 4x8 panel buttons we use for the Crumar picker
  // on Juno-Xtra ... each lights up as it is saved. In the end, all 32 buttons
  // are lit"). Ported by LOOK, not by code: that app builds its rows from its
  // own copy of the artwork, and this one has a drawing of its own that every
  // other panel view already comes out of. Two apps, no shared dependency.
  //
  // A run is 32 slots and roughly 48 seconds of ~3,600 round trips, and the
  // only feedback used to be one line in the connection row — easy to miss
  // when you are watching the instrument, so the app looked idle for most of a
  // minute.
  //
  // EACH ROW IS A CROP OF THE SAME DRAWING, like every other panel view here,
  // so a control added to assets/seven-panel.svg appears in all 32 buttons
  // without anyone remembering to. Row 1 keeps the preset numerals above the
  // caps; rows 2-4 start below them, because the numbering does not change
  // down a column and four copies of it is four times the height for nothing.
  // Each row's own bank lamp is the only one it shows, which is how the row
  // says which bank it is — the way the instrument says it.
  const GRID_BANKS = [1, 2, 3, 4];
  const GRID_SLOTS = 32;
  // In the drawing's own coordinates. The preset numerals sit on y 30 and the
  // factory legends on y 48; the bezels span y 56-148.
  //
  // ROW 1 KEEPS THE PANEL'S OWN HEADER — number above name, TINES REEDS
  // EGRAND CLAVI DX EP MKS EP VIBES GRAND, exactly as the artwork draws it
  // (Daniel, 2026-11-13: "Just use mine"). The transfer chooser hides those
  // legends because they name BANK 1's factory presets and it may be pointing
  // at banks 2-4 — here the top row IS bank 1, so they are simply true, and
  // rows 2-4 start BELOW them rather than repeating eight names that belong to
  // the row above. Same reason their numerals are dropped: a column's number
  // does not change on the way down.
  //
  // THE CROP STARTS AFTER THE BANK BUTTON, at x 768 rather than the chooser's
  // 678. The instrument has ONE bank button and four of them is a column of
  // identical blank caps taking a sixth of the width to say nothing — the
  // picture read as four empty slots beside the real ones (seen in the
  // screenshot, both themes, before this). What a row needs from that cluster
  // is its LAMP and its NUMERAL, which is how the instrument says which bank
  // you are on, and those come with it.
  const ROW_VIEW = { x: 768, w: 554 };
  const ROW_TOP = { y: 16, h: 136 };
  // 53, not 50: the legends' baseline is y 48 and their descenders reach about
  // 51, so a row starting at 50 catches the bottom of the row above's names.
  const ROW_REST = { y: 53, h: 99 };
  // Where the row's own lamp is put: the vertical centre of the caps (y 60-144
  // in the drawing), with its numeral on the same line. In the full drawing
  // the four lamps are stacked at cy 64, 88, 112 and 136, which is correct for
  // four lamps in one cluster and wrong for ONE lamp in each of four rows —
  // every row showed its lamp at a different height and the column drifted
  // down the picture. This is the one measurement here that departs from the
  // drawing, and it departs because the crop already did.
  const LAMP_CY = 102;

  const gridPrefix = (bank) => `bk${bank}-`;

  function buildGridRow(fullSvg, bank) {
    const prefix = gridPrefix(bank);
    const crop = bank === 1 ? ROW_TOP : ROW_REST;
    const style = block(fullSvg, 'style').replace(/@font-face\s*{[^}]*}\s*/g, '');
    const defs = block(fullSvg, 'defs');
    // FROM THE BANK CLUSTER, ONLY THE LAMPS AND THEIR NUMERALS. Cropping the
    // button out of view would leave it in the document — eight elements per
    // row, four rows, all of them off-picture and none of them inert by
    // anything but the crop. It is taken out instead, with the BANK legend and
    // the leader line that runs from the lamps across to the preset row: that
    // line joins four lamps to eight buttons in the full drawing, and points
    // at nothing once there is one lamp, moved.
    const lamps = (dark(section(fullSvg, 'sec-bank')).match(
      /<circle class="led amber"[^/]*\/>|<text class="lbl-sm lbl-bank-num"[^>]*>\d<\/text>/g
    ) || []).join('');
    let body = prefixIds(lamps + dark(section(fullSvg, 'sec-presets')), prefix);
    // Which preset group is which, so painting never has to know geometry.
    body = body.replace(
      new RegExp(`<g id="${prefix}preset-(\\d)">`, 'g'),
      `<g id="${prefix}preset-$1" data-bk-preset="$1">`
    );
    // THIS ROW'S OWN LAMP AND NUMERAL, and no others. Four stacked copies of
    // all four lamps is sixteen lamps saying nothing; one per row, carrying
    // that row's number, is the instrument's own way of saying which bank you
    // are looking at. CSS hides the rest — marked here because the mark is
    // per-row data and the stylesheet cannot know which row it is in.
    body = body
      .replace(
        new RegExp(`class="led amber"(\\s+id="${prefix}led-bank-${bank}")( cx="\\d+") cy="\\d+"`),
        `class="led amber is-own"$1$2 cy="${LAMP_CY}"`
      )
      .replace(
        new RegExp(`(<text class="lbl-sm lbl-bank-num)("[^>]*?)y="\\d+"([^>]*>${bank}</text>)`),
        `$1 is-own$2y="${LAMP_CY + 5}"$3`
      );
    // THE PANEL'S OWN BACKDROP, per row. Cropping to the sections drops
    // `.panel-bg` (one rect at the top of the full drawing, outside both), and
    // without it the panel's white legends land on the dialog's background —
    // invisible in light mode, which is how that was found the first time
    // (Daniel, 2026-08-22).
    const bg = `<rect class="panel-bg" x="${ROW_VIEW.x}" y="${crop.y}" `
      + `width="${ROW_VIEW.w}" height="${crop.h}" rx="5"/>`;
    // aria-hidden, and not reluctantly: this is a picture of a machine, and
    // everything it says is said in words by the status line beside it. A
    // screen reader walking 32 unlabelled buttons would be worse than useless.
    return `<svg class="modal-panel bk-row" data-bk-bank="${bank}" `
      + `viewBox="${ROW_VIEW.x} ${crop.y} ${ROW_VIEW.w} ${crop.h}" `
      + 'width="100%" aria-hidden="true" focusable="false">'
      + prefixIds(style, prefix) + prefixIds(defs, prefix) + bg + body
      + '</svg>';
  }

  const buildGrid = (fullSvg) => (
    typeof fullSvg !== 'string' || !fullSvg
      ? ''
      : GRID_BANKS.map((b) => buildGridRow(fullSvg, b)).join('')
  );

  // WHAT THE LIGHTS MEAN, and the whole reason this takes two numbers.
  //
  //   `saved`    how many slots the run has finished with, in slot order
  //   `current`  the slot being read right now (0-based), or null
  //
  // A LIT BUTTON MEANS THE RUN HAS REACHED THAT SLOT — not that anything was
  // written. A typical run is mostly "unchanged": the backup dedupes by
  // content hash, and Daniel's run of 2026-11-13 was 30 unchanged, 2 new. A
  // cell staying dark because nothing needed writing would read as a failure,
  // so an unchanged slot lights exactly like a new one. DARK NEVER MEANS DONE.
  //
  // The cap is pressed on the slot being read, which is also what the
  // instrument's own panel looks like at that moment — the run has just
  // recalled it. So the light says how far, and the cap says where.
  //
  // A light can RETRACT, once, and only on a failure: the slot in flight when
  // a run aborts was lit as `current` and is not in `saved`, so it goes dark
  // when the final count arrives. That is correct — it was never saved — and
  // the connection row says the run stopped.
  function paintBackup(grid, { saved = 0, current = null } = {}) {
    if (!grid) return;
    const currentBank = current == null ? null : Math.floor(current / 8) + 1;
    for (let i = 0; i < GRID_SLOTS; i += 1) {
      const bank = Math.floor(i / 8) + 1;
      const preset = (i % 8) + 1;
      const g = grid.querySelector(`[data-bk-bank="${bank}"] [data-bk-preset="${preset}"]`);
      if (!g) continue;
      const led = g.querySelector('.led');
      const face = g.querySelector('.btn-face');
      if (led) led.classList.toggle('on', i < saved || i === current);
      if (face) face.classList.toggle('on', i === current);
    }
    // THE BANK INDICATOR follows the run exactly as the instrument's does:
    // the lamp lights on the bank being read, and that row's numeral comes up
    // with it (Daniel, 2026-11-13 — "the 1/2/3/4 numeral stack with the active
    // row's number lit and its lamp"). The numeral is CSS, off the row's own
    // class, so the lamp and the number cannot come apart: one call sets both.
    for (const bank of GRID_BANKS) {
      const row = grid.querySelector(`[data-bk-bank="${bank}"]`);
      if (!row) continue;
      row.classList.toggle('is-current', bank === currentBank);
      const lamp = row.querySelector('.led.amber.is-own');
      if (lamp) lamp.classList.toggle('on', bank === currentBank);
    }
  }

  return {
    buildPanel, setStage, setBank, setPreset, nextBank, focusControl, bindKeys,
    buildGrid, paintBackup,
    PREFIX, VIEW, PRESET_CX, GRID_SLOTS,
  };
});
