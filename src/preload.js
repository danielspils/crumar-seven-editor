'use strict';

// The one place that knows where the data comes from. Today it reads the fixture
// files off disk. When real MIDI arrives, THIS is the only file that changes —
// `getLibrary` would return a device-derived library object instead. The renderer
// asks for `sevenAPI.getLibrary()` and never learns the difference.

const { contextBridge } = require('electron');
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
  getPanelSvg: () => readText('assets/seven-panel.svg'),
  // Placeholder logo (7-Eleven riff) — replace before the repo goes public.
  getLogoSvg: () => readText('assets/logo.svg'),
});
