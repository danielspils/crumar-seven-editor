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
    const face = (family, rel) => {
      const b64 = fs.readFileSync(path.join(root, rel)).toString('base64');
      return (
        `@font-face { font-family: '${family}'; ` +
        `src: url(data:font/woff2;base64,${b64}) format('woff2'); ` +
        `font-weight: 100 900; font-display: swap; }`
      );
    };
    return (
      face('Archivo', 'assets/fonts/Archivo-Variable.woff2') +
      '\n' +
      face('Inter', 'assets/fonts/Inter-Variable.woff2')
    );
  },
  // View-menu commands from the main process (Show raw values, Expand/Collapse
  // all). View state only — nothing here touches patch data.
  onViewCommand: (cb) => ipcRenderer.on('view-command', (_e, msg) => cb(msg)),
});
