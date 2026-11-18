// PRESSING A STATE PILL ALWAYS DOES SOMETHING.
//
// WHY (Daniel, 18 Nov 2026, on the instrument). The effects chain's ON/OFF
// pills stopped acting: clicking ON left it ON, clicking OFF left it OFF, and
// nothing else appeared — no prompt, no toast, no refusal. The chain was
// reading real values off the Seven at the time (Vol 127, Pedal Wha-Wha, JCM,
// Level 91 · Decay 32), so the read path was fine. A Cmd+R brought them back
// with no code change, which makes it a STATE bug rather than a missing path:
// the pane got into something it could not leave, and it will recur.
//
// IT WOULD NOT HAVE CAUGHT THAT ONE, and saying so is the point of this
// comment. The reported failure needed a long session — a full device pass
// and a push had already happened — and a scenario launches a fresh app,
// presses a pill within a few seconds and exits. Whatever accumulated had no
// time to accumulate. This asserts the GUARANTEE, so that the next way of
// breaking it is caught at the moment somebody writes it, rather than months
// later on stage.
//
// WHAT IT ASSERTS IS DELIBERATELY WEAK: that SOMETHING observable happened.
// Not that the switch flipped — the Seven is allowed to refuse, and the pill
// reflects device state and never forks, which is a documented rule. So the
// bar is "the device changed, or the app said why". NOTHING IS THE ONE
// OUTCOME THAT FAILS.
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };

  const api = window.sevenAPI.midi;
  // The six section switches, by the group that owns each. veq_byp is a
  // BYPASS, so its sense is inverted against the others — that is a display
  // rule, and this scenario deliberately does not care: it asks whether the
  // device VALUE moved, not which way the pill reads.
  const SWITCHES = [
    ['efx_fx1', 'fx1_sw'],
    ['efx_fx2', 'fx2_sw'],
    ['efx_amp', 'amp_sw'],
    ['efx_rev', 'rev_sw'],
    ['efx_pad', 'pad_sw'],
  ];

  const pillOf = (group) => {
    const sec = ui.$(`#detail .fx-section[data-group="${group}"]`);
    return sec && sec.querySelector('.fx-state');
  };
  const readOne = async (key) => {
    const r = await api.readParam(key);
    return r && r.ok ? r.value : null;
  };
  // Everything the app could say: the live bar's note, a toast, a dialog.
  const saidAnything = () => {
    const note = ui.$('.audition-bar .audition-note, .audition-bar .is-error');
    const toastEl = ui.$('.seven-toast, [data-toast]');
    const modal = ui.$('.seven-modal');
    const bits = [];
    if (note && note.textContent.trim()) bits.push(`note "${note.textContent.trim().slice(0, 60)}"`);
    if (toastEl && toastEl.textContent.trim()) bits.push(`toast "${toastEl.textContent.trim().slice(0, 60)}"`);
    if (modal) bits.push('a dialog');
    return bits;
  };

  await ui.openLibrary();
  await ui.sleep(400);
  const row = ui.$('#library .lib-row.lib-patch, #library [data-file]');
  if (!row) return { skipped: 'this library holds no patch to make live' };
  ui.click(row, 'a patch');
  await ui.sleep(2500);

  const live = await ui.live();
  ui.note(`a live session is open: ${live}`);

  let pressed = 0;
  for (const [group, key] of SWITCHES) {
    const pill = pillOf(group);
    if (!pill) { ui.note(`${group}: no pill on screen — not checked`); continue; }

    const before = await readOne(key);
    const pillBefore = pill.textContent.trim();
    ui.click(pill, `the ${group} pill`);
    // The write, then the read-back the app does of what the Seven actually
    // did. Measured at ~12ms a parameter, so this is room and not a guess at
    // the duration — and the assertion below does not depend on it having
    // finished, only on SOMETHING being observable by now.
    await ui.sleep(1400);

    const after = await readOne(key);
    const pillAfter = pillOf(group) ? pillOf(group).textContent.trim() : '(gone)';
    const said = saidAnything();
    const moved = before != null && after != null && before !== after;

    ui.note(`${group.padEnd(9)} ${key.padEnd(8)} device ${String(before)} -> ${String(after)}`
      + ` · pill "${pillBefore}" -> "${pillAfter}"`
      + ` · ${said.length ? said.join(' + ') : 'said nothing'}`);

    // THE WHOLE CLAIM. Either the instrument moved, or the app explained
    // itself. Both at once is fine. Neither is the defect.
    ui.check(moved || said.length > 0,
      `${group}: the press did something — the device moved (${before} -> ${after})`
      + ` or the app said why (${said.length ? said.join('; ') : 'it said nothing'})`);
    pressed += 1;

    // PUT IT BACK, so this scenario does not leave the chain rearranged for
    // whatever runs next and for whoever is sitting at the instrument.
    if (moved) {
      await api.setParam(key, before);
      await ui.sleep(300);
    }
  }

  ui.check(pressed > 0, `at least one pill was reachable to press (${pressed})`);
})()
