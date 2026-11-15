// ANSWERING THE LEAVE GUARD RESOLVES IT, AND THE NAVIGATION PROCEEDS.
//
// Daniel, 2026-11-14: unsaved changes -> the guard appears -> "Save to
// computer" -> name it -> "Saved to Patches" -> Done -> "You have unsaved
// changes" IS ON SCREEN AGAIN. The guard exists so he can leave safely; he
// answered it and a copy is on disk, so re-asking makes that row a dead end.
//
// IT WAS NOT THE FIRST GUARD, UNDISMISSED. That one is closed by openSaveFlow's
// own `finally`, and these dialogs stack as separate overlays rather than
// replacing one another. It was a SECOND guard, created by the save itself:
// announceSaved takes the player to the new file (revealPatch -> app.js
// selectLibraryEntry), that door asks confirmLeave, and saving a COPY leaves
// the session dirty ON PURPOSE — the new patch records this moment, the open
// patch is still edited. So the arrival asked a question that had just been
// answered, and the dialog it raised sat behind the confirmation until that was
// dismissed.
//
// Two fixes, because the bug has two halves and each path needs its own:
//
//   - the arrival does not ask (selectLibraryEntry's `answered`), which is what
//     made the SAVE BUTTON raise a guard too, with no navigation anywhere in it
//   - from the guard there is no arrival at all (announceSaved's `reveal`): the
//     click being held up is already a request to be somewhere else
//
// NEITHER CLEARS THE DIRTY FLAG, and the assertions below do not expect it to.
// The buffer really does still differ from the stored preset — saving to the
// computer does not store anything on the Seven — so the drift is correct and
// stays. What changes is that nobody asks about it twice.
//
// Needs the instrument: the guard requires a live session with real drift, and
// a live session needs the cable.
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };

  // Bank-region work, so the tray is CLOSED rather than left however the last
  // scenario had it (harness.closeLibrary — the state is persisted).
  await ui.closeLibrary();

  // ── A BANK THAT CAN BE OVERWRITTEN ──────────────────────────────────────
  //
  // Bank 1 is refused a store by the instrument, so the overwrite row is
  // absent there by design (save-plan.js) and the second half below would have
  // nothing to click. Chosen rather than inherited.
  const tabs = ui.$$('#bank-tabs .bank-tab');
  const labelOf = (t) => (t.querySelector('.bank-tab-label') || t).textContent.trim();
  const active = () => ui.$('#bank-tabs .bank-tab.active');
  if (active() && /\b1\b/.test(labelOf(active()))) {
    const other = tabs.find((t) => !/\b1\b/.test(labelOf(t)));
    if (other) { ui.click(other, 'a bank that is not locked'); await ui.sleep(700); }
  }
  const bankName = active() ? labelOf(active()) : '(unknown)';
  ui.note(`working in ${bankName}`);
  const canOverwrite = !/\b1\b/.test(bankName);

  const overlays = () => ui.$$('.seven-modal-overlay');
  const titleOf = (card) => card.querySelector('.seven-modal-title').textContent.trim();
  // THE TOPMOST DIALOG, because these stack and a plain `.seven-modal` query
  // answers with whichever was appended first. That is not a detail: against
  // the unfixed code this scenario clicked a row belonging to the stale guard
  // UNDERNEATH, the harness's hit test correctly reported the click landing on
  // the dialog in front, and the failure read as a layout problem rather than
  // as the extra dialog it was. Everything below asks the dialog the player can
  // actually see.
  const top = () => {
    const o = overlays()[overlays().length - 1];
    return o ? o.querySelector('.seven-modal') : null;
  };
  const inTop = (sel) => {
    const card = top();
    return card ? [...card.querySelectorAll(sel)] : [];
  };

  // Put an edit in the instrument's buffer, so leaving has something to lose.
  // Same gesture as switch-patch-guard and live-edit: press three quarters
  // along a continuous bar, which the device echoes back.
  async function makeDrift(slotIndex) {
    if (!(await ui.selectBankPreset(slotIndex))) return false;
    if (!(await ui.enterAudition())) return false;
    const row = ui.$('.param.is-live[data-max="127"]');
    if (!ui.check(!!row, 'a continuous parameter is live')) return false;
    const bar = row.querySelector('.param-bar');
    const r = bar.getBoundingClientRect();
    bar.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, cancelable: true,
      clientX: r.left + r.width * 0.75, clientY: r.top + r.height / 2,
    }));
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    return ui.waitFor(() => !!ui.$('.audition-bar.is-live'), { what: 'an unsaved change' });
  }

  // Walk the name step the way a person does: take the suggested name and
  // press the button. The suggestion is free by construction, so this never
  // meets the taken-name refusal.
  async function completeNameStep() {
    if (!(await ui.waitFor(() => inTop('.name-input').length > 0,
      { what: 'the name field' }))) return null;
    const field = inTop('.name-input')[0];
    const typed = field.value;
    const ok = field.closest('.seven-modal').querySelector('.seven-modal-ok');
    if (!ui.check(!!ok && !ok.disabled, 'the name can be accepted')) return null;
    ui.click(ok, 'Save as new patch');
    return typed;
  }

  // THE CONFIRMATION IS THE ONLY THING ON SCREEN. This is the assertion that
  // names the bug: with the second guard present there were TWO overlays here,
  // and the one underneath was what Daniel saw when he pressed Done.
  async function dismissConfirmation(what) {
    const up = await ui.waitFor(
      () => overlays().some((o) => /Saved to Patches/.test(o.textContent)),
      { timeout: 20000, what: `the "Saved to Patches" confirmation (${what})` }
    );
    if (!up) return false;
    const cards = overlays().map((o) => titleOf(o.querySelector('.seven-modal')));
    ui.note(`${what} — dialogs on screen: ${cards.join(' | ')}`);
    ui.check(cards.length === 1,
      `${what}: the confirmation is the only dialog on screen (${cards.length})`);
    ui.check(!cards.some((t) => /unsaved changes/i.test(t)),
      `${what}: nothing is asking about unsaved changes behind it`);

    const done = inTop('.seven-modal-ok')[0];
    if (!ui.check(!!done, `${what}: the confirmation has a Done button`)) return false;
    ui.click(done, 'Done');
    await ui.sleep(900);
    return true;
  }

  // ── SAVE TO COMPUTER, FROM THE GUARD ────────────────────────────────────
  if (!(await makeDrift(0))) return;

  // The navigation being attempted. Slot 1, so the destination is not the slot
  // the edit is on — "it proceeded" and "nothing moved" have to be different
  // observations.
  ui.$$('#patch-list .patch-row')[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  if (!(await ui.waitFor(() => !!top(), { what: 'the leave guard' }))) return;
  ui.check(titleOf(top()) === 'You have unsaved changes',
    'leaving a changed patch asks first');

  const computerRow = inTop('.sv-row').find(
    (x) => /Save to computer/.test(x.querySelector('.sv-row-t').textContent)
  );
  if (!ui.check(!!computerRow, 'the computer is offered as a destination')) return;
  ui.click(computerRow, 'Save to computer');

  const named = await completeNameStep();
  ui.check(!!named, `the name step completed (${named})`);
  if (!named) return;

  if (!(await dismissConfirmation('save to computer'))) return;

  // THE TWO THINGS DANIEL ASKED FOR, measured separately.
  ui.check(overlays().length === 0,
    `no dialog remains after the confirmation (${overlays().length})`);
  const landed = ui.$('#patch-list .patch-row.selected');
  ui.note(`selected slot after the save: ${landed && landed.dataset.index}`);
  ui.check(!!landed && landed.dataset.index === '1',
    'and the navigation the guard was holding up went through');
  // NO DETOUR THROUGH PATCHES. The tray was closed when this began, and a save
  // from the guard does not open it: the click being held up was a request to
  // be somewhere else, so arriving at the new file and being moved off it again
  // is a flash and a second instrument send for one gesture. This is the
  // visible half of announceSaved's `reveal`.
  ui.check(!ui.$('#library.lib-open'),
    'and it did not detour through Patches on the way');
  // The copy is on disk, which is what made the guard answerable at all.
  const data = await window.sevenAPI.library.list();
  ui.check((data.patches || []).some((e) => e.name === named),
    `the patch "${named}" is in the library — which is what made the guard answerable`);

  // ── OVERWRITE, FROM THE GUARD ───────────────────────────────────────────
  //
  // The hold screen is the same dialog turned into its next step (modal
  // replace), so there is one overlay through it — and the copy the tick box
  // takes is still a new patch, with the same arrival to suppress.
  if (!canOverwrite) {
    ui.note(`the overwrite row is absent in ${bankName}, which is correct — half not checked`);
    return;
  }
  if (!(await makeDrift(1))) return;
  ui.$$('#patch-list .patch-row')[2].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  if (!(await ui.waitFor(() => !!top(), { what: 'the leave guard again' }))) return;

  const holdRow = inTop('.sv-row').find(
    (x) => /^Overwrite /.test(x.querySelector('.sv-row-t').textContent)
  );
  if (!ui.check(!!holdRow, `the Seven is offered from ${bankName}`)) return;
  ui.click(holdRow, 'the overwrite row');

  // The hold instruction, in place of the rows. Nothing is held on the
  // instrument here — there is no store opcode to fake and no hold to
  // synthesise; what is on trial is the dialog, and the tick box is left
  // CHECKED, which is the default and the path that writes a copy.
  const held = await ui.waitFor(
    () => /Hold it on the Seven/.test(String(top() && top().textContent)),
    { what: 'the hold screen' }
  );
  if (!held) return;
  // WAIT FOR THE SWAP TO FINISH BEFORE PRESSING ANYTHING. replace() paints the
  // new body ~170ms in and only re-arms action() when the whole ~510ms
  // animation is over, so a press in between settles nothing and is silently
  // dropped — this scenario hung on exactly that, 15s on a name step whose
  // Done had already been clicked. A person cannot click that fast into a
  // dialog that is still moving; a scenario can.
  await ui.waitFor(() => { const c = top(); return c && !c.classList.contains('is-resizing'); },
    { what: 'the hold screen to settle' });
  ui.check(overlays().length === 1,
    `the hold screen replaces the rows rather than stacking (${overlays().length})`);
  const box = inTop('.sv-copy')[0];
  ui.check(!!box && box.checked, 'the copy to Patches is ticked by default');
  const doneHold = inTop('.seven-modal-ok')[0];
  if (!ui.check(!!doneHold, 'the hold screen has its Done button')) return;
  ui.click(doneHold, 'Done');

  const named2 = await completeNameStep();
  ui.check(!!named2, `the overwrite path's copy was named (${named2})`);
  if (!named2) return;
  if (!(await dismissConfirmation('overwrite'))) return;

  ui.check(overlays().length === 0,
    `no dialog remains after the overwrite path (${overlays().length})`);
  const landed2 = ui.$('#patch-list .patch-row.selected');
  ui.note(`selected slot after the overwrite path: ${landed2 && landed2.dataset.index}`);
  ui.check(!!landed2 && landed2.dataset.index === '2',
    'and that navigation went through as well');
  ui.check(!ui.$('#library.lib-open'), 'and no detour through Patches here either');

  // ── CLEARING THE TICK BOX: TOLD, NOT ASKED ──────────────────────────────
  //
  // The one route through this dialog that could not resolve the guard.
  // Clearing "Also save a copy to Patches" and pressing Done writes nothing,
  // so the flow still answers 'stay' — and the NEXT attempt to leave used to
  // raise the whole guard again, which made "I will keep it on the Seven" an
  // answer the app would not accept. Daniel's call, 14 Nov 2026: that press is
  // him taking the keeping on, so the next move out is told rather than asked.
  if (!(await makeDrift(2))) return;
  ui.$$('#patch-list .patch-row')[3].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  if (!(await ui.waitFor(() => !!top(), { what: 'the leave guard a third time' }))) return;
  const holdRow2 = inTop('.sv-row').find(
    (x) => /^Overwrite /.test(x.querySelector('.sv-row-t').textContent)
  );
  if (!ui.check(!!holdRow2, 'the overwrite row is there')) return;
  ui.click(holdRow2, 'the overwrite row');
  if (!(await ui.waitFor(
    () => /Hold it on the Seven/.test(String(top() && top().textContent)),
    { what: 'the hold screen' }
  ))) return;
  await ui.waitFor(() => { const c = top(); return c && !c.classList.contains('is-resizing'); },
    { what: 'the hold screen to settle' });

  const box2 = inTop('.sv-copy')[0];
  if (!ui.check(!!box2, 'the tick box is there to clear')) return;
  box2.click();
  ui.check(!box2.checked, 'the copy to Patches is cleared');
  ui.click(inTop('.seven-modal-ok')[0], 'Done');
  await ui.sleep(1200);

  // NOTHING WAS WRITTEN, so this press on its own does not move anybody. That
  // half is unchanged and is asserted so a later fix cannot quietly turn Done
  // on the hold screen into a navigation of its own.
  ui.check(overlays().length === 0, `the hold screen closes (${overlays().length})`);
  const stillHere = ui.$('#patch-list .patch-row.selected');
  ui.check(!!stillHere && stillHere.dataset.index === '2',
    'and clearing the box does not move you on its own');

  // NOW MOVE ON. Told, not asked.
  ui.$$('#patch-list .patch-row')[3].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  if (!(await ui.waitFor(() => !!top(), { what: 'the acknowledgement' }))) return;
  const ack = top();
  ui.note(`moving on after clearing the box says: "${titleOf(ack)}"`);
  ui.check(titleOf(ack) === 'Discarding Edits',
    `it is told, not asked (${titleOf(ack)})`);
  ui.check(ack.querySelectorAll('.sv-row').length === 0,
    'and it is not the leave guard wearing a different title');
  // THE SENTENCE IS THE ONLY THING THE PLAYER CANNOT WORK OUT UNAIDED: that
  // discarding costs nothing once the hold is done. Matched on a distinctive
  // phrase rather than the whole string — the wording is Daniel's and may move
  // once he has seen it running, and an assertion on the full sentence would
  // make a reword look like a regression.
  ui.check(/saved to your Seven/.test(ack.textContent),
    'and it says the Seven may already have it');
  // SevenModal.confirm does not default its body and paragraphs() stringifies
  // what it is handed, so an omitted body prints the literal word "undefined"
  // under the heading. Found by reading modal.js rather than by shipping it,
  // and pinned here because the title-only version is one deletion away.
  ui.check(!/undefined/.test(ack.textContent),
    'with no stray text under it');
  const okay = ack.querySelector('.seven-modal-ok');
  ui.check(!!okay && okay.textContent.trim() === 'Okay', 'one button, and it says Okay');
  if (!okay) return;
  ui.click(okay, 'Okay');
  await ui.sleep(1200);
  ui.check(overlays().length === 0, `nothing remains after Okay (${overlays().length})`);
  const moved = ui.$('#patch-list .patch-row.selected');
  ui.note(`selected slot after being told: ${moved && moved.dataset.index}`);
  ui.check(!!moved && moved.dataset.index === '3', 'and the move goes through');

  // ── AND IT DOES NOT OUTLIVE THE SESSION ─────────────────────────────────
  //
  // THE DANGEROUS MUTATION. Declining the copy once must not disarm the guard
  // for the rest of the run: the next edit has never been offered a hold. The
  // flag is hung on liveEdit so it dies when the session does, and this is what
  // proves it — without it, a module-level flag nobody remembered to clear
  // would pass everything above.
  if (!(await makeDrift(3))) return;
  ui.$$('#patch-list .patch-row')[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  if (!(await ui.waitFor(() => !!top(), { what: 'the guard on a fresh session' }))) return;
  ui.check(titleOf(top()) === 'You have unsaved changes',
    `a new session is asked properly again (${titleOf(top())})`);
  const discard = top().querySelector('.seven-modal-deny');
  if (!ui.check(!!discard, 'and it still offers the named discard')) return;
  ui.click(discard, 'Discard changes and leave');
  await ui.sleep(900);

  // ── AND THE SAVE BUTTON, WHICH IS NOT A NAVIGATION AT ALL ───────────────
  //
  // THE OTHER HALF OF THE SAME BUG, and the only path that exercises
  // selectLibraryEntry's `answered`. Pressing Save raises no guard — nobody is
  // leaving — but it saves a copy and then TAKES YOU TO IT, and that arrival
  // is a library-row selection like any other. So the leave guard fired on the
  // way to the file that had just been written, with no navigation anywhere in
  // the gesture: "You have unsaved changes", behind the confirmation.
  //
  // Here the arrival is wanted (2026-08-23, "it takes you there first"), so
  // this half asserts that it HAPPENS and that it is silent.
  if (!(await makeDrift(0))) return;
  const saveBtn = ui.$('#save-live-btn');
  if (!ui.check(!!saveBtn && !saveBtn.disabled, 'the Save button is live')) return;
  ui.click(saveBtn, 'Save patch');
  if (!(await ui.waitFor(() => !!top(), { what: 'the save dialog' }))) return;
  ui.check(titleOf(top()) === 'Save patch',
    `pressing Save is not a leave guard (${titleOf(top())})`);

  const row2 = inTop('.sv-row').find(
    (x) => /Save to computer/.test(x.querySelector('.sv-row-t').textContent)
  );
  if (!ui.check(!!row2, 'the computer is offered')) return;
  ui.click(row2, 'Save to computer');
  const named3 = await completeNameStep();
  ui.check(!!named3, `the Save button's copy was named (${named3})`);
  if (!named3) return;
  if (!(await dismissConfirmation('the Save button'))) return;

  ui.check(overlays().length === 0,
    `no dialog remains after the Save button's save (${overlays().length})`);
  // THE ARRIVAL, which is this path's whole difference from the two above.
  ui.check(!!ui.$('#library.lib-open'), 'pressing Save takes you to the new patch');
  const arrived = ui.$('#library .lib-row.lib-patch.selected');
  ui.note(`arrived at: ${arrived && arrived.dataset.file}`);
  ui.check(!!arrived, 'and the new patch is the selected row there');

  // PUT THE TRAY BACK. Whether the library is open is persisted in
  // localStorage, which lives in userData — and the runner copies a fresh
  // library per scenario but shares userData, so a scenario that leaves it open
  // hands it to every scenario after it and to every run after that. That cost
  // two days of calling bank-tab-arrows "flaky" (CLAUDE.md, 2026-08-22). This
  // one opens the tray by design, so it closes it on the way out.
  await ui.closeLibrary();
})()
