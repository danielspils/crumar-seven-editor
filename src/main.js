'use strict';

// Electron main process. No MIDI, no device access — this shell only opens a
// window that renders the fixture library. The renderer never talks to a device;
// data reaches it through preload.js (see there for the swap point).

const { app, BrowserWindow, screen } = require('electron');
const path = require('path');

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
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
