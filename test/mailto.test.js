'use strict';

// The mailto URL and the no-mail-client fallback. Runs on `npm test`, which is
// why both live in src/mailto.js rather than in app.js.

const test = require('node:test');
const assert = require('node:assert');

const { buildMailto, mailSetlist } = require('../src/mailto');
const { formatSetlist } = require('../src/setlist-text');

const SETLIST = {
  name: 'PIKE PLACE — 28 AUG',
  slots: ['Tine Piano', 'Reed Piano', 'Wurli Bark', 'Clav Comp', null, null, null, 'Electric Grand'],
};
const WHEN = new Date(2026, 7, 18, 16, 12);
const params = (url) => new URLSearchParams(url.slice(url.indexOf('?') + 1));

test('the setlist’s name is the subject', () => {
  const url = buildMailto({ subject: SETLIST.name, body: 'x' });
  assert.strictEqual(params(url).get('subject'), 'PIKE PLACE — 28 AUG');
});

// THE WHOLE POINT OF REUSING formatSetlist: what arrives in the mail must be
// the same text the clipboard gets, character for character. If these two can
// disagree about what a setlist looks like, there are two formatters.
test('the body round-trips to exactly what formatSetlist produced', () => {
  const text = formatSetlist(SETLIST, WHEN);
  const decoded = params(buildMailto({ subject: SETLIST.name, body: text })).get('body');
  // RFC 6068 requires CRLF in a mailto body; that is the ONLY difference, and
  // it is introduced by the URL builder, never by the formatter.
  assert.strictEqual(decoded.replace(/\r\n/g, '\n'), text);
  // Said again the other way, because "newlines intact" is the requirement:
  // every line survives, in order, including the dashes for empty slots.
  assert.deepStrictEqual(decoded.split('\r\n'), text.split('\n'));
  assert.ok(decoded.includes('5. —'), 'an empty slot still reads as a dash');
});

test('line breaks are encoded, and encoded as CRLF', () => {
  const url = buildMailto({ subject: 'x', body: 'one\ntwo' });
  assert.ok(url.includes('%0D%0A'), `CRLF pair: ${url}`);
  assert.ok(!/%0A/.test(url.replace(/%0D%0A/g, '')), 'no bare %0A left over');
  assert.ok(!/\n/.test(url), 'and no literal newline in the URL at all');
});

// No To:, no stored address, nothing pre-filled. The person picks the
// recipient in their own client, from their own address book.
test('no recipient is set', () => {
  const url = buildMailto({ subject: SETLIST.name, body: formatSetlist(SETLIST, WHEN) });
  assert.ok(url.startsWith('mailto:?'), `empty path, not mailto:// — got ${url.slice(0, 12)}`);
  assert.strictEqual(url.slice('mailto:'.length, url.indexOf('?')), '', 'nothing before the query');
  assert.strictEqual(params(url).get('to'), null);
  assert.ok(!/@/.test(url.slice(0, url.indexOf('?'))), 'no address anywhere in the path');
});

test('a subject cannot break the URL or smuggle a second field', () => {
  const url = buildMailto({ subject: 'Gig\n&cc=someone@example.com', body: 'x' });
  assert.strictEqual(params(url).get('cc'), null, 'the ampersand is escaped, not honoured');
  assert.strictEqual(params(url).get('subject'), 'Gig &cc=someone@example.com');
});

// THE FAILURE PATH. A mailto: with no client registered does nothing visible,
// so the click looks broken. The person must end up holding the setlist either
// way.
test('with no mail client, the setlist goes to the clipboard instead', async () => {
  const text = formatSetlist(SETLIST, WHEN);
  let clipped = null;
  const r = await mailSetlist({
    subject: SETLIST.name,
    body: text,
    openExternal: () => Promise.reject(new Error('no application knows how to open mailto:')),
    writeClipboard: (t) => { clipped = t; },
  });
  assert.strictEqual(r.via, 'clipboard', 'the caller can tell which happened');
  assert.strictEqual(r.ok, true, 'the person got the setlist, so this is not a failure');
  assert.strictEqual(clipped, text, 'and what they got is the whole setlist');
});

test('with a mail client, nothing touches the clipboard', async () => {
  let clipped = null;
  let opened = null;
  const r = await mailSetlist({
    subject: SETLIST.name,
    body: formatSetlist(SETLIST, WHEN),
    openExternal: (url) => { opened = url; return Promise.resolve(); },
    writeClipboard: (t) => { clipped = t; },
  });
  assert.strictEqual(r.via, 'mail');
  assert.strictEqual(clipped, null, 'the clipboard is left alone');
  assert.ok(opened.startsWith('mailto:?subject='));
});

// Windows passes a mailto: URL through ShellExecute, where the practical
// ceiling is around 2000 characters. A worst-case setlist has to stay clear of
// it or the failure is a truncated message nobody notices.
test('a setlist of long names stays well under the mailto length ceiling', () => {
  const long = 'Wurlitzer 200A Bright Stage Left Doubled'; // 39 chars, realistic
  const url = buildMailto({
    subject: 'A Long Setlist Name For A Long Evening',
    body: formatSetlist({ name: 'A Long Setlist Name For A Long Evening', slots: Array(8).fill(long) }, WHEN),
  });
  assert.ok(url.length < 2000, `worst realistic case is ${url.length} chars`);
});
