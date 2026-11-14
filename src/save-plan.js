'use strict';

// SAVING WHAT YOU HEAR — the decision, apart from the dialog and the store.
//
// WYHIWYG. Daniel, 14 Nov 2026: "What I'm hearing is what I want to save .. so
// it shouldn't matter if it's partly programmed in the app and partly on the
// Seven." Save used to write the app's own copy of the patch, which is a
// BELIEF — the values it sent, plus whatever panel moves it managed to follow.
// A belief is not what is sounding. So a save reads the edit buffer off the
// instrument and writes THAT.
//
// It lives here, injected, for the same reason src/send-choice.js does: none
// of it is reachable from a UI scenario without a connected Seven, because a
// live session needs the cable. The branches nobody would think to try by hand
// — losing the instrument half way through the read, the device reporting
// fewer parameters than the schema has, the tick box being cleared — are
// exactly the ones that lose work, and this is where they get pinned in
// `npm test`.
//
// Two rules are worth stating before the code, because every function here is
// one of them:
//
//   1. WHAT IS WRITTEN IS WHAT WAS READ. Never the app's copy, whenever there
//      is an instrument to ask.
//   2. A READ THAT DID NOT FINISH WRITES NOTHING. Not a shorter patch, not a
//      blend of fresh and stale values — nothing. A file holding sixty read
//      values and fifty remembered ones is worse than no file, because nothing
//      afterwards can tell it from a real one.

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SevenSavePlan = api;
})(typeof window !== 'undefined' ? window : null, function () {
  // WHICH ROWS THE DIALOG OFFERS.
  //
  // The overwrite row is ABSENT with nothing changed: there is no slot to
  // overwrite, and a row offering to replace a preset with its own contents is
  // an instruction to do nothing. With changes it is present — and it is NOT a
  // save button and must not read like one, because the app cannot write a
  // slot on the Seven at all. There is no store opcode; only the player's
  // three-second hold does it. So the row can only tell him to hold, which is
  // why the hold is named in the row itself rather than hidden behind a click.
  //
  // The slot is named ONLY when it is known. The hold overwrites whichever
  // preset the instrument is sitting on — not the one on screen — so a name
  // printed from a stale belief is an instruction to overwrite something the
  // player did not mean. Worse than naming nothing.
  function saveRows({ changed, slot = null }) {
    const rows = [];
    if (changed) {
      rows.push({
        value: 'hold',
        title: slot
          ? `Overwrite Bank ${slot.bank} / Slot ${slot.preset}`
          : 'Overwrite the preset on your Seven',
        sub: 'Hold the button on the Seven to confirm',
      });
    }
    rows.push({
      value: 'computer',
      title: 'Save to computer',
      sub: 'Adds it to your Patches library. The Seven is untouched',
    });
    return rows;
  }

  // The rows as markup, here rather than in audition.js so a UI scenario can
  // render exactly what the player sees instead of a replica of it. A replica
  // cannot fail when the real one breaks, which is the only failure a layout
  // scenario exists to catch (CLAUDE.md, 2026-08-23).
  const esc = (v) =>
    String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const rowsHtml = (rows) =>
    '<div class="sv-rows">' + rows.map((r) =>
      `<button type="button" class="sv-row" data-sv="${esc(r.value)}">` +
      `<span class="sv-row-t">${esc(r.title)}</span>` +
      `<span class="sv-row-s">${esc(r.sub)}</span></button>`
    ).join('') + '</div>';

  // WHAT THE SAVE WRITES.
  //
  // Connected -> the instrument's buffer. `readBuffer` returning null means it
  // could not be finished, and the answer is null all the way out: the caller
  // writes nothing and says why.
  //
  // NOT connected -> the app's copy, which is a different save and has to be
  // presented as one. There is nothing to ask, so this is not a failure; it is
  // a file that records the app's view rather than a reading, and the same
  // words meaning two different things depending on a cable is the shape of
  // bug this project keeps finding.
  async function valuesToWrite({ connected, readBuffer, appParams }) {
    if (!connected) return { params: { ...appParams() }, fromInstrument: false };
    const read = await readBuffer();
    if (!read || !read.params) return null;
    return { params: read.params, missing: read.missing || [], fromInstrument: true };
  }

  // THE WHOLE FLOW.
  //
  //   ask()        -> 'hold' | 'computer' | 'leave' | null (dismissed)
  //   holdScreen() -> true when "Also save a copy to Patches" was left ticked
  //   write(params, { asNew }) -> true when a patch was written
  //
  // Returns 'saved', 'leave' (discard and go) or 'stay'.
  //
  // DISMISSING MEANS STAY, from both entry points. Discarding is the one move
  // here that cannot be walked back, so it takes a deliberate press — never an
  // Escape, never a stray click on the backdrop.
  async function decideSave({
    connected, ask, holdScreen, readBuffer, appParams, write, savesAsNew = true,
  }) {
    const answer = await ask();
    if (answer === 'leave') return 'leave';
    if (answer !== 'hold' && answer !== 'computer') return 'stay';

    // THE HOLD IS THE PLAYER'S, AND IT MAY NOT HAPPEN. The tick box is the
    // whole protection against that, which is why it is ticked by default:
    // unticked it is a step he would skip in exactly the moment he needs it.
    // Cleared deliberately, there is nothing left for this app to do — the
    // instruction has been read and the keeping is his.
    if (answer === 'hold' && !(await holdScreen())) return 'stay';

    const values = await valuesToWrite({ connected, readBuffer, appParams });
    if (!values) return 'stay';

    // A COPY TAKEN AT THE HOLD IS ALWAYS A NEW PATCH, whatever view it was
    // reached from. It exists because the hold may not happen — a record of
    // this moment, taken as insurance — and writing it over whatever file is
    // open would be a second consequence nobody asked for.
    const asNew = answer === 'hold' ? true : savesAsNew;
    return (await write(values.params, { asNew, missing: values.missing || [] }))
      ? 'saved'
      : 'stay';
  }

  return { saveRows, rowsHtml, valuesToWrite, decideSave };
});
