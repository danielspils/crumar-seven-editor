// THE SIGNAL HOOK IS PROVIDED BY THE RUN, not declared here.
//
// This file used to carry `// @env SEVEN_UI_SIGNAL=<an absolute path inside one
// session's scratchpad>`. It worked on the one desk it was written on and was
// wrong everywhere else — wrong on any other machine, and wrong on this one
// after a temp sweep. It was also why this scenario alone could ask for a hand
// while panel-cc-follow and signal-hook silently could not.
//
// `run.js --device` now provisions SEVEN_UI_SIGNAL for every scenario, because
// whether a person is at the panel is a fact about the RUN and not about any
// one file. See the comment there.
//
// DOES THE APP FOLLOW A REAL PANEL TOGGLE? B9's last unknown.
//
// Settled already, with tools/listen.js and Daniel at the keyboard on
// 16 Nov 2026: a slow push on knob 6 DOES transmit, four pushes giving four
// messages, `be 1c 00` / `be 1c 7f` — CC 28, AMP TOGGLE, on channel 15. FX1
// Depth as a control case gave 115 messages of `be 16` (CC 22) on the same
// port in the same session, so "nothing was listening" is ruled out.
//
// The instrument announces it. What is left is whether the APP acts on it,
// and that cannot be asked without a hand on the panel: the change has to
// arrive as a real CC, which is exactly what the app originating it does not
// produce. So this waits for a human step rather than faking one.
//
// WHAT IT DISTINGUISHES. audition.js's onPanelCc maps the CC to a key, reads
// the value back over SysEx and re-renders. Three places it can stop:
//   - the message never reaches the renderer (channel gate, subscription)
//   - it reaches onPanelCc and is dropped (no live session, no map entry)
//   - it is followed in state but the pill does not repaint
// The readings below separate them: the device's own value, the app's belief
// (the rendered pill), and whether either moved.
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };
  const api = window.sevenAPI.midi;
  const pill = () => {
    const sec = ui.$('#detail .fx-section[data-group="efx_amp"]');
    const b = sec && sec.querySelector('.fx-state');
    return b ? b.textContent.trim() : null;
  };

  await ui.selectTab('seven');
  await ui.sleep(800);
  const rows = ui.$$('#patch-list .patch-row');
  if (!rows.length) { ui.note('no bank rows'); return; }
  rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await ui.sleep(2800);

  const before = await api.readBuffer();
  const B = (before && before.ok && (before.params || before.values)) || {};
  const pillBefore = pill();
  ui.note(`BEFORE: device amp_sw=${B.amp_sw} · pill "${pillBefore}"`
    + ` · live session ${await ui.live()}`);
  ui.check(await ui.live(), 'a live session is open — onPanelCc returns early without one');

  await ui.waitForHuman('SLOW PUSH KNOB 6 ON THE SEVEN (hold ~1s, release) — once.',
    { timeout: 180000 });
  // The follow is debounced 80ms and then reads over SysEx; give it room.
  await ui.sleep(1800);

  const after = await api.readBuffer();
  const A = (after && after.ok && (after.params || after.values)) || {};
  const pillAfter = pill();
  ui.note(`AFTER : device amp_sw=${A.amp_sw} · pill "${pillAfter}"`);

  const deviceMoved = A.amp_sw !== B.amp_sw;
  const pillMoved = pillAfter !== pillBefore;
  ui.note(`the instrument ${deviceMoved ? 'MOVED' : 'did not move'}`
    + ` · the app ${pillMoved ? 'FOLLOWED' : 'DID NOT FOLLOW'}`);

  ui.check(deviceMoved,
    `the push reached the instrument (amp_sw ${B.amp_sw} -> ${A.amp_sw})`);
  if (deviceMoved) {
    ui.check((pillAfter === 'ON') === (A.amp_sw === 1),
      `the app followed the panel — device ${A.amp_sw}, pill "${pillAfter}"`);
  }
})()
