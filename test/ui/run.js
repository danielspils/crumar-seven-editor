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
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const dir = path.join(__dirname, 'scenarios');
const only = process.argv[2];

function runScenario(file) {
  return new Promise((resolve) => {
    const child = spawn('npx', ['electron', '.'], {
      cwd: root,
      env: { ...process.env, SEVEN_UI_TEST: path.join(dir, file) },
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
  let failed = 0;
  let skipped = 0;
  for (const file of files) {
    const r = await runScenario(file);
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
  process.exit(failed ? 1 : 0);
})();
