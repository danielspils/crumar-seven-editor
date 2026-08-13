'use strict';

// The keyboard picture in the Sound Engine panel: which keys a sound actually
// answers to.
//
// EVIDENCE. The instrument does not publish this. There is no key-range field
// in the schema, no opcode that reports one, and nothing in a recall burst that
// names a lowest or highest note — so unlike every other fact this app draws,
// a faded key cannot be read off the wire. It comes from playing the Seven and
// hearing where the sound stops.
//
// That is still device evidence, and this project accepts it on the same terms
// as any other: each entry records WHO observed it, WHEN, and HOW, and nothing
// is entered from the v1.22 manual. A range nobody has played is absent, and an
// absent range draws no keyboard at all — a picture claiming a limit that has
// not been heard is worse than no picture.
(function (global) {
  // Note numbers are MIDI: 60 is middle C.
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const IS_BLACK = [false, true, false, true, false, false, true, false, true, false, true, false];

  const noteName = (n) => `${NAMES[n % 12]}${Math.floor(n / 12) - 1}`;

  // Draw the instrument's own keybed, with the keys outside `low`..`high`
  // faded. Both are MIDI note numbers, inclusive.
  //
  // keybed: { low, high } — the physical keyboard being drawn. It is a
  // parameter rather than a constant because it is an observation too: nobody
  // here has counted the keys on the wire, and a keyboard drawn to the wrong
  // length would misplace every fade on it.
  function render({ low, high, keybed }) {
    if (!keybed || low == null || high == null) return '';
    const from = keybed.low;
    const to = keybed.high;

    // White keys carry the layout; black keys are drawn on top at the seams.
    const whites = [];
    for (let n = from; n <= to; n++) if (!IS_BLACK[n % 12]) whites.push(n);
    if (!whites.length) return '';

    const W = 7;      // white key width
    const H = 30;     // white key height
    const BW = 4.4;   // black key width
    const BH = 19;
    const width = whites.length * W;

    const xOf = new Map();
    whites.forEach((n, i) => xOf.set(n, i * W));

    const inRange = (n) => n >= low && n <= high;

    let out = `<svg class="key-range" viewBox="0 0 ${width} ${H}" width="${width}" height="${H}" ` +
      `role="img" aria-label="Plays from ${noteName(low)} to ${noteName(high)}">`;

    for (const n of whites) {
      out += `<rect class="kr-white${inRange(n) ? '' : ' is-mute'}" ` +
        `x="${xOf.get(n)}" y="0" width="${W}" height="${H}" rx="1"></rect>`;
    }
    for (let n = from; n <= to; n++) {
      if (!IS_BLACK[n % 12]) continue;
      // A black key sits on the seam after the white key below it.
      const belowX = xOf.get(n - 1);
      if (belowX === undefined) continue;
      out += `<rect class="kr-black${inRange(n) ? '' : ' is-mute'}" ` +
        `x="${belowX + W - BW / 2}" y="0" width="${BW}" height="${BH}" rx="1"></rect>`;
    }
    out += '</svg>';
    return out;
  }

  global.SevenKeyRange = { render, noteName };
})(window);
