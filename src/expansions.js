'use strict';

// What sample sets exist, and which of them this instrument has.
//
// Two sources, and they are not equal:
//
//   THE CATALOGUE (data/expansions.json) is Crumar's published list — titles,
//   release dates and ZIP DOWNLOAD sizes copied from their support page. It
//   says what EXISTS. The release dates are kept as data but are no longer
//   shown: beside a device-sourced number they read as install dates, and the
//   Seven reports nothing of the kind (Daniel, 2026-08-15). It is documentation, not evidence: no size here was measured on an
//   instrument, and installed size is not known to equal download size.
//
//   THE SOUND TABLE, read from the connected unit at connect, says what is
//   INSTALLED. It is the authority, and where the two disagree the instrument
//   wins.
//
// Matching is by the names the DEVICE reports, which differ from the download
// titles ("Electric Grand 70BXL" on the page, "Electric Grand 70B XL" on the
// instrument). A catalogue entry whose sound names nobody here has ever seen
// carries `sounds: null` and is reported as UNVERIFIED — never as missing,
// because "we don't know" and "you don't have it" are different answers.
//
// Nothing in this file writes anything anywhere. The app cannot install an
// expansion and never claims it can: installing needs the instrument's own
// Wi-Fi editor, which needs Crumar's Wi-Fi USB adapter.

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SevenExpansions = api;
})(typeof window !== 'undefined' ? window : null, function () {
  // The three groups, by the id ranges the instrument uses. Ids 0–7 are the
  // physical models, 8–15 the sample sets every Seven ships with, 16+ whatever
  // expansions this unit has (docs/DEVICE.md §11).
  const MODELED_MAX = 7;
  const INCLUDED_MAX = 15;

  const kindOf = (id) =>
    (id <= MODELED_MAX ? 'modeled' : id <= INCLUDED_MAX ? 'included' : 'expansion');

  const fold = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

  // deviceSounds: the connected unit's table, or null when nothing is attached.
  // OFFLINE IS NOT "NOTHING INSTALLED": with no instrument there is no
  // installed/missing state at all, and the schema is explicitly not used as a
  // stand-in — that list describes the developer's Seven, and claiming it as
  // the user's is exactly the bug class this app spent 2026-08-14 removing.
  function classify(catalogue, deviceSounds) {
    const entries = (catalogue && catalogue.expansions) || [];
    const connected = Array.isArray(deviceSounds);
    const have = new Set((deviceSounds || []).map((s) => fold(s.name)));

    // The instrument's own id for every sound it holds — the only place ids
    // come from. They are NOT positions in the catalogue: an id is what THIS
    // unit calls that sound, and a different Seven with different expansions
    // numbers them differently (schema soundsNote).
    const idByName = new Map((deviceSounds || []).map((s) => [fold(s.name), s.id]));

    const expansions = entries.map((e) => {
      const names = Array.isArray(e.sounds) ? e.sounds : null;
      let status = 'unknown'; // offline: no claim either way
      if (connected) {
        if (!names) status = 'unverified'; // nobody here has seen its sound names
        else {
          const present = names.filter((n) => have.has(fold(n)));
          status = present.length === names.length ? 'installed'
            : present.length === 0 ? 'not-installed'
              // Some but not all: say so rather than rounding to either.
              : 'partial';
        }
      }
      // Only ids the instrument actually reported. An expansion that is not
      // installed HAS no id here, and none is invented — one download can
      // supply several sounds, so this is a list (U1/Felt gives two).
      const ids = (names || [])
        .map((n) => idByName.get(fold(n)))
        .filter((id) => id !== undefined)
        .sort((a, b) => a - b);
      return { ...e, sounds: names, status, ids };
    });

    // Sounds the instrument has that no catalogue entry claims. These get their
    // own line rather than being dropped: if the matching is wrong, the owner
    // must SEE a sound they own listed as unaccounted for, instead of a sound
    // they own being quietly reported missing.
    const claimed = new Set(
      entries.flatMap((e) => (Array.isArray(e.sounds) ? e.sounds : [])).map(fold)
    );
    const unaccounted = (deviceSounds || [])
      .filter((s) => kindOf(s.id) === 'expansion' && !claimed.has(fold(s.name)))
      .map((s) => ({ id: s.id, name: s.name }));

    return {
      connected,
      modeled: (deviceSounds || []).filter((s) => kindOf(s.id) === 'modeled'),
      included: (deviceSounds || []).filter((s) => kindOf(s.id) === 'included'),
      expansions,
      unaccounted,
    };
  }

  // "354.09 Mb" as Crumar writes it. Deliberately not converted to GB and never
  // summed against the device's storage figure: these are download sizes and
  // that is a number of unknown meaning (docs/protocol.md).
  const downloadSize = (mb) => (typeof mb === 'number' ? `${mb.toFixed(2)} Mb` : '—');

  return { classify, kindOf, downloadSize, MODELED_MAX, INCLUDED_MAX };
});
