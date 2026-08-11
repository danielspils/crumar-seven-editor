'use strict';

// Original line art for the sound families — drawn for this project, not traced
// from photographs or from the manufacturer's artwork (CLAUDE.md Rule 3 is about
// code; the same instinct applies to images). Each is an abstract silhouette of
// the KIND of instrument, never a brand's trade dress.
//
// Art is cosmetic. It is picked from the sound NAME, which is the only portable
// identity a sound has (schema soundsNote) — a sound this mapper has never seen
// falls back to a generic keyboard, and nothing here is protocol truth.

(function (global) {
  const ART = {
    // Tine piano — tonebar, tine and hammer.
    tine:
      '<path d="M3 16.5h18"/><path d="M8 16.5V7"/><circle cx="8" cy="5.2" r="1.8"/>' +
      '<path d="M13 16.5v-4"/><path d="M11.2 12.5h3.6"/>',
    // Reed piano — the reed comb.
    reed:
      '<path d="M3 15h18"/><path d="M6 15V9M9 15V7M12 15V9M15 15V7M18 15V9"/>' +
      '<path d="M4.5 18h15"/>',
    // Electric grand — grand body on legs.
    grandLegs:
      '<path d="M3.5 6h10.5a6 6 0 0 1 6 6v2.5h-16.5z"/><path d="M6 14.5V19M17.5 14.5V19"/>',
    // Clavi — plucked strings under a long body.
    clavi:
      '<rect x="2.5" y="7.5" width="19" height="6" rx="1"/><path d="M2.5 10.5h19"/>' +
      '<path d="M7 13.5v4M12 13.5v4M17 13.5v4"/>',
    // FM synth — panel of sliders above the keys.
    synth:
      '<rect x="2.5" y="5.5" width="19" height="13" rx="1.5"/><path d="M2.5 13.5h19"/>' +
      '<path d="M6 8v3M9.5 8v3M13 8v3M16.5 8v3"/><path d="M7 13.5v5M12 13.5v5M17 13.5v5"/>',
    // Rack synth module — a faceplate with knobs.
    rack:
      '<rect x="2.5" y="8" width="19" height="8" rx="1"/><circle cx="6.5" cy="12" r="1.5"/>' +
      '<circle cx="10.5" cy="12" r="1.5"/><path d="M14.5 10.3h4.5M14.5 13.7h4.5"/>',
    // Vibraphone — bars over resonator tubes.
    vibes:
      '<path d="M3 7.5h6M11 7.5h5M18 7.5h3"/><path d="M3 11h6M11 11h5M18 11h3"/>' +
      '<path d="M6 11v7M13.5 11v6M19.5 11v5"/>',
    // Acoustic grand — the lid seen from above.
    grand:
      '<path d="M6 19.5V7.5a3 3 0 0 1 3-3h3.5c4.4 0 7.5 3.4 7.5 7.6 0 4.1-3.3 7.4-7.4 7.4z"/>' +
      '<path d="M6 12.5h5"/>',
    // Anything sampled that has no family of its own — a waveform.
    wave: '<path d="M2.5 12h3l2.2-6.5L11 18.5l2.6-9 2 5 1.7-2.5h4.2"/>',
    // Unknown sound (a future expansion this build has never seen).
    keys:
      '<rect x="2.5" y="7" width="19" height="10" rx="1.5"/><path d="M2.5 11.5h19"/>' +
      '<path d="M7 11.5v5.5M12 11.5v5.5M17 11.5v5.5"/>',
  };

  // Name → art. Ordered: the first match wins, so "Sampled Tine Piano" gets the
  // tine drawing rather than the generic sampled waveform.
  const RULES = [
    [/tine/i, 'tine'],
    [/reed|wurl/i, 'reed'],
    [/electric grand|\b70b\b|\bcp\b/i, 'grandLegs'],
    [/clavi/i, 'clavi'],
    [/\bdx\b/i, 'synth'],
    [/\bmks\b/i, 'rack'],
    [/vibraphone|vibes/i, 'vibes'],
    [/grand|piano/i, 'grand'],
  ];

  function artKeyFor(name, sampled) {
    const n = String(name || '');
    for (const [re, key] of RULES) if (re.test(n)) return key;
    return sampled ? 'wave' : 'keys';
  }

  // Returns a complete <svg>. Strokes use currentColor so a tile can tint the
  // art with its engine colour without a second palette to keep in step.
  function iconFor(name, sampled) {
    return (
      '<svg class="sound-art" viewBox="0 0 24 24" width="34" height="34" aria-hidden="true" ' +
      'fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" ' +
      `stroke-linejoin="round">${ART[artKeyFor(name, sampled)]}</svg>`
    );
  }

  global.SevenSoundArt = { iconFor, artKeyFor };
})(window);
