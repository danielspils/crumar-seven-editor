// Left and right walk the bank tabs. Needs no instrument: browsing banks is
// navigation, and the app holds the four banks from the last backup.
//
// Written as a UI scenario rather than a unit test because the handler lives
// on `document` in app.js — the thing worth checking is that a real keydown
// reaches it and moves the tab, not that a function does arithmetic.
(async () => {
  const activeBank = () => {
    const tab = ui.$('.bank-tab.active');
    return tab ? Number(tab.dataset.bank) : null;
  };
  const press = async (key) => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    await ui.sleep(120);
  };

  // THE BANK REGION HAS TO BE ON SCREEN, and whether it is was decided by
  // whichever scenario ran last: the tray's open state is persisted in
  // localStorage, and the runner shares userData between scenarios. Open, the
  // region is a collapsed strip with no tabs in it. This scenario failed for
  // two days behind arrow-ownership-open.js, which leaves it open on purpose.
  await ui.closeLibrary();

  // Start from a known tab by clicking it, which is also the path the arrows
  // have to agree with. waitClickable rather than $, so an unreachable tab
  // says it waited rather than reporting whatever was under the coordinates.
  ui.click(await ui.waitClickable('.bank-tab[data-bank="0"]', 'Bank 1 tab'), 'Bank 1 tab');
  await ui.sleep(150);
  ui.check(activeBank() === 0, 'clicking Bank 1 selects it');

  await press('ArrowRight');
  ui.check(activeBank() === 1, `right steps to Bank 2 (at ${activeBank()})`);
  await press('ArrowRight');
  await press('ArrowRight');
  ui.check(activeBank() === 3, `right reaches Bank 4 (at ${activeBank()})`);

  // Clamps: the tabs stand for four buttons on the panel, which do not wrap.
  await press('ArrowRight');
  ui.check(activeBank() === 3, `right at Bank 4 stays put (at ${activeBank()})`);

  await press('ArrowLeft');
  ui.check(activeBank() === 2, `left steps back to Bank 3 (at ${activeBank()})`);
  await press('ArrowLeft');
  await press('ArrowLeft');
  await press('ArrowLeft');
  ui.check(activeBank() === 0, `left clamps at Bank 1 (at ${activeBank()})`);

  // A text field owns its own arrows — the rename input must keep them.
  const input = document.createElement('input');
  document.body.appendChild(input);
  input.focus();
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  await ui.sleep(120);
  ui.check(activeBank() === 0, 'an arrow typed in a text field does not move the bank');
  input.remove();

  return { activeBank: activeBank() };
})()
