'use strict';

// A miniature of the Seven's bank LEDs and preset buttons, drawn to point at
// one physical button. Used by the transfer walk, where the instruction is not
// "confirm this" but "press THAT, the one under your left hand" — and a
// picture of the panel says it in the vocabulary the player is already looking
// at, which a sentence cannot.
//
// Panel colours are literal, not themed: this is a picture of a machine, and
// the machine does not change colour when the room lights do (docs/DESIGN.md).
// The HOLD legend uses the panel's own CLAVI TABS yellow and bracket.

(function (global) {
  const BTN_W = 44;
  const BTN_H = 74;
  const GAP = 10;
  const LEFT = 66;   // room for the bank LED column
  const TOP = 54;    // room for the numbers, the bracket and the HOLD legend

  // bank: 1-4, preset: 1-8 — the slot the player must hold.
  function render(bank, preset) {
    const x = (i) => LEFT + i * (BTN_W + GAP);
    const width = LEFT + 8 * (BTN_W + GAP) + 8;
    const height = TOP + BTN_H + 18;

    const banks = [1, 2, 3, 4]
      .map((b, i) => {
        const cy = TOP + 6 + i * 17;
        const lit = b === bank;
        return (
          `<circle cx="20" cy="${cy}" r="4.2" fill="${lit ? '#e0a03a' : '#4a412a'}"` +
          `${lit ? ' stroke="#f6d089" stroke-width="1"' : ''}/>` +
          `<text class="pm-num${lit ? ' pm-on' : ''}" x="34" y="${cy + 4}">${b}</text>`
        );
      })
      .join('');

    // Everything but the button to press is dimmed: the panel has eight
    // identical caps, and the whole job of this picture is to single one out.
    // WHICH one is carried entirely by the group's class, so moving to the
    // next button is a class toggle on live nodes rather than a re-render —
    // that is what lets the dimming cross-fade instead of cutting.
    const buttons = Array.from({ length: 8 }, (_, i) => {
      const n = i + 1;
      const bx = x(i);
      return (
        `<g class="pm-btn ${n === preset ? 'pm-active' : 'pm-dim'}" data-preset="${n}">` +
        `<text class="pm-idx" x="${bx + BTN_W / 2}" y="${TOP - 10}">${n}</text>` +
        `<rect class="pm-bezel" x="${bx}" y="${TOP}" width="${BTN_W}" height="${BTN_H}" rx="3"/>` +
        `<rect class="pm-face" x="${bx + 3}" y="${TOP + 3}" ` +
        `width="${BTN_W - 6}" height="${BTN_H - 6}"/>` +
        // The cap sits on the lower two-thirds, as on the instrument.
        `<path class="pm-cap" d="M${bx + 3} ${TOP + 28}h${BTN_W - 6}v${BTN_H - 31}h${-(BTN_W - 6)}z"/>` +
        `<circle class="pm-led" cx="${bx + BTN_W / 2}" cy="${TOP + 16}" r="4"/>` +
        `</g>`
      );
    }).join('');

    // HOLD sits above the number with its bracket between them, the way the
    // panel labels CLAVI TABS — legend, rule, then the thing itself. It is
    // drawn over button 1 and TRANSLATED to the right one, so that stepping
    // through a bank slides the legend along the row.
    const hx = x(0) + BTN_W / 2;
    const hold =
      `<g class="pm-hold-g" transform="${holdShift(preset)}">` +
      `<text class="pm-hold" x="${hx}" y="${TOP - 32}">HOLD</text>` +
      `<path class="pm-bracket" d="M${hx - 20} ${TOP - 26}v5h40v-5"/></g>`;

    return (
      `<svg class="panel-mini" viewBox="0 0 ${width} ${height}" width="100%" ` +
      `data-bank="${bank}" role="img" ` +
      `aria-label="${holdLabel(bank, preset)}">` +
      `<rect class="pm-bg" x="0" y="0" width="${width}" height="${height}" rx="6"/>` +
      // A hairline from the bank column to the buttons, as the panel runs one
      // between its bank LEDs and the preset row.
      `<path class="pm-bracket pm-dim" d="M14 ${TOP - 4}h34"/>` +
      banks + buttons + hold +
      `</svg>`
    );
  }

  const holdShift = (preset) => `translate(${(preset - 1) * (BTN_W + GAP)},0)`;
  const holdLabel = (bank, preset) =>
    `Hold preset ${preset} in bank ${bank} on the Seven`;

  // Point an ALREADY RENDERED panel at a different button. The transfer walk
  // uses this instead of drawing a new picture: the same eight buttons stay on
  // screen and the highlight travels, which is what the player's own hand is
  // about to do. `root` is any element containing the panel.
  function setPreset(root, preset) {
    // `root` is either a container holding the panel or the panel itself —
    // playSave already has the <svg> in hand, and passing it here silently did
    // nothing, because querySelector only looks at DESCENDANTS. The button
    // never lit (Daniel, 2026-08-13).
    const svg = !root ? null
      : (root.classList && root.classList.contains('panel-mini')
        ? root
        : root.querySelector('.panel-mini'));
    if (!svg) return;
    for (const g of svg.querySelectorAll('[data-preset]')) {
      const on = Number(g.dataset.preset) === preset;
      g.classList.toggle('pm-active', on);
      g.classList.toggle('pm-dim', !on);
    }
    const hold = svg.querySelector('.pm-hold-g');
    if (hold) hold.setAttribute('transform', holdShift(preset));
    svg.setAttribute('aria-label', holdLabel(Number(svg.dataset.bank), preset));
  }

  // Play the save, on an already-rendered panel: the button you hold comes up,
  // it stays up for the length of the hold, and then the lights run down the
  // row to confirm it — 8 back to 2, quickly and overlapping, which is what
  // the Seven does (Daniel, 2026-08-13, watched).
  //
  // Bank 1 is not in the run because the Seven will not store there.
  //
  // The demonstration waits 2s where the copy says 3. Daniel timed the real
  // hold at about two seconds but chose to keep telling people three, which is
  // the safer instruction — hold too long and it still stores, let go early
  // and it does not. The picture shows the shorter, true wait so the loop does
  // not stall; the words ask for the one that cannot fail.
  //
  // Returns a stop() so a modal closing mid-cycle does not leave timers firing
  // at nodes that are gone.
  const HOLD_MS = 3000;   // the hold, matching what the copy asks for
  const RUN_STEP = 45;    // gap between lights — they overlap
  const RUN_LIT = 150;    // how long each stays up
  const REST_MS = 900;    // pause before it plays again

  function playSave(root, preset, { loop = true } = {}) {
    const svg = root && root.querySelector('.panel-mini');
    if (!svg) return () => {};
    // A demonstration, not an instruction: the lit button holds a SOLID light
    // here. The blinking LED is the transfer walk asking for a press, and a
    // blink in the middle of a sequence that is itself about lights would say
    // two things at once (Daniel, 2026-08-13).
    svg.classList.add('pm-demo');

    const timers = [];
    const at = (ms, fn) => timers.push(setTimeout(fn, ms));
    const led = (n) => svg.querySelector(`[data-preset="${n}"]`);
    const allOff = () => {
      for (const g of svg.querySelectorAll('[data-preset]')) {
        g.classList.remove('pm-run', 'pm-active');
        g.classList.add('pm-dim');
      }
    };

    const cycle = () => {
      // The held button is lit from the start — the picture opens showing the
      // button you are being asked to hold, and the wait IS the hold
      // (Daniel, 2026-08-13). Going dark first made you watch it arrive before
      // anything could begin.
      allOff();
      setPreset(svg, preset);
      // Then the lights run to it, ALWAYS FROM THE FAR END — whichever of
      // button 1 or button 8 is further away, so the sweep is as long as the
      // row allows and reads as travelling rather than nudging. Saving to 5
      // runs 1 → 5; saving to 4 runs 8 → 4 (Daniel, 2026-08-13).
      //
      // The target is not in the run: it is already lit, and the sweep
      // arriving there ends the sequence rather than flashing it again.
      const fromLow = (preset - 1) > (8 - preset);
      const step = fromLow ? 1 : -1;
      let t = HOLD_MS;
      for (let n = fromLow ? 1 : 8; n !== preset; n += step) {
        const g = led(n);
        if (!g) continue;
        at(t, () => g.classList.add('pm-run'));
        at(t + RUN_LIT, () => g.classList.remove('pm-run'));
        t += RUN_STEP;
      }
      if (loop) at(t + REST_MS, cycle);
    };
    cycle();

    return () => {
      for (const id of timers) clearTimeout(id);
      svg.classList.remove('pm-demo');
    };
  }

  global.SevenPanelMini = { render, setPreset, playSave };
})(window);
