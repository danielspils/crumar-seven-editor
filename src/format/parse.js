'use strict';

// .sevenlib.json string -> { library, report }.
//
// PARSE MUST NOT MUTATE. The returned library is exactly what the file
// contained — out-of-range values are preserved verbatim and reported as
// warnings (key, value, schema max); unknown keys are kept so a
// formatVersion 2 file opened by this build loses nothing on re-save.
// Clamping is the MIDI layer's job at send time, never the parser's.
//
// Never throws on recoverable problems. Unrecoverable input (invalid JSON)
// yields { library: null } with the error in the report rather than a throw,
// so callers have one uniform result shape.

const { validateLibrary, structuralReport, emptyReport } = require('./validate.js');

function parseLibrary(text, opts = {}) {
  const report = emptyReport();
  let library;
  try {
    library = JSON.parse(text);
  } catch (e) {
    report.errors.push(`invalid JSON: ${e.message}`);
    return { library: null, report };
  }
  if (opts.schema) {
    const full = validateLibrary(library, opts.schema);
    return { library, report: full };
  }
  structuralReport(library, report);
  return { library, report };
}

module.exports = { parseLibrary };
