'use strict';

// A setlist as plain text, for pasting into whatever the player already reads
// on stage — Notes, Keep, Messages, an email. No file, no dialog, no
// automation: the clipboard is the whole delivery mechanism.
//
// PURE ON PURPOSE. `npm test` globs "test/*.test.js" and src/app.js is not
// reachable from it, so a formatter living in app.js is a formatter nothing
// tests. Here it takes a setlist and a timestamp and returns a string, which
// is exactly what a test can assert.
//
// THE CLOCK IS AN ARGUMENT, not something this module reads. A formatter that
// calls new Date() itself cannot be tested for the thing the timestamp is FOR.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "18 Aug 2026, 4:12 PM" — built by hand rather than through toLocaleString,
// which answers differently depending on the machine's locale and ICU build.
// A test that asserts whatever the host says is not asserting anything, and a
// gig sheet is not the place to discover that a date read as 08/09 somewhere
// else. Local time, because that is the time the player is standing in.
function stamp(when) {
  const d = when instanceof Date ? when : new Date(when);
  if (Number.isNaN(d.getTime())) return '';
  const h = d.getHours();
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const minute = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, `
    + `${hour12}:${minute} ${h < 12 ? 'AM' : 'PM'}`;
}

// One line's worth of name, whatever was stored. A newline inside a patch name
// would put the rest of that name on a line of its own, where it reads as
// another slot — so control characters collapse to a space. Nothing else is
// touched: the name is the user's.
function oneLine(text) {
  // \s covers the whole family — newline, carriage return, tab, vertical tab,
  // form feed and the unicode line separators — so one pass collapses anything
  // that could put part of a name on a line of its own.
  return String(text).replace(/\s+/g, ' ').trim();
}

// setlist: { name, slots } where slots is up to 8 entries, each a display name
// or null. Resolving a slot to a name — a patch file, a bare sound, a file
// that has gone missing — belongs to the caller, which is the only place that
// holds the library.
//
// ALL EIGHT SLOTS, ALWAYS. An empty one is a dash, never omitted: the position
// IS the information, and a list that skips slot 5 renumbers every slot after
// it. "1. Name" rather than padded columns, because this is pasted into apps
// with proportional fonts where columns cannot line up anyway.
function formatSetlist(setlist, when) {
  const name = oneLine((setlist && setlist.name) || 'Untitled setlist');
  const slots = (setlist && setlist.slots) || [];
  const lines = [name];
  // BANK N, and ONLY when it is known. A setlist that has never been sent has
  // no honest answer, and a guess on a sheet somebody is reading at a gig is
  // worse than a blank line — so the line is omitted entirely rather than
  // rendered as "BANK —" or "BANK ?". Same rule as the version numbers in the
  // download report: print it when it is known, say nothing when it is not.
  // A REAL bank, 1 to 4 — the instrument has four. Anything else (0, a
  // string, a stray NaN) is not a bank we know, and the rule is the same as
  // not knowing at all: say nothing.
  const bank = setlist && setlist.bank;
  if (Number.isInteger(bank) && bank >= 1 && bank <= 4) lines.push(`BANK ${bank}`);
  lines.push('');
  for (let i = 0; i < 8; i++) {
    const slot = slots[i];
    const label = slot == null || oneLine(slot) === '' ? '—' : oneLine(slot);
    lines.push(`${i + 1}. ${label}`);
  }
  const at = stamp(when);
  // The timestamp is not decoration. Once this text leaves the app nothing can
  // update it, and a gig sheet showing last month's setlist is worse than no
  // gig sheet at all.
  if (at) lines.push('', `Exported ${at}`);
  return `${lines.join('\n')}\n`;
}

module.exports = { formatSetlist };
