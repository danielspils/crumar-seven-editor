// Undo (Cmd/Ctrl-Z) puts library actions back. No instrument needed: these
// are file operations, which is exactly why they must be reversible.
(async () => {
  const openLibrary = () => {
    ui.$('#library-head').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return ui.sleep(500);
  };
  const setlists = () => ui.$$('.lib-setlist .patch-name').map((el) => el.textContent.trim());
  const undo = () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true }));
    return ui.sleep(900);
  };

  await openLibrary();
  ui.click(ui.$('.seg-btn[data-tab="setlists"]'), 'the Setlists tab');
  await ui.sleep(500);
  const before = setlists();
  ui.check(before.length > 0, `some setlists exist (${before.length})`);

  // Create one, then take it back.
  ui.click(ui.$('.lib-new-setlist'), 'New setlist');
  await ui.sleep(400);
  const input = ui.$('[data-setlist-create]');
  if (!ui.check(!!input, 'the new-setlist field opens')) return;
  input.value = 'Undo Me';
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await ui.sleep(900);
  ui.check(setlists().includes('Undo Me'), `the setlist was created: ${setlists()}`);

  await undo();
  ui.check(!setlists().includes('Undo Me'), `undo removed it again: ${setlists()}`);
  ui.check(!!ui.$('#undo-toast.shown'), 'undo says what it put back');
  ui.note(`toast: ${ui.$('#undo-toast')?.textContent}`);

  // And the list is otherwise exactly as it started.
  ui.check(
    JSON.stringify(setlists()) === JSON.stringify(before),
    `the list matches its starting state\n      before: ${before}\n      after:  ${setlists()}`
  );
})()
