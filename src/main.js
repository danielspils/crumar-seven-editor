'use strict';

// Electron main process. No MIDI, no device access — this shell only opens a
// window that renders the fixture library. The renderer never talks to a device;
// data reaches it through preload.js (see there for the swap point).

const { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, screen, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const fs = require('fs');
const path = require('path');
const { LibraryStore, writeAtomic } = require('./library-store');
const { Donations } = require('./donations');
const demoCleanup = require('./demo-cleanup');
const globalsCleanup = require('./globals-cleanup');
const { buildReport, reportFileName } = require('./instrument-report');
const { formatSetlist } = require('./setlist-text');
const { mailSetlist } = require('./mailto');
const { NotesSeen } = require('./notes-seen');
const { parseNotesFeed } = require('./notes-feed');

// Where "Report this instrument" sends someone. The APP's repo — Issues
// enabled, checked 2026-08-15. It pointed at this-seven-goes-to-eleven, which
// is the WEBSITE repo (homepage copy, screenshots, favicons); instrument
// reports would have landed among favicon commits.
const ISSUE_URL = 'https://github.com/danielspils/crumar-seven-editor/issues/new';

// ---- Library IPC (the on-disk Library folder; see library-store.js) --------
// Lazy so app.getPath is ready and a broken Library folder can't stop launch.
let store = null;
function getStore() {
  if (!store) {
    const root = path.join(__dirname, '..');
    // SEVEN_LIBRARY_DIR: test-only override (e.g. pointing at an empty dir to
    // exercise the empty state). An EXISTING empty dir is not re-seeded.
    store = new LibraryStore(
      process.env.SEVEN_LIBRARY_DIR || path.join(app.getPath('userData'), 'Library'),
      JSON.parse(fs.readFileSync(path.join(root, 'schema', 'seven-1.37.json'), 'utf8')),
      JSON.parse(fs.readFileSync(path.join(root, 'fixtures', 'sample-library.json'), 'utf8'))
    );
  }
  return store;
}

function registerLibraryIpc() {
  ipcMain.handle('library:list', () => getStore().list());
  ipcMain.handle('library:rename', (_e, { file, patchIndex, newName }) => {
    try {
      return getStore().rename(file, patchIndex, String(newName).trim() || 'Untitled');
    } catch (err) {
      if (err.code === 'NAME_TAKEN') return { ok: false, error: err.message };
      throw err;
    }
  });
  ipcMain.handle('library:duplicate', (_e, { file, patchIndex, name }) => {
    try {
      return getStore().duplicate(file, patchIndex, name);
    } catch (err) {
      if (err.code === 'NAME_TAKEN') return { ok: false, error: err.message };
      throw err;
    }
  });
  ipcMain.handle('library:saveSound', (_e, { file, patchIndex, soundName, sampled }) =>
    getStore().savePatchSound(file, patchIndex || 0, soundName, sampled));
  ipcMain.handle('library:saveParams', (_e, { file, patchIndex, params }) =>
    getStore().savePatchParams(file, patchIndex || 0, params));
  ipcMain.handle('library:trash', (_e, { file }) =>
    shell.trashItem(getStore().absPath(file)));
  ipcMain.handle('library:reveal', () => {
    getStore().ensureSeeded();
    shell.showItemInFolder(getStore().dir);
  });
  ipcMain.handle('library:export', async (e, { file, suggestedName }) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Export patch',
      defaultPath: suggestedName || file,
      filters: [{ name: 'Seven library', extensions: ['sevenlib.json', 'json'] }],
    });
    if (canceled || !filePath) return false;
    fs.copyFileSync(getStore().absPath(file), filePath);
    return true;
  });
  // Native context menu for a library row; resolves with the chosen action
  // (or null when dismissed).
  const popupMenu = (e, template) =>
    new Promise((resolve) => {
      let done = false;
      const pick = (action) => () => { done = true; resolve(action); };
      const menu = Menu.buildFromTemplate(
        template.map((item) => (item.action ? { label: item.label, click: pick(item.action) } : item))
      );
      menu.popup({ window: BrowserWindow.fromWebContents(e.sender) });
      menu.on('menu-will-close', () => setTimeout(() => { if (!done) resolve(null); }, 120));
    });
  ipcMain.handle('library:contextMenu', (e) =>
    popupMenu(e, [
      { label: 'Rename', action: 'rename' },
      { label: 'Duplicate', action: 'duplicate' },
      { type: 'separator' },
      { label: 'Send to Seven…', action: 'send' },
      { type: 'separator' },
      { label: 'Export…', action: 'export' },
      { type: 'separator' },
      { label: 'Delete', action: 'trash' },
    ]));

  // ---- Setlists (all mutations persist immediately in setlists.json) -------
  ipcMain.handle('setlist:create', (_e, { name }) => getStore().createSetlist(name));
  // Opening one counts as using it — the list is ordered by last touched.
  ipcMain.handle('setlist:touch', (_e, { index }) => getStore().touchSetlist(index));
  // Hand-placed order, for both lists. `order` takes the whole displayed
  // sequence; `clearOrder` puts the list back to sorting itself.
  // Generating a patch from an instrument, in two steps so the UI can show
  // what it is about to copy from: what the donors are, then the write.
  ipcMain.handle('library:generateFromSound', (_e, { name, patchName }) => {
    try { return { ok: true, ...getStore().createPatchFromSound(name, { patchName }) }; }
    catch (err) { return { ok: false, error: String(err.message || err) }; }
  });
  // The name a new patch is offered before it is made: the sound's own,
  // numbered if that is taken.
  // Inline validation for the naming prompt: is this name free, and if not,
  // what should the field say. One answer from the store, so the dialog and
  // the write cannot disagree.
  ipcMain.handle('library:nameAvailable', (_e, { name, exceptFile, exceptPatchIndex }) => {
    try {
      // The STORE's own sentence, not a second copy of it here. Two copies of
      // one message drift, and this one now has to name the EXISTING patch —
      // which only the store knows.
      getStore().assertNameFree(name, { exceptFile, exceptPatchIndex });
      return { available: true };
    } catch (err) {
      if (err.code === 'NAME_TAKEN') return { available: false, message: err.message };
      // A library that cannot be read must not block the dialog; the write
      // itself is still guarded by the store.
      console.warn(`[library] name check failed: ${err.message}`);
      return { available: true };
    }
  });

  ipcMain.handle('library:nextPatchName', (_e, { name }) => {
    try { return getStore().nextPatchName(name); }
    catch { return name; }
  });
  ipcMain.handle('library:patchOrder', (_e, { keys }) => getStore().writePatchOrder(keys));
  ipcMain.handle('library:clearPatchOrder', () => getStore().clearPatchOrder());
  // A setlist as plain text, on the clipboard. The player pastes it wherever
  // they already read things on a phone — no file, no save dialog, nothing
  // platform-specific. The renderer resolves the slots to the names its own
  // rows show and sends those; the formatting is src/setlist-text.js, which is
  // pure and tested, and the CLOCK IS READ HERE and passed in, so the
  // formatter has nothing to stub.
  ipcMain.handle('setlist:copyText', (_e, { name, slots, bank }) => {
    const text = formatSetlist({ name, slots, bank }, new Date());
    clipboard.writeText(text);
    return { ok: true, text };
  });
  // The same text, handed to whatever mail client the person already uses,
  // with no recipient — they choose who. SEVEN_NO_MAIL_CLIENT=1 forces the
  // no-client branch, which is otherwise unreachable on a machine that has
  // one: the failure it stands for is somebody else's empty Mail.app, and a
  // branch nobody can reach is a branch nobody has seen.
  ipcMain.handle('setlist:email', async (_e, { name, slots, bank }) => {
    // ONE formatter. The mail body is the clipboard text, character for
    // character, so BANK N arrives here for free and the two can never
    // disagree about what a setlist looks like.
    const text = formatSetlist({ name, slots, bank }, new Date());
    return mailSetlist({
      subject: name,
      body: text,
      openExternal: (url) => (process.env.SEVEN_NO_MAIL_CLIENT
        ? Promise.reject(new Error('no application knows how to open mailto: (SEVEN_NO_MAIL_CLIENT)'))
        : shell.openExternal(url)),
      writeClipboard: (t) => clipboard.writeText(t),
    });
  });
  ipcMain.handle('setlist:order', (_e, { indexes }) => getStore().writeSetlistOrder(indexes));
  ipcMain.handle('setlist:clearOrder', () => getStore().clearSetlistOrder());
  ipcMain.handle('setlist:rename', (_e, { index, name }) => getStore().renameSetlist(index, name));
  ipcMain.handle('setlist:delete', (_e, { index }) => getStore().deleteSetlist(index));
  ipcMain.handle('setlist:assign', (_e, { index, slot, file }) => getStore().assignSlot(index, slot, file));
  ipcMain.handle('setlist:clear', (_e, { index, slot }) => getStore().clearSlot(index, slot));
  ipcMain.handle('setlist:move', (_e, { index, from, to }) => getStore().moveSlot(index, from, to));
  ipcMain.handle('setlist:contextMenu', (e) =>
    popupMenu(e, [
      { label: 'Rename', action: 'rename' },
      { type: 'separator' },
      { label: 'Delete…', action: 'delete' },
    ]));
  // Deleting a setlist never deletes patches — the dialog says so.
  // A backup run writes "Bank 2 setlist (2026-08-09)" — a dated RECORD of what
  // the instrument held that day, not a set you built. Deleting one is a
  // different act from deleting a gig setlist and the dialog says so: the
  // record is the only thing that remembers that day's arrangement as a whole.
  const BACKUP_SETLIST = /^Bank ([1-4]) setlist \((\d{4})-(\d{2})-(\d{2})(, partial)?\)$/;

  // The WORDING is composed here — it needs the backup-record pattern above —
  // and the dialog is drawn in the renderer as one of the app's own modals.
  // It was dialog.showMessageBox, an OS panel with its own typeface, button
  // order and warning triangle, in an app that has its own language
  // (Daniel, 2026-08-13).
  ipcMain.handle('setlist:deletePrompt', async (_e, { name }) => {
    const m = BACKUP_SETLIST.exec(String(name));
    const when = m
      ? new Date(`${m[2]}-${m[3]}-${m[4]}T12:00:00Z`).toLocaleDateString([], {
          day: 'numeric', month: 'long', year: 'numeric',
        })
      : null;
    return {
      title: m
        ? `Delete the backup record of Bank ${m[1]} from ${when}?`
        : `Delete the setlist \u201C${name}\u201D?`,
      body: m
        ? `This is what a backup run saw in Bank ${m[1]} on that date. Deleting it ` +
          'removes the record of that day\u2019s arrangement — the eight patches ' +
          'themselves stay in your library, and each one still records the slot it ' +
          'came from.\n\nThis cannot be undone.'
        : 'Only the setlist is deleted — the patches it references stay in the library.',
      confirmLabel: m ? 'Delete backup record' : 'Delete setlist',
    };
  });
}

// ---- MIDI IPC (src/seven-midi.js; all SysEx stays in the main process) -----
// Lazy like the library store: the native backend loads on first use, so a
// missing/broken @julusian/midi can't stop the app from launching.
let midiLayer = null;
function getMidi() {
  if (!midiLayer) {
    const { SevenMidi } = require('./seven-midi');
    midiLayer = new SevenMidi({
      userDataDir: app.getPath('userData'),
      // What connect() compares the instrument's own parameter table against.
      // Without it there is no comparison and nothing is gated.
      schemaParams: getSchema().parameters,
      schemaFirmware: getSchema().firmware || null,
    });
  }
  return midiLayer;
}

function registerMidiIpc() {
  ipcMain.handle('midi:connect', () => getMidi().connect());
  ipcMain.handle('midi:disconnect', () => getMidi().disconnect());
  ipcMain.handle('midi:status', () => getMidi().status());
  // "Is one plugged in?" — port names only, nothing opened or sent, so the
  // renderer can ask on a timer while disconnected.
  // The report a stranger's Seven sends home. Builds the file, saves where the
  // owner chooses, reveals it, then opens the issue page — deliberately NOT
  // prefilled: a 110-parameter table does not fit in a URL, and a truncated
  // table is worse than an attached one.
  ipcMain.handle('midi:reportInstrument', async (e) => {
    const midi = getMidi();
    if (midi.state !== 'connected') return { ok: false, error: 'The Seven is not connected.' };
    const created = new Date().toISOString();
    const report = buildReport({
      appVersion: app.getVersion(),
      schemaName: 'seven-1.37.json',
      appParamCount: getSchema().parameters.length,
      appFirmware: getSchema().firmware || null,
      firmware: midi.firmware,
      soundTable: midi.soundTable,
      paramTable: midi.paramTable,
      storage: midi.storage,
      verdict: midi.paramVerdict,
      created,
    });
    const win = BrowserWindow.fromWebContents(e.sender);
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Save instrument report',
      defaultPath: path.join(app.getPath('desktop'), reportFileName(midi.firmware, created)),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (canceled || !filePath) return { ok: false, cancelled: true };
    fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`);
    shell.showItemInFolder(filePath);
    await shell.openExternal(ISSUE_URL);
    return { ok: true, path: filePath };
  });
  // External links, allowlisted. The renderer hands a URL, not a command, and
  // only these two hosts are openable — a link is a way out of the app, and an
  // app that opens any URL the page asks for is a link-following machine.
  ipcMain.handle('shell:open', (_e, { url }) => {
    const ok = /^https:\/\/(www\.)?(crumar\.it|github\.com)\//.test(String(url || ''));
    if (!ok) return false;
    shell.openExternal(String(url));
    return true;
  });
  // SEVEN_UI_SIGNAL — development only. A UI test drives the app, but some of
  // this app's tests need a HUMAN in the loop: a three-second hold on the
  // panel, a listening judgement, a preset that only a person can press. The
  // script polls this file and the operator writes it when the human step is
  // done. Nothing reads it unless the env var is set.
  ipcMain.handle('dev:signal', () => {
    const p = process.env.SEVEN_UI_SIGNAL;
    if (!p) return null;
    try { return fs.readFileSync(p, 'utf8').trim(); } catch { return ''; }
  });
  ipcMain.handle('midi:present', () => {
    try {
      return getMidi().portPresent();
    } catch {
      return false;
    }
  });
}

// ---- Backup run (src/backup-runner.js) -------------------------------------
let backupRunner = null;
function getBackupRunner() {
  if (!backupRunner) {
    const { BackupRunner } = require('./backup-runner');
    const root = path.join(__dirname, '..');
    backupRunner = new BackupRunner({
      midi: getMidi(),
      store: getStore(),
      schema: JSON.parse(fs.readFileSync(path.join(root, 'schema', 'seven-1.37.json'), 'utf8')),
    });
    backupRunner.on('event', (ev) => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('midi-event', ev);
      }
    });
  }
  return backupRunner;
}

let schemaCache = null;
function getSchema() {
  if (!schemaCache) {
    const root = path.join(__dirname, '..');
    schemaCache = JSON.parse(
      fs.readFileSync(path.join(root, 'schema', 'seven-1.37.json'), 'utf8')
    );
  }
  return schemaCache;
}

let patchSender = null;
function getPatchSender() {
  if (!patchSender) {
    const { PatchSender } = require('./patch-sender');
    patchSender = new PatchSender({ midi: getMidi(), schema: getSchema() });
  }
  return patchSender;
}

// Audition: put a library patch in the edit buffer so it can be HEARD. It
// stores nothing — the panel hold is the only way to keep it, and the UI says
// so. The patch is read from disk here rather than accepted from the renderer:
// the file on disk is the single source of truth for what gets sent.
function registerAuditionIpc() {
  ipcMain.handle('audition:send', async (_e, { file, patchIndex }) => {
    const midi = getMidi();
    if (midi.state !== 'connected') return { ok: false, error: 'The Seven is not connected.' };
    try {
      const parsed = getStore().readFile(file);
      if (!parsed.library) throw new Error('That patch file is not readable.');
      const patch = parsed.library.patches[patchIndex || 0];
      if (!patch) throw new Error('No such patch in that file.');
      const result = await getPatchSender().send(patch);
      return { ok: true, name: patch.name, ...result };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  });

  // A sound with no parameters — the picker's "sound only" case.
  ipcMain.handle('audition:sound', async (_e, { name }) => {
    const midi = getMidi();
    if (midi.state !== 'connected') return { ok: false, error: 'The Seven is not connected.' };
    try {
      const result = await getPatchSender().send({ sound: { name }, params: {} });
      return { ok: true, name, ...result };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  });
}

// Live editing: one parameter, one write, to the EDIT BUFFER. The renderer
// sends a schema KEY, never an id — ids are firmware-specific and the key is
// the stable identity (docs/FORMAT.md). The device echoes the value it took,
// which is what we return: the UI shows what the instrument did, not what we
// asked for. Still stores nothing; the panel hold remains the only way to keep
// an edit on the instrument, and "Save to library" keeps it on the computer.
function registerEditIpc() {
  ipcMain.handle('edit:param', async (_e, { key, value }) => {
    const midi = getMidi();
    if (midi.state !== 'connected') return { ok: false, error: 'The Seven is not connected.' };
    const spec = getSchema().parameters.find((p) => p.key === key);
    if (!spec) return { ok: false, error: `Unknown parameter “${key}”.` };
    const wanted = Math.max(0, Math.min(spec.max, Number(value)));
    try {
      const r = await midi.setParamValue(spec.id, wanted);
      return { ok: true, key, value: r.value, requested: wanted };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  });

  // Read one parameter back. Used when the panel announces a change by CC:
  // the CC says WHICH parameter moved, this says what it now is.
  ipcMain.handle('edit:read', async (_e, { key }) => {
    const midi = getMidi();
    if (midi.state !== 'connected') return { ok: false };
    const spec = getSchema().parameters.find((p) => p.key === key);
    if (!spec) return { ok: false };
    try {
      const r = await midi.readParamValue(spec.id);
      return { ok: true, key, value: r.value };
    } catch {
      return { ok: false };
    }
  });

  // The CC number -> parameter key map, straight from the schema (every cc
  // there came off the device; none carry ccUnverified). -1 means the
  // parameter has no CC.
  ipcMain.handle('edit:ccMap', () => {
    const map = {};
    for (const p of getSchema().parameters) if (p.cc >= 0) map[p.cc] = p.key;
    return map;
  });

  // The instrument's own global options. Read is the whole array; the write
  // is refused by the MIDI layer for any index whose meaning has not been
  // pinned against the device (see PINNED_GLOBALS there).
  ipcMain.handle('midi:globals', async () => {
    const midi = getMidi();
    if (midi.state !== 'connected') return { ok: false };
    const { PINNED_GLOBALS, GLB_FIELDS } = require('./seven-midi');
    const g = midi.globals || await midi.readGlobals();
    // glb and tun only — the reply also carries wfp, which the parse layer has
    // already replaced and which must never travel further than this process.
    //
    // The field table travels WITH the values so the renderer never keeps its
    // own copy of what a global means. One table, beside the guard that
    // enforces it: a label the UI can show is exactly a value the wire will
    // accept, and neither can drift from the other.
    return {
      ok: true, tun: g.tun, glb: g.glb.slice(), writable: [...PINNED_GLOBALS],
      fields: GLB_FIELDS.map((f) => ({
        name: f.name, max: f.max, labels: { ...f.labels }, complete: f.complete,
      })),
    };
  });

  ipcMain.handle('midi:setGlobal', async (_e, { index, value }) => {
    try {
      return { ok: true, ...(await getMidi().setGlobalOption(index, value)) };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  });

  // Recall a preset ON THE INSTRUMENT. The bank region mirrors hardware, so
  // clicking a slot there should move the hardware — the library region never
  // does this, because a file is not a slot.
  ipcMain.handle('midi:recall', async (_e, { bank, preset }) => {
    const midi = getMidi();
    if (midi.state !== 'connected') return { ok: false };
    try {
      midi.sendProgramChange(bank * 8 + preset); // 0-based global slot
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  });
}

let transferRunner = null;
function getTransferRunner() {
  if (!transferRunner) {
    const { TransferRunner } = require('./transfer-runner');
    transferRunner = new TransferRunner({
      midi: getMidi(),
      store: getStore(),
      sender: getPatchSender(),
    });
    transferRunner.on('event', (ev) => {
      for (const win of BrowserWindow.getAllWindows()) win.webContents.send('midi-event', ev);
    });
  }
  return transferRunner;
}

// Transfer: a setlist onto a bank, one preset at a time. Every rule that keeps
// this safe lives in the runner (Bank 1 blocked, pre-flight before any write,
// no timers), so these handlers stay thin — they must not be able to route
// around it.
function registerTransferIpc() {
  // Bank picked, nothing decided yet: put the instrument on that bank so the
  // "replace this?" question is about something the player can hear.
  ipcMain.handle('transfer:selectBank', (_e, { bank }) => getTransferRunner().selectBank(bank));
  ipcMain.handle('transfer:releaseBank', () => getTransferRunner().releaseBank());

  ipcMain.handle('transfer:preflight', (_e, { setlistIndex, bank }) =>
    getTransferRunner().preflight(setlistIndex, bank));

  // The confirmation this needs is the app's own modal now — an OS alert says
  // "the computer needs something from you", when what this moment says is
  // "here is what is about to happen to your instrument". `confirmed` is not a
  // formality: without it this refuses, so a caller that skips the question has
  // to say so in its own source rather than merely omit it.
  ipcMain.handle('transfer:start', async (_e, { setlistIndex, bank, confirmed }) => {
    const runner = getTransferRunner();
    const plan = runner.preflight(setlistIndex, bank);
    if (!plan.ok) return plan;
    if (confirmed !== true) return { ok: false, cancelled: true };
    return runner.start(setlistIndex, bank);
  });

  // One preset, from the bank region. No confirm dialog here: the user picked
  // a sound for a specific slot they were already looking at, and the walk
  // itself is the confirmation — nothing is stored until they hold the button.
  ipcMain.handle('transfer:startSlot', (_e, { bank, preset, ref }) =>
    getTransferRunner().startSlot(bank, preset, ref));

  ipcMain.handle('transfer:next', () => getTransferRunner().nextSlot());
  ipcMain.handle('transfer:confirm', () => getTransferRunner().confirmSlot());
  ipcMain.handle('transfer:cancel', () => getTransferRunner().cancel());
}

function registerBackupIpc() {
  // Confirm EVERY run — no "don't show again". The confirmation states where
  // the instrument will be left before anything is sent.
  //
  // The WORDING is composed here and the dialog is drawn in the renderer, as
  // one of the app's own modals. It used to be dialog.showMessageBox, which is
  // an OS panel: a different typeface, a different button order, and a yellow
  // warning triangle in an app that has its own visual language. Only the
  // TEXT needs main-process knowledge — whether the panel has told us which
  // preset it is on — so only the text comes from here.
  ipcMain.handle('backup:plan', async () => {
    const midi = getMidi();
    if (midi.state !== 'connected') return { ok: false };
    // Daniel's copy, 2026-08-13. One thing the previous wording carried is
    // deliberately not here: where the Seven is left afterwards, and the tip
    // about pressing a preset button first so the run can come back to it.
    // Flagged to him; his call.
    return {
      ok: true,
      title: 'Backing up 32 presets',
      bodyHtml:
        '<p class="bk-sum">4 banks x 8 buttons = 32 presets</p>' +
        '<p class="bk-arrow" aria-hidden="true">\u2193</p>' +
        '<p class="bk-sum">computer</p>' +
        '<p class="bk-time">It takes about 60 seconds.</p>' +
        '<p class="bk-time">Any unsaved edits will be lost.</p>',
      confirmLabel: 'Back Up',
    };
  });

  // Starting is separate from confirming, and stays gated on the connection.
  ipcMain.handle('backup:start', async () => {
    const midi = getMidi();
    if (midi.state !== 'connected') return { started: false };
    const runner = getBackupRunner();
    runner.run().catch((err) => {
      for (const w of BrowserWindow.getAllWindows()) {
        w.webContents.send('midi-event', { type: 'backup-done', ok: false, error: err.message });
      }
    });
    return { started: true };
  });
  ipcMain.handle('backup:cancel', () => { getBackupRunner().cancel(); });
}

// ---- Notes pointer (thissevengoestoeleven.com) ----------------------------
// The only network call the app makes, and the renderer can trigger it but
// never aim it: the URL is fixed here. It returns the newest Notes entry;
// the renderer compares it against what the user has already seen and shows
// a one-line strip. Any failure returns {ok:false} and nothing is shown.
const NOTES_FEED_URL = 'https://thissevengoestoeleven.com/feed.xml';
const NOTES_SITE = 'https://thissevengoestoeleven.com/';

// The ONE address, and the only thing this app ever does about money: open
// Ko-fi in the browser. No in-app payment handling of any kind, no embedded
// view, no card fields (docs/DONATIONS.md).
const KOFI_URL = 'https://ko-fi.com/danielspils';
let donations = null;

let notesSeen = null;
function getNotesSeen() {
  if (!notesSeen) {
    notesSeen = new NotesSeen(app.getPath('userData'));
    // SEVEN_RESET_NOTES: development only, and permanent, for the same reason
    // SEVEN_RESET_DONATIONS is — this state is one-directional, so without it
    // the strip can be seen exactly once per published post and no change to
    // it could ever be verified.
    if (process.env.SEVEN_RESET_NOTES) {
      notesSeen.reset();
      console.log('[notes] seen-state reset (SEVEN_RESET_NOTES)');
    }
  }
  return notesSeen;
}

function getDonations() {
  if (!donations) {
    donations = new Donations(app.getPath('userData'));
    // SEVEN_RESET_DONATIONS: development only, and permanent. Without it the
    // second showing is seven days away and "I already donated" is a dead end,
    // so any change to this copy or these triggers would be unverifiable.
    if (process.env.SEVEN_RESET_DONATIONS) {
      donations.reset();
      console.log('[donations] state reset (SEVEN_RESET_DONATIONS)');
    }
  }
  return donations;
}

function registerDonationIpc() {
  // Which showing this trigger earns, or 0. The renderer asks only after an
  // operation has COMPLETED and its summary has been dismissed — a cancelled
  // or failed run never gets here.
  ipcMain.handle('donations:due', () => getDonations().dueShowing());
  ipcMain.handle('donations:shown', () => { getDonations().recordShown(); });
  ipcMain.handle('donations:answer', (_e, answer) => {
    getDonations().recordAnswer(String(answer || ''));
    if (answer === 'donate') shell.openExternal(KOFI_URL);
  });
  // The Help menu's way in. It opens the same page and touches no state:
  // asking for it is not the app asking, so it can never count as a showing.
  ipcMain.handle('donations:open', () => { shell.openExternal(KOFI_URL); });
}

function registerNotesIpc() {
  // Read once and cleared: the notice is a single sentence after an update,
  // not a state the app keeps returning to.
  ipcMain.handle('demo-cleanup:notice', () => {
    const notice = demoCleanupNotice;
    demoCleanupNotice = null;
    return notice;
  });

  // EVERY WAY THIS CAN DECLINE NOW SAYS WHICH ONE IT WAS.
  //
  // The old version returned a bare { ok: false } from seven different paths,
  // and the strip's absence is also its normal state — so a feed that had
  // 404'd, a shape that had changed, and "no new post" were one observable.
  // The renderer half was missing entirely for ten days and nothing could have
  // revealed it (Daniel, 2026-08-20). The log line is for the maintainer, in
  // the terminal; users are never told the blog was unreachable.
  const noStrip = (reason) => {
    console.warn(`[notes] no strip: ${reason}`);
    return { ok: false, reason };
  };

  ipcMain.handle('notes:latest', async () => {
    const debug = !!process.env.SEVEN_NOTES_DEBUG;
    let res;
    try {
      res = await fetch(NOTES_FEED_URL, { signal: AbortSignal.timeout(6000) });
    } catch (err) {
      // Offline, DNS, TLS, or the 6s timeout — all arrive here.
      return noStrip(`feed unreachable (${(err && err.name) || 'error'}: ${(err && err.message) || err})`);
    }
    if (!res.ok) return noStrip(`feed returned HTTP ${res.status}`);

    let xml;
    try {
      xml = await res.text();
    } catch (err) {
      return noStrip(`feed body unreadable (${(err && err.message) || err})`);
    }

    // The parse lives in src/notes-feed.js so `npm test` can reach every one
    // of its refusals — the UI scenario runs against the LIVE feed and cannot
    // produce a title-less entry.
    const parsed = parseNotesFeed(xml, NOTES_SITE);
    if (!parsed.ok) return noStrip(parsed.reason);
    const { title, url, published } = parsed;

    // SEVEN_NOTES_DEBUG shows the strip whatever has been dismissed, so the
    // feature can be seen more than once per published post.
    const seen = debug ? false : getNotesSeen().hasSeen(url);
    if (debug) console.log(`[notes] ${JSON.stringify(title)} → ${url} (seen check bypassed)`);
    else if (seen) console.log(`[notes] newest post already dismissed: ${url}`);

    return { ok: true, title, url, published, seen };
  });

  // Dismissed, or followed — both count as having been told.
  ipcMain.handle('notes:dismiss', (_e, url) => {
    const wrote = getNotesSeen().markSeen(url);
    if (!wrote) console.warn(`[notes] could not record dismissal of ${url}`);
    return { ok: wrote };
  });
  // Opening is gated on the same prefix — a renderer bug can't launch
  // arbitrary URLs.
  ipcMain.handle('notes:open', (_e, url) => {
    if (typeof url === 'string' && url.startsWith(NOTES_SITE)) shell.openExternal(url);
  });
}

// Decoded events (status, current-sound, program-change, sound-name) fan out
// to every open window. No frame bytes cross this boundary.
function forwardMidiEvents() {
  getMidi().on('event', (ev) => {
    // The store answers "does this instrument have that sound?" for every row
    // in the library, and it has no MIDI handle of its own — so the table is
    // pushed in here, and cleared the moment the instrument goes away. A stale
    // table would describe an instrument that is no longer attached.
    if (ev.type === 'status') {
      try {
        const live = ev.state === 'connected';
        getStore().setDeviceSounds(live ? getMidi().soundTable : null);
        getStore().setDeviceFirmware(live ? getMidi().firmware : null);
      } catch { /* a broken Library folder must not break the connection */ }
    }
    for (const win of BrowserWindow.getAllWindows()) {
      // A window can be torn down between the device sending and us
      // forwarding — the instrument keeps talking while the app closes. The
      // send then throws from inside a MIDI callback, where there is no
      // caller to catch it.
      if (win.isDestroyed() || win.webContents.isDestroyed()) continue;
      win.webContents.send('midi-event', ev);
    }
  });
}

// View menu: display-only toggles routed to the renderer. Expand/collapse and
// raw-value visibility are view state — never written to patch data.
function buildMenu(win) {
  const send = (payload) => win.webContents.send('view-command', payload);
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        {
          label: 'Show raw values',
          type: 'checkbox',
          checked: false,
          click: (item) => send({ type: 'showRaw', value: item.checked }),
        },
        { type: 'separator' },
        {
          label: 'Appearance',
          submenu: [
            { label: 'Dark', click: () => send({ type: 'theme', value: 'dark' }) },
            { label: 'Light', click: () => send({ type: 'theme', value: 'light' }) },
          ],
        },
        { type: 'separator' },
        // Captures the live window — whatever state it is in — at native
        // resolution. Used for release and website screenshots; the OS
        // screenshot tools need screen-recording permission, this doesn't.
        {
          label: 'Capture Window…',
          accelerator: 'Shift+CmdOrCtrl+S',
          click: async () => {
            const image = await win.webContents.capturePage();
            const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const file = path.join(app.getPath('desktop'), `crumar-seven-${stamp}.png`);
            fs.writeFileSync(file, image.toPNG());
            console.log(`captured ${file}`);
          },
        },
        { type: 'separator' },
        { label: 'Expand all sections', click: () => send({ type: 'expandAll' }) },
        { label: 'Collapse all sections', click: () => send({ type: 'collapseAll' }) },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        // The only update path that reports anything. Everything automatic is
        // silent, including its failures.
        { label: 'Check for Updates…', click: () => checkForUpdates({ manual: true }) },
        { type: 'separator' },
        // Always available, so anyone who changes their mind can find it.
        // Never counts as a showing (docs/DONATIONS.md).
        { label: 'Support this app', click: () => shell.openExternal(KOFI_URL) },
        { type: 'separator' },
        {
          label: 'Report an Issue',
          click: () => shell.openExternal(
            'https://github.com/danielspils/crumar-seven-editor/issues/new'
          ),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  // Fit the primary display: never open larger than the work area, and never
  // let the minimum width exceed the screen itself.
  const work = screen.getPrimaryDisplay().workAreaSize;
  const win = new BrowserWindow({
    useContentSize: true,
    width: Math.min(1440, work.width),
    height: Math.min(900, work.height),
    minWidth: Math.min(1280, work.width),
    backgroundColor: '#141416',
    title: 'Crumar Seven Editor',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload uses fs to read the fixture/schema/svg
    },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  buildMenu(win);

  // UI scenario runner (test/ui). Loads the harness, runs one scenario against
  // the real app, prints a single machine-readable line and exits. Kept beside
  // the screenshot hook because it is the same idea grown up: drive the actual
  // interface rather than reason about what it probably does.
  if (process.env.SEVEN_UI_TEST) {
    win.webContents.once('did-finish-load', async () => {
      const report = (payload) => {
        console.log(`[ui-test]${JSON.stringify(payload)}`);
        app.exit(0);
      };
      try {
        const root = path.join(__dirname, '..');
        // executeJavaScript resolves with the script's LAST expression, and it
        // has to survive structured cloning. The harness ends by building an
        // object full of functions, so end on a primitive instead.
        await win.webContents.executeJavaScript(
          `${fs.readFileSync(path.join(root, 'test', 'ui', 'harness.js'), 'utf8')}\n;true;`
        );
        const outcome = await win.webContents.executeJavaScript(
          `Promise.resolve(${fs.readFileSync(process.env.SEVEN_UI_TEST, 'utf8')})` +
            '.then((r) => (r && r.skipped ? { skipped: String(r.skipped) } : null))'
        );
        if (outcome && outcome.skipped) return report(outcome);
        report(await win.webContents.executeJavaScript('window.ui.result()'));
      } catch (err) {
        report({ failures: [`scenario threw: ${err && err.message}`], notes: [] });
      }
    });
    return;
  }

  // Dev tooling: SEVEN_SHOT=<path> captures the window once it has settled and
  // exits. Used for release/website screenshots — the app renders itself at
  // native resolution, which the OS screenshot tools can't do without
  // screen-recording permission.
  if (process.env.SEVEN_SHOT) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        // SEVEN_SHOT_JS runs in the page first — lets a capture show a state
        // that normally takes clicks to reach.
        if (process.env.SEVEN_SHOT_JS) {
          try {
            const result = await win.webContents.executeJavaScript(process.env.SEVEN_SHOT_JS);
            if (result !== undefined) console.log('[shot-js]', JSON.stringify(result));
            await new Promise((r) => setTimeout(r, 400));
          } catch (err) {
            console.error('SEVEN_SHOT_JS failed:', err.message);
          }
        }
        const image = await win.webContents.capturePage();
        fs.writeFileSync(process.env.SEVEN_SHOT, image.toPNG());
        console.log(`captured ${process.env.SEVEN_SHOT}`);
        app.quit();
      }, Number(process.env.SEVEN_SHOT_DELAY || 1500));
    });
  }
}

// ── Auto-update (electron-updater + GitHub Releases) ────────────────────────
// Silent on launch: check, download in the background, and say one thing when
// there is something to say. Declining is not deferral — autoInstallOnAppQuit
// means the update lands the next time the app closes, without asking again.
//
// Background failures stay silent. Someone on a festival stage with no wifi
// does not need a dialog about GitHub; the only path that ever reports an
// error is the menu item, where a person just asked.
//
// The release layout this depends on: ONE release per version carrying BOTH
// platforms' assets. JP Patches published Mac and Windows as separate
// releases, so the Windows updater looked for latest.yml on a release that
// only had Mac assets and 404'd silently for months. The workflow in
// .github/workflows/release.yml enforces the single release; this end just
// assumes it.
let manualUpdateCheck = false;

function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-not-available', () => {
    if (!manualUpdateCheck) return;
    manualUpdateCheck = false;
    dialog.showMessageBox({
      type: 'info',
      message: 'You’re up to date',
      detail: `This Seven Goes to Eleven ${app.getVersion()} is the latest version.`,
      buttons: ['OK'],
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    manualUpdateCheck = false;
    dialog.showMessageBox({
      type: 'info',
      message: 'Update ready to install',
      detail: `Version ${(info && info.version) || ''} has been downloaded. `
        + 'Restart now to finish updating, or it will be installed the next '
        + 'time you quit.',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
  });

  autoUpdater.on('error', (err) => {
    if (!manualUpdateCheck) return;
    manualUpdateCheck = false;
    dialog.showMessageBox({
      type: 'error',
      message: 'Update check failed',
      detail: String((err && err.message) || err),
      buttons: ['OK'],
    });
  });
}

function checkForUpdates({ manual = false } = {}) {
  if (!app.isPackaged) {
    if (manual) {
      dialog.showMessageBox({
        type: 'info',
        message: 'Updates unavailable in development',
        detail: 'Auto-update only works in the installed app.',
        buttons: ['OK'],
      });
    }
    return;
  }
  manualUpdateCheck = manual;
  autoUpdater.checkForUpdates().catch(() => { /* reported by the error handler */ });
}

// The library folder Electron picks is derived from productName, and 1.0
// renames the app from "Crumar Seven Editor" to what it has been called
// everywhere else — which moves that folder. Bring an existing library
// across, ONCE, and only by copying: if any of this is wrong, the original is
// still sitting where it was. Guarded, because failing to find an old library
// must never stop the app opening.
function migrateLegacyLibrary() {
  if (process.env.SEVEN_LIBRARY_DIR) return;
  try {
    const dest = path.join(app.getPath('userData'), 'Library');
    if (fs.existsSync(dest)) return;
    const legacy = path.join(
      path.dirname(app.getPath('userData')), 'Crumar Seven Editor', 'Library'
    );
    if (!fs.existsSync(legacy)) return;
    fs.cpSync(legacy, dest, { recursive: true });
    console.log(`[library] carried over from ${legacy}`);
  } catch (err) {
    console.warn(`[library] could not carry over the old folder: ${err.message}`);
  }
}

// What the cleanup did, for the renderer to say once. Held in memory: if the
// app closes before it is read, the marker on disk still stops the cleanup
// running again, and a notice nobody saw is not worth a second file.
let demoCleanupNotice = null;

// Removes the demo patches 1.0 shipped by mistake. Runs once per install,
// before any window exists, so the library is already correct when it renders.
// Failure here must never stop the app opening — a cleanup that cannot run is
// a library left exactly as it was.
async function runDemoCleanup() {
  try {
    const result = await demoCleanup.run({
      store: getStore(),
      fixture: JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'fixtures', 'sample-library.json'), 'utf8')),
      userDataDir: app.getPath('userData'),
      trash: (abs) => shell.trashItem(abs),
    });
    if (result.ran && result.removed > 0) demoCleanupNotice = result;
    if (result.ran) {
      console.log(`[demo-cleanup] removed ${result.removed}, kept ${result.keptEdited} edited, ` +
        `${result.keptInSetlist} in setlists`);
    }
  } catch (err) {
    console.warn(`[demo-cleanup] skipped: ${err.message}`);
  }
}

// Redacts the 1.0 leak out of globals snapshots already on disk. Quiet on
// purpose — a console line, no dialog: it only affects someone whose Wi-Fi
// password contains a semicolon, and announcing it would alarm everyone else
// for something that did not happen to them (Daniel, 2026-08-17).
function runGlobalsCleanup() {
  try {
    globalsCleanup.run({
      dir: getStore().dir,
      userDataDir: app.getPath('userData'),
      write: writeAtomic,
    });
  } catch (err) {
    console.warn(`[globals-cleanup] skipped: ${err.message}`);
  }
}

app.whenReady().then(async () => {
  migrateLegacyLibrary();
  await runDemoCleanup();
  runGlobalsCleanup();
  setupAutoUpdater();
  checkForUpdates();
  registerLibraryIpc();
  registerMidiIpc();
  registerBackupIpc();
  registerAuditionIpc();
  registerEditIpc();
  registerTransferIpc();
  registerNotesIpc();
  registerDonationIpc();
  forwardMidiEvents();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// If this session changed the Send PC global, put it back before dying —
// disconnect() restores the pending marker (and leaves it on disk for the
// next startup if the device is already gone).
app.on('before-quit', () => {
  if (midiLayer && midiLayer.state === 'connected') {
    midiLayer.disconnect().catch(() => {});
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
