'use strict';

// "Is this value at its factory setting?" — the one place that question is
// answered, used by the renderer to decide which rows are muted.
//
// WHERE THE NUMBERS COME FROM. schema/factory-defaults-1.37.json, derived from
// Bank 1 by tools/extract-factory-defaults.js. Bank 1 cannot be stored to, so
// its eight presets are what the instrument shipped with — the only factory
// numbers readable on a device whose protocol has no default opcode and whose
// schema carries no default field (0x15's `value` was the CURRENT value at
// query time, which is a different thing entirely).
//
// COVERAGE IS PARTIAL AND STAYS THAT WAY. Bank 1 holds eight sounds. For any
// other sound there is no evidence, and `defaultFor` returns **null** rather
// than a guess — a row with no known default renders normally instead of
// claiming to be stock. That is the whole point: the old heuristic,
// `min(64, max)`, asserted a default for all 110 parameters on every sound,
// and on switches it was simply wrong. It clamps 64 to a max of 1, so every
// switch sitting OFF — its factory position on the Tine Piano and most others
// — rendered as "you changed this", on every patch, forever.
//
// The heuristic survives as `seedValue`, which is what it was always fit for:
// inventing plausible demo numbers in fixtures/. It is not a default and
// nothing in the UI may treat it as one.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SevenDefaults = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // Plausible-looking value for generated demo data. NOT evidence, NOT a
  // default — most 0-127 parameters do centre near 64, which is why this makes
  // readable fixtures, and that is the entire justification for it.
  function seedValue(param) {
    return Math.min(64, param.max);
  }

  // table: the parsed schema/factory-defaults-<fw>.json, or null when it could
  // not be read. Returns defaultFor(param, soundName) -> number | null.
  function createDefaults(table) {
    const sounds = (table && table.sounds) || {};
    return function defaultFor(param, soundName) {
      if (!param || !soundName) return null;
      const vals = sounds[soundName];
      if (!vals) return null;            // sound not in Bank 1 — no evidence
      const v = vals[param.key];
      return typeof v === 'number' ? v : null;
    };
  }

  return { createDefaults, seedValue };
});
