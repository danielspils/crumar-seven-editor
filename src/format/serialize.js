'use strict';

// Library object -> .sevenlib.json string. Pure data layer: no MIDI, no
// filesystem, no device access.
//
// Output is deterministic and git-diffable: UTF-8 JSON, 2-space indent,
// stable key order — spec-known keys first in spec order, then any unknown
// keys in their insertion order (unknown keys round-trip verbatim so a
// formatVersion 2 file saved by this build loses nothing). `params` keys are
// sorted lexicographically, which also groups them by engine prefix.
//
// SECURITY: serialization REFUSES any object graph containing a `wfp` key at
// any depth. The globals reply carries the instrument's Wi-Fi password under
// that key (CLAUDE.md Rule 6); globals never belong in a patch file, and this
// assertion makes the mistake loud instead of silent.

const TOP_ORDER = ['format', 'formatVersion', 'created', 'source', 'patches'];
const PATCH_ORDER = ['name', 'nameFrom', 'origin', 'sound', 'params', 'source', 'captured', 'verified'];
const SOURCE_ORDER = ['app', 'firmware', 'firmwareBuild', 'schema', 'soundList'];

function assertNoWfp(node, path, seen) {
  if (node === null || typeof node !== 'object') return;
  if (seen.has(node)) return; // cycles are JSON.stringify's problem, not ours
  seen.add(node);
  if (Array.isArray(node)) {
    node.forEach((v, i) => assertNoWfp(v, `${path}[${i}]`, seen));
    return;
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === 'wfp') {
      throw new Error(
        `refusing to serialize: "wfp" key at ${path}.${k} — ` +
          `the instrument's Wi-Fi password never goes in a patch file (Rule 6)`
      );
    }
    assertNoWfp(v, `${path}.${k}`, seen);
  }
}

// Rebuild an object with `order`ed known keys first, unknown keys after in
// insertion order. Values pass through untouched unless `map` transforms them.
function orderKeys(obj, order, map) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const out = {};
  for (const k of order) {
    if (k in obj) out[k] = map && map[k] ? map[k](obj[k]) : obj[k];
  }
  for (const k of Object.keys(obj)) {
    if (!(k in out)) out[k] = obj[k];
  }
  return out;
}

function orderParams(params) {
  if (params === null || typeof params !== 'object' || Array.isArray(params)) return params;
  const out = {};
  for (const k of Object.keys(params).sort()) out[k] = params[k];
  return out;
}

function orderSource(source) {
  return orderKeys(source, SOURCE_ORDER);
}

function orderPatch(patch) {
  return orderKeys(patch, PATCH_ORDER, {
    params: orderParams,
    source: orderSource,
  });
}

function serializeLibrary(library) {
  assertNoWfp(library, 'library', new Set());
  const shaped = orderKeys(library, TOP_ORDER, {
    source: orderSource,
    patches: (patches) => (Array.isArray(patches) ? patches.map(orderPatch) : patches),
  });
  return JSON.stringify(shaped, null, 2) + '\n';
}

module.exports = { serializeLibrary };
