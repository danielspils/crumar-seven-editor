'use strict';

// The UI runner refuses to start while the editor holds the instrument. The
// refusal is correct; its DETECTION matched any `ps` line containing both
// "crumar-seven-editor" and "Electron", which is satisfied by a shell whose
// own arguments mention them. That false refusal cost Daniel three attempts
// at panel-cc-follow on 14 Nov 2026 and sent a session after a wrong
// diagnosis.
//
// These tests feed `isAppRunning` the two cases that matter. They are in the
// AUTOMATIC suite (test/*.test.js), unlike the scenarios, so this one runs
// without anybody remembering to ask.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { isAppRunning, ROOT } = require('./ui/app-running');

const MAIN = path.join(ROOT, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const HELPER = path.join(ROOT,
  'node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper.app/Contents/MacOS/Electron Helper');
const RENDERER = path.join(ROOT,
  'node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper (Renderer).app/Contents/MacOS/Electron Helper (Renderer)');

test('the editor running is detected', () => {
  assert.strictEqual(isAppRunning(`/bin/zsh\n${MAIN}\n${HELPER}\n`), true);
});

test('a shell whose arguments merely mention the app is NOT the app', () => {
  // This is the bug, written as the case that produced it. `ps -Ao comm=`
  // reports the EXECUTABLE, so this is what the old command-line scan saw as
  // an editor and this one must not.
  const ps = [
    '/bin/zsh',
    '/bin/bash',
    '/usr/bin/pkill',
    '/opt/homebrew/bin/node',
    // AND the command-line shape too, which is what the old check actually
    // saw and got wrong. The function is fed `comm=` now, so it should never
    // receive these — but rejecting them is the property that was missing,
    // and a test that only feeds well-behaved input would pass with the old
    // predicate restored. Measured 15 Nov 2026: with nothing running,
    // `ps -Ao command | grep -c "crumar-seven-editor.*Electron"` returned 2.
    `/bin/zsh -c pkill -f "${ROOT}/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"; npm run test:ui`,
    `/opt/homebrew/bin/node ${ROOT}/test/ui/run.js carousel-peeks`,
  ].join('\n');
  assert.strictEqual(isAppRunning(ps), false);
});

test('the detection asks ps for the executable, not the command line', () => {
  // The predicate and the ps invocation are one fix, not two: matching paths
  // against whole command lines would still see a shell's arguments.
  const fs = require('node:fs');
  const src = fs.readFileSync(path.join(__dirname, 'ui', 'app-running.js'), 'utf8');
  // The CALL, not the prose. A first version asserted the string "ps -Ao
  // command" was absent from the file and failed on the comment explaining
  // why it was removed — a test that reads documentation as if it were code.
  assert.match(src, /execSync\('ps -Ao comm='/,
    'should execute `ps -Ao comm=` — the executable path');
});

test('Electron helpers do not count — only the main process holds the port', () => {
  assert.strictEqual(isAppRunning(`${HELPER}\n${RENDERER}\n`), false);
});

test('another Electron app on the machine does not count', () => {
  // Claude's own desktop app is Electron and is typically running while this
  // suite is used. It was excluded before only by accident, because its path
  // happens not to contain the repo's name.
  const other = '/Applications/Claude.app/Contents/MacOS/Claude\n'
    + '/Applications/Some Other.app/Contents/MacOS/Electron';
  assert.strictEqual(isAppRunning(other), false);
});

test('a path that merely starts with the repo name does not count', () => {
  // `${ROOT}-backup/…` shares a prefix with ROOT as a STRING. Matching must
  // be on a path boundary, which is why the separator is appended.
  const sibling = `${ROOT}-backup/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron`;
  assert.strictEqual(isAppRunning(sibling), false);
});

test('empty or unreadable ps output is not a running app', () => {
  assert.strictEqual(isAppRunning(''), false);
  assert.strictEqual(isAppRunning(null), false);
  assert.strictEqual(isAppRunning(undefined), false);
});

test('the runner uses the shared detection rather than its own copy', () => {
  // run.js cannot be required — requiring it runs the whole suite — so this
  // asserts the wiring as text, the same approach css-hazards.test.js uses for
  // main.js. Without it the module could be correct while run.js kept a
  // private, broken copy.
  const fs = require('node:fs');
  const src = fs.readFileSync(path.join(__dirname, 'ui', 'run.js'), 'utf8');
  assert.match(src, /require\('\.\/app-running'\)/,
    'run.js should get appAlreadyRunning from test/ui/app-running.js');
  assert.doesNotMatch(src, /ps -Ao command/,
    'run.js should no longer scan whole command lines for the app');
});
