'use strict';

// Electron main process. No MIDI, no device access — this shell only opens a
// window that renders the fixture library. The renderer never talks to a device;
// data reaches it through preload.js (see there for the swap point).

const { app, BrowserWindow, Menu, screen } = require('electron');
const path = require('path');

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
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
