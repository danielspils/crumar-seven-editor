'use strict';

// The one place that knows where the data comes from. Today it reads the fixture
// files off disk. When real MIDI arrives, THIS is the only file that changes —
// `getLibrary` would return a device-derived library object instead. The renderer
// asks for `sevenAPI.getLibrary()` and never learns the difference.

const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const readText = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

contextBridge.exposeInMainWorld('sevenAPI', {
  // The single library object all rendering reads from.
  getLibrary: () => readJson('fixtures/sample-library.json'),
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
    export: (file, suggestedName) => ipcRenderer.invoke('library:export', { file, suggestedName }),
    reveal: () => ipcRenderer.invoke('library:reveal'),
    contextMenu: () => ipcRenderer.invoke('library:contextMenu'),
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
