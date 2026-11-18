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
// `only` is parsed below, beside the --device flag, so the two cannot
// disagree about which argument is which.

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

// A scenario declares the launch state it needs, at the top of its own file:
//
//   // @env SEVEN_RESET_NOTES=1
//
// SO THAT A TEST ARRANGES ITS OWN PRECONDITION instead of instructing a human
// to. notes-strip.js DISMISSES the post it tests — that is the half of the
// feature most worth asserting — and dismissal is permanent, so the scenario
// destroyed the very state it needed and every later run failed with "run with
// SEVEN_RESET_NOTES=1". A person in a hurry re-runs it with the flag; CI never
// will, and a suite that needs someone to read the failure and try again is a
// suite that goes quietly red and stays there.
//
// Only SEVEN_-prefixed names, and NEVER from the environment this runner was
// started in: the point is that the state is CHOSEN by the scenario and visible
// in its source, not inherited from whatever the desk happens to have set.
//
// It cannot be used to weaken a check. SEVEN_NOTES_DEBUG bypasses the seen
// rule that notes-strip.js asserts, so declaring it would turn a real assertion
// into scenery — the sort of thing that reads as setup and behaves as a
// deleted test. Refused by name.
const FORBIDDEN_ENV = new Set(['SEVEN_NOTES_DEBUG']);

function declaredEnv(file) {
  const src = fs.readFileSync(path.join(dir, file), 'utf8');
  const out = {};
  for (const m of src.matchAll(/^\s*\/\/\s*@env\s+(SEVEN_[A-Z0-9_]+)=(\S*)\s*$/gm)) {
    const [, name, value] = m;
    if (FORBIDDEN_ENV.has(name)) {
      throw new Error(`${file} declares ${name}, which suspends the behaviour a scenario would be asserting`);
    }
    out[name] = value;
  }
  return out;
}

function runScenario(file, libraryDir) {
  return new Promise((resolve) => {
    // A bad declaration is that scenario's failure, not a crash of the run:
    // one malformed line should not take the other sixteen with it.
    let declared;
    try {
      declared = declaredEnv(file);
    } catch (err) {
      return resolve({ file, failures: [String(err.message || err)], notes: [], out: '' });
    }
    const child = spawn('npx', ['electron', '.'], {
      cwd: root,
      env: {
        ...process.env,
        ...declared,
        SEVEN_UI_TEST: path.join(dir, file),
        SEVEN_LIBRARY_DIR: libraryDir,
      },
    });
    let out = '';
    // A HUMAN-STEP PROMPT IS ECHOED THE MOMENT IT ARRIVES (18 Nov 2026).
    //
    // Everything else a scenario says is buffered here and printed after the
    // child exits, which is correct: notes belong under their scenario's
    // heading, in order. A PROMPT IS THE ONE THING THAT IS USELESS LATE — it
    // asks someone to do something while the scenario waits, and by the time
    // the buffer is printed the wait has already timed out. The app shows a
    // banner for a person sitting at it; this is for whoever is watching the
    // terminal, which on 18 Nov was an agent that then missed the window.
    //
    // Only lines carrying the marker are echoed, so this does not turn into a
    // raw passthrough of the child's chatter.
    let pending = '';
    const echoPrompts = (chunk) => {
      pending += chunk;
      const lines = pending.split('\n');
      pending = lines.pop();
      for (const l of lines) {
        const m = l.match(/^\[ui-prompt\](.*)$/);
        if (m) console.log(`\n>>> WAITING FOR YOU: ${m[1]}\n`);
      }
    };
    child.stdout.on('data', (d) => { out += d; echoPrompts(String(d)); });
    child.stderr.on('data', (d) => { out += d; });
    child.on('exit', (code, signal) => {
      const line = out.split('\n').find((l) => l.startsWith('[ui-test]'));
      if (!line) {
        // THE ONE FAILURE MODE WITH NO DIAGNOSTIC WAS THE ONE THAT NEEDED IT
        // MOST. `out` was resolved and then never printed, so "the app crashed"
        // and "the scenario threw before it could report" — different bugs,
        // with fixes nowhere near each other — arrived as the same sentence.
        // On 2026-11-14 two scenarios failed this way in a hardware run and
        // the run output could not distinguish them even in principle.
        //
        // The exit code and signal separate them on their own: a renderer
        // exception leaves the app to exit 0 with its reporting skipped, while
        // a crash exits non-zero or dies on a signal. Both are printed, with
        // the tail of what the child said.
        const how = signal ? `killed by ${signal}` : `exit code ${code}`;
        const tail = out.trim().split('\n').slice(-25);
        return resolve({
          file,
          failures: [
            `no [ui-test] result — ${how}. `
            + (signal || code ? 'The app died before reporting.'
              : 'The app exited cleanly WITHOUT reporting, so the scenario '
                + 'most likely threw before its result was printed.'),
            ...tail.map((l) => `  | ${l}`),
          ],
          notes: [],
          out,
        });
      }
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
//
// The detection lives in its own module because it is worth testing and this
// file cannot be required without running the suite. See the comment there for
// why a command-line substring was the wrong thing to match.
const { appRunningPids } = require('./app-running');
const { deviceAnswered } = require('./device-present');

// A DEVICE PASS IS A DIFFERENT RUN, AND IT SAYS SO (Daniel, 18 Nov 2026).
//
// `--device` means "this run exists for the scenarios that need the Seven".
// It changes two things and nothing else: the suite REFUSES TO START unless
// the instrument answered, and any device scenario that skips makes the pass
// FAIL rather than quietly shrinking it.
//
// WHY IT IS A FLAG AND NOT AUTOMATIC. Most runs are offline and should stay
// useful on a machine with no Seven — which is every machine but Daniel's.
// What must never happen again is a run STARTED for device coverage that
// silently became an offline one. The flag is the statement of intent, and
// the gate below holds the run to it.
const wantDevice = process.argv.includes('--device');
const only = process.argv.slice(2).find((a) => !a.startsWith('--'));

(async () => {
  // IT NAMES THE PROCESS IT FOUND (Daniel, 18 Nov 2026). This used to say
  // `pkill -f "crumar-seven-editor"`, which matches any process whose COMMAND
  // LINE carries the repo name — a Claude Code session working in this repo
  // has it in a permission rule, so the line killed the session that ran it.
  //
  // The runner already had to detect the app to print this message, so it
  // knows which process it means. A pid matches one process; a -f pattern
  // matches whatever happens to share the string, and what shares it changes
  // over time. `.length`, not truthiness — an empty array is truthy.
  const openPids = appRunningPids();
  if (openPids.length) {
    console.error(
      'The editor is already open, and it holds the instrument.\n'
      + `Quit the app first (Cmd+Q), or: kill ${openPids.join(' ')}\n`
      + 'Then run this again.'
    );
    process.exit(2);
  }

  // THE PORT BEING FREE IS NOT THE INSTRUMENT BEING THERE. The check above
  // only establishes that no sibling session holds it. This one asks the
  // Seven directly — a STRING-4 round trip through the app's own connect().
  let device = null;
  if (wantDevice) {
    process.stdout.write('device pass: asking the Seven… ');
    device = await deviceAnswered();
    console.log(device.ok
      ? `answered, firmware ${device.firmware}`
      : `NO — ${device.reason}`);
    if (!device.ok) {
      console.error(
        '\nREFUSING TO START A DEVICE PASS WITHOUT THE DEVICE.\n'
        + `  ${device.reason}\n`
        + '  A device pass that skipped device scenarios is a failed pass, and\n'
        + '  running one anyway would answer a different question than the one\n'
        + '  asked. Plug the Seven in, or drop --device for an offline pass.'
      );
      process.exit(2);
    }

    // A DEVICE PASS HAS A PERSON AT THE PANEL, so it provisions the hook that
    // lets a scenario ask them for something (18 Nov 2026).
    //
    // WHY: panel-cc-follow and signal-hook both reported GREEN in the first
    // real device pass having tested nothing. SEVEN_UI_SIGNAL was unset, so
    // waitForHuman returned false immediately, and both scenarios took their
    // no-signal branch — which noted the word "skipped" and then returned
    // normally. Daniel was sitting at the instrument and was never asked for
    // the knob.
    //
    // THE FIX IS NOT A PER-SCENARIO @env LINE. amp-follow-live.js carried one,
    // which is why it alone worked, and it hardcoded a session-specific
    // scratchpad path — a path that is wrong on any other machine and gone
    // after a temp sweep. The hook is a property of the RUN (is anyone there?),
    // not of the scenario, so the run provides it.
    //
    // AND ONLY IN A DEVICE PASS. An offline or CI run has nobody to ask, and
    // defaulting this everywhere would turn a fast skip into a two-minute
    // timeout on a machine with no Seven. `--device` is the statement that
    // someone is present.
    if (!process.env.SEVEN_UI_SIGNAL) {
      process.env.SEVEN_UI_SIGNAL = path.join(os.tmpdir(), 'seven-ui-signal');
    }
    // EMPTIED FIRST, because waitForHuman waits for the contents to CHANGE
    // from whatever is there when the wait begins. A leftover "go" from an
    // earlier run would satisfy the first wait instantly — the person is never
    // asked and the step silently does not happen, which cost a real preset on
    // 20 Aug.
    try {
      fs.writeFileSync(process.env.SEVEN_UI_SIGNAL, '');
    } catch (e) {
      console.error(`could not prepare the signal file: ${e.message}`);
      process.exit(2);
    }
    console.log(`hands-on scenarios will ask through: ${process.env.SEVEN_UI_SIGNAL}`);
    console.log('  (answer a prompt with:  echo go > '
      + `${process.env.SEVEN_UI_SIGNAL}  — something DIFFERENT each time)`);
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
  let ran = 0;
  const deviceSkipped = [];
  const otherSkipped = [];
  const made = [];   // every scratch copy, so none is left behind in /tmp
  for (const file of files) {
    // A fresh copy per scenario, so one cannot leave state for the next.
    const { dir: lib } = makeScratchLibrary();
    made.push(lib);
    const r = await runScenario(file, lib);
    if (r.skipped) {
      // A DEVICE SKIP IN A DEVICE PASS IS A FAILURE, in those words.
      //
      // The gate at the top means the Seven answered before the run began,
      // so a scenario skipping for want of an instrument NOW is not a
      // machine without one — it is the instrument having gone away
      // mid-run, or a scenario asking a question the gate did not. Either
      // is a result, and counting it as a skip would let the pass end green
      // having covered none of what it was for.
      //
      // OTHER SKIPS STAY SKIPS even here: SEVEN_WRITE_BANK, a reset flag, a
      // library with no backup runs. Those are preconditions the scenario
      // cannot control and that the device being present does not supply.
      // THE REASON, NOT A WORD IN IT. This matched /instrument|device|seven/
      // for one run and was too broad by exactly the amount that matters:
      // "SEVEN_WRITE_BANK not set" contains "SEVEN" and would have been
      // reported as a device scenario skipping for want of the device, when
      // it is a scenario declining to WRITE to the instrument without being
      // told which bank it may use. Flattening those two together is the
      // same error as counting a skip as a pass, one level up — a report
      // that says the wrong thing about why.
      //
      // A DEVICE SKIP IS THE INSTRUMENT NOT BEING THERE, which is what
      // `ui.requireDevice()` says in those words. Everything else — a write
      // flag, a reset flag, a library with nothing in it — is a precondition
      // the pass cannot supply by having a Seven plugged in, and stays a
      // skip that the summary lists by name.
      // TWO KINDS OF SKIP MAKE A DEVICE PASS A FAILED PASS, and only one of
      // them is about the instrument (18 Nov 2026).
      //
      // `r.hand` is set by a scenario that asked a person to do something at
      // the panel and got no answer — the knob turn, the three-second hold,
      // the signal. In the 18 Nov run those were filed under "a precondition
      // the device does not supply" and the pass ended without saying a device
      // scenario had been skipped, which is exactly what this gate exists to
      // prevent. A HUMAN IS PART OF A DEVICE PASS: `--device` is the statement
      // that someone is at the instrument.
      //
      // IT IS A FLAG AND NOT A REGEX because the reason is prose and gets
      // reworded. "no signal arrived" and "nobody pushed knob 6" and "nobody
      // answered the prompt" are the same fact in three phrasings, and a
      // pattern that caught today's three would miss tomorrow's fourth — the
      // same way /instrument|device|seven/ once caught SEVEN_WRITE_BANK.
      const deviceSkip = /no instrument attached/i.test(r.skipped) || !!r.hand;
      if (wantDevice && deviceSkip) {
        failed++;
        deviceSkipped.push(`${file} — ${r.skipped}`);
        // NAMES WHICH OF THE TWO IT WAS. "for want of the device" is wrong
        // when the instrument was there and the person was not, and sends the
        // next reader to check the cable.
        console.log(`✗ ${file} — SKIPPED in a device pass, `
          + `${r.hand ? 'FOR WANT OF A HAND AT THE PANEL' : 'FOR WANT OF THE DEVICE'}`);
        console.log(`    ${r.skipped}`);
        continue;
      }
      skipped++;
      otherSkipped.push(`${file} — ${r.skipped}`);
      console.log(`- ${file} — skipped (${r.skipped})`);
      continue;
    }
    for (const n of r.notes || []) console.log(`    ${n}`);

    // A SCENARIO THAT SKIPS ITSELF IN A NOTE REPORTED GREEN (18 Nov 2026).
    //
    // panel-cc-follow.js and signal-hook.js both ended:
    //
    //     ui.note('skipped: no signal arrived …');
    //     return;
    //
    // A bare return. The word "skipped" went into a NOTE, the runner was told
    // nothing, no failures were recorded, and a ✓ was printed for a scenario
    // that had tested none of its claim. Both are fixed at the source, but
    // THAT IS THE PARTICULAR CASE AND THIS IS THE GENERAL ONE: the same two
    // lines can be written again in any of 83 files, and the next one would
    // hide exactly as well.
    //
    // It is the same failure as the device gate, one level down. The gate
    // stops a RUN from silently becoming a smaller run; this stops a SCENARIO
    // from doing it. A guard that only caught the two known instances would be
    // the kind of fix that reads as a fix and prevents nothing.
    //
    // IT IS A FAILURE, NOT A SKIP, deliberately: the scenario's own words say
    // it did not run, and its return value says it passed. Those disagree, and
    // which one is true is not for this runner to guess. A loud red gets the
    // return value corrected; a quiet skip would let the contradiction live.
    const selfSkipped = (r.notes || []).filter((n) => /^\s*skipped\b/i.test(n));
    if (selfSkipped.length && !r.skipped) {
      r.failures = (r.failures || []).concat(
        'THIS SCENARIO SAYS IT SKIPPED AND REPORTS THAT IT RAN. Its note reads '
        + `"${selfSkipped[0].trim()}" — so it returned without a `
        + '{ skipped: reason }, and would have been counted as a pass.'
      );
    }

    if ((r.failures || []).length) {
      failed++;
      console.log(`✗ ${file}`);
      for (const f of r.failures) console.log(`    ${f}`);
    } else {
      ran++;
      console.log(`✓ ${file}`);
    }
  }
  console.log(`\n${files.length - failed - skipped} passed, ${failed} failed, ${skipped} skipped`);
  if (wantDevice) {
    console.log(`device pass · ${ran} ran · ${skipped} skipped · ${failed} failed`);
    if (deviceSkipped.length) {
      console.log('\nA DEVICE PASS THAT SKIPPED DEVICE SCENARIOS IS A FAILED PASS.');
      for (const s of deviceSkipped) console.log(`  ${s}`);
    }
    // NAMED, NOT COUNTED. A number beside "skipped" invites the reader to
    // assume they were all the harmless kind. These are the preconditions
    // the pass could not supply even with the instrument attached, and each
    // one is a scenario that covered nothing.
    if (otherSkipped.length) {
      console.log('\nSkipped for a precondition the device does not supply:');
      for (const s of otherSkipped) console.log(`  ${s}`);
    }
  }
  // ALL of them. The old cleanup removed the single throwaway copy and left
  // one directory per scenario in /tmp on every run.
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
})();
