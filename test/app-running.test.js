'use strict';

// The UI runner refuses to start while the editor holds the instrument. The
// refusal is correct; its DETECTION matched any `ps` line containing both
// "crumar-seven-editor" and "Electron", which is satisfied by a shell whose
// own arguments mention them. That false refusal cost Daniel three attempts
// at hands-on-panel-cc-follow on 14 Nov 2026 and sent a session after a wrong
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
    'run.js should get its detection from test/ui/app-running.js');
  assert.doesNotMatch(src, /ps -Ao command/,
    'run.js should no longer scan whole command lines for the app');
});

// THE REFUSAL MUST NOT PRINT A -f PATTERN (Daniel, 18 Nov 2026).
//
// It said `pkill -f "crumar-seven-editor"`, which matches any process whose
// command line carries the repo name — including a Claude Code session working
// in this repo, whose command line has it inside a permission rule. The
// message was in the runner's own output, so the obvious thing to do with it
// was run it, and running it killed the session.
test('the refusal never tells anyone to pkill -f', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(path.join(__dirname, 'ui', 'run.js'), 'utf8');
  // The comment explaining why is allowed to name the old command; the code
  // that builds the message is not. Only template/quoted output is checked by
  // stripping full-line comments first.
  const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  assert.doesNotMatch(code, /pkill/,
    'run.js should name the pid it found, not a pattern that matches whatever shares the string');
  assert.match(code, /kill \$\{openPids/,
    'the refusal should print `kill <pid>` for the process it detected');
});

// NO PROCESS MATCHER IS ALLOWLISTED (Daniel, 18 Nov 2026).
//
// The rule was `Bash(pkill -f MacOS/Electron)`, which matches every Electron
// app running from a dev checkout — the JUNO-Xtra, JP Patches and Hammond
// M-solo editors as well as this one. An allowlisted command runs without
// anybody being asked, which is exactly the wrong property for one that can
// close three unrelated projects.
//
// There is no narrower pattern available: every segment of this app's
// executable path except the repo directory is shared by every Electron
// checkout, and the repo directory is what must not be matched (see the
// refusal test above). So the rule is a script name, and this guards that.
test('no allowlisted rule matches processes by pattern', () => {
  const fs = require('node:fs');
  const settings = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', '.claude', 'settings.json'), 'utf8')
  );
  const allow = (settings.permissions && settings.permissions.allow) || [];
  assert.ok(allow.length > 0, 'the repo should carry its own permission rules');
  for (const rule of allow) {
    assert.doesNotMatch(rule, /pkill|pgrep|killall/,
      `"${rule}" allowlists a process matcher — use ./scripts/quit-editor.sh, `
      + 'which finds the pid for THIS checkout');
  }
  assert.ok(allow.includes('Bash(./scripts/quit-editor.sh)'),
    'the script that frees the instrument should be allowlisted by name');
});

test('the quit script exists, is executable, and never reaches for kill -9', () => {
  const fs = require('node:fs');
  const p = path.join(__dirname, '..', 'scripts', 'quit-editor.sh');
  const src = fs.readFileSync(p, 'utf8');
  // eslint-disable-next-line no-bitwise
  assert.ok(fs.statSync(p).mode & 0o111, 'scripts/quit-editor.sh should be executable');

  // STATEMENTS, NOT PROSE. The first version of this assertion searched the
  // whole file for /kill\s+-9/ and failed on the script's own comment saying
  // "NEVER kill -9" and on the warning it prints telling a human not to. The
  // check is about what the script DOES, so comment lines and echoed text are
  // removed before looking — otherwise documenting the hazard is what trips
  // the guard against it.
  const statements = src
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .filter((l) => !/^\s*echo\b/.test(l))
    .join('\n');
  assert.doesNotMatch(statements, /\bkill\s+-/,
    'this app writes to hardware — a transfer interrupted mid-walk leaves a '
    + 'preset half-written, so the script must send a plain SIGTERM and never '
    + 'pass a signal flag');
  assert.match(statements, /\bkill\s+"\$p"/,
    'it should kill by pid');
  // It must not solve its own problem with the pattern it replaces.
  assert.doesNotMatch(statements, /pkill|killall/,
    'the script should find pids, not match command lines');
});

const { appPids } = require('./ui/app-running');

test('appPids returns the main process pid and ignores the helpers', () => {
  const ps = [
    '  501 /bin/zsh',
    `60928 ${MAIN}`,
    `60930 ${HELPER}`,
    `60931 ${RENDERER}`,
  ].join('\n');
  assert.deepStrictEqual(appPids(ps), ['60928']);
});

test('appPids tolerates spaces in the executable path', () => {
  // "Electron Helper (Renderer)" has two. A split on whitespace would take
  // "Electron" as the command and drop the rest, so the pid is split off the
  // front and the REST is the path.
  const ps = `60931 ${RENDERER}\n60928 ${MAIN}\n`;
  assert.deepStrictEqual(appPids(ps), ['60928']);
});

test('appPids finds nothing for another checkout, or for no app at all', () => {
  const sibling = '60928 /Users/someone/other-editor/node_modules/electron/dist/'
    + 'Electron.app/Contents/MacOS/Electron';
  assert.deepStrictEqual(appPids(sibling), []);
  assert.deepStrictEqual(appPids(''), []);
  assert.deepStrictEqual(appPids(null), []);
  // A line with no pid — `ps -Ao comm=` output fed in by mistake — yields
  // nothing rather than a bad pid, because `kill` on a wrong number is worse
  // than a refusal that cannot name one.
  assert.deepStrictEqual(appPids(MAIN), []);
});

test('an empty pid list is falsy only by length', () => {
  // run.js tests `.length`. This records why: the array itself is truthy, so
  // `if (appRunningPids())` would refuse every run on a machine with no app.
  assert.ok([], 'an empty array is truthy — the guard must use .length');
  assert.strictEqual(appPids('').length, 0);
});
