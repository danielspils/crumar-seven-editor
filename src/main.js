'use strict';

// Electron main process. No MIDI, no device access — this shell only opens a
// window that renders the fixture library. The renderer never talks to a device;
// data reaches it through preload.js (see there for the swap point).

const { app, BrowserWindow, Menu, dialog, ipcMain, screen, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { LibraryStore } = require('./library-store');

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
  ipcMain.handle('library:rename', (_e, { file, patchIndex, newName }) =>
    getStore().rename(file, patchIndex, String(newName).trim() || 'Untitled'));
  ipcMain.handle('library:duplicate', (_e, { file, patchIndex }) =>
    getStore().duplicate(file, patchIndex));
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
      { label: 'Export…', action: 'export' },
      { type: 'separator' },
      { label: 'Delete', action: 'trash' },
    ]));

  // ---- Setlists (all mutations persist immediately in setlists.json) -------
  ipcMain.handle('setlist:create', (_e, { name }) => getStore().createSetlist(name));
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

  ipcMain.handle('setlist:confirmDelete', async (e, { name }) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const m = BACKUP_SETLIST.exec(String(name));
    const when = m
      ? new Date(`${m[2]}-${m[3]}-${m[4]}T12:00:00Z`).toLocaleDateString([], {
          day: 'numeric', month: 'long', year: 'numeric',
        })
      : null;
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: [m ? 'Delete Backup Record' : 'Delete Setlist', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      message: m
        ? `Delete the backup record of Bank ${m[1]} from ${when}?`
        : `Delete the setlist “${name}”?`,
      detail: m
        ? `This is what a backup run saw in Bank ${m[1]} on that date. Deleting it ` +
          'removes the record of that day\u2019s arrangement — the eight patches ' +
          'themselves stay in your library, and each one still records the slot it ' +
          'came from.\n\nThis cannot be undone.'
        : 'Only the setlist is deleted — the patches it references stay in the library.',
    });
    return response === 0;
  });
}

// ---- MIDI IPC (src/seven-midi.js; all SysEx stays in the main process) -----
// Lazy like the library store: the native backend loads on first use, so a
// missing/broken @julusian/midi can't stop the app from launching.
let midiLayer = null;
function getMidi() {
  if (!midiLayer) {
    const { SevenMidi } = require('./seven-midi');
    midiLayer = new SevenMidi({ userDataDir: app.getPath('userData') });
  }
  return midiLayer;
}

function registerMidiIpc() {
  ipcMain.handle('midi:connect', () => getMidi().connect());
  ipcMain.handle('midi:disconnect', () => getMidi().disconnect());
  ipcMain.handle('midi:status', () => getMidi().status());
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

let patchSender = null;
function getPatchSender() {
  if (!patchSender) {
    const { PatchSender } = require('./patch-sender');
    const root = path.join(__dirname, '..');
    patchSender = new PatchSender({
      midi: getMidi(),
      schema: JSON.parse(fs.readFileSync(path.join(root, 'schema', 'seven-1.37.json'), 'utf8')),
    });
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

function registerBackupIpc() {
  // Confirm EVERY run — no "don't show again". The dialog states where the
  // instrument will be left before anything is sent.
  ipcMain.handle('backup:start', async (e) => {
    const midi = getMidi();
    if (midi.state !== 'connected') return { started: false };
    const sendPcOn = midi.globals && midi.globals.glb[3] === 1;
    const knowPrior = sendPcOn && midi.lastPanelProgram != null;
    // The Seven has no "which preset are you on?" opcode. The app learns the
    // slot only when the panel BROADCASTS one — which happens on a preset
    // press while connected. Selecting a preset before launching the app is
    // invisible to it, so the run can't come back to it. Say how to fix that
    // here, where the user can still act on it, instead of only stating the
    // outcome afterwards.
    const slot = midi.lastPanelProgram;
    const endState = knowPrior
      ? `When it finishes, the Seven is returned to Bank ${Math.floor(slot / 8) + 1}, ` +
        `Preset ${(slot % 8) + 1} — where it is now.`
      : 'When it finishes, the Seven is left on Bank 4, Preset 8 (the last slot backed up).\n\n' +
        'To come back to the preset you are on instead, press its button on the ' +
        'panel once before you start — that is how the Seven tells the app where it is.';
    const win = BrowserWindow.fromWebContents(e.sender);
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['Back Up', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      message: 'Back up all 32 presets?',
      detail: `This recalls all 32 presets on the Seven. Any unsaved edits on the instrument will be lost.\n\n${endState}`,
    });
    if (response !== 0) return { started: false };
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

function registerNotesIpc() {
  ipcMain.handle('notes:latest', async () => {
    try {
      const res = await fetch(NOTES_FEED_URL, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) return { ok: false };
      const xml = await res.text();
      const entry = (xml.match(/<entry>[\s\S]*?<\/entry>/) || [])[0];
      if (!entry) return { ok: false };
      const title = (entry.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] || '';
      const url = (entry.match(/<link[^>]*href="([^"]+)"/) || [])[1] || '';
      const published = (entry.match(/<published>([^<]+)<\/published>/) || [])[1] || '';
      // Only ever hand back a link to the site itself.
      if (!url.startsWith(NOTES_SITE)) return { ok: false };
      const decode = (t) => t
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
      return { ok: true, title: decode(title).trim(), url, published };
    } catch {
      return { ok: false };
    }
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
    for (const win of BrowserWindow.getAllWindows()) {
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

app.whenReady().then(() => {
  registerLibraryIpc();
  registerMidiIpc();
  registerBackupIpc();
  registerAuditionIpc();
  registerNotesIpc();
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
