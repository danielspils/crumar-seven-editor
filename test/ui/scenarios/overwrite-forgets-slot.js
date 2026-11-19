// AN ATTEMPTED OVERWRITE LEAVES THE SLOT UNKNOWN, NOT LIVE.
//
// THE GAP THIS CLOSES. Step 2 of the freshness work (16 Nov) draws a slot the
// app has heard from this session at full strength and everything else faded.
// Selecting a slot recalls it, the 0x45 names the sound, and the row goes
// live — correctly. Then the player presses Save patch, chooses "Overwrite
// Bank 2 · Preset 5", and is sent to hold the button. From that moment the
// row's claim is wrong: it is still drawing the values the app read BEFORE the
// overwrite was attempted, at full strength, under the backup's name.
//
// THE APP CANNOT KNOW WHETHER THE HOLD HAPPENED. There is no store opcode and
// no acknowledgement — the Discarding Edits dialog exists to say exactly that
// ("this app can't tell if you have"). So neither confident answer is
// available: recording the sent values claims a store happened, and leaving
// the slot marked live claims the old values are current. "I no longer know
// what is in this slot" is the only honest state, and it is one the app
// already knows how to draw.
//
// WHAT IS NOT TESTED HERE, because it cannot be: nothing is held on the
// instrument. There is no hold to synthesise and no reply to wait for. What is
// on trial is what the APP does with a slot it sent somebody to overwrite.
//
// Needs the instrument twice over: a live session needs the cable, and the
// overwrite row is only offered when there is drift to overwrite with.
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };

  // THE APP MUST BE ABLE TO NAME THE SLOT, and with Send PC off it cannot:
  // holdSlot() answers null, the row reads "Overwrite the preset on your
  // Seven", and there is no slot to forget. That is a genuine precondition
  // this scenario cannot arrange — Send PC is a global on the instrument's own
  // menu — so it SKIPS rather than passing on a path where the assertion below
  // is unreachable. The limit itself is recorded in docs/next-1.5.7.md.
  const status = await window.sevenAPI.midi.status();
  ui.note(`Send PC on the instrument: ${status && status.sendPc}`);
  if (!status || status.sendPc !== 1) {
    return { skipped: 'Send PC is off, so the app cannot name the slot a hold would overwrite' };
  }

  // Bank-region work, and the tab is CHOSEN rather than inherited from
  // whichever scenario ran last (CLAUDE.md, 2026-08-22).
  await ui.closeLibrary();

  // A BANK THAT CAN BE OVERWRITTEN. The Seven refuses a store into Bank 1, so
  // the overwrite row is absent there by design and this scenario would have
  // nothing to click.
  const tabs = ui.$$('#bank-tabs .bank-tab');
  const labelOf = (t) => (t.querySelector('.bank-tab-label') || t).textContent.trim();
  const active = () => ui.$('#bank-tabs .bank-tab.active');
  if (active() && /\b1\b/.test(labelOf(active()))) {
    const other = tabs.find((t) => !/\b1\b/.test(labelOf(t)));
    if (other) { ui.click(other, 'a bank that is not locked'); await ui.sleep(700); }
  }
  const bankName = active() ? labelOf(active()) : '(unknown)';
  ui.note(`working in ${bankName}`);
  if (/\b1\b/.test(bankName)) {
    return { skipped: 'only Bank 1 is available, and it cannot be stored to' };
  }

  const rows = () => ui.$$('#patch-list .patch-row');
  const overlays = () => ui.$$('.seven-modal-overlay');
  const top = () => {
    const o = overlays()[overlays().length - 1];
    return o ? o.querySelector('.seven-modal') : null;
  };
  const inTop = (sel) => {
    const card = top();
    return card ? [...card.querySelectorAll(sel)] : [];
  };
  const stale = (i) => !!(rows()[i] && rows()[i].classList.contains('is-stale'));
  const opacity = (i) => Math.round(Number(getComputedStyle(rows()[i]).opacity) * 100) / 100;

  // A SLOT WITH A BACKUP BEHIND IT. An empty slot is never faded — it claims
  // nothing about the past — so forgetting a reading would be invisible on one.
  const target = rows().findIndex((r) => !r.classList.contains('empty-slot'));
  if (!ui.check(target >= 0, 'there is a backed-up slot to work on')) return;
  ui.note(`using preset ${target + 1}`);

  // ---- 1. SELECTING IT MAKES IT LIVE -------------------------------------
  //
  // The precondition, and worth asserting rather than assuming: if the row
  // were already faded here, the assertion at the end would pass for a reason
  // that has nothing to do with the overwrite.
  if (!(await ui.selectBankPreset(target))) return;
  const lifted = await ui.waitFor(() => !stale(target),
    { timeout: 12000, what: 'the selected row to come up to full' })
    .then(() => true).catch(() => false);
  ui.note(`after selecting: stale=${stale(target)} · opacity ${opacity(target)}`);
  ui.check(lifted && !stale(target),
    'selecting the slot makes it live — the app has heard from it this session');

  // ---- 2. SOMETHING TO OVERWRITE WITH ------------------------------------
  //
  // The overwrite row is absent with nothing changed: a row offering to
  // replace a preset with its own contents is an instruction to do nothing.
  // Same gesture as live-edit and leave-guard-resolves — press along a
  // continuous bar, which the device echoes back.
  if (!(await ui.enterAudition())) return;
  const param = ui.$('.param.is-live[data-max="127"]');
  if (!ui.check(!!param, 'a continuous parameter is live')) return;
  const bar = param.querySelector('.param-bar');
  const r = bar.getBoundingClientRect();
  bar.dispatchEvent(new PointerEvent('pointerdown', {
    bubbles: true, cancelable: true,
    clientX: r.left + r.width * 0.75, clientY: r.top + r.height / 2,
  }));
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  if (!(await ui.waitFor(() => !!ui.$('.audition-bar.is-live'),
    { what: 'an unsaved change' }))) return;

  // AND IT IS STILL LIVE AFTER THE EDIT. An edit is not a reason to forget a
  // slot — the app knows exactly what it sent — so if the row faded here, the
  // end of this scenario would prove nothing.
  ui.note(`after editing: stale=${stale(target)} · opacity ${opacity(target)}`);
  ui.check(!stale(target), 'editing does not make the app forget the slot');

  // ---- 3. THE SAVE FLOW, AS FAR AS THE HOLD SCREEN -----------------------
  //
  // The SAVE BUTTON rather than a navigation: pressing Save raises no leave
  // guard, so the only dialog in this scenario is the one under test.
  const saveBtn = ui.$('#save-live-btn');
  if (!ui.check(!!saveBtn && !saveBtn.disabled, 'the Save button is live')) return;
  ui.click(saveBtn, 'Save patch');
  if (!(await ui.waitFor(() => !!top(), { what: 'the save dialog' }))) return;

  const holdRow = inTop('.sv-row').find(
    (x) => /^Overwrite /.test(x.querySelector('.sv-row-t').textContent)
  );
  if (!ui.check(!!holdRow, `the Seven is offered as a destination from ${bankName}`)) return;
  const rowTitle = holdRow.querySelector('.sv-row-t').textContent.trim();
  ui.note(`the row reads: "${rowTitle}"`);
  // IT NAMES THE SLOT IT IS ABOUT TO SEND HIM TO, which is the same slot the
  // app must then forget. An unnamed row ("Overwrite the preset on your
  // Seven") means the app does not know which preset, and nothing below would
  // be reachable.
  ui.check(new RegExp(`Preset ${target + 1}\\b`).test(rowTitle),
    `and it names the preset that is selected (${target + 1})`);
  ui.click(holdRow, 'the overwrite row');

  if (!(await ui.waitFor(
    () => /Hold it on the Seven/.test(String(top() && top().textContent)),
    { what: 'the hold screen' }
  ))) return;
  // WAIT FOR THE SWAP. replace() paints the new body part-way through its
  // animation and only re-arms action() when the whole ~510ms is over, so a
  // press in between settles nothing and is silently dropped.
  await ui.waitFor(() => { const c = top(); return c && !c.classList.contains('is-resizing'); },
    { what: 'the hold screen to settle' });

  // THE SLOT IS STILL LIVE WHILE THE SCREEN IS UP. Forgetting belongs to the
  // dismissal, not to the opening: until the screen is answered nothing has
  // been attempted, and a player who closes it has at least been shown what
  // the app thinks it knows.
  ui.note(`while the hold screen is up: stale=${stale(target)}`);

  // CLEAR THE TICK BOX. That path writes nothing at all — the flow answers
  // 'stay' — so what is observed afterwards can only have come from the
  // forgetting itself, not from a save, a refresh or a re-render behind it.
  const box = inTop('.sv-copy')[0];
  if (!ui.check(!!box, 'the tick box is there to clear')) return;
  box.click();
  ui.check(!box.checked, 'the copy to Patches is cleared, so nothing is written');
  const done = inTop('.seven-modal-ok')[0];
  if (!ui.check(!!done, 'the hold screen has its Done button')) return;
  ui.click(done, 'Done');
  await ui.sleep(1200);
  ui.check(overlays().length === 0, `the hold screen closes (${overlays().length})`);

  // ---- 4. THE SLOT IS UNKNOWN AGAIN --------------------------------------
  ui.note(`after the hold screen: stale=${stale(target)} · opacity ${opacity(target)}`);
  ui.check(stale(target),
    'the slot the app sent him to overwrite is no longer claimed as live');
  // THE FADE IS REAL, not just a class. A class with no rule behind it would
  // satisfy the line above and change nothing on screen.
  ui.check(opacity(target) < 1,
    `and it is drawn faded (opacity ${opacity(target)})`);
  // AND IT SHOWS THE BACKUP AGAIN rather than a name nobody can support. The
  // row falls back to the record, which is what "I no longer know" looks like
  // in this view — the record is the only thing the app can still stand behind.
  ui.note(`the row now reads: "${rows()[target].textContent.trim().replace(/\s+/g, ' ')}"`);

  // ---- 5. AND ONLY THAT ONE ----------------------------------------------
  //
  // Forgetting one slot must not clear the session. A version that emptied
  // verifiedSlots would look identical on the row above and be wrong about
  // every other one — and this run has only visited one, so the check is that
  // nothing ELSE changed state rather than that something else stayed live.
  const others = rows().filter((row, i) => i !== target && !row.classList.contains('empty-slot'));
  const stillStale = others.filter((row) => row.classList.contains('is-stale'));
  ui.note(`other backed-up rows faded: ${stillStale.length} of ${others.length}`);
  ui.check(stillStale.length === others.length,
    'the rows around it are untouched — the forgetting is per slot');

  // ---- 6. SELECTING IT READS IT FRESH ------------------------------------
  //
  // The other half of being honest about not knowing: the unknown is
  // recoverable, by the same recall that filled it the first time. Without
  // this, "forget it" would be a one-way loss of something the app can have
  // back for free.
  //
  // The edit is still live, so leaving asks — and the tick box was cleared, so
  // this is the Discarding Edits acknowledgement rather than the full guard.
  rows()[target].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  if (await ui.waitFor(() => !!top(), { timeout: 4000, what: 'the acknowledgement' })
    .then(() => true).catch(() => false)) {
    ui.note(`moving on says: "${top().querySelector('.seven-modal-title').textContent.trim()}"`);
    const okay = top().querySelector('.seven-modal-ok');
    if (okay) ui.click(okay, 'Okay');
  }
  const back = await ui.waitFor(() => !stale(target),
    { timeout: 12000, what: 'the row to come back up' })
    .then(() => true).catch(() => false);
  ui.note(`after selecting it again: stale=${stale(target)} · opacity ${opacity(target)}`);
  ui.check(back && !stale(target),
    'and selecting it reads it fresh — the unknown is recoverable, not a loss');
})()
