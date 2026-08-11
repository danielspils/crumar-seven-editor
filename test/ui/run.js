'use strict';

// UI scenario runner: launches the real app once per scenario, drives it in
// the renderer, and fails the build on any unmet expectation.
//
// These run against the REAL instrument when one is attached. Scenarios that
// need it declare `needsDevice`, and are skipped (not failed) without one, so
// this is still useful on a machine with no Seven — which is every machine
// but Daniel's.

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const dir = path.join(__dirname, 'scenarios');
const only = process.argv[2];

// Scenarios edit patches and save them — that is the point of the save test —
// so they must never run against the real library. Each run gets a scratch
// copy: real content, so the bank rows and sounds are what the app actually
// sees, but nothing the user owns can be changed.
function makeScratchLibrary() {
  const source = process.env.SEVEN_REAL_LIBRARY ||
    path.join(os.homedir(), 'Library', 'Application Support', 'Crumar Seven Editor', 'Library');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'seven-ui-lib-'));
  if (fs.existsSync(source)) {
    for (const f of fs.readdirSync(source)) {
      if (f.endsWith('.json')) fs.copyFileSync(path.join(source, f), path.join(scratch, f));
    }
  }
  return scratch;
}

function runScenario(file, libraryDir) {
  return new Promise((resolve) => {
    const child = spawn('npx', ['electron', '.'], {
      cwd: root,
      env: {
        ...process.env,
        SEVEN_UI_TEST: path.join(dir, file),
        SEVEN_LIBRARY_DIR: libraryDir,
      },
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('exit', () => {
      const line = out.split('\n').find((l) => l.startsWith('[ui-test]'));
      if (!line) return resolve({ file, failures: ['no result — the app crashed or never loaded'], notes: [], out });
      try {
        resolve({ file, ...JSON.parse(line.slice('[ui-test]'.length)) });
      } catch (err) {
        resolve({ file, failures: [`unreadable result: ${err.message}`], notes: [], out });
      }
    });
  });
}

(async () => {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && (!only || f.includes(only))).sort();
  const scratch = makeScratchLibrary();
  console.log(`library: ${scratch} (a copy — the real one is never touched)\n`);
  let failed = 0;
  let skipped = 0;
  for (const file of files) {
    // A fresh copy per scenario, so one cannot leave state for the next.
    const lib = makeScratchLibrary();
    const r = await runScenario(file, lib);
    if (r.skipped) {
      skipped++;
      console.log(`- ${file} — skipped (${r.skipped})`);
      continue;
    }
    for (const n of r.notes || []) console.log(`    ${n}`);
    if ((r.failures || []).length) {
      failed++;
      console.log(`✗ ${file}`);
      for (const f of r.failures) console.log(`    ${f}`);
    } else {
      console.log(`✓ ${file}`);
    }
  }
  console.log(`\n${files.length - failed - skipped} passed, ${failed} failed, ${skipped} skipped`);
  fs.rmSync(scratch, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
})();
