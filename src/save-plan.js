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
  // EVERY ROW IS A DESTINATION, and the count varies by where you are: two in
  // ON THE SEVEN, three in Patches. Settled by Daniel, 14 Nov 2026.
  //
  // The third row is `update`, and it is here because the question it asks used
  // to be a SECOND DIALOG. Choosing "save to computer" on one of your own
  // patches opened "write these values into X, or keep it and save them as a
  // separate patch" — so an ordinary save met two dialogs in a row, which is
  // the confusion this whole feature exists to remove. Daniel: "'update this
  // patch' is the common want in Patches that the modal currently cannot
  // serve."
  //
  // `update` is offered only when there is a file to update and updating it is
  // allowed — never for a bank slot, which has no file behind it, and never
  // for a backup record or a Bank 1 donor. Those two refusals are the caller's
  // to decide (audition.js canUpdate) because they are facts about the library;
  // this function only lays out what it is told is possible.
  function saveRows({ changed, slot = null, canUpdate = false, targetName = '' }) {
    const rows = [];
    // NOTHING CHANGED MEANS NOTHING TO WRITE BACK. A row offering to update a
    // patch with its own contents is an instruction to do nothing, exactly as
    // the overwrite row below would be.
    if (changed && canUpdate) {
      rows.push({
        value: 'update',
        // NAMED, because this dialog is reached from several views and Daniel
        // once met the old version of this question while standing in Backups
        // and could not tell which patch was the target (2026-08-22). The
        // unnamed fallback exists for a patch with no name, not as a choice.
        title: targetName ? `Update “${targetName}”` : 'Update this patch',
        sub: 'Writes these values into the patch you have open',
      });
    }
    // BANK 1 CANNOT BE STORED TO, so it is never offered as a destination.
    //
    // The Seven refuses a store into Bank 1 outright — owner-confirmed on
    // hardware 2026-08-13, and it is why Bank 1 is the only place the factory's
    // own numbers are readable. The transfer runner blocks it, and the app
    // blocks it as a destination in three other places. This flow did not: a
    // hardware run of switch-patch-guard offered "Overwrite Bank 1 · Preset 1"
    // on a real instrument.
    //
    // That is this feature's own failure mode, pointed back at itself. Daniel
    // lost two patches on 13 Nov by hunting for a way to save, and the row
    // would have sent him to hold a button for three seconds while the
    // instrument quietly refused — a save he would have every reason to
    // believe had worked.
    //
    // ABSENT, not disabled, and not relabelled to say the bank is locked:
    // adding that sentence is a copy decision rather than a correctness one,
    // and what is left — "Save to computer" — is already the true answer, since
    // the computer is genuinely the only place a Bank 1 edit can go.
    const slotIsWritable = !slot || slot.bank !== 1;
    if (changed && slotIsWritable) {
      rows.push({
        value: 'hold',
        // PRESET, with a ·, because that is what the instrument prints on its
        // own panel and what the other nine places in this app say. "Slot" was
        // the spec's word (out/save-what-you-hear.md §3, corrected 14 Nov) and
        // it made this flow the only place in the app using it — the modal and
        // the hold screen would say Slot while the library row the save lands
        // in says Preset, which is the confusion this feature exists to remove.
        title: slot
          ? `Overwrite Bank ${slot.bank} · Preset ${slot.preset}`
          : 'Overwrite the preset on your Seven',
        // NOT "to confirm". This row is here precisely BECAUSE the app cannot
        // write a preset — there is no store opcode — so a word implying the
        // app did it and the player is approving reverses the row's whole job.
        sub: 'Holding the button on the Seven for three seconds is what saves it',
      });
    }
    rows.push({
      value: 'computer',
      title: 'Save to computer',
      // THE CONTRAST IS THE POINT when `update` sits above it: both write to
      // the computer and the difference is which file. The words are the ones
      // the dialog this replaces already used, and Daniel has read those.
      sub: canUpdate && changed
        ? 'Keeps this patch and saves these values as a separate one'
        : 'Adds it to your Patches library. The Seven is untouched',
    });
    return rows;
  }

  // The rows as markup, here rather than in audition.js so a UI scenario can
  // render exactly what the player sees instead of a replica of it. A replica
  // cannot fail when the real one breaks, which is the only failure a layout
  // scenario exists to catch (CLAUDE.md, 2026-08-23).
  const esc = (v) =>
    String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // TWO ATTRIBUTES, TWO JOBS, and the second one is not decoration.
  //
  //   data-sv            WHICH destination this row means — read by the caller
  //   data-modal-choice  that clicking it ANSWERS the dialog — read by modal.js
  //
  // This dialog has no affirmative button on purpose, so without the second
  // attribute a row click records the choice and settles nothing: the dialog
  // stays open and the player's click appears to do nothing, which is exactly
  // what Daniel reported on 2026-11-14. Letting modal.js settle on a marked
  // choice means a dialog built out of rows cannot be left unanswerable by a
  // caller that forgot to wire it up.
  const rowsHtml = (rows) =>
    '<div class="sv-rows">' + rows.map((r) =>
      `<button type="button" class="sv-row" data-sv="${esc(r.value)}" data-modal-choice>` +
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
  //   ask()        -> 'update' | 'hold' | 'computer' | 'leave' | null (dismissed)
  //   holdScreen() -> true when "Also save a copy to Patches" was left ticked
  //   write(params, { asNew }) -> true when a patch was written
  //
  // Returns 'saved', 'leave' (discard and go) or 'stay'.
  //
  // DISMISSING MEANS STAY, from both entry points. Discarding is the one move
  // here that cannot be walked back, so it takes a deliberate press — never an
  // Escape, never a stray click on the backdrop.
  // The three destination rows. Anything else — a dismissal, a stray click, a
  // value a future row adds without teaching this function about it — is STAY,
  // which is the answer that writes nothing and loses nothing.
  const DESTINATIONS = ['update', 'hold', 'computer'];

  async function decideSave({
    connected, ask, holdScreen, readBuffer, appParams, write,
  }) {
    const answer = await ask();
    if (answer === 'leave') return 'leave';
    if (!DESTINATIONS.includes(answer)) return 'stay';

    // THE HOLD IS THE PLAYER'S, AND IT MAY NOT HAPPEN. The tick box is the
    // whole protection against that, which is why it is ticked by default:
    // unticked it is a step he would skip in exactly the moment he needs it.
    // Cleared deliberately, there is nothing left for this app to do — the
    // instruction has been read and the keeping is his.
    if (answer === 'hold' && !(await holdScreen())) return 'stay';

    const values = await valuesToWrite({ connected, readBuffer, appParams });
    if (!values) return 'stay';

    // ONLY `update` WRITES AN EXISTING FILE, and it is the row the player
    // pressed rather than something inferred from which view they are in. That
    // inference is what this replaces: `savesAsNew` worked out the destination
    // from the view and then a second dialog asked anyway.
    //
    // A COPY TAKEN AT THE HOLD IS ALWAYS A NEW PATCH, whatever view it was
    // reached from. It exists because the hold may not happen — a record of
    // this moment, taken as insurance — and writing it over whatever file is
    // open would be a second consequence nobody asked for.
    const asNew = answer !== 'update';
    return (await write(values.params, { asNew, missing: values.missing || [] }))
      ? 'saved'
      : 'stay';
  }

  return { saveRows, rowsHtml, valuesToWrite, decideSave };
});
