'use strict';

// The report a stranger's Seven sends home.
//
// When the write gate closes, the person in front of the app has an instrument
// this project has never met, and their parameter table is exactly what it
// would take to support it. This builds a file they can attach to a GitHub
// issue in one click.
//
// WHAT GOES IN: only what the DEVICE said about itself — the firmware string,
// its sound table, its parameter table — plus which app and schema were
// looking at it.
//
// WHAT NEVER GOES IN:
//   - globals. The 0x33 reply carries the instrument's Wi-Fi password in
//     plaintext (Rule 6), and the safest way to keep a secret out of a file is
//     for the code that writes the file to have no way of reaching it. This
//     module takes no globals argument — not a redacted one, not an optional
//     one. There is nothing here to forget to mask.
//   - anything from the library. Patch names are the player's, not the
//     instrument's, and none of them help support a firmware.
//
// The parameter table itself is NOT redacted and must not be: it is a map of
// the instrument's own controls, it carries no personal data, and a report with
// holes in it is a report nobody can act on.

// One flat list per table, in id order, so a diff between two reports reads
// cleanly in a terminal.
function buildReport({ appVersion, schemaName, appParamCount, firmware, soundTable, paramTable, verdict, created }) {
  const sounds = (soundTable && soundTable.sounds) || [];
  const params = (paramTable && paramTable.params) || [];
  return {
    report: 'crumar-seven-instrument',
    reportVersion: 1,
    created,
    // WHAT THIS DIAGNOSES, stated in the file so it cannot be mistaken for a
    // general fault report: a FIRMWARE whose parameter set differs from the
    // schema this build was written against. Not the instrument's OS, and not
    // which expansions are installed — expansions change the SOUND table, and
    // the app already resolves sounds against the connected unit's own table.
    // The parameter table below is the evidence for exactly one question:
    // what would a schema for this firmware have to say?
    diagnoses:
      'A firmware whose parameter set differs from the schema this build was '
      + 'written against. Not the OS, and not installed expansions — those '
      + 'change the sound table, which the app already reads from the '
      + 'instrument.',
    app: { version: appVersion, schema: schemaName, knownParameters: appParamCount },
    // Verbatim, as the device gave it. Not parsed into a version number here:
    // the build date is half of what identifies a firmware.
    firmware: firmware || null,
    sounds: {
      count: sounds.length,
      fingerprint: (soundTable && soundTable.fingerprint) || null,
      list: sounds.map((s) => ({ id: s.id, name: s.name, sampled: !!s.sampled })),
    },
    parameters: {
      count: paramTable ? paramTable.count : 0,
      fingerprint: (paramTable && paramTable.fingerprint) || null,
      // THE WHOLE 0x15 REPLY, field for field: id | group | key | label | cc |
      // max | value | flag. Not a chosen subset — group, cc and flag are half
      // of what a schema entry is, and without them a submitted report cannot
      // produce a working schema file for that firmware, which is the only
      // reason to collect one (Daniel, 2026-08-15).
      //
      // `value` is the parameter's value AT READ TIME — whatever the edit
      // buffer happened to hold — not a factory default. The device has no
      // factory-default field; see CLAUDE.md on where defaults actually come
      // from. It is here for completeness and must not be read as a default.
      list: params.map((p) => ({
        id: p.id,
        group: p.group,
        key: p.key,
        label: p.label,
        cc: p.cc,
        max: p.max,
        value: p.value,
        flag: p.flag,
      })),
    },
    // What the app thought was wrong. Recomputable from the lists above, but
    // this is what the issue is ABOUT — it should be readable off the top of
    // the file rather than diffed out of 110 entries.
    difference: verdict
      ? {
        appCount: verdict.appCount,
        deviceCount: verdict.deviceCount,
        missing: verdict.missing,
        extra: verdict.extra,
        renamed: verdict.renamed,
        labelDrift: verdict.labelDrift,
        maxDrift: verdict.maxDrift,
        summary: verdict.summary,
      }
      : null,
  };
}

// seven-instrument-report-1.42-2026-08-15.json — the firmware VERSION only, so
// the name stays short and sortable; the whole string is inside the file.
function reportFileName(firmware, created) {
  const version = (/v\.?\s*([\d.]+)/i.exec(String(firmware || '')) || [])[1] || 'unknown';
  const day = String(created || '').slice(0, 10) || 'undated';
  return `seven-instrument-report-${version}-${day}.json`;
}

module.exports = { buildReport, reportFileName };
