// SHOT B — THE DASHBOARD RELIGHTING ACROSS PATCHES.
//
// Select several patches in turn so the panel visibly changes each time.
//
// CHOSEN BY WHAT MOVES ON SCREEN, NOT ALPHABETICALLY. Four patches of the
// same sound relight almost nothing — same engine group, same artwork, same
// rows — and the shot would read as a list being clicked rather than a
// dashboard responding. So this groups the rows by the SOUND each one names
// and takes one from each group, which is what actually drives the engine
// column, the instrument drawing and which parameters exist at all.
(async () => {
  await ui.selectTab('patches');
  await ui.openLibrary();
  await ui.sleep(400);

  const rows = ui.$$('#library .lib-row.lib-patch, #library [data-file]');
  if (!rows.length) return { shot: 'b-dashboard', error: 'no patches in this library' };

  // THE SOUND IS IN `.lib-origin`. The first version read `.patch-sound`,
  // which EXISTS ON EVERY ROW AND IS EMPTY — so every row keyed to "" and the
  // whole list collapsed into one group. The run reported distinctSounds: 1
  // and shot a single click. An empty element is not a missing one, so the
  // "fall back to the row's text" guard never fired; each candidate is now
  // tried in turn and the first NON-EMPTY one wins.
  const soundOf = (el) => {
    for (const sel of ['.lib-origin', '.patch-sound', '.lib-sound']) {
      const cell = el.querySelector(sel);
      const t = ((cell && cell.textContent) || '').trim();
      if (t) return t.toLowerCase();
    }
    return ((el.textContent || '').trim() || Math.random().toString()).toLowerCase();
  };

  const bySound = new Map();
  for (const r of rows) {
    const s = soundOf(r);
    if (!bySound.has(s)) bySound.set(s, r);
  }
  const picks = [...bySound.values()].slice(0, 5);

  console.log('[reel-arm]');   // setup done — start capturing here
  await ui.sleep(200);

  const names = [];
  for (const row of picks) {
    // RE-QUERIED BY FILE, never held: selecting re-renders the list and a row
    // captured before that is detached, which reports a rect of zeros rather
    // than failing. Three scenarios were caught by this on 18 Nov.
    const file = row.getAttribute('data-file');
    const live = file
      ? ui.$(`#library [data-file="${CSS.escape(file)}"]`)
      : ui.$$('#library .lib-row.lib-patch')[picks.indexOf(row)];
    if (!live) continue;
    names.push((live.textContent || '').trim().slice(0, 40));
    ui.click(live, 'a patch');
    await ui.sleep(430);
  }

  await ui.sleep(200);
  return { shot: 'b-dashboard', distinctSounds: bySound.size, picked: names };
})()
