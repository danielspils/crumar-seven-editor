'use strict';

// Find where a sound starts and stops answering, by playing it.
//
//   node tools/key-range.js
//
// The Seven does not publish key ranges. There is no field for it in the
// schema, no opcode that reports one, and nothing in a recall burst that names
// a lowest or highest note — so the only way to know that the modeled Wurlitzer
// stops short of the keybed is to play the keybed and listen.
//
// This removes the tedious half of that: it watches note-on and prints the name
// of every key you press, so you can play the lowest key that SOUNDS and read
// the answer off the screen instead of counting semitones. It sends nothing.
//
// Method, per sound:
//   1. Recall the preset on the Seven (or pick the sound in the editor).
//   2. Play down from the middle until the sound stops. The last key you HEARD
//      is the low limit — press it once more and note what this prints.
//   3. Play up until it stops. Same again for the high limit.
//   4. Type the sound's name here to stamp the pair into the session log.
//
// What counts as "stops" is a judgement you are making with your ears, so the
// log records it as exactly that. Do not enter a number from the manual: the
// newest manual documents v1.22 and this instrument runs v1.37.

const readline = require('node:readline');
const os = require('node:os');
const { SevenMidi } = require('../src/seven-midi');

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (n) => `${NAMES[n % 12]}${Math.floor(n / 12) - 1}`;

(async () => {
  const midi = new SevenMidi({ userDataDir: os.tmpdir(), emitNotes: true });
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const seen = [];   // every key pressed, in order
  const pinned = []; // { sound, low, high }

  const onEvent = (ev) => {
    if (ev.type !== 'note-on') return;
    const name = noteName(ev.note);
    seen.push({ note: ev.note, name });
    process.stdout.write(`\r  ${name}  (MIDI ${ev.note})            \n› `);
  };

  try {
    process.stdout.write('Connecting…\n');
    await midi.connect();
    midi.on('event', onEvent);
    process.stdout.write(
      `Connected — ${midi.firmware || 'unknown firmware'}\n\n` +
      'Play keys and this names them. When you have found a sound’s limits, type\n' +
      '  <sound name> = <low> <high>      e.g.  Wurly = F1 E6\n' +
      'Blank line to finish.\n\n'
    );

    for (;;) {
      const said = await new Promise((r) => rl.question('› ', r));
      const line = said.trim();
      if (!line) break;
      const m = line.match(/^(.+?)\s*=\s*(\S+)\s+(\S+)$/);
      if (!m) {
        process.stdout.write('  Use: <sound name> = <low> <high>\n');
        continue;
      }
      pinned.push({ sound: m[1].trim(), low: m[2], high: m[3] });
      process.stdout.write(`  noted: ${m[1].trim()} plays ${m[2]}–${m[3]}\n`);
    }

    if (pinned.length) {
      process.stdout.write('\n--- observed by ear, ' + new Date().toISOString().slice(0, 10) + ' ---\n');
      for (const p of pinned) process.stdout.write(`${p.sound}: ${p.low} to ${p.high}\n`);
      process.stdout.write(
        '\nThese are HEARD limits, not reported ones. Record them with the date and the\n' +
        'method; they are evidence of what this unit on this firmware does, and nothing\n' +
        'here came from the manual.\n'
      );
    }
    if (seen.length) {
      const lo = seen.reduce((a, b) => (b.note < a.note ? b : a));
      const hi = seen.reduce((a, b) => (b.note > a.note ? b : a));
      process.stdout.write(`\nKeys played this session: ${lo.name} to ${hi.name}.\n`);
    }
  } catch (err) {
    process.stderr.write(`\n${err.message || err}\n`);
    process.exitCode = 1;
  } finally {
    rl.close();
    midi.off('event', onEvent);
    try { await midi.disconnect(); } catch { /* already gone */ }
  }
})();
