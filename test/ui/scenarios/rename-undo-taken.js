// Undo of a rename, when the old name is no longer free.
//
// THIS SCENARIO DOES NOT RUN ON `npm test`. The test script globs
// "test/*.test.js", which never descends into test/ui/ — this only runs when
// someone types `npm run test:ui`. Its companion test/ipc-result.test.js
// covers the seam (a refusal throws rather than returning something usable)
// and DOES run in CI. This one needs a real window because the thing under
// test is the undo stack talking to the toast, and neither exists outside the
// app.
//
// THE BUG: rename answers with a filename or with { ok: false, error }, and the
// undo closure stored the refusal as though it were a filename, returned
// normally, and let runUndo announce "Undid: rename to …". The undo did
// nothing and said it had worked.
//
// The decided behaviour: an undo that cannot be performed says so. Not a name
// nobody chose, not a dialog in front of a keystroke — a refusal, out loud.
//
// SETTING THE TRAP TAKES CARE. The obvious script — rename A away, rename B
// onto A's old name, undo — cannot work: the stack is LIFO, so Cmd-Z undoes
// B's rename and frees the name it was supposed to be blocked by. The name
// has to be taken by something that pushed NO undo entry, which is what
// duplicate does. It is called here through the same IPC the app's own
// Duplicate uses; only the naming modal is skipped.
(async () => {
  const rows = () => ui.$$('.lib-row.lib-patch .patch-name');
  const names = () => rows().map((el) => el.textContent.trim());
  const nameEl = (text) => rows().find((el) => el.textContent.trim() === text);
  const toastText = () => (ui.$('#undo-toast') || {}).textContent || '';
  const stored = async () => (await window.sevenAPI.library.list()).patches
    .filter((e) => !e.invalid).map((e) => e.name);

  // Two clicks inside 450ms open the rename field — the list re-renders after
  // the first, so the second has to be aimed at a freshly queried node.
  async function renameTo(from, to) {
    if (!ui.check(!!nameEl(from), `a row called “${from}” to rename`)) return false;
    ui.click(nameEl(from), `the name “${from}”`);
    await ui.sleep(80);
    if (!ui.click(nameEl(from), `the name “${from}” again`)) return false;
    const input = await ui.waitEl('.lib-rename-input', 'the rename field');
    if (!input) return false;
    input.value = to;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return ui.waitFor(() => names().includes(to), { what: `the row to read “${to}”` });
  }

  const undo = () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true }));
    return ui.sleep(900);
  };

  await ui.openLibrary();
  ui.click(await ui.waitEl('.seg-btn[data-tab="patches"]', 'the Patches tab'), 'the Patches tab');
  await ui.waitFor(() => rows().length > 0, { what: 'the patches list' });

  // The Patches tab lists your own patches only (records live behind Backups),
  // so every row here is subject to the one-name-per-patch rule.
  const start = names();
  if (!start.length) {
    ui.note('skipped: the library has no patches');
    return;
  }
  const victim = start[0];
  ui.note(`renaming “${victim}” away, then taking its name`);

  // 1. Rename it away. THIS is the undo entry under test: put “victim” back.
  if (!await renameTo(victim, 'Undo Target')) return;

  // 2. Take the freed name with a copy. Duplicate pushes no undo entry, so
  //    this cannot be popped before the rename it is meant to block.
  const listed = (await window.sevenAPI.library.list()).patches
    .find((e) => !e.invalid && e.name === 'Undo Target');
  if (!ui.check(!!listed, 'the renamed patch is on disk under its new name')) return;
  await window.sevenAPI.library.duplicate(listed.file, listed.patchIndex, victim);
  ui.check((await stored()).includes(victim), `a copy now holds “${victim}”`);

  // 3. Undo. The old name belongs to the copy, so the store refuses.
  await undo();

  ui.check(
    /Couldn’t undo/.test(toastText()),
    `the undo says it could not happen — toast: “${toastText()}”`
  );
  // The store's own sentence, carried through unchanged. It is the only part
  // of the error that survives contextBridge — custom properties are stripped,
  // so nothing downstream can re-word this by inspecting a code.
  ui.check(
    new RegExp(`already a patch called “${victim}”`).test(toastText()),
    `and says what is in the way — toast: “${toastText()}”`
  );

  // Read from DISK, not from the list: the point is what actually happened,
  // and a refused undo does not refresh the view.
  const after = await stored();
  ui.check(
    after.includes('Undo Target'),
    `the patch still holds the name the undo failed to change — ${after.slice(0, 5)}`
  );
  ui.check(
    after.filter((n) => n === victim).length === 1,
    `and “${victim}” still belongs to exactly one patch`
  );
})()
