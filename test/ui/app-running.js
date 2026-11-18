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

// THE PIDs, SO THE REFUSAL CAN NAME ONE (Daniel, 18 Nov 2026).
//
// The runner used to tell the reader to quit the app with
//
//     pkill -f "crumar-seven-editor"
//
// and that instruction was dangerous in a way the detector above was already
// careful about. `-f` matches any process whose COMMAND LINE contains the
// string, and plenty of things carry a repo's name without being the app: a
// Claude Code session working in this repo has it in a permission rule, so
// running that line kills the session that ran it. This module exists because
// a command line is arbitrary text; printing a -f pattern handed that same
// looseness straight back to the reader.
//
// A PID MATCHES ONE PROCESS. A pattern matches whatever happens to share the
// string, and what shares it changes over time.
//
// PURE, like isAppRunning, and takes the output of `ps -Ao pid=,comm=`. The
// executable path may contain spaces ("…/Electron Helper"), so the pid is
// split off the front and the REST is the command — not a split on whitespace.
function appPids(psOutput, root = ROOT) {
  const out = [];
  for (const line of String(psOutput || '').split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(.*)$/);
    if (!m) continue;
    const cmd = m[2].trim();
    if (cmd.startsWith(root + path.sep) && cmd.endsWith(MAIN_SUFFIX)) out.push(m[1]);
  }
  return out;
}

// Returns the main-process pids, empty when the app is not running. Callers
// test `.length`, never truthiness: an empty array is truthy, and `if (pids)`
// would refuse every run.
function appRunningPids() {
  const { execSync } = require('node:child_process');
  try {
    return appPids(execSync('ps -Ao pid=,comm=', { encoding: 'utf8' }));
  } catch {
    // A failure to ask is not evidence that nothing is running, but refusing
    // to run the suite because `ps` broke would be worse: the scenarios would
    // simply never run. Fail open, as before.
    return [];
  }
}

function appAlreadyRunning() {
  const { execSync } = require('node:child_process');
  try {
    return isAppRunning(execSync('ps -Ao comm=', { encoding: 'utf8' }));
  } catch {
    return false;
  }
}

module.exports = {
  isAppRunning, appAlreadyRunning, appPids, appRunningPids, ROOT, MAIN_SUFFIX,
};
