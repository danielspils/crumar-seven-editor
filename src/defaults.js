'use strict';

// Shared parameter-default heuristic, used by BOTH the fixture generator and the
// renderer so "is this value at its default?" means the same thing in each.
//
// NOTE: schema/seven-1.37.json carries NO per-parameter default. The 0x15 `value`
// field is the *current* value at query time, not a factory default, and was never
// stored in the schema. Until real defaults are captured from the device, this
// heuristic stands in: most 0–127 parameters centre at 64; smaller-range params
// clamp 64 to their own max. When real defaults are known, change ONLY this
// function — nothing else in the app depends on how the default is derived.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SevenDefaults = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function defaultFor(param) {
    return Math.min(64, param.max);
  }
  return { defaultFor };
});
