// @env SEVEN_NO_DEVICE=1
//
// THE SUMMARY'S BOX DOES NOT MOVE, whichever shape it takes.
//
// One modal serves both flows, and their headlines are very different lengths:
// a bank send says "8 of 8 presets stored", a single send says the patch's
// NAME, which can be anything a person typed. What the two must not do is
// resize the dialog between them, or between a short name and a long one.
//
// The WORDING is asserted in test/transfer-summary.test.js, which runs on
// npm test and can reach shapes no hand can produce — a one-slot setlist, a
// bank where every preset already matched. This is the half that needs a real
// window, because a rendered height is not a property of a string.
(async () => {
  const S = SevenTransferSummary;
  const shot = async (label, report) => {
    const m = SevenModal.open({
      title: S.title(report), bodyHtml: S.body(report),
      confirmLabel: 'Done', tone: 'is-transfer',
    });
    await ui.sleep(320);
    const r = m.body.closest('.seven-modal').getBoundingClientRect();
    const head = m.body.querySelector('.tx-step-name');
    const where = m.body.querySelector('.tx-step-where');
    ui.note(`${label}: ${Math.round(r.width)}x${Math.round(r.height)}  `
      + `"${head ? head.textContent : ''}"${where ? ` / "${where.textContent}"` : ''}`);
    m.close();
    await ui.sleep(180);
    return { w: Math.round(r.width), h: Math.round(r.height) };
  };
  const base = {
    type: 'transfer-done', bank: 3, error: null, cancelled: false,
    alreadyThere: [], loadedNotConfirmed: [],
  };

  const bank = await shot('whole bank  ',
    { ...base, setlistIndex: 0, total: 8, confirmed: [1, 2, 3, 4, 5, 6, 7, 8] });
  const one = await shot('single send ',
    { ...base, setlistIndex: null, name: 'DX Synth Piano', preset: 1, total: 1, confirmed: [1] });
  const longName = await shot('a long name ',
    { ...base, setlistIndex: null, name: 'Venice Upright U1 Felt Nightfall 2', preset: 8, total: 1, confirmed: [8] });

  ui.check(bank.w === one.w && bank.h === one.h,
    `both flows are the same box (${bank.w}x${bank.h} vs ${one.w}x${one.h})`);
  ui.check(one.w === longName.w && one.h === longName.h,
    `and a long patch name does not move it (${one.w}x${one.h} vs ${longName.w}x${longName.h})`);

  // The destination line is the one that gained a preset. Rendered uppercase
  // by CSS, which is why the source says "Bank 3 · Preset 1" — asserted on
  // what is on screen rather than on the string that produced it.
  const m = SevenModal.open({
    title: 'Sent to Seven',
    bodyHtml: S.body({ ...base, setlistIndex: null, name: 'DX Synth Piano', preset: 1, total: 1, confirmed: [1] }),
    confirmLabel: 'Done', tone: 'is-transfer',
  });
  await ui.sleep(320);
  const where = m.body.querySelector('.tx-step-where');
  const shown = getComputedStyle(where).textTransform === 'uppercase'
    ? where.textContent.toUpperCase() : where.textContent;
  ui.note(`the destination reads: "${shown}"`);
  ui.check(shown === 'BANK 3 · PRESET 1', `it names bank AND preset ("${shown}")`);
  m.close();
})()
