// SHOT C — THE FX TRAYS. The snap is the shot.
//
// Open a tray, let it land, open another, close them. The body animates
// grid-template-rows 0fr->1fr over 180ms with the content fading in behind
// it, and since 18 Nov opening one ANCHORS the pane to it — so the scroll
// travelling with the tray is part of what this shows.
(async () => {
  await ui.selectTab('patches');
  await ui.openLibrary();
  await ui.sleep(380);
  const row = ui.$('#library .lib-row.lib-patch, #library [data-file]');
  if (row) { ui.click(row, 'a patch'); await ui.sleep(900); }

  const head = (g) => ui.$(`#detail .fx-section[data-group="${g}"] .fx-head`);
  const open = (g) => {
    const s = ui.$(`#detail .fx-section[data-group="${g}"]`);
    return s && !s.classList.contains('collapsed');
  };

  // Two near the top and one at the bottom, so the shot shows both a tray
  // opening in place and the pane travelling to reach one.
  const order = ['efx_fx1', 'efx_amp', 'pdl_exp'];

  console.log('[reel-arm]');   // setup done — start capturing here
  await ui.sleep(180);

  for (const g of order) {
    if (!head(g)) continue;
    ui.click(head(g), `opening ${g}`);
    await ui.sleep(300);
  }
  for (const g of [...order].reverse()) {
    if (!head(g) || !open(g)) continue;
    ui.click(head(g), `closing ${g}`);
    await ui.sleep(230);
  }

  await ui.sleep(160);
  return { shot: 'c-fx', trays: order };
})()
