// @env SEVEN_NO_DEVICE=1
//
// THE SEND PC PROMPT, in the state a test can reach without hardware: no
// instrument, so no reading of the global, so no prompt.
//
// That is not a trivial case. The trigger must be an actual READ — off IS the
// factory setting, which is exactly why assuming it feels safe and is not. A
// prompt that appeared whenever the app had NOT read the global would tell
// every disconnected user their instrument's setting is off, which the app
// cannot know and, with no instrument attached, cannot possibly matter.
//
// The rest is a hardware case: connect a Seven with SEND PC off and the modal
// must appear on every connect; with it on, never. The button's write and
// read-back are unit-tested in test/send-pc-prompt.test.js against an injected
// setGlobal, including the case where the write is accepted and the value
// comes back unchanged.
(async () => {
  await ui.sleep(1000);
  const s = await window.sevenAPI.midi.status();
  ui.note(`state=${s && s.state} sendPc=${JSON.stringify(s && s.sendPc)}`);

  // Nothing was read, so the value is null — and null is not zero.
  ui.check(!s || s.sendPc === null || s.sendPc === undefined,
    'with no instrument, the global has no value');
  ui.check(SevenSendPcPrompt.shouldPrompt(s) === false,
    'and the rule refuses to prompt on an unread setting');

  ui.check(!ui.$('.seven-modal'),
    'no modal is on screen');

  // The same rule, asked directly about the three readings it must tell apart.
  ui.check(SevenSendPcPrompt.shouldPrompt({ state: 'connected', sendPc: 0 }) === true,
    'a connected instrument reading OFF would prompt');
  ui.check(SevenSendPcPrompt.shouldPrompt({ state: 'connected', sendPc: 1 }) === false,
    'reading ON would not');
  ui.check(SevenSendPcPrompt.shouldPrompt({ state: 'connected', sendPc: null }) === false,
    'and an unreadable global would not — no guessing from defaults');
})()
