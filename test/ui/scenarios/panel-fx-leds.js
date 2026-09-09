// THE PANEL FOLLOWS THE FX MODE, and says which one.
//
// The panel drawing has carried led-fx1-0..3 and led-fx2-0..3 since the first
// Electron shell (2026-07-31) and nothing in src/ ever referenced them, so
// selecting Delay in FX2 lit nothing at all for six weeks. Found in Windows QA
// on 1.5.4; not a 1.5.4 regression — it had never worked.
//
// THIS ASSERTS WHICH LED IS LIT, not that a repaint happened. "The panel
// re-rendered" is satisfied by a panel that renders the wrong thing, which is
// exactly the state this is guarding against.
//
// The mapping is the device's own enum labels:
//   fx1_md 0..3  Mono Tremolo / Stereo Panner / LFO Wha-Wha / Pedal Wha-Wha
//   fx2_md 0..3  Chorus / Phaser / Flanger / Delay
(async () => {
  if (!(await ui.requireDevice())) return;

  const litFor = (fx) => ui.$$(`[id^="led-fx${fx}-"]`)
    .filter((el) => el.classList.contains('on'))
    .map((el) => Number(el.id.split('-').pop()));

  // A patch to work on, and a live session so the controls act.
  await ui.openLibrary();
  ui.click(await ui.waitEl('.seg-btn[data-tab="patches"]', 'the Patches tab'), 'Patches');
  await ui.sleep(700);
  const row = ui.$('#library .lib-row.lib-patch, #library [data-file]');
  if (!ui.check(!!row, 'a patch to select')) return;
  ui.click(row, 'a patch');
  await ui.sleep(3000);
  await ui.closeLibrary();
  await ui.sleep(600);

  ui.check(ui.$$('[id^="led-fx1-"]').length === 4, 'the panel has four FX1 LEDs');
  ui.check(ui.$$('[id^="led-fx2-"]').length === 4, 'the panel has four FX2 LEDs');

  // DRIVE WHAT THE PLAYER DRIVES. The first version called midi.setParam
  // directly, which changes the instrument's edit buffer and never tells the
  // app — so the panel had nothing to follow and every assertion failed
  // against a fix that was fine. The bug is about changing things in the
  // Effects Chain, so this uses those controls: the ON/OFF pill
  // (button.fx-state) and the Mode dropdown's underlying select, dispatched
  // the way SevenPicker does when an option is clicked.
  const pill = (key) => ui.$(`[data-switch="${key}"]`);
  const switchOn = async (key, want) => {
    const el = pill(key);
    if (!el) return false;
    const on = /^on$/i.test(el.textContent.trim());
    if (on !== want) { el.click(); await ui.sleep(1200); }
    return true;
  };
  const setMode = async (key, value) => {
    const sel = ui.$(`.param[data-key="${key}"] .param-select`);
    if (!sel) return false;
    sel.value = String(value);
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await ui.sleep(1200);
    return true;
  };

  for (const fx of [1, 2]) {
    if (!ui.check(await switchOn(`fx${fx}_sw`, true), `FX${fx} has an ON/OFF control`)) continue;

    for (const mode of [0, 1, 2, 3]) {
      if (!(await setMode(`fx${fx}_md`, mode))) { ui.check(false, `FX${fx} Mode is on screen`); break; }
      const lit = litFor(fx);
      ui.check(lit.length === 1 && lit[0] === mode,
        `FX${fx} mode ${mode} lights led-fx${fx}-${mode} and nothing else (lit: [${lit}])`);
    }

    await switchOn(`fx${fx}_sw`, false);
    ui.check(litFor(fx).length === 0,
      `FX${fx} switched off leaves every mode LED dark (lit: [${litFor(fx)}])`);
  }
})()
