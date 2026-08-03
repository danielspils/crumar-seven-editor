'use strict';

// Sound resolution: maps each patch's sound NAME to an id in a sound list.
// Data only — no UI, no console output, and "unavailable" is a result, not an
// exception.
//
// PROVENANCE IS PER-PATCH. A library can hold patches from more than one
// instrument (the transfer use case): the top-level source is the library's
// own provenance and each patch may carry a source override. A patch's
// EFFECTIVE sound list is its own source.soundList, falling back to the
// library's — never the top-level list unconditionally.
//
// resolveSounds(library, targetSoundList?):
// - with targetSoundList (importing onto a specific instrument): every patch
//   resolves against that target.
// - without: each patch resolves against its EFFECTIVE list — "does the
//   instrument this patch came from have this sound" — which is what makes a
//   missing-expansion warning possible when just viewing a library.
//
// sound.name is authoritative; sound.id is diagnostic only and is never used
// to resolve.

const fold = (s) => String(s).trim().toLowerCase().replace(/\s+/g, ' ');

function resolveSounds(library, targetSoundList) {
  const libList =
    (library && library.source && Array.isArray(library.source.soundList)
      ? library.source.soundList
      : []);
  return ((library && library.patches) || []).map((patch) => {
    const effective =
      patch && patch.source && Array.isArray(patch.source.soundList)
        ? patch.source.soundList
        : libList;
    const list = Array.isArray(targetSoundList) ? targetSoundList : effective;
    const name = patch && patch.sound ? patch.sound.name : null;
    const sourceId = patch && patch.sound && patch.sound.id != null ? patch.sound.id : null;
    if (typeof name !== 'string' || name === '') {
      return { status: 'unavailable', sourceId, sourceName: name ?? null };
    }
    let hit = list.find((s) => s && s.name === name);
    if (hit) return { status: 'ok', targetId: hit.id };
    hit = list.find((s) => s && fold(s.name) === fold(name));
    if (hit) return { status: 'ok', targetId: hit.id, fuzzy: true };
    return { status: 'unavailable', sourceId, sourceName: name };
  });
}

module.exports = { resolveSounds };
