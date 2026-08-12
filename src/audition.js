'use strict';

// Audition mode and live editing: the part of the app that speaks to the edit
// buffer. Lifted out of app.js, where it had grown to a third of the file and
// tangled with bank navigation, because it is the piece with the most rules
// and the most ways to be wrong — every state here was learned from something
// going wrong on the instrument.
//
// The rules, in one place:
//   - a control is live ONLY while the buffer is known to hold the patch on
//     screen, which is true only after an audition and while still connected;
//   - a write stores the value the device ECHOED, never the one requested;
//   - a Program Change means either a recall or a panel store, so the buffer
//     is re-read before deciding which;
//   - the app's own recall echo is not the player reaching for the panel;
//   - nothing here stores anything: the three-second panel hold is the only
//     way onto the instrument, and Save to Library the only way onto disk.
//
// app.js supplies the selection model and rendering through `deps`; this
// module owns everything about the live session itself.

(function (global) {
  const esc = (v) =>
    String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // deps: { el, getTarget, getPatch, renderDetail, refreshLibrary, getEntries,
  //         undoStack }
  function create(deps) {
    const el = deps.el;
    const toast = (text, opts) => SevenToast.show(text, opts);
    const hideToast = () => SevenToast.hide();

  // {kind, text, file} — a result belongs to the patch it came from, so it is
  // shown only while that patch is still the selected one.
  let auditionNote = null;

  // Which patch the bar acts on. The selection model lives in app.js;
  // this module only asks which file is in front of the user.
  const auditionTarget = () => deps.getTarget();

  function renderAuditionBar(patch, live) {
    const target = auditionTarget();
    if (!target) return '';
    const stranded =
      !isConnected() && liveEdit && liveEdit.dirty && liveEdit.file === target.file;
    if (stranded) {
      return (
        `<div class="audition-bar">` +
        `<button type="button" id="save-live-btn">Save to Library</button>` +
        `<span class="audition-note is-error">The Seven disconnected. These edits ` +
        `are still here — save them to keep them.</span>` +
        `</div>`
      );
    }
    if (!isConnected()) return '';
    const mine = auditionNote && auditionNote.file === target.file;
    // While live the line is CONSTANT. It used to swap between the send result
    // ("Sent 110 settings…") and a longer live hint, and the two wrapped to
    // different heights — so making the first edit rewrote the sentence and
    // shifted the row, which read as the app warning you about something.
    // Only a genuine problem may replace it.
    // Before you are in audition mode the button says what it does, so the
    // sentence beside it only repeated itself; the rule it carried is what the
    // modal explains. Live, the line is constant (see below). Either way, a
    // real problem still replaces it.
    // Notes are shown while live too. That used to reflow the controls, which
    // is why they were suppressed; now the line sits on its own full-width row
    // beneath them, so its text can change without moving anything.
    const showNote = mine;
    const note = showNote
      ? `<span class="audition-note ${auditionNote.kind}">${esc(auditionNote.text)}</span>`
      : live
        // Daniel's words, 2026-08-12. The old line said the same thing twice
        // over — the Save button is right there and speaks for itself, so what
        // is left to say is the part the app CANNOT do for you.
        ? '<span class="audition-note">hold a button for 3 seconds on your Seven to save</span>'
        : '';

    // Audition mode is a STATE, not an interruption — so it wears persistent
    // chrome (a sticky amber-edged header that follows you down the panel)
    // rather than a modal. A modal big enough for 110 parameters would cover
    // the lists you pick the next patch from, and would have to be dismissed
    // before every edit.
    if (live) {
      // The bar's shape never changes while live. It used to swap Done for
      // Save + Discard on the first edit, which moved every control sideways
      // under the cursor mid-gesture. Same three buttons throughout; Save is
      // simply disabled until there is something to save.
      const dirty = liveEdit.dirty;
      return (
        `<div class="audition-bar is-live">` +
        `<span class="audition-mode">Audition mode</span>` +
        `<span class="audition-patch">${esc(patch.name)}` +
        `${dirty ? '<span class="audition-dirty" title="Edited since it was sent">•</span>' : ''}` +
        `</span>` +
        `<button type="button" id="audition-btn" class="is-secondary">Reset sound</button>` +
        `<button type="button" id="save-live-btn"${dirty ? '' : ' disabled'}>Save to Library</button>` +
        note +
        // Leaving is a close control at the far right, like the modal's — not
        // a button competing with Save.
        `<button type="button" id="done-live-btn" title="Leave audition mode" aria-label="Leave audition mode">` +
        '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none" ' +
        'stroke="currentColor" stroke-width="1.6" stroke-linecap="round">' +
        '<path d="M4 4l8 8M12 4l-8 8"/></svg></button>' +
        `</div>`
      );
    }
    return (
      `<div class="audition-bar">` +
      `<button type="button" id="audition-btn">Audition “${esc(patch.name)}”</button>` +
      note +
      `</div>`
    );
  }

  // The working copy of a patch that the instrument's edit buffer is known to
  // hold. Set by a successful Audition and ONLY by that: without it, a control
  // would be editing whatever the Seven happens to be playing, which is not
  // what is on screen. Cleared on disconnect and when another patch is chosen.
  const labelFor = (key) => {
    const p = (deps.schema && deps.schema.parameters || []).find((x) => x.key === key);
    return p ? p.label : key;
  };

  let liveEdit = null; // { file, patchIndex, params, dirty }

  const isConnected = () => {
    const row = document.getElementById('connection-row');
    return !!row && row.classList.contains('connected');
  };

  // Live requires BOTH: the buffer holds this patch, and we still have the
  // instrument. Without the second, the controls would keep accepting edits
  // that go nowhere.
  function isLive() {
    const t = auditionTarget();
    return !!(
      liveEdit && t && liveEdit.file === t.file && liveEdit.patchIndex === t.patchIndex &&
      isConnected()
    );
  }

  // Losing the instrument ends the live session, but NOT the working copy when
  // it holds unsaved edits — those values are real, the device confirmed each
  // one, and dropping them silently would lose work. The bar stays visible
  // with a Save button and says the connection is gone.
  function clearLive() {
    stopPanelPoll();
    if (!liveEdit) return;
    if (!liveEdit.dirty) liveEdit = null;
    deps.renderDetail();
  }

  // One parameter, one write. The value stored is the one the device ECHOED,
  // never the one requested — if the Seven clamps or refuses, the panel shows
  // what the instrument actually did.
  let sendInFlight = false;
  let pendingSend = null;
  let auditionInFlight = false;

  async function sendEdit(key, value, opts = {}) {
    if (!isLive()) return;
    if (sendInFlight) { pendingSend = { key, value, opts }; return; } // coalesce a drag
    sendInFlight = true;
    // What the parameter held before this write — the thing an undo puts back.
    // Read before the send, because the send overwrites it.
    const before = liveEdit.params[key];
    try {
      const r = await window.sevenAPI.midi.setParam(key, value);
      if (r.ok) {
        // An edit to the instrument's buffer joins the app's one undo stack,
        // so Cmd-Z means the same thing here as it does in the library. Not
        // recorded when the undo IS the caller, or the stack would grow a rung
        // every time you stepped back down it.
        if (!opts.undoing && before != null && before !== r.value && deps.undoStack) {
          deps.undoStack.push(`${labelFor(key)} → ${before}`, async () => {
            await sendEdit(key, before, { undoing: true });
          });
        }
        liveEdit.params[key] = r.value;
        liveEdit.touched.add(key);
        liveEdit.dirty = true;
        auditionNote = null;
      } else {
        auditionNote = { kind: 'is-error', text: r.error, file: liveEdit.file };
      }
    } finally {
      sendInFlight = false;
    }
    deps.renderDetail();
    if (pendingSend) {
      const next = pendingSend;
      pendingSend = null;
      sendEdit(next.key, next.value, next.opts);
    }
  }

  // Panel moves announce themselves by CC. The CC number says WHICH parameter
  // moved — that mapping is device-verified in the schema — but its value is
  // not interpreted: how a CC value maps onto a parameter's range has never
  // been demonstrated, so the arrival is treated as a notification and the
  // real value is read back over SysEx. Reads are coalesced per parameter, so
  // sweeping a knob costs one read after it settles, not one per CC.
  let ccMap = null;
  const ccTimers = new Map();

  async function onPanelCc(cc) {
    if (!isLive()) return;
    if (!ccMap) ccMap = await window.sevenAPI.midi.ccMap();
    const key = ccMap[cc];
    if (!key) return;
    clearTimeout(ccTimers.get(key));
    ccTimers.set(key, setTimeout(async () => {
      ccTimers.delete(key);
      if (!isLive()) return;
      const r = await window.sevenAPI.midi.readParam(key);
      if (r && r.ok && liveEdit.params[key] !== r.value) {
        liveEdit.params[key] = r.value;
        liveEdit.dirty = true; // the buffer no longer matches the saved patch
        deps.renderDetail();
      }
    }, 80));
  }

  // The six panel-owned Clavi tabs announce nothing (flag=0, cc=-1), so the
  // only way to follow them is to look. While a Clavi patch is live, poll them
  // about once a second — six reads, well inside what the port carries (a
  // backup does ~75 a second). Any other engine polls nothing.
  const PANEL_OWNED = ['zd6_br', 'zd6_tr', 'zd6_md', 'zd6_sf', 'zd6_cd', 'zd6_ab'];
  let panelPoll = null;

  function startPanelPoll() {
    stopPanelPoll();
    panelPoll = setInterval(async () => {
      if (!isLive()) return stopPanelPoll();
      if (!PANEL_OWNED.some((k) => k in liveEdit.params)) return stopPanelPoll();
      let changed = false;
      for (const key of PANEL_OWNED) {
        const r = await window.sevenAPI.midi.readParam(key);
        if (r && r.ok && liveEdit && liveEdit.params[key] !== r.value) {
          liveEdit.params[key] = r.value;
          changed = true;
        }
      }
      // A tab move is the PLAYER's edit, not ours — it makes the buffer differ
      // from the saved patch, so it counts as unsaved work like any other.
      if (changed) { liveEdit.dirty = true; deps.renderDetail(); }
    }, 1000);
  }

  function stopPanelPoll() {
    clearInterval(panelPoll);
    panelPoll = null;
  }

  // Reads back the parameters this session changed and compares them with the
  // working copy. Still ours -> the buffer survived, so stay live. Changed ->
  // a genuine recall replaced it, so end the session and say so.
  async function checkBufferAfterRecall(ev) {
    const file = liveEdit.file;
    // Prefer the parameters this session changed; with none yet, sample the
    // patch itself. Clearing without checking meant an unexplained Program
    // Change silently ended a session whose buffer was still perfectly intact.
    const touched = [...(liveEdit.touched || [])];
    const keys = (touched.length ? touched : Object.keys(liveEdit.params)).slice(0, 8);
    if (!keys.length) {
      liveEdit = null;
      deps.renderDetail();
      return;
    }
    let intact = true;
    for (const key of keys) {
      const r = await window.sevenAPI.midi.readParam(key);
      if (!r || !r.ok || r.value !== liveEdit.params[key]) { intact = false; break; }
    }
    if (intact) {
      // The edit buffer still holds what we sent. Most often that means the
      // user just stored it on the panel — say where, without claiming more
      // than the instrument has actually told us.
      auditionNote = {
        kind: 'is-ok',
        file,
        text: `The Seven is on Bank ${ev.bank} · Preset ${ev.preset}, still holding these settings. ` +
          'If you held the button to store it, it is saved there — Save to Library keeps a copy here.',
      };
    } else {
      const stale = liveEdit.dirty;
      liveEdit = null;
      auditionNote = {
        kind: 'is-error',
        file,
        text: stale
          ? 'The Seven recalled a different preset — your unsaved edits are gone.'
          : 'The Seven recalled a preset, so audition mode ended.',
      };
    }
    deps.renderDetail();
  }

  const explainAuditionModal = () =>
    SevenModal.confirm({
      title: 'AUDITION MODE',
      body:
        'Your tweaks change the sound of the Crumar Seven. But it\u2019s all in a ' +
        'buffer. Your saved sounds are safe.\n\n' +
        'To save your new sound to the SEVEN, hold a preset button for three ' +
        'seconds (just like you normally do to save patches).\n\n' +
        'Click the \u201CSave to Library\u201D button to save your new sound to ' +
        'the computer.',
      confirmLabel: 'Start Audition',
    });

  // Reaching for a control while not in audition mode IS the request to edit,
  // so it offers the way in rather than explaining why nothing happened. The
  // modal is the door: Start Audition walks through it, the X declines.
  // Guarded against re-entry: the send takes a moment, and until it lands the
  // row is still not live — so a second click on the control (or on another
  // one) used to open a second copy of the same modal.
  let offering = false;
  let ourRecall = null; // { program, until } — the echo of a recall we sent // patch file the modal has already been shown for

  async function offerAudition() {
    if (offering || auditionInFlight) return;
    // Already live: this control simply isn't editable — an inert row, or a
    // shape with no live handler yet (the pedal's range pair). Offering to
    // start audition mode here walked the whole entry path and ended up
    // pressing the button that now reads "Reset sound", which asks about
    // discarding the very edits the user was in the middle of making.
    if (isLive()) return;
    // No cooldown and no once-per-patch memory: reaching for a control IS the
    // request to edit, so it asks every time. The modal-on-every-touch loop
    // this once guarded against was the recall echo ending live sessions, and
    // that is fixed at the source — suppressing the offer only left someone
    // who dismissed it with controls that did nothing at all.
    if (!isConnected()) {
      toast('Connect the Seven to edit sounds');
      return;
    }
    if (!auditionTarget()) return;
    offering = true;
    try {
      // No modal on this path. Touching a control is already the request, so
      // asking again only added a step to dismiss — and a modal that can
      // reappear is a modal that can trap you. What the rule is gets taught
      // once by the Audition button, and stated permanently in the bar.
      localStorage.setItem('seven.auditionExplained', '1');
      toast('Entering audition mode…', { sticky: true });
      const btn = document.getElementById('audition-btn');
      if (btn) btn.click();
      else hideToast();
      // The click hands off to an async handler. If that handler bailed before
      // starting the send — no target, a confirm declined, the instrument gone
      // — nothing else will take this message down.
      setTimeout(() => { if (!auditionInFlight && !isLive()) hideToast(); }, 400);
    } finally {
      offering = false;
    }
  }

  const rowKeyOf = (el) => {
    const row = el.closest('.param.is-live');
    return row ? { key: row.dataset.key, max: Number(row.dataset.max) } : null;
  };

  // Bars: press or drag anywhere along the track. Value follows the pointer,
  // rounded to the parameter's own range — no separate handle to hunt for.
  el.addEventListener('pointerdown', (e) => {
    const bar = e.target.closest('.param.is-live .param-bar');
    if (!bar) return;
    e.preventDefault();
    const info = rowKeyOf(bar);
    if (!info) return;
    e.preventDefault();
    const rect = bar.getBoundingClientRect();
    const valueAt = (clientX) => {
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Math.round(pct * info.max);
    };
    let last = null;
    const move = (ev) => {
      const v = valueAt(ev.clientX);
      if (v !== last) { last = v; sendEdit(info.key, v); }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    move(e);
  });

  // Switches, choice tabs and segmented selectors all carry their target value.
  el.addEventListener('click', (e) => {
    // Not live yet: any reach for a control offers audition mode.
    const idle = e.target.closest('.param:not(.is-live) [data-set], .param:not(.is-live) .param-bar');
    if (idle) { offerAudition(); return; }
    const hit = e.target.closest('.param.is-live [data-set]');
    if (!hit) return;
    const info = rowKeyOf(hit);
    if (!info) return;
    const want = Number(hit.dataset.set);
    // Each half of a choice tab carries ITS OWN value, so clicking the lit
    // side asks for the value already in place. Don't spend a write on it —
    // and don't let the silence read as a broken control: the hover styling
    // now marks the side that would actually change something.
    if (liveEdit.params[info.key] === want) return;
    sendEdit(info.key, want);
  });

  el.addEventListener('change', (e) => {
    const sel = e.target.closest('.param.is-live .param-select');
    if (!sel) return;
    const info = rowKeyOf(sel);
    if (info) sendEdit(info.key, Number(sel.value));
  });

  el.addEventListener('click', async (e) => {
    if (e.target.closest('#done-live-btn')) {
      const target = auditionTarget();
      // Leaving with unsaved edits is a decision, not a side effect. What the
      // instrument holds is untouched either way — it keeps them until a
      // preset is recalled — but the library copy is what survives.
      const liveEditWasDirty = !!(liveEdit && liveEdit.dirty);
      if (liveEditWasDirty) {
        const go = await SevenModal.confirm({
          title: 'Leave without saving?',
          body:
            'Your edits stay in the Seven\u2019s buffer until you recall a preset, ' +
            'but they will not be saved to this computer.',
          confirmLabel: 'Leave Without Saving',
          tone: 'is-warning',
        });
        if (!go) return;
      }
      liveEdit = null;
      auditionNote = liveEditWasDirty
        ? { kind: 'is-error', file: target && target.file,
            text: 'Left audition mode. Those edits were not saved to the library.' }
        : null;
      deps.renderDetail();
      return;
    }
    if (e.target.closest('#save-live-btn')) {
      const btn = e.target.closest('#save-live-btn');
      btn.disabled = true;
      btn.textContent = 'Saving…';
      await saveLiveToLibrary();
      deps.renderDetail();
      return;
    }
    if (!e.target.closest('#audition-btn')) return;
    const target = auditionTarget();
    if (!target) return;
    // Explain the rule once from the BUTTON — you already said what you wanted
    // by pressing it. Reaching for a control instead is a different case: see
    // offerAudition().
    const EXPLAINED = 'seven.auditionExplained';
    if (!localStorage.getItem(EXPLAINED)) {
      const ok = await explainAuditionModal();
      localStorage.setItem(EXPLAINED, '1');
      if (!ok) return;
    }
    // Resetting while there are unsaved edits destroys them — ask first.
    if (isLive() && liveEdit.dirty) {
      const go = await SevenModal.confirm({
        title: 'Discard your live edits?',
        body:
          'This sends the patch as it is saved on this computer, replacing what is ' +
          'in the Seven’s edit buffer. Edits you have not saved to the library are lost.',
        confirmLabel: 'Reset Sound',
        tone: 'is-warning',
      });
      if (!go) return;
    }
    const btn = e.target.closest('#audition-btn');
    btn.disabled = true;
    btn.textContent = 'Sending…';
    auditionInFlight = true;
    let r;
    try {
      r = await window.sevenAPI.midi.audition(target.file, target.patchIndex);
    } catch (err) {
      // An IPC that rejects (rather than returning {ok:false}) used to strand
      // the button mid-send: disabled, reading "Sending…", with no path back
      // except restarting the app.
      r = { ok: false, error: `The send failed: ${err && err.message}` };
    } finally {
      auditionInFlight = false;
      hideToast();
    }
    if (!r.ok) {
      auditionNote = { kind: 'is-error', text: r.error, file: target.file };
      toast(r.error);
    } else {
      // Say exactly what happened, including anything the device refused.
      const parts = [`Sent ${r.sent} settings · ${r.soundName}`];
      if (r.mismatches && r.mismatches.length) {
        parts.push(`${r.mismatches.length} value${r.mismatches.length === 1 ? '' : 's'} the Seven adjusted`);
      }
      parts.push('hold a preset button for 3s to keep it');
      auditionNote = { kind: 'is-ok', text: `${parts.join(' · ')}.`, file: target.file };
      // The edit buffer now holds this patch, so its controls can go live.
      // The working copy starts from what was actually sent.
      liveEdit = {
        file: target.file,
        patchIndex: target.patchIndex,
        params: { ...(deps.getPatch() || {}).params },
        touched: new Set(), // keys this session changed — evidence for the check below
        dirty: false,
      };
      startPanelPoll();
    }
    deps.renderDetail();
  });

  // Writes the working copy to the patch file. Needs no instrument — the
  // values are already here, which is why switching patches never has to cost
  // you the edit itself.
  async function saveLiveToLibrary() {
    if (!liveEdit) return;
    const previous = { ...((deps.getEntries().find(
      (e) => e.file === liveEdit.file && e.patchIndex === liveEdit.patchIndex
    ) || {}).params || {}) };
    const { file, patchIndex } = liveEdit;
    await window.sevenAPI.library.saveParams(file, patchIndex, liveEdit.params);
    liveEdit.dirty = false;
    auditionNote = { kind: 'is-ok', text: 'Saved to the library.', file };
    await deps.refreshLibrary();
    deps.undoStack.push('save to library', async () => {
      await window.sevenAPI.library.saveParams(file, patchIndex, previous);
      await deps.refreshLibrary();
      deps.renderDetail();
    });
  }

  async function recallOnDevice(bank, preset) {
    if (!isConnected()) return;
    if (liveEdit && liveEdit.dirty) {
      // The Seven has ONE edit buffer, so a recall replaces it — that part is
      // hardware. But the app holds these values, and saving them needs no
      // instrument, so offer that rather than only warning.
      const answer = await SevenModal.confirm({
        title: 'Save your changes first?',
        body:
          'Switching patches loads the new one onto the Seven, which replaces the ' +
          'sound you have been editing.\n\n' +
          'Saving keeps your changes on this computer. To keep them on the Seven ' +
          'itself, hold a preset button for three seconds first.',
        confirmLabel: 'Save, Then Switch',
        secondaryLabel: 'Switch Without Saving',
        tone: 'is-warning',
      });
      if (!answer) return;
      if (answer === true) await saveLiveToLibrary();
    }
    // With Send PC on, the Seven echoes the recall straight back as a Program
    // Change. That echo is ours, not the player reaching for the panel, and
    // treating it as theirs ended live sessions that had only just begun.
    ourRecall = { program: bank * 8 + preset, until: Date.now() + 2000 };
    await window.sevenAPI.midi.recall(bank, preset);
    // The buffer has just been replaced on purpose, so the live session is
    // over. Without this the app kept asking about edits the FIRST recall had
    // already discarded — a warning about work that no longer existed, once
    // per click.
    if (liveEdit) {
      liveEdit = null;
      deps.renderDetail();
    }
  }

  // The state pill reflects DEVICE state only — it never flips from a click
  // alone (docs/DESIGN.md). In audition mode it CAN act: the write goes out,
  // and the pill re-renders from the value the instrument echoed back. The
  // TODO this replaces was written before there was a device to talk to; its
  // "No instrument connected" was the only answer available then, and it kept
  // being given after the instrument arrived.
  function handleStatePill(pill) {
    const key = pill.dataset.switch;
    if (isLive() && key) {
      const current = liveEdit.params[key];
      sendEdit(key, current === 1 ? 0 : 1); // raw flip; `invert` is a display rule
      return;
    }
    offerAudition();
  }

    // Preview a patch by selection — clicking a setlist slot should let you
    // hear it. Coalesced: while one send is in flight the latest request is
    // remembered and sent after, so walking a list does not queue a send per
    // row. Declines with a toast when there are unsaved live edits, rather
    // than silently discarding them.
    let previewQueued = null;

    async function preview(target) {
      if (!isConnected() || !target) return;
      if (liveEdit && liveEdit.dirty && liveEdit.file !== target.file) {
        toast('Save or discard your edits before previewing another patch');
        return;
      }
      if (auditionInFlight) {
        previewQueued = target;
        return;
      }
      auditionInFlight = true;
      toast('Loading…', { sticky: true });
      try {
        const r = await window.sevenAPI.midi.audition(target.file, target.patchIndex);
        if (r && r.ok) {
          liveEdit = {
            file: target.file,
            patchIndex: target.patchIndex,
            params: { ...(deps.getPatch() || {}).params },
            touched: new Set(),
            dirty: false,
          };
          startPanelPoll();
        } else if (r) {
          toast(r.error);
        }
      } finally {
        auditionInFlight = false;
        hideToast();
      }
      deps.renderDetail();
      const next = previewQueued;
      previewQueued = null;
      if (next && next.file !== target.file) preview(next);
    }

    return {
      preview,
      isLive,
      // Selecting a different patch is leaving. The session ends — but only
      // when there is nothing to lose: a DIRTY session is left alone, because
      // the bar and its Save button are the one thing standing between unsaved
      // edits and the bin, and the switch guard owns that conversation.
      endIfClean() {
        if (!liveEdit || liveEdit.dirty) return false;
        liveEdit = null;
        stopPanelPoll();
        return true;
      },
      // Unlike isLive(), this asks about the SESSION rather than the selection:
      // is there edited-but-unsaved work in the instrument's buffer right now,
      // whatever the user happens to have clicked on. Anything that recalls a
      // preset for its own reasons has to check this first — a recall replaces
      // the buffer, and only a dirty session has something to lose.
      hasUnsavedEdit: () => !!(liveEdit && liveEdit.dirty),
      clearLive,
      renderBar: renderAuditionBar,
      workingParams: () => (liveEdit ? liveEdit.params : null),
      offerAudition,
      handleStatePill,
      onPanelCc,
      recallOnDevice,
      saveLiveToLibrary,
      // A Program Change while live is ambiguous — see checkBufferAfterRecall.
      // Returns true when the app caused it, so the caller ignores its echo.
      onProgramChange(ev) {
        const isEcho = ourRecall && ourRecall.program === ev.program && Date.now() < ourRecall.until;
        if (isEcho) {
          ourRecall = null;
          return true;
        }
        if (liveEdit && !auditionInFlight) checkBufferAfterRecall(ev);
        return false;
      },
    };
  }

  global.SevenAudition = { create };
})(window);
