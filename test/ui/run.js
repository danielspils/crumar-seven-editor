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
// THE FOLDER THE APP ACTUALLY USES. This read
// "Crumar Seven Editor" — the PRE-1.0 name — long after productName moved
// userData to "This Seven Goes to Eleven". So every scenario ran against a
// snapshot frozen on the day of the rename: 62 files dated 16 August against
// the 65 the app was really using on the 20th (measured 2026-08-20). Nothing
// failed, which is the problem — scenarios that needed content quietly found a
// thinner library and reported "no backup run to open" as if that were the
// library's fault.
//
// The legacy path stays as a FALLBACK, for anyone whose library never moved.
// Both are named so a wrong answer is visible rather than silent, and the
// runner prints which one it used.
const LIBRARY_DIRS = [
  'This Seven Goes to Eleven',   // current — productName since 1.0.0
  'Crumar Seven Editor',         // pre-1.0, kept for an un-migrated machine
];

function realLibrarySource() {
  if (process.env.SEVEN_REAL_LIBRARY) return process.env.SEVEN_REAL_LIBRARY;
  for (const name of LIBRARY_DIRS) {
    const dir = path.join(os.homedir(), 'Library', 'Application Support', name, 'Library');
    if (fs.existsSync(dir)) return dir;
  }
  return null;
}

function makeScratchLibrary() {
  const source = realLibrarySource();
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'seven-ui-lib-'));
  let copied = 0;
  if (source && fs.existsSync(source)) {
    for (const f of fs.readdirSync(source)) {
      if (f.endsWith('.json')) {
        fs.copyFileSync(path.join(source, f), path.join(scratch, f));
        copied += 1;
      }
    }
  }
  return { dir: scratch, source, copied };
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

// Only one app may hold the MIDI port. If the editor is already open, its
// instance answers the device and the suite's does not — scenarios then fail
// for a reason that has nothing to do with the code. Say so instead of
// producing a flaky red.
function appAlreadyRunning() {
  const { execSync } = require('node:child_process');
  try {
    const out = execSync('ps -Ao command', { encoding: 'utf8' });
    return out.split('\n').some(
      (line) => line.includes('crumar-seven-editor') && line.includes('Electron') &&
        !line.includes('SEVEN_UI_TEST') && !line.includes('ps -Ao')
    );
  } catch {
    return false;
  }
}

(async () => {
  if (appAlreadyRunning()) {
    console.error(
      'The editor is already open, and it holds the instrument.\n' +
      'Quit it first (or run: pkill -f "crumar-seven-editor"), then run this again.'
    );
    process.exit(2);
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && (!only || f.includes(only))).sort();
  // SAID ONCE, AND ABOUT THE SOURCE. This used to make an extra scratch copy
  // purely to print its path — a directory no scenario ever ran in, since each
  // gets its own below. The useful fact is which REAL library was read: an
  // empty scratch is a legitimate state on a machine with no library yet, and
  // indistinguishable from a wrong path unless the runner names it.
  const src = realLibrarySource();
  console.log(src
    ? `source: ${src}`
    : 'source: none found — scenarios needing library content will skip');
  console.log('library: a fresh copy per scenario — the real one is never touched\n');
  let failed = 0;
  let skipped = 0;
  const made = [];   // every scratch copy, so none is left behind in /tmp
  for (const file of files) {
    // A fresh copy per scenario, so one cannot leave state for the next.
    const { dir: lib } = makeScratchLibrary();
    made.push(lib);
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
  // ALL of them. The old cleanup removed the single throwaway copy and left
  // one directory per scenario in /tmp on every run.
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
})();
