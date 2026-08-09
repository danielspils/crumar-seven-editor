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
  ipcMain.handle('setlist:confirmDelete', async (e, { name }) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['Delete Setlist', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      message: `Delete the setlist “${name}”?`,
      detail: 'Only the setlist is deleted — the patches it references stay in the library.',
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
}

app.whenReady().then(() => {
  registerLibraryIpc();
  registerMidiIpc();
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
