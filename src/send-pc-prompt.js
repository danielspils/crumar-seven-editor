'use strict';

// SEND PC IS OFF — deciding whether to say so, and turning it on if asked.
//
// "Send PC" is the instrument's own name: glb index 3, listed under that name
// in the manual (docs/DEVICE.md) and shown that way in the manufacturer's
// editor. Two independent sources agree, which matters more than usual here —
// a modal naming a setting the player cannot find on their own panel has
// taught them nothing.
//
// With it OFF, a panel recall emits no Program Change. The app still hears
// WHICH SOUND is playing, from the unsolicited 0x45, but never which preset
// SLOT — so it cannot follow the panel, and the recall burst never closes,
// which is what the store-detection fingerprint is assembled from.
//
// TWO RULES, and the second is the one worth the module:
//
//   - Driven by an actual READ of the global, never by an assumption about
//     defaults. Off IS the factory setting, which is exactly why assuming it
//     feels safe and is not: a unit whose globals did not answer would be told
//     its setting is off when nobody knows. status().sendPc is already null in
//     that case, and null is not zero.
//   - A write is not a success until the instrument agrees. setGlobalOption
//     re-reads the global and returns what the device now holds; if that
//     disagrees with what was asked, the app must not report a change to
//     somebody's instrument that it has not verified.
//
// NOT the transfer runner's borrow-and-restore. That path writes a
// pending-restore marker and puts the setting back afterwards. This one is
// permanent, with the player's consent — pressing the button IS the consent —
// so it goes through setGlobalOption, which writes no marker.

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SevenSendPcPrompt = api;
})(typeof window !== 'undefined' ? window : null, function () {
  const SEND_PC_INDEX = 3;

  // Strictly 0. `null` means the globals could not be read and `undefined`
  // means nobody looked; neither is evidence of anything.
  function shouldPrompt(status) {
    if (!status || status.state !== 'connected') return false;
    return status.sendPc === 0;
  }

  async function turnOn({ setGlobal }) {
    let r;
    try {
      r = await setGlobal(SEND_PC_INDEX, 1);
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
    if (!r || r.ok === false) {
      return { ok: false, error: (r && r.error) || 'The Seven did not accept that change.' };
    }
    // THE READ-BACK IS THE ANSWER, not the fact that a write was sent.
    if (r.value !== 1) {
      return { ok: false, error: 'The write did not take — Send PC is still off on the Seven.' };
    }
    return { ok: true };
  }

  return { shouldPrompt, turnOn, SEND_PC_INDEX };
});
