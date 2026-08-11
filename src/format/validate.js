'use strict';

// Checks a library object against a parameter schema. Returns a report — it
// never prints, never throws, and NEVER MUTATES the library.
//
// Severity rules (docs/FORMAT.md):
// - wrong `format` string / non-integer `formatVersion` / non-array `patches`
//   → error (the file cannot be trusted as a library).
// - out-of-range param value → WARNING, value preserved verbatim. Clamping
//   belongs to the MIDI layer at send time; doing it here would let an
//   open-then-resave silently destroy data from a future firmware.
// - missing param key → WARNING naming the key; the library stays usable.
// - unknown keys (top-level, patch-level, or unknown param keys) → recorded,
//   round-tripped verbatim by the serializer.

const FORMAT_NAME = 'crumar-seven-library';
const KNOWN_TOP = new Set(['format', 'formatVersion', 'created', 'source', 'patches']);
const KNOWN_PATCH = new Set(['name', 'origin', 'sound', 'params', 'source', 'captured', 'verified']);

function emptyReport() {
  return { errors: [], warnings: [], missingParams: [], outOfRange: [], unknownKeys: [] };
}

// Structure-only checks — usable without a schema (parse.js relies on this).
function structuralReport(library, report) {
  if (library === null || typeof library !== 'object' || Array.isArray(library)) {
    report.errors.push('library is not an object');
    return report;
  }
  if (library.format !== FORMAT_NAME) {
    report.errors.push(
      `wrong format string: expected "${FORMAT_NAME}", got ${JSON.stringify(library.format)}`
    );
  }
  if (!Number.isInteger(library.formatVersion)) {
    report.errors.push(
      `formatVersion must be an integer, got ${JSON.stringify(library.formatVersion)}`
    );
  } else if (library.formatVersion > 1) {
    report.warnings.push(
      `file written by formatVersion ${library.formatVersion}; unknown data is preserved verbatim`
    );
  }
  if (!Array.isArray(library.patches)) {
    report.errors.push('patches must be an array');
  }
  return report;
}

function validateLibrary(library, schema) {
  const report = emptyReport();
  structuralReport(library, report);
  if (report.errors.length && !Array.isArray(library && library.patches)) return report;

  for (const k of Object.keys(library)) {
    if (!KNOWN_TOP.has(k)) report.unknownKeys.push({ where: 'library', key: k });
  }

  const byKey = schema ? new Map(schema.parameters.map((p) => [p.key, p])) : null;

  (library.patches || []).forEach((patch, i) => {
    const where = `patches[${i}]`;
    if (patch === null || typeof patch !== 'object') {
      report.errors.push(`${where} is not an object`);
      return;
    }
    for (const k of Object.keys(patch)) {
      if (!KNOWN_PATCH.has(k)) report.unknownKeys.push({ where, key: k });
    }
    if (!patch.sound || typeof patch.sound.name !== 'string') {
      report.warnings.push(`${where} has no sound.name — import cannot resolve its sound`);
    }
    const params = patch.params;
    if (params === null || typeof params !== 'object' || Array.isArray(params)) {
      report.warnings.push(`${where} has no params object`);
      return;
    }
    if (!byKey) return;
    for (const p of schema.parameters) {
      if (!(p.key in params)) {
        report.missingParams.push({ patch: i, key: p.key });
        report.warnings.push(`${where} missing param "${p.key}" (${p.label})`);
      }
    }
    for (const [key, value] of Object.entries(params)) {
      const p = byKey.get(key);
      if (!p) {
        report.unknownKeys.push({ where: `${where}.params`, key });
        continue;
      }
      if (!Number.isInteger(value) || value < p.min || value > p.max) {
        report.outOfRange.push({ patch: i, key, value, max: p.max });
        report.warnings.push(
          `${where}.params.${key} = ${JSON.stringify(value)} is outside schema range ` +
            `${p.min}..${p.max} — preserved verbatim; clamping happens at send time`
        );
      }
    }
  });

  return report;
}

module.exports = { validateLibrary, structuralReport, emptyReport, FORMAT_NAME };
