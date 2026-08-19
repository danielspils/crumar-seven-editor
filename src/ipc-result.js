'use strict';

// One shape for "the main process refused to do the thing".
//
// A handler that either does something or doesn't answers in one of two ways:
// the RESULT (a filename, an object, whatever the call is for), or
// `{ ok: false, error }`. That union has no marker on its success half, so the
// failure half is a perfectly truthy value that reads as a result — and every
// caller that forgets to check proceeds on it.
//
// It cost an undo that reported success while doing nothing at all: the store
// refused the rename, the renderer stored `{ ok: false, … }` as though it were
// a filename, the undo closure returned normally, and the toast said
// "Undid: rename to …" (2026-08-18).
//
// So the seam converts a refusal into an exception. A thrown error is the only
// shape a caller cannot ignore by accident: forget to handle it and the action
// stops loudly instead of continuing on a wrong value. See CLAUDE.md,
// "Two conventions for a refused write".
//
// A CANCELLATION IS NOT A REFUSAL. `{ ok: false, cancelled: true }` is what a
// file dialog says when somebody pressed Cancel — the answer to "did this
// happen?" is no, and nothing went wrong. Turning that into an exception would
// put an error in front of a person who chose not to do something.
function throwIfRefused(result, code) {
  if (result && result.ok === false && !result.cancelled) {
    const err = new Error(result.error || 'That is not allowed.');
    err.code = code || 'REFUSED';
    throw err;
  }
  return result;
}

module.exports = { throwIfRefused };
