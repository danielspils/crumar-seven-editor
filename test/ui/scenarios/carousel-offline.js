// @env SEVEN_NO_DEVICE=1
//
// OFFLINE THE STACK IS A BROWSER, NOT A CONTROL — in every tab.
//
// THIS FILE ASSERTED THE OPPOSITE UNTIL 18 Nov 2026, and the inversion is
// deliberate rather than a correction. It read "THE WHEEL IS NOT OFFERED
// WITH NOTHING PLUGGED IN", and its two reasons were good ones:
//
//   It cannot act. Choosing needs a connected instrument, so offline the
//   only possible outcome was a toast saying "Connect the Seven".
//
//   It would be WRONG. soundList falls back to schema.sounds when nothing
//   is attached — this build's 24, not the player's instrument — so the
//   wheel offered sounds their Seven may not have and hid ones it does. A
//   claim about hardware needs hardware, and that applies to a control as
//   much as to a badge.
//
// BOTH REASONS SURVIVE AND ARE ANSWERED, which is why this is a rewrite and
// not a deletion. Daniel demonstrates the app without a Seven to hand, and a
// control that cannot be shown is hard to explain — so it renders, and:
//
//   THE REFUSAL IS REMOVED RATHER THAN HIDDEN. Picking is not offered. No
//   Select button, no selection state, no heading renaming itself. Turning
//   is the whole of what works, and turning sends nothing. There is no
//   gesture that appears to act and silently does not — which is the thing
//   the old scenario was protecting against, now protected at the source.
//
//   THE CLAIM IS WITHDRAWN. Every card wears the unverified fade, the same
//   visual language the stale bank rows use. The app shows what it believes
//   and marks what it has not confirmed.
//
// SO THIS NOW PINS THE OFFLINE CONTRACT: the stack is there, it is marked,
// and nothing about it can be mistaken for having taken effect. The geometry
// is carousel-stack.js's subject; this one is about the two tabs and the
// absence of a pick.
//
// ON THE SEVEN IS STILL THE TAB THAT MATTERS MOST. It showed the carousel
// offline in every shipped build up to 1.5.3, then stopped, and now shows it
// again under different rules — three states for one view, which is exactly
// the history a scenario should hold on to.
(async () => {
  const browserOnly = (where) => {
    const art = ui.$('#detail .engine-art');
    ui.check(!!art, `${where}: the instrument picture is there`);
    if (!art) return;
    // IT IS THE STACK.
    ui.check(art.classList.contains('engine-carousel'),
      `${where}: the stack renders offline (${art.className})`);
    ui.check(!!ui.$('[data-carousel]'),
      `${where}: and it is in the document`);
    // AND IT IS MARKED. The list is this build's schema, not a reading of
    // anybody's instrument, so it may not look like a confirmed inventory.
    ui.check(art.classList.contains('is-unverified'),
      `${where}: marked unverified (${art.className})`);
    const op = getComputedStyle(art).opacity;
    ui.check(op !== '' && Number(op) < 1,
      `${where}: and faded (${op || 'DETACHED — no value'})`);
    // NOTHING TO PICK WITH. Before any turning there is nothing to install
    // anyway, so this is the resting state; carousel-stack.js checks the
    // harder case, after a turn has made `moved` true.
    //
    // THIS WAS `!ui.$('#detail [data-car-select]')` AND COULD NOT FAIL. The
    // Select button died with the side-peek wheel on 18 Nov 2026 and nothing
    // in the app renders that selector in any state, so the check was green by
    // asking after something that exists nowhere. It read like coverage of the
    // offline rule and had no power to report a breach of it.
    //
    // THE FRONT CARD IS THE CONTROL NOW, so the question is whether it takes a
    // press. Offline it must not, and the rule that withholds it is scoped
    // `.has-moved:not(.is-unverified)`.
    const front = ui.$('#detail .car-face.is-front');
    if (ui.check(!!front && !!front.isConnected,
      `${where}: the front card is on screen to be asked about`)) {
      // getComputedStyle on a detached node returns '' for everything, and
      // `'' === 'none'` is false — so this would fail honestly rather than
      // pass on nothing, which is why the guard above exists.
      const pe = getComputedStyle(front).pointerEvents;
      // NOTED, NOT ONLY CHECKED. A passing ui.check prints nothing, so a
      // silent green here is indistinguishable from the guard above having
      // skipped the measurement — which is the exact ambiguity that let the
      // old [data-car-select] check sit vacuous for a week. The value in the
      // log is the proof that the question was asked.
      ui.note(`${where}: the front card's pointer-events is ${pe || 'DETACHED'}`);
      ui.check(pe === 'none',
        `${where}: the front card takes no clicks (pointer-events: ${pe || 'DETACHED'})`);
    }
    // THE CHEVRONS ARE THERE, because turning is what still works.
    ui.check(ui.$$('#detail [data-car-step]').length === 2,
      `${where}: both chevrons are present`);
    // AND NO CAPTION, because nothing has been turned yet. Rule 3 of the
    // 18 Nov brief: nothing under the stack while the front card IS the
    // loaded sound — the header already names it.
    //
    // THIS ASSERTED THE OPPOSITE until that day, when the caption was an
    // unconditional "7 of 24". The offline claim it was protecting survives
    // in the form that still matters and is checked in carousel-stack.js:
    // once the stack has been TURNED, the caption is there and carries the
    // count, because offline that is still the only thing saying where you
    // are. Here the stack has not been turned.
    const c = ui.$('#detail .car-count');
    ui.check(!c,
      `${where}: no caption at rest (${c ? `"${c.textContent.trim()}"` : 'none'})`);
    // AND NO LOAD CHIP, which is the offline half: nothing can be sent, so
    // nothing may look like it would send.
    ui.check(!ui.$('#detail .car-load'), `${where}: and no Load chip`);
  };

  // 1. ON THE SEVEN — the tab whose behaviour this has now changed twice.
  await ui.closeLibrary();
  await ui.sleep(600);
  const tab = ui.$$('.bank-tab')[1];
  if (tab) { ui.click(tab, 'Bank 2'); await ui.sleep(400); }
  const slot = ui.$$('.patch-row')[0];
  if (ui.check(!!slot, 'a preset row on the Seven')) {
    ui.click(slot, 'a preset');
    await ui.sleep(1200);
    browserOnly('On the Seven');
  }

  // 2. PATCHES — a library patch of your own.
  await ui.openLibrary();
  await ui.selectTab('patches');
  await ui.sleep(600);
  const row = ui.$('#library .lib-row.lib-patch, #library [data-file]');
  if (ui.check(!!row, 'a patch to select')) {
    ui.click(row, 'a patch');
    await ui.sleep(1200);
    browserOnly('Patches');
  }
  await ui.closeLibrary();
})()
