// THE CAROUSEL IN FRONT OF LIBRARY FILES, AND THE FILE AFTERWARDS.
//
// This control sat here once before, on 2026-08-12, and choosing an instrument
// wrote the new name straight to disk — tine-piano-443, reed-piano, cp70,
// funk-clav and rhodes were silently renamed by what looked like listening.
// It was removed for three weeks and is back, so the guarantee is asserted
// here, in the view where the damage happened.
//
// It checks the FILE, not the screen. A panel showing the old name proves
// nothing about what is on disk, and it was the disk that got hurt.
//
// source-wiring.test.js holds the always-on half of this (no instrument
// needed, runs in CI); this half proves the gesture actually works.
(async () => {
  if (!(await ui.requireDevice())) return;

  const onDisk = async (file) => {
    const lib = await window.sevenAPI.library.list();
    const e = (lib.patches || []).find((x) => x.file === file);
    // Everything the store says about this patch, from disk.
    return e ? JSON.stringify(e) : null;
  };

  for (const tab of ['patches', 'backups']) {
    await ui.openLibrary();
    const seg = await ui.waitEl(`.seg-btn[data-tab="${tab}"]`, `the ${tab} tab`);
    ui.click(seg, `the ${tab} tab`);
    await ui.sleep(700);

    // BACKUPS IS TWO LEVELS. It lists backup SETLISTS ("24 August Backup, 32
    // presets"); the patches are inside one. Patches is a flat list. Both end
    // at a row carrying data-file, which is what the carousel needs.
    if (tab === 'backups') {
      const set = ui.$('#library .lib-row.lib-setlist-row');
      if (!set) { ui.note('backups: this library holds no backup — not checked'); await ui.closeLibrary(); continue; }
      ui.click(set, 'a backup setlist');
      await ui.sleep(1000);
    }
    const row = ui.$('#library .lib-row.lib-patch, #library .lib-slot[data-file], #library [data-file]');
    // A precondition this scenario cannot arrange: whether the copied library
    // contains anything in this tab depends on the source library. Noted
    // rather than failed — an empty tab is not this feature misbehaving.
    if (!row) { ui.note(`${tab}: no patch in this library to try — not checked`); await ui.closeLibrary(); continue; }
    ui.click(row, `a patch in ${tab}`);
    // Selecting plays it; that send must land before the wheel starts another.
    await ui.sleep(3000);

    // THE CONTROL IS THERE — this is what was missing until the restoration.
    const car = ui.$('[data-carousel]');
    if (!ui.check(!!car, `the carousel renders in ${tab} with no preset selected`)) {
      await ui.closeLibrary(); continue;
    }
    const hero = ui.$('[data-carousel] .is-hero');
    const box = hero && hero.getBoundingClientRect();
    ui.check(!!box && box.width > 0 && box.height > 0,
      `and its centre is clickable in ${tab} (${box ? Math.round(box.width) : 0}px)`);

    const file = (ui.$('[data-file]') && ui.$('[data-file]').dataset.file) || row.dataset.file;
    const before = await onDisk(file);
    const wasCentred = hero.dataset.carName;

    // OPEN THE WHEEL FIRST. At rest it is one picture; the neighbours only
    // come out from under the centre when the pointer is over it, so a click
    // aimed at a peek face while it is closed lands on whatever is on top.
    // This is the real gesture, not a shortcut around it.
    const r = car.getBoundingClientRect();
    document.dispatchEvent(new PointerEvent('pointermove', {
      clientX: Math.round(r.left + r.width / 2),
      clientY: Math.round(r.top + r.height / 2),
      bubbles: true,
    }));
    await ui.sleep(600);
    ui.check(car.classList.contains('is-open'), `the wheel opens on hover in ${tab}`);

    // TURN IT, then CHOOSE the centre.
    const peek = ui.$('[data-carousel] .is-peek');
    if (!ui.check(!!peek, `the wheel turns in ${tab}`)) { await ui.closeLibrary(); continue; }
    peek.click();   // .click() not ui.click(): the faces overlap by design
    await ui.sleep(1300);
    const nowCentred = ui.$('[data-carousel] .is-hero').dataset.carName;
    ui.check(nowCentred !== wasCentred, `turning centres a different instrument in ${tab}`);

    ui.$('[data-carousel] .is-hero').click();   // the choice
    await ui.sleep(2800);
    ui.check(!ui.$('.seven-modal'), `choosing raised no refusal in ${tab}`);

    // THE WHOLE POINT: the file is untouched.
    const after = await onDisk(file);
    ui.check(before !== null && before === after,
      `the patch file is UNCHANGED on disk after choosing in ${tab}`);
    ui.note(`${tab}: ${wasCentred} -> chose ${nowCentred}; file ${before === after ? 'untouched' : 'CHANGED'}`);
    await ui.closeLibrary();
  }
})()
