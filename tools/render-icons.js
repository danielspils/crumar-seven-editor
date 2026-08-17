'use strict';

// Renders the icon SVGs to PNGs at every size the packagers need.
//
// Each size is DRAWN at that size rather than downscaled from 1024: a 16px
// tile drawn at 16px keeps its edges, where the same tile shrunk from 1024
// arrives as porridge.
//
// It draws through a canvas rather than capturing a window, for two reasons.
// A captured window comes back at the display's device pixel ratio, so on a
// Retina Mac a 16px window yields a 32px image; and a loop that creates and
// destroys a transparent window per size fails part-way through with
// ERR_FAILED. One window, one canvas, exact pixels, no races.
//
// Usage: npx electron tools/render-icons.js <jobs.json>
// where jobs.json is [{ svg, size, out }, ...] with paths relative to the repo.

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const jobs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

app.disableHardwareAcceleration();

const draw = `(svgText, size) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    // No fill: everything outside the rounded body stays alpha 0, or macOS
    // draws a white square behind the icon.
    ctx.drawImage(img, 0, 0, size, size);
    resolve(canvas.toDataURL('image/png'));
  };
  img.onerror = () => reject(new Error('svg failed to decode'));
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
})`;

app.whenReady().then(async () => {
  // NOT offscreen: an offscreen window never finishes loading here, and the
  // whole run hangs. A plain hidden window decodes and draws exactly the same.
  const win = new BrowserWindow({
    show: false,
    webPreferences: { webSecurity: false },
  });
  await win.loadURL('data:text/html,<body></body>');

  for (const job of jobs) {
    const svg = fs.readFileSync(path.join(ROOT, job.svg), 'utf8');
    const dataUrl = await win.webContents.executeJavaScript(
      `(${draw})(${JSON.stringify(svg)}, ${job.size})`
    );
    fs.writeFileSync(
      path.join(ROOT, job.out),
      Buffer.from(dataUrl.split(',')[1], 'base64')
    );
    console.log(`  ${job.out}  ${job.size}px  ${path.basename(job.svg)}`);
  }

  win.destroy();
  app.quit();
});
