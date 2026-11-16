'use strict';

// IS THE EDITOR ALREADY HOLDING THE INSTRUMENT?
//
// Only one app may hold the MIDI port, so the runner refuses to start while
// the editor is open. The refusal is right. The DETECTION was not.
//
// It used to scan `ps -Ao command` for any line containing both
// "crumar-seven-editor" and "Electron". A command line is arbitrary text:
// a shell running
//
//   pkill -f "crumar-seven-editor/node_modules/electron" … npm run test:ui
//
// contains both strings and is not the editor. The runner then refused to
// start with nothing running, which cost Daniel three attempts at
// panel-cc-follow on 14 Nov 2026 and sent a session after a wrong diagnosis
// on the strength of it.
//
// MATCH THE BINARY, NOT THE COMMAND LINE. `ps -Ao comm=` reports the
// EXECUTABLE path of each process, which a process cannot spell however it
// likes — a shell's comm is /bin/zsh whatever its arguments say.
//
// Two conditions, and both are needed:
//   - the executable lives under THIS repo, so another Electron app does not
//     count. The Claude desktop app is Electron and is running right now on
//     this machine, at /Applications/Claude.app/… — the old check excluded it
//     only by accident, because its path has no "crumar-seven-editor" in it.
//   - it is the MAIN process, not a helper. Electron's GPU, renderer and
//     utility processes all live under the same root and all have "Electron"
//     in their path; only the main process holds the MIDI port, and only it
//     ends in /MacOS/Electron. The helpers end in "Electron Helper", "Electron
//     Helper (Renderer)" and so on.

const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const MAIN_SUFFIX = `${path.sep}Contents${path.sep}MacOS${path.sep}Electron`;

// PURE, so it can be tested without a running app or a real `ps`. Takes the
// output of `ps -Ao comm=`.
function isAppRunning(psOutput, root = ROOT) {
  return String(psOutput || '').split('\n').some((line) => {
    const cmd = line.trim();
    if (!cmd) return false;
    return cmd.startsWith(root + path.sep) && cmd.endsWith(MAIN_SUFFIX);
  });
}

function appAlreadyRunning() {
  const { execSync } = require('node:child_process');
  try {
    return isAppRunning(execSync('ps -Ao comm=', { encoding: 'utf8' }));
  } catch {
    // A failure to ask is not evidence that nothing is running, but refusing
    // to run the suite because `ps` broke would be worse: the scenarios would
    // simply never run. Fail open, as before.
    return false;
  }
}

module.exports = { isAppRunning, appAlreadyRunning, ROOT, MAIN_SUFFIX };
