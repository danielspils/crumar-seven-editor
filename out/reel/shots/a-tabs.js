// SHOT A — THE FOUR-TAB NAV, the reveal.
//
// Start on the Seven and cut across all four, letting each land before
// moving. The tab fade and the list's arrival are the subject, so each stop
// is long enough to read and no longer.
//
// SLEEPS ARE IN SHIPPED TIME. The rig multiplies setTimeout by SLOWMO, so
// `sleep(420)` is 420ms as a VIEWER sees it and 1.7s of real capture at
// SLOWMO=4. Write what the shot should feel like; the rig does the stretching
// and ffmpeg takes it back out.
(async () => {
  await ui.selectTab('seven');
  await ui.sleep(400);
  console.log('[reel-arm]');   // setup done — start capturing here
  await ui.sleep(260);

  for (const tab of ['patches', 'setlists', 'backups', 'seven']) {
    await ui.selectTab(tab);
    await ui.sleep(240);
  }

  await ui.sleep(200);
  return { shot: 'a-tabs', tabs: ['seven', 'patches', 'setlists', 'backups', 'seven'] };
})()
