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
//     way onto the instrument, and Save to Computer the only way onto disk.
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

  // The bar says ONE thing, and only once there is something to say: your
  // changes are not saved, and here is how to keep them.
  //
  // It used to announce a mode — AUDITION MODE, with a chip, a Reset button
  // and a way out. That mode was never a place the player was in; it was the
  // app's own bookkeeping for "the instrument's buffer holds what is on
  // screen", which selecting a patch now guarantees on its own. What is left
  // is the fact the app cannot do for you: storing needs your hands on the
  // panel (Daniel, 2026-08-12).

  function renderAuditionBar(patch, live) {
    const target = auditionTarget();
    if (!target) return '';

    // Two words of text, not two buttons. A filled button sat in a column of
    // 12px labels and read as the loudest thing on the panel, and it was
    // competing for shape with everything else (Daniel, 2026-08-13). These are
    // links: the same size as the lines above them, told apart by colour and
    // weight rather than by chrome.
    //
    // Both are always present, dimmed and inert until there is something to
    // save. The note, when there is one, goes on its own line underneath.
    // NOT on Bank 1. The Seven refuses a store there — the bank is hardware
    // write-protected — so the control offered a walkthrough of a hold that
    // cannot work and then said so in brackets underneath. A control that
    // explains why it will fail should not be a control (Daniel, 2026-08-14).
    //
    // Everything else about Bank 1 stays: the slot loads, its parameters are
    // live, the carousel changes its sound. All of that is the edit buffer,
    // which the instrument allows. Only KEEPING it there is refused, so only
    // the control that offers to keep it goes away.
    const slot = deps.getSlot && deps.getSlot();
    const onFactoryBank = !!slot && slot.bank === 0 && deps.lastTouchedDevice && deps.lastTouchedDevice();

    // A Crumar capture on disk. Editing it in place is refused — it seeds
    // every generated patch of its model — so the way to edit it is offered
    // here, BEFORE any editing, rather than turning up as a copy you did not
    // ask for at save time (Daniel, 2026-08-14).
    const donorEntry = (deps.getEntries() || []).find(
      (e) => e.file === target.file && (e.patchIndex || 0) === (target.patchIndex || 0)
    );
    // ONE CONTROL, THREE CONTEXTS (Daniel, 2026-08-21).
    //
    //   ON THE SEVEN   "Save as new patch"  ALWAYS available
    //   Backups        "Save as new patch"  when something has drifted
    //   Patches        "Save patch"         when something has drifted
    //
    // The label names the DESTINATION, never "save edits": a backup is not
    // written to and cannot be, so a label promising to save into one would be
    // describing something the app refuses to do.
    //
    // ON THE SEVEN is always on because there is no file behind a bank slot to
    // compare against. The app knows only what that slot held at the last
    // backup, and the preset may have changed on the instrument since — so it
    // cannot honestly claim the player edited anything, because it does not
    // know what the slot contained. An always-available control claims
    // nothing; a drift marker there would be a guess.
    const onSeven = !!(deps.lastTouchedDevice && deps.lastTouchedDevice());
    const isBackupRecord = !!(donorEntry && donorEntry.origin && donorEntry.origin.kind === 'backup');
    const savesAsNew = onSeven || isBackupRecord;
    const saveLabel = savesAsNew ? 'Save as new patch' : 'Save patch';

    const bar = (live, note, kind = '') =>
      `<div class="audition-bar ${live ? 'is-live' : 'is-idle'}">` +
      `<span class="save-actions">` +
      // SHOWN ONLY WHEN THERE IS SOMETHING TO SAVE, and hidden rather than
      // removed: the slot keeps its height either way, so the panel does not
      // jump the instant somebody touches a knob. A control that shoves the
      // layout around on the first edit is worse than one that is always there
      // (Daniel, 2026-08-21).
      //
      // It was DISABLED before, which is not the same thing — a disabled
      // button still drew in full, in the action colour, on a patch nobody had
      // edited. Measured on an unedited backup record: disabled=true,
      // color rgb(79,185,106), opacity 1.
      //
      // `live` is this bar's own argument — whether anything has drifted — so
      // the button follows drift everywhere except ON THE SEVEN, where it is
      // always present because there is no file to compare against.
      `<button type="button" id="save-live-btn" data-save-mode="${savesAsNew ? 'new' : 'overwrite'}"` +
      `${onSeven || live ? '' : ' class="is-hidden" tabindex="-1" aria-hidden="true" disabled'}>` +
      `${saveLabel}</button>` +
      // NO "Send to Seven" HERE, in any context. It is not a link: it moved to
      // the rows, where every other per-patch action already lives.
      `</span>` +
      (note ? `<span class="audition-note ${kind}">${note}</span>` : '') +
      `</div>`;

    // Losing the cable is not the same as walking away from a patch: you did
    // not choose it, so the edits stay and the bar keeps a way to save them.
    const stranded =
      !isConnected() && liveEdit && driftNow() && liveEdit.file === target.file;
    if (stranded) {
      return bar(true, 'The Seven disconnected. These edits are still here — save them to keep them.', 'is-error');
    }
    if (!isConnected()) return bar(false, '');

    const mine = auditionNote && auditionNote.file === target.file;
    const dirty = !!(live && liveEdit && driftNow());
    // A note about what just happened (saved, copied) belongs on the quiet
    // state too — it is news, not an alarm.
    return bar(dirty, mine ? esc(auditionNote.text) : '', mine ? auditionNote.kind : '');
  }

  // ---- Drift: is anything different from what was sent? --------------------
  //
  // Replaces `liveEdit.dirty`, which was set the moment a control was touched
  // and never recomputed — so turning a knob up and back left the save button
  // showing, offering to save an edit that no longer existed. A flag records
  // that something happened; only a comparison says whether anything differs,
  // and differing is what the button is for (src/drift.js, and the tests there
  // pin the restore case specifically).
  const driftNow = () => (liveEdit ? SevenDrift.hasDrift({
    baseline: liveEdit.baseline,
    live: liveEdit.params,
    baselineSound: liveEdit.baselineSound,
    liveSound: liveEdit.liveSoundName || liveEdit.baselineSound,
  }) : false);

  // Which keys actually differ — used to check the buffer survived a recall.
  // This was `liveEdit.touched`, a set of everything the session had written;
  // a comparison is strictly better, because a value written and then put back
  // is not evidence of anything and only wasted one of the eight reads.
  const driftedKeys = () => {
    if (!liveEdit || !liveEdit.baseline) return [];
    return Object.keys(liveEdit.params).filter(
      (k) => Number(liveEdit.params[k]) !== Number(liveEdit.baseline[k])
    );
  };

  // Is there anything to save right now? The panel uses it to decide whether
  // the controls have just come alive and should say so.
  function saveIsActive() {
    const target = auditionTarget();
    if (!target) return false;
    if (!isConnected()) return !!(liveEdit && driftNow() && liveEdit.file === target.file);
    return driftNow();
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
  // Which slot the Seven was sitting on when this session started. Leaving
  // audition mode is an act in the APP — the instrument goes on playing
  // whatever we last put in its buffer — so a session that ends cleanly puts
  // the instrument back where it found it. Without this you leave audition
  // mode, select something else, and are still hearing the sound you were
  // trying out (Daniel, 2026-08-12: "I'm hearing a CP80 even when I've
  // switched to another patch").
  let cameFrom = null; // { bank, preset }, 0-based, or null if unknown

  const rememberWhereWeWere = () => {
    cameFrom = (deps.getSlot && deps.getSlot()) || null;
  };

  // Put it back. Never when the session is dirty: a recall replaces the edit
  // buffer, and unsaved edits live there.
  const restoreWhereWeWere = () => {
    const back = cameFrom;
    cameFrom = null;
    if (!back || !isConnected()) return;
    // Mark it as OURS before it goes. The Seven echoes the Program Change and
    // the app moves its selection to follow the hardware — which is right when
    // a player presses a panel button, and wrong when the app pressed it. Left
    // unmarked, putting the instrument back yanked the selection to the bank
    // region mid-browse, so the next arrow key moved the wrong list.
    markOurRecall(back.bank * 8 + back.preset);
    window.sevenAPI.midi.recall(back.bank, back.preset);
  };

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
    if (!driftNow()) liveEdit = null;
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
        // Follow the value either way — the panel is the truth about the
        // buffer. But only call it UNSAVED WORK if it was not the recall's own
        // burst describing what it just loaded.
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
      if (changed) deps.renderDetail();
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
    const changed = driftedKeys();
    const keys = (changed.length ? changed : Object.keys(liveEdit.params)).slice(0, 8);
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
      // Nothing to say. The buffer still holds what is on screen, which is the
      // ordinary state of things now that selecting a patch loads it — and a
      // paragraph explaining that a hold you just performed probably worked is
      // a paragraph about the absence of a problem (Daniel, 2026-08-12).
      auditionNote = null;
    } else {
      const stale = driftNow();
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

  // Reaching for a control while not in audition mode IS the request to edit,
  // so it offers the way in rather than explaining why nothing happened. The
  // modal is the door: Start Audition walks through it, the X declines.
  // Guarded against re-entry: the send takes a moment, and until it lands the
  // row is still not live — so a second click on the control (or on another
  // one) used to open a second copy of the same modal.
  let offering = false;
  // Every recall WE issue, until its echo comes back. A list, not one slot:
  // selecting a patch can fire two in a row — one to put the instrument back
  // where the last session started, then one for the slot just chosen — and
  // with room for only the latest, the first echo arrived unrecognised, was
  // read as the player pressing a panel button, and dragged the selection back
  // to the bank it had just left (Daniel, 2026-08-12: "I click Bank 3/button 2
  // and it flips back to Bank 2").
  let ourRecalls = []; // [{ program, until }]

  const markOurRecall = (program) => {
    const now = Date.now();
    ourRecalls = ourRecalls.filter((r) => r.until > now);
    ourRecalls.push({ program, until: now + 2500 });
  };

  const claimOurRecall = (program) => {
    const now = Date.now();
    const i = ourRecalls.findIndex((r) => r.program === program && r.until > now);
    ourRecalls = ourRecalls.filter((r) => r.until > now);
    if (i < 0) return false;
    ourRecalls.splice(i, 1);
    return true;
  };

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
      // No button and no dialog. Reaching for a control is the request; the
      // app makes the buffer match what is on screen and then does what you
      // reached for. There is nothing here for the player to agree to.
      await preview(auditionTarget());
      hideToast();
      if (isLive()) await applyPendingIntent();
      else pendingIntent = null;
    } finally {
      offering = false;
    }
  }

  const rowKeyOf = (el) => {
    const row = el.closest('.param.is-live');
    return row ? { key: row.dataset.key, max: Number(row.dataset.max) } : null;
  };

  // The move that PROMPTED audition mode. Reaching for a control while the
  // patch is not live opens the session — and then the move itself was lost,
  // so you had to make it twice: once to be asked, once to mean it. This
  // remembers what you were reaching for and does it as soon as the session
  // opens (Daniel, 2026-08-12).
  let pendingIntent = null;

  const intentFrom = (e, el) => {
    const row = el.closest('.param');
    if (!row || !row.dataset.key) return null;
    const key = row.dataset.key;
    const setter = el.closest('[data-set]');
    if (setter) return { key, value: Number(setter.dataset.set) };
    const bar = el.closest('.param-bar');
    if (bar) {
      const rect = bar.getBoundingClientRect();
      const max = Number(row.dataset.max);
      if (!rect.width || !Number.isFinite(max)) return null;
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      return { key, value: Math.round(pct * max) };
    }
    return null;
  };

  // Called once a session is live. A pending move is a one-shot: if the send
  // fails or the offer is declined, it is dropped rather than lying in wait.
  async function applyPendingIntent() {
    const intent = pendingIntent;
    pendingIntent = null;
    if (!intent || !isLive()) return;
    await sendEdit(intent.key, intent.value);
  }

  // Bars: press or drag anywhere along the track. Value follows the pointer,
  // rounded to the parameter's own range — no separate handle to hunt for.
  el.addEventListener('pointerdown', (e) => {
    const idleBar = e.target.closest('.param:not(.is-live) .param-bar');
    if (idleBar) {
      // Remember where on the bar they pressed; the click handler that follows
      // opens the offer.
      pendingIntent = intentFrom(e, idleBar);
      return;
    }
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
    if (idle) {
      pendingIntent = intentFrom(e, idle);
      offerAudition();
      return;
    }
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
    if (e.target.closest('#save-live-btn')) {
      const btn = e.target.closest('#save-live-btn');
      const mode = btn.dataset.saveMode;
      btn.disabled = true;
      btn.textContent = 'Saving…';
      if (mode === 'new') await saveLiveAsNewPatch();
      else await saveLiveToLibrary();
      deps.renderDetail();
      return;
    }
    // The Audition button is gone. Selecting a patch already makes the
    // instrument play it — a bank slot by recall, a library patch by load — so
    // there is nothing left to press to "enter" anything, and the whole send
    // path that lived here now belongs to preview().
  });

  // SAVE AS NEW: the buffer, as its own patch in Patches.
  //
  // What is saved is WHAT IS LIVE, not the contents of whatever file is open.
  // That is the whole reason the control exists — you were playing a backup
  // record, or a bank slot with no file behind it at all, and the thing worth
  // keeping is what the instrument is holding. A copy-the-source
  // implementation discards exactly the edits the button was pressed for, and
  // it looks like it worked.
  //
  // Provenance is a NEW patch's: created now, instrument facts from what is
  // connected now, and nothing claimed when nothing is attached
  // (createPatchFromLive in library-store.js).
  async function saveLiveAsNewPatch() {
    const patch = deps.getPatch();
    if (!patch) return;
    const liveSound = deps.getLiveSound && deps.getLiveSound();
    const soundName = (liveSound && liveSound.name) || patch.soundName || '';
    // Whatever the buffer holds. With no live session — the ON THE SEVEN case,
    // where nothing has been sent — the slot's own values are what is playing.
    const params = (liveEdit && liveEdit.params) || patch.params || {};

    const base = String(patch.name || soundName || 'Patch')
      .replace(/^Bank\s*\d+\s*Preset\s*\d+\s*—\s*/, '');
    const suggested = await window.sevenAPI.library.nextPatchName(base);
    const chosen = await deps.askForName({
      title: 'Save as new patch', suggested, confirmLabel: 'Save',
    });
    // FALSE, not undefined: a caller that offered this as one of two choices
    // needs to tell "they cancelled the name" from "it saved", so it can put
    // its own question back rather than closing everything (app.js's send).
    if (!chosen) return false;

    let made;
    try {
      made = await window.sevenAPI.library.createFromLive({
        name: chosen,
        soundName,
        sampled: liveSound ? !!liveSound.sampled : undefined,
        params: { ...params },
      });
    } catch (err) {
      // The seam throws on a refusal, so this cannot be mistaken for success.
      toast(err.message || 'Could not save that patch');
      return false;
    }
    await deps.refreshLibrary();
    // The live session, if there is one, does NOT follow the new patch: you
    // were playing a record or a slot and you still are. The new patch is a
    // copy of this moment, not a change of what is open.
    toast(`Saved to Patches: ${chosen}`);
    if (made && made.file && deps.revealPatch) deps.revealPatch(made.file, made.patchIndex || 0);
    return true;
  }

  // Writes the working copy to the patch file. Needs no instrument — the
  // values are already here, which is why switching patches never has to cost
  // you the edit itself.
  async function saveLiveToLibrary() {
    if (!liveEdit) return;
    const entry = deps.getEntries().find(
      (e) => e.file === liveEdit.file && e.patchIndex === liveEdit.patchIndex
    ) || {};
    const previous = { ...(entry.params || {}) };
    let { file, patchIndex } = liveEdit;

    // A BACKUP RECORD IS NEVER OVERWRITTEN. It is a dated account of what the
    // instrument held on the day it was captured, and the value of a record is
    // that it does not change — so saving edits made on top of one always
    // produces a new patch, with no question asked (Daniel, 2026-08-13).
    // Anything else in the library is yours, and there the choice is real:
    // overwriting is right when refining a patch, a copy when making a
    // variant.
    const isBackup = !!(entry.origin && entry.origin.kind === 'backup');
    // A DONOR IS NEVER OVERWRITTEN EITHER, and this is its own rule rather
    // than a side effect of the one above (Daniel, 2026-08-14).
    //
    // A library patch captured from Bank 1 is what every generated patch of
    // that model is seeded from — see createPatchFromSound in
    // library-store.js. Editing one in place changes every patch generated
    // from that model afterwards, with nothing on screen to connect the two.
    // It was already safe, because a Bank 1 patch is also a backup record and
    // backups always copy; but that is a rule about RECORDS that happened to
    // cover donors, and the day it changes the donors lose their protection
    // silently. So the reason is written down where it applies.
    const isDonor = !!(entry.origin && entry.origin.bank === 1);
    // WHAT TO DO, not which button was pressed. The two were the same thing
    // until the safe option became the confirm, and reading the modal's raw
    // answer at the branch below is how that swap would silently invert.
    let intent = 'copy';
    if (!isBackup && !isDonor) {
      const target = entry.name || 'this patch';
      const answer = await SevenModal.confirm({
        title: `Save “${esc(target)}”`,
        // NO CLAIM THAT ANYTHING WAS EDITED. This said "save your changes as a
        // copy" — but a slot captured from the instrument has no changes, and
        // the sentence narrated an edit that need never have happened. It says
        // what each button does instead (Daniel, 2026-08-22).
        body: `Write these values into “${target}”, or keep it and save them `
          + 'as a separate patch.',
        // THE SAFE PATH LEADS. Overwrite held both the focus and Return, so
        // pressing Enter destroyed a patch — and destroying one is
        // unrecoverable while making a second is not. Not the is-equal tone:
        // where one choice is undoable and the other is not, the modal should
        // lean, and it should lean to the one you can walk back from.
        confirmLabel: 'Save as a separate patch',
        // NAMED. Daniel met this dialog while standing in the Backups tab, saw
        // "Overwrite patch", and could not tell whether a backup was about to
        // be overwritten. It never could be — a record skips this dialog
        // entirely — but nothing on screen said which patch was the target.
        secondaryLabel: `Overwrite “${target}”`,
        cancelLabel: 'Cancel',
      });
      if (!answer) return;
      intent = answer === 'secondary' ? 'overwrite' : 'copy';
    }
    if (intent === 'copy') {
      const copy = await window.sevenAPI.library.duplicate(file, patchIndex);
      if (!copy || !copy.file) {
        toast('Could not make a copy');
        return;
      }
      // The live session follows the copy: what you go on editing is the thing
      // you just chose to keep.
      file = copy.file;
      patchIndex = copy.patchIndex || 0;
      liveEdit.file = file;
      liveEdit.patchIndex = patchIndex;
    }
    await window.sevenAPI.library.saveParams(file, patchIndex, liveEdit.params);

    // The SOUND goes with the settings. It used not to: audition a Vibraphone
    // onto a Tine patch, save, and the file kept "Tine Piano" over Vibraphone
    // settings — a record of a patch that had never existed (Daniel, raised
    // twice). The params alone were never the patch; the instrument playing
    // them is half of it.
    //
    // Written only when it actually differs, so an ordinary parameter save
    // does not restamp a field it had no opinion about.
    const live = deps.getLiveSound && deps.getLiveSound();
    const previousSound = entry.soundName || null;
    const soundChanged = live && live.name && live.name !== previousSound;
    if (soundChanged) {
      await window.sevenAPI.library.saveSound(file, patchIndex, live.name, !!live.sampled);
    }
    // SAVED: the file now holds what is live, so the baseline moves to meet
    // it and the drift goes away on its own. There is no flag to clear —
    // clearing one was how a restored value stayed "dirty" in the first place.
    liveEdit.baseline = { ...liveEdit.params };
    if (live && live.name) liveEdit.baselineSound = live.name;
    // A modal, not a line of status text under the controls. Saving is the
    // one thing in this column with a consequence on disk, and a note that
    // appeared where the hint used to be read as another piece of furniture
    // rather than an answer (Daniel, 2026-08-13). Notes stay for PROBLEMS —
    // a lost cable, a refused write — which is what that line is for.
    auditionNote = null;
    // Opened rather than confirmed, because the dialog now carries a way OUT
    // of itself: the file it just wrote may be one the user has never seen —
    // a backup record's edit becomes a new patch — so it offers to go there.
    // The library has to be refreshed BEFORE the link can work: the row it
    // scrolls to does not exist until the list has been re-read.
    await deps.refreshLibrary();
    // Name the patch that now EXISTS, not the one that was open. Saving a
    // backup record's edit writes a new file, and the dialog was announcing
    // the record's own name — "Bank 1 Preset 4 — Clavi Piano" — for a patch
    // actually called "Clavi Piano copy" (Daniel, 2026-08-14). The slot prefix
    // is stripped by the library's own displayName, so the dialog and the row
    // it sends you to agree.
    const savedEntry = deps.getEntries().find(
      (e) => e.file === file && (e.patchIndex || 0) === (patchIndex || 0)
    );
    const view = typeof window !== 'undefined' ? window.SevenLibraryView : null;
    const shownName =
      (view && view.displayName ? view.displayName(savedEntry || entry) : '') ||
      (savedEntry || entry).name || 'This patch';
    // "Clavi Piano copy": the instrument leads, and the suffix the app added
    // is quieter than the name you would say out loud.
    const copySuffix = /\s(copy(?:\s*\d+)?)$/i.exec(shownName);
    const nameHtml = copySuffix
      ? `${esc(shownName.slice(0, copySuffix.index))} <span class="bk-suffix">${esc(copySuffix[1])}</span>`
      : esc(shownName);
    const saved = SevenModal.open({
      // NAMES THE TAB THE PLAYER CAN GO TO. "Sound saved to computer" said
      // where the bytes went; "Patches" is a place they can actually open, and
      // the link below goes there. Used here and nowhere else — no other save
      // path shares this heading, so no other state is made wrong by it.
      title: 'Saved to Patches',
      bodyHtml:
        `<p class="bk-sum">${nameHtml}</p>` +
        // NO "Saved as a copy." line. The name directly above it already ends
        // in "copy", so the sentence restated what the reader had just read
        // (Daniel, 2026-08-22) — the same reason the "backup record is
        // unchanged" line went on 2026-08-14.
        //
        // It also referenced `answer`, which stopped existing when the
        // overwrite dialog started mapping its result to an `intent`: the
        // const is block-scoped to the branch that asks, and this line is
        // outside it. That was a ReferenceError on every successful save from
        // the Patches tab, shipped in 07d2b44 and live for minutes.
        '<button type="button" class="modal-link" data-goto-patch>Go to your new patch</button>',
      confirmLabel: 'Done',
      cancelLabel: 'Close',
      tone: 'is-announce',
    });
    const goto = saved.body.querySelector('[data-goto-patch]');
    if (goto && deps.revealPatch) {
      goto.addEventListener('click', () => {
        // Close first: the list scrolls and the detail panel re-renders
        // behind the dialog, and arriving somewhere you cannot see is not
        // arriving.
        saved.close();
        deps.revealPatch(file, patchIndex);
      });
    }
    // Done, Escape, the corner X and the backdrop all just dismiss it.
    saved.action().then(() => saved.close());
    deps.undoStack.push('save to library', async () => {
      await window.sevenAPI.library.saveParams(file, patchIndex, previous);
      // Undo puts the sound back too, or undoing a save would leave the file
      // in the very state this fix exists to prevent.
      if (soundChanged && previousSound) {
        await window.sevenAPI.library.saveSound(
          file, patchIndex, previousSound, !!entry.sampled
        );
      }
      await deps.refreshLibrary();
      deps.renderDetail();
    });
  }

  async function recallOnDevice(bank, preset) {
    if (!isConnected()) return;
    // No save-first prompt: leaving a patch discards, everywhere, by decision
    // (2026-08-12). The bar says so while the edits exist.
    // With Send PC on, the Seven echoes the recall straight back as a Program
    // Change. That echo is ours, not the player reaching for the panel, and
    // treating it as theirs ended live sessions that had only just begun.
    markOurRecall(bank * 8 + preset);
    await window.sevenAPI.midi.recall(bank, preset);
    // The buffer now holds this slot's own preset, which is exactly what the
    // panel is showing — so the session is simply OPEN. There is no mode to
    // enter: selecting a slot on the Seven guarantees the one condition
    // editing requires, and asking the player to confirm that guarantee was
    // the whole of "audition mode" on this side (2026-08-12).
    liveEdit = null;
    beginLiveForTarget();
    deps.renderDetail();
  }

  // Open a session on whatever is selected, from a caller that has just made
  // the buffer match it. The one rule it must not break is the rule the whole
  // module exists for: live means the buffer holds what is on screen.
  // A recall broadcasts 22 panel CCs describing the patch it just loaded. Those
  // are not the player turning anything — but the CC handler cannot tell the
  // difference, so it read each one back, found it differed from the file, and
  // marked the brand-new session dirty before anyone had touched the
  // instrument (Daniel, 2026-08-13; it is also why switch-patch-guard failed
  // intermittently — the race is between the burst and the fresh session).
  //
  // So a session ignores CCs for a moment after it opens. Long enough for a
  // recall's burst to land, short enough that a knob turned straight afterwards
  // still counts.
  const SETTLE_MS = 700;
  let settlingUntil = 0;
  const settling = () => Date.now() < settlingUntil;

  function beginLiveForTarget() {
    const target = auditionTarget();
    const patch = deps.getPatch();
    if (!target || !patch) return false;
    liveEdit = {
      file: target.file,
      patchIndex: target.patchIndex,
      params: { ...(patch.params || {}) },
      // The caller says the buffer already holds this, so this IS what was
      // sent as far as the app can know. beginLive({ params }) overwrites both
      // sides together when it has better information.
      baseline: { ...(patch.params || {}) },
      baselineSound: patch.soundName || null,
    };
    settlingUntil = Date.now() + SETTLE_MS;
    rememberWhereWeWere();
    startPanelPoll();
    return true;
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
      if (liveEdit && driftNow() && liveEdit.file !== target.file) {
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
          // BOTH SIDES START AS WHAT WAS SENT — the file's values after
          // clamping, reported by the sender. Seeding the live side from the
          // raw file instead would leave an out-of-range patch differing from
          // its own baseline before anybody touched a control (src/drift.js).
          const sentValues = r.values || { ...(deps.getPatch() || {}).params };
          liveEdit = {
            file: target.file,
            patchIndex: target.patchIndex,
            params: { ...sentValues },
            baseline: { ...sentValues },
            baselineSound: r.soundName || (deps.getPatch() || {}).soundName || null,
          };
          rememberWhereWeWere();
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
      // Enter the live session for whatever is selected, without the modal or
      // the send — for a caller that has ALREADY put the right thing in the
      // edit buffer and knows it. The one rule this must not break is the one
      // audition exists for: live means the buffer holds what is on screen.
      beginLive(opts) {
        const ok = beginLiveForTarget();
        // Changing the INSTRUMENT is an unsaved change, exactly as moving a
        // parameter is: the buffer no longer matches the stored preset, and
        // keeping it needs the same three-second hold. The bar used to wait
        // for a parameter edit, so a player who had picked a different sound
        // and wanted to keep it was told nothing (Daniel, 2026-08-13).
        //
        // It no longer takes a `dirty` flag for this: the caller passes the
        // sound it put in the buffer, and drift compares that with the sound
        // the file describes. Same answer, derived instead of asserted — and
        // it comes back on its own if the original sound is chosen again.
        // Values the caller has ALREADY put in the buffer — the working copy
        // must agree with the instrument, not with the file. The BASELINE moves
        // with them: these values are what the instrument was given, so they
        // are what drift is measured from. Moving only one side would report
        // an edit nobody made.
        if (ok && opts && opts.params) {
          Object.assign(liveEdit.params, opts.params);
          Object.assign(liveEdit.baseline, opts.params);
        }
        // The sound the buffer now holds. NOT the baseline — the baseline stays
        // whatever the file describes, and these two differing is exactly what
        // makes a sound change count as drift.
        if (ok && opts && opts.soundName) liveEdit.liveSoundName = opts.soundName;
        if (ok) deps.renderDetail();
        return ok;
      },
      // Selecting a different patch is leaving, and leaving DISCARDS. Daniel's
      // call, 2026-08-12, replacing a save-first prompt: the audition bar
      // already says nothing is saved until you save it, and a dialog between
      // you and the next patch is a toll on the common case (browsing) to
      // protect the rare one (browsing away from work you wanted).
      //
      // Two things make that liveable. The note says plainly what just
      // happened — "Left audition mode. Those edits were not saved to the
      // library." — and the instrument is put back where the session found it,
      // so what you hear matches what you are looking at.
      endSession() {
        if (!liveEdit) return false;
        liveEdit = null;
        stopPanelPoll();
        restoreWhereWeWere();
        // No note. It was written when leaving was rare and deliberate; now
        // every click on another patch leaves, and a red line after each one
        // is noise rather than news.
        return true;
      },
      // Is a load on its way to the instrument? The 0x45 it will broadcast
      // belongs to THAT load, not to whatever is selected by the time it
      // lands.
      isBusy: () => auditionInFlight,
      // Unlike isLive(), this asks about the SESSION rather than the selection:
      // is there edited-but-unsaved work in the instrument's buffer right now,
      // whatever the user happens to have clicked on. Anything that recalls a
      // preset for its own reasons has to check this first — a recall replaces
      // the buffer, and only a dirty session has something to lose.
      hasUnsavedEdit: () => driftNow(),
      clearLive,
      renderBar: renderAuditionBar,
      workingParams: () => (liveEdit ? liveEdit.params : null),
      offerAudition,
      handleStatePill,
      onPanelCc,
      recallOnDevice,
      saveLiveToLibrary,
      saveIsActive,
      // Save-as-new, for a caller offering it as a choice. Resolves true when
      // a patch was written, false when the name was cancelled or refused.
      saveAsNew: () => saveLiveAsNewPatch(),
      // Drift ON A NAMED PATCH, rather than "is anything drifted anywhere".
      // Send to Seven can be reached from a row that is not the live one — the
      // context menu — and asking about the wrong patch's edits would offer to
      // save something the player never touched.
      hasUnsavedEditFor: (file, patchIndex = 0) => !!(
        liveEdit && liveEdit.file === file
        && (liveEdit.patchIndex || 0) === (patchIndex || 0) && driftNow()
      ),
      // A Program Change while live is ambiguous — see checkBufferAfterRecall.
      // Returns true when the app caused it, so the caller ignores its echo.
      onProgramChange(ev) {
        if (claimOurRecall(ev.program)) return true;
        if (liveEdit && !auditionInFlight) checkBufferAfterRecall(ev);
        return false;
      },
    };
  }

  global.SevenAudition = { create };
})(window);
