'use strict';

// The one place that knows where the data comes from. The swap this file was
// built for has happened: the renderer's data is the on-disk library (IPC to
// library-store) and the live device (IPC to seven-midi) — fixtures no longer
// reach the renderer at all (they only seed a first-run demo library in the
// main process).

const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const readText = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

contextBridge.exposeInMainWorld('sevenAPI', {
  // Static reference data (parameter map + panel artwork), not device state.
  getSchema: () => readJson('schema/seven-1.37.json'),
  // The SVG's internal @font-face uses a path relative to assets/ so the file
  // renders standalone; inlined into the DOM it would resolve against src/ and
  // 404 (masking the app-supplied face). Strip it — getFontCss() provides the
  // same family document-wide.
  getPanelSvg: () =>
    readText('assets/seven-panel.svg').replace(/@font-face\s*{[^}]*}\s*/g, ''),
  // Self-hosted fonts as data: URIs — path-independent and fully offline.
  getFontCss: () => {
    const face = (family, rel, { weight = '100 900', style = 'normal' } = {}) => {
      const b64 = fs.readFileSync(path.join(root, rel)).toString('base64');
      return (
        `@font-face { font-family: '${family}'; ` +
        `src: url(data:font/woff2;base64,${b64}) format('woff2'); ` +
        `font-weight: ${weight}; font-style: ${style}; font-display: swap; }`
      );
    };
    return [
      face('Archivo', 'assets/fonts/Archivo-Variable.woff2'),
      face('Archivo Narrow', 'assets/fonts/ArchivoNarrow-Italic-Variable.woff2', {
        weight: '400 700',
        style: 'italic',
      }),
      face('Inter', 'assets/fonts/Inter-Variable.woff2'),
    ].join('\n');
  },
  // View-menu commands from the main process (Show raw values, Expand/Collapse
  // all). View state only — nothing here touches patch data.
  onViewCommand: (cb) => ipcRenderer.on('view-command', (_e, msg) => cb(msg)),
  // On-disk Library folder (library-store.js in the main process). Display
  // entries in, file operations out — the renderer never touches the disk.
  library: {
    list: () => ipcRenderer.invoke('library:list'),
    rename: (file, patchIndex, newName) => ipcRenderer.invoke('library:rename', { file, patchIndex, newName }),
    duplicate: (file, patchIndex) => ipcRenderer.invoke('library:duplicate', { file, patchIndex }),
    trash: (file) => ipcRenderer.invoke('library:trash', { file }),
    saveParams: (file, patchIndex, params) =>
      ipcRenderer.invoke('library:saveParams', { file, patchIndex, params }),
    export: (file, suggestedName) => ipcRenderer.invoke('library:export', { file, suggestedName }),
    reveal: () => ipcRenderer.invoke('library:reveal'),
    contextMenu: () => ipcRenderer.invoke('library:contextMenu'),
  },
  // Real MIDI (src/seven-midi.js in the main process). The renderer speaks
  // only in decoded events and high-level calls — it never learns what SysEx
  // is. connect() rejects with a user-facing message on failure.
  midi: {
    connect: () => ipcRenderer.invoke('midi:connect'),
    disconnect: () => ipcRenderer.invoke('midi:disconnect'),
    status: () => ipcRenderer.invoke('midi:status'),
    onEvent: (cb) => ipcRenderer.on('midi-event', (_e, ev) => cb(ev)),
    backup: () => ipcRenderer.invoke('backup:start'),
    // Audition: load a patch (or a bare sound) into the edit buffer so it can
    // be heard. Stores nothing — keeping it needs a three-second panel hold.
    audition: (file, patchIndex) => ipcRenderer.invoke('audition:send', { file, patchIndex }),
    auditionSound: (name) => ipcRenderer.invoke('audition:sound', { name }),
    // One live parameter write to the edit buffer; resolves to the value the
    // instrument actually took.
    setParam: (key, value) => ipcRenderer.invoke('edit:param', { key, value }),
    readParam: (key) => ipcRenderer.invoke('edit:read', { key }),
    ccMap: () => ipcRenderer.invoke('edit:ccMap'),
    // Recall a slot on the instrument (bank/preset are 0-based).
    recall: (bank, preset) => ipcRenderer.invoke('midi:recall', { bank, preset }),
    cancelBackup: () => ipcRenderer.invoke('backup:cancel'),
  },
  // Newest post on thissevengoestoeleven.com, so the app can point at Notes
  // rather than run a mailing list. Fetch and URL are fixed in the main
  // process; this side can only ask.
  notes: {
    latest: () => ipcRenderer.invoke('notes:latest'),
    open: (url) => ipcRenderer.invoke('notes:open', url),
  },
  // Setlist mutations (setlists.json; every mutation persists immediately).
  setlists: {
    create: (name) => ipcRenderer.invoke('setlist:create', { name }),
    rename: (index, name) => ipcRenderer.invoke('setlist:rename', { index, name }),
    delete: (index) => ipcRenderer.invoke('setlist:delete', { index }),
    assign: (index, slot, file) => ipcRenderer.invoke('setlist:assign', { index, slot, file }),
    clear: (index, slot) => ipcRenderer.invoke('setlist:clear', { index, slot }),
    move: (index, from, to) => ipcRenderer.invoke('setlist:move', { index, from, to }),
    contextMenu: () => ipcRenderer.invoke('setlist:contextMenu'),
    confirmDelete: (name) => ipcRenderer.invoke('setlist:confirmDelete', { name }),
  },
});
