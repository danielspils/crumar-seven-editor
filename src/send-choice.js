'use strict';

// SEND TO SEVEN, when the patch on screen has been edited.
//
// What used to happen: the send discarded the live edits, told the player
// afterwards that they were gone, sent the file's version anyway, and left them
// looking at a cleared save button. Every part of that was true, and the player
// was never asked (Daniel, 2026-08-21).
//
// The decision lives here, apart from the modal and the store, because it has
// four outcomes and a loop — and because a UI scenario cannot reach any of it
// without a connected instrument: drift needs a live session, and a live
// session needs the cable. Injected `ask` and `saveAsNew` make the whole shape
// reachable from `npm test`, which is where the branch nobody would think to
// try by hand — cancelling the name and being asked again — gets pinned.

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SevenSendChoice = api;
})(typeof window !== 'undefined' ? window : null, function () {
  // ask()      -> false | 'secondary' | true   (X | save edits | send original)
  // saveAsNew() -> true when a patch was written, false when cancelled/refused
  //
  // Returns: 'send'   proceed into the destination flow with the file's version
  //          'cancel' nothing happens at all
  //          'saved'  a new patch exists; do NOT chain into the send
  async function decideSend({ hasDrift, ask, saveAsNew }) {
    // NOT DRIFTED: no question to ask. The existing flow is unchanged, which is
    // the common case and must stay the fast one.
    if (!hasDrift) return 'send';

    for (;;) {
      const answer = await ask();

      // X — and it means it. Nothing sent, nothing saved, the edits and the
      // save button both stay. A dialog that "cancels" by quietly doing the
      // safe-looking half is worse than one that does nothing.
      if (!answer) return 'cancel';

      // Send original: the edits are discarded because that is what was
      // chosen, and the modal said so before the click rather than after it.
      if (answer !== 'secondary') return 'send';

      // Saved: stop. Chaining into the send would take the player somewhere
      // they did not ask to go — and they are now on a patch with no drift, so
      // clicking Send to Seven again goes straight through.
      if (await saveAsNew()) return 'saved';

      // The name was cancelled or refused. NOTHING HAS BEEN DECIDED, so the
      // question comes back rather than the whole thing closing — losing the
      // send because you thought better of a name is not an outcome anybody
      // asked for.
    }
  }

  return { decideSend };
});
