// @env SEVEN_NO_DEVICE=1
//
// THE WHEEL IS NOT OFFERED WITH NOTHING PLUGGED IN — in every tab.
//
// Two reasons, and the second is the one that makes this a fix rather than a
// tidy-up:
//
//   It cannot act. Choosing needs a connected instrument, so offline the only
//   possible outcome was a toast saying "Connect the Seven".
//
//   It would be WRONG. soundList falls back to schema.sounds when nothing is
//   attached — this build's 24, not the player's instrument — so the wheel
//   offered sounds their Seven may not have and hid ones it does. A claim
//   about hardware needs hardware, and that applies to a control as much as
//   to a badge.
//
// ON THE SEVEN IS THE TAB THAT CHANGED. It showed the carousel offline in
// every shipped build up to 1.5.3 (measured), so it is the one that most
// needs pinning: this scenario is the record that the change was deliberate.
//
// The gate is CONNECTEDNESS, never sounds.length. Asserting on list length
// would pass offline for the wrong reason, because the schema fallback keeps
// it above 2.
(async () => {
  const plainOnly = (where) => {
    const art = ui.$('#detail .engine-art');
    ui.check(!!art, `${where}: the instrument picture is there`);
    if (!art) return;
    ui.check(!art.classList.contains('engine-carousel'),
      `${where}: it is the plain picture, not the wheel (${art.className})`);
    ui.check(!ui.$('[data-carousel]'),
      `${where}: no carousel anywhere in the document`);
  };

  // 1. ON THE SEVEN — the tab whose behaviour this changed.
  await ui.closeLibrary();
  await ui.sleep(600);
  const tab = ui.$$('.bank-tab')[1];
  if (tab) { ui.click(tab, 'Bank 2'); await ui.sleep(400); }
  const slot = ui.$$('.patch-row')[0];
  if (ui.check(!!slot, 'a preset row on the Seven')) {
    ui.click(slot, 'a preset');
    await ui.sleep(1200);
    plainOnly('On the Seven');
  }

  // 2. PATCHES — a library patch of your own.
  await ui.openLibrary();
  ui.click(await ui.waitEl('.seg-btn[data-tab="patches"]', 'the Patches tab'), 'Patches');
  await ui.sleep(600);
  const row = ui.$('#library .lib-row.lib-patch, #library [data-file]');
  if (ui.check(!!row, 'a patch to select')) {
    ui.click(row, 'a patch');
    await ui.sleep(1200);
    plainOnly('Patches');
  }
  await ui.closeLibrary();
})()
