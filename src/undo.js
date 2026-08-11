'use strict';

// Undo stack. Every entry carries the work needed to put one thing back, so a
// step is described where it happens rather than reconstructed later from a
// diff. Deliberately linear and one-directional: this app's actions are small
// and independent (rename a patch, fill a slot, move a parameter), and a redo
// stack would mostly be a way to get the instrument and the library out of
// step with each other.
//
// What is NOT undoable is as important as what is:
//   - a backup run: it reads the instrument and writes files, and "undoing" it
//     would mean deleting patches that are now the only copy of something;
//   - trashing a patch: the file is in the system Trash, and only the Finder
//     can put it back — pretending otherwise would be worse than saying so;
//   - the three-second panel hold: that happens on the instrument, by hand,
//     and nothing this app does can reach it.

(function (global) {
  const LIMIT = 50;

  function createUndoStack() {
    const stack = [];
    let onChange = null;

    return {
      // label: what the user did, phrased so "Undo <label>" reads correctly.
      // undo: async () => void — puts it back. Throwing surfaces to the caller.
      push(label, undo) {
        stack.push({ label, undo });
        if (stack.length > LIMIT) stack.shift();
        if (onChange) onChange(this.peek());
      },
      peek() {
        return stack.length ? stack[stack.length - 1].label : null;
      },
      get depth() {
        return stack.length;
      },
      // Runs the newest entry. Returns its label, or null when empty. An entry
      // that throws is DISCARDED rather than retried: the state it wanted to
      // restore is gone (a file renamed underneath it, the instrument
      // unplugged), and leaving it on top would jam every later undo.
      async undo() {
        const entry = stack.pop();
        if (onChange) onChange(this.peek());
        if (!entry) return null;
        await entry.undo();
        return entry.label;
      },
      // Called when a step's target stops existing — a patch trashed after it
      // was renamed, say. Entries the predicate matches are dropped.
      forget(predicate) {
        for (let i = stack.length - 1; i >= 0; i--) {
          if (predicate(stack[i])) stack.splice(i, 1);
        }
        if (onChange) onChange(this.peek());
      },
      clear() {
        stack.length = 0;
        if (onChange) onChange(null);
      },
      onChange(fn) {
        onChange = fn;
      },
    };
  }

  global.SevenUndo = { createUndoStack };
})(window);
