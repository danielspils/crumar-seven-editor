'use strict';

// Original illustrations of the instrument TYPES the Seven models — a tine
// electric piano, a reed piano, a clavinet, an electric grand, and so on.
// Drawn for this project: side-on silhouettes in the panel's own line weight,
// with no maker's logo, badge or trade dress. They say "this is that kind of
// instrument", which is what a player needs when choosing a sound; they are
// not portraits of any particular make.
//
// Art is cosmetic and is chosen from the sound NAME — the only portable
// identity a sound has (schema soundsNote). A sound this mapper has never seen
// falls back to a generic keyboard, and nothing here is protocol truth.
//
// Common canvas: 48x32, stroke-only, currentColor — the tile tints the whole
// drawing with its family colour, so a stripe and its art can never disagree.

(function (global) {
  const ART = {
    // Tine electric piano: suitcase body with a sloped harp lid, splayed legs
    // and the sustain rod down the middle.
    tine:
      '<path d="M8 11h29l4 6H6z"/>' +
      '<path d="M6 17h35v4H6z"/>' +
      '<path d="M12 17v4M18 17v4M24 17v4M30 17v4M36 17v4"/>' +
      '<path d="M10 21l-3 8M37 21l3 8"/>' +
      '<path d="M23.5 21v6M20 27h7"/>',
    // Reed piano: the wedge-shaped lid and lipped keybed of a school-hall
    // electric, on thin splayed legs.
    reed:
      '<path d="M12 10h24l5 8H7z"/>' +
      '<path d="M7 18h34v4H7z"/>' +
      '<path d="M13 18v4M19 18v4M25 18v4M31 18v4"/>' +
      '<path d="M11 22l-4 7M37 22l4 7"/>' +
      '<path d="M24 22v5M21 27h6"/>',
    // Electric grand: a grand's curved case cut down to a stage instrument,
    // on straight posts.
    grandLegs:
      '<path d="M7 10h19c8 0 15 4 15 9v2H7z"/>' +
      '<path d="M7 21h34"/>' +
      '<path d="M13 21v8M35 21v8"/>' +
      '<path d="M12 14h14"/>',
    // Clavinet: long shallow box, pickup rail across the body, tapered legs.
    clavi:
      '<path d="M5 13h38v5H5z"/>' +
      '<path d="M5 18h38v4H5z"/>' +
      '<path d="M11 18v4M17 18v4M23 18v4M29 18v4M35 18v4"/>' +
      '<path d="M10 15.5h28"/>' +
      '<path d="M8 22l-3 7M40 22l3 7"/>',
    // FM synth: a flat slab — control panel above, keys below, small display.
    synth:
      '<rect x="4" y="11" width="40" height="11" rx="1.5"/>' +
      '<path d="M4 17.5h40"/>' +
      '<path d="M11 17.5v4.5M18 17.5v4.5M25 17.5v4.5M32 17.5v4.5M39 17.5v4.5"/>' +
      '<rect x="7" y="13" width="9" height="3"/>' +
      '<path d="M20 14.5h4M27 14.5h4M34 14.5h4"/>',
    // Rack synth: a faceplate with mounting ears, knobs and a window.
    rack:
      '<rect x="5" y="12" width="38" height="10" rx="1"/>' +
      '<path d="M9 12v10M39 12v10"/>' +
      '<circle cx="13.5" cy="17" r="2"/>' +
      '<circle cx="20" cy="17" r="2"/>' +
      '<rect x="26" y="15" width="11" height="4"/>',
    // Vibraphone: two ranks of bars over resonator tubes, frame on castors.
    vibes:
      '<path d="M6 11h13M22 11h9M34 11h8"/>' +
      '<path d="M6 15h13M22 15h9M34 15h8"/>' +
      '<path d="M10 15v8M16 15v7M25 15v7M29 15v6M37 15v6"/>' +
      '<path d="M7 24h34"/>' +
      '<circle cx="10" cy="27" r="1.6"/><circle cx="38" cy="27" r="1.6"/>',
    // Acoustic grand, three-quarter: curved case, raised lid, three legs.
    grand:
      '<path d="M9 22V12a3 3 0 0 1 3-3h9c10 0 17 4 17 9v4z"/>' +
      '<path d="M9 22h29"/>' +
      '<path d="M12 9l14-4"/>' +
      '<path d="M12 22v7M35 22v7M24 22v5"/>',
    // Upright: a tall cabinet with the keys at the front. Used when the drawn
    // illustration is unavailable.
    upright:
      '<rect x="10" y="4" width="28" height="19" rx="1"/><path d="M13 7h22v8H13z"/>' +
      '<path d="M7 23h34v5H7z"/><path d="M13 23v3M19 23v3M25 23v3M31 23v3"/>',
    // Sampled, with no instrument of its own: a waveform.
    wave: '<path d="M4 16h4l3-8 4 15 4-11 3 7 3-4h15"/>',
    // A sound this build has never seen.
    keys:
      '<rect x="5" y="12" width="38" height="10" rx="1.5"/>' +
      '<path d="M5 17h38"/>' +
      '<path d="M12 17v5M19 17v5M26 17v5M33 17v5"/>',
  };

  // Name → art. Ordered: the first match wins, so "Sampled Tine Piano" gets the
  // tine drawing rather than the generic sampled waveform.
  const RULES = [
    [/upright/i, 'upright'],
    [/tine/i, 'tine'],
    [/reed|wurl/i, 'reed'],
    [/electric grand|\b70b\b|\bcp\b/i, 'grandLegs'],
    [/clavi/i, 'clavi'],
    [/\bdx\b/i, 'synth'],
    [/\bmks\b/i, 'rack'],
    [/vibraphone|vibes/i, 'vibes'],
    // Venice is a family of sampled acoustics with its own illustration — a
    // brown grand, where the modeled Acoustic Piano is black. It sits AFTER
    // the upright rule on purpose: a "Venice Upright U1" is an upright, and
    // the picture should say what the instrument is before it says which
    // family it belongs to.
    [/venice/i, 'venice'],
    [/grand|piano/i, 'grand'],
  ];

  function artKeyFor(name, sampled) {
    const n = String(name || '');
    for (const [re, key] of RULES) if (re.test(n)) return key;
    return sampled ? 'wave' : 'keys';
  }

  // Drawn illustrations, one per instrument TYPE (assets/instruments). Where a
  // sound has one, it is used instead of the line art — full colour, inlined so
  // its CSS variables resolve against the page's theme. The line art remains
  // for everything with no instrument to draw: a rack module, a vibraphone, a
  // sample set that was never a physical machine.
  const DRAWING_FOR = {
    tine: 'tine',
    reed: 'reed',
    clavi: 'clavi',
    grandLegs: 'cp70',
    synth: 'dx7',
    grand: 'grand',
    venice: 'venice',
    upright: 'upright',
  };

  let drawings = null; // { name: {kind, markup|src} }, loaded once via preload

  function drawingFor(artKey) {
    if (drawings === null) {
      drawings = (global.sevenAPI && global.sevenAPI.getInstrumentArt)
        ? global.sevenAPI.getInstrumentArt()
        : {};
    }
    const file = DRAWING_FOR[artKey];
    return file ? drawings[file] || null : null;
  }

  // Returns a complete <svg>, or the drawing wrapped for the tile. Line-art
  // strokes use currentColor so a tile can tint them with the engine colour;
  // a drawing brings its own palette and is left alone.
  function iconFor(name, sampled) {
    const key = artKeyFor(name, sampled);
    const drawn = drawingFor(key);
    if (drawn && drawn.kind === 'png') {
      // The alt is empty and the wrapper aria-hidden: the sound's NAME is
      // right beside it, and a screen reader repeating it as a picture caption
      // would say the same thing twice.
      return '<span class="sound-art is-drawing" aria-hidden="true">' +
        `<img src="${drawn.src}" alt=""></span>`;
    }
    if (drawn) return `<span class="sound-art is-drawing" aria-hidden="true">${drawn.markup}</span>`;
    return (
      '<svg class="sound-art" viewBox="0 0 48 32" width="46" height="31" aria-hidden="true" ' +
      'fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" ' +
      `stroke-linejoin="round">${ART[artKeyFor(name, sampled)]}</svg>`
    );
  }

  global.SevenSoundArt = { iconFor, artKeyFor };
})(window);
