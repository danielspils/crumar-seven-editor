// PROVES THE SIGNAL HOOK ITSELF, with no instrument and no human judgement.
//
// SEVEN_UI_SIGNAL has existed since the UI suite was built and nothing had ever
// used it (2026-08-20). Before asking somebody to stand at the Seven waiting
// for a prompt, prove the prompt-and-wait mechanism works at all — otherwise
// the first time it is exercised is also the first time it could fail, with a
// person watching.
//
//   SEVEN_UI_SIGNAL=/tmp/seven-signal npm run test:ui signal-hook
//   (then, from another shell:  echo go > /tmp/seven-signal)
(async () => {
  const got = await ui.waitForHuman('write anything to the signal file', { timeout: 30000 });
  if (!got) {
    // THE RETURN VALUE, NOT A NOTE. This scenario exists to prove that a
    // scenario CAN wait on a person, and it spent the 18 Nov device pass
    // reporting ✓ while proving that it cannot: `ui.note('skipped: …')` and a
    // bare return told the log one thing and the runner another.
    return { skipped: 'no SEVEN_UI_SIGNAL set, or nothing arrived in 30s' };
  }
  ui.check(true, 'the signal hook delivered — a scenario can wait on a person');
})()
