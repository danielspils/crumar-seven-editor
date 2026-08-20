'use strict';

// Reading the Notes feed, and every way it can decline.
//
// These run on `npm test`. The UI scenario (test/ui/scenarios/notes-strip.js)
// proves the strip actually appears, against the live feed — the right test for
// "does this feature exist", and the one that catches a renderer nobody wrote.
// But a real feed never serves a title-less entry or an attribute on <entry>,
// so those shapes exist only here.
//
// The property under test throughout: A DECLINE SAYS WHICH DECLINE IT WAS.
// Seven paths that all returned a bare `{ ok: false }` are why a 404, a changed
// feed shape and "no new post" were one observable for ten days.

const test = require('node:test');
const assert = require('node:assert');

const { parseNotesFeed } = require('../src/notes-feed');
const { NotesSeen } = require('../src/notes-seen');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SITE = 'https://thissevengoestoeleven.com/';
const feed = (entries) => `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title type="html">This Seven Goes to Eleven</title>
${entries}</feed>`;
const entry = ({ title = 'The Case of the Missing Samples',
  url = `${SITE}2026/08/20/the-case-of-the-missing-samples.html`,
  published = '2026-08-20T00:00:00+00:00', open = '<entry>' } = {}) =>
  `${open}<title type="html">${title}</title>` +
  `<link href="${url}" rel="alternate" type="text/html" />` +
  `<published>${published}</published></entry>`;

test('the newest entry is read out of a normal feed', () => {
  const r = parseNotesFeed(feed(entry()), SITE);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.title, 'The Case of the Missing Samples');
  assert.strictEqual(r.url, `${SITE}2026/08/20/the-case-of-the-missing-samples.html`);
  assert.strictEqual(r.published, '2026-08-20T00:00:00+00:00');
});

test('the FIRST entry wins — the feed is newest-first', () => {
  const r = parseNotesFeed(
    feed(entry({ title: 'Newest' }) + entry({ title: 'Older' })), SITE
  );
  assert.strictEqual(r.title, 'Newest');
});

// THE CASE THE LIVE FEED CANNOT PRODUCE, and the reason this file exists: the
// mutation that deletes this guard passes the UI scenario, because
// thissevengoestoeleven.com always has titles.
test('a title-less entry is a refusal, not a strip with no words', () => {
  const r = parseNotesFeed(feed(entry({ title: '' })), SITE);
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /no <title>/);
});

test('whitespace is not a title', () => {
  const r = parseNotesFeed(feed(entry({ title: '   \n  ' })), SITE);
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /no <title>/);
});

test('an empty feed says the shape is wrong, not nothing at all', () => {
  const r = parseNotesFeed(feed(''), SITE);
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /no <entry>/);
});

// A generator that starts emitting `<entry xml:base="…">` would otherwise read
// as "no entries", which is the silent-failure shape all over again.
test('an attribute on <entry> does not hide the entry', () => {
  const r = parseNotesFeed(feed(entry({ open: '<entry xml:base="https://x/">' })), SITE);
  assert.strictEqual(r.ok, true, r.reason);
  assert.strictEqual(r.title, 'The Case of the Missing Samples');
});

test('a link off the site is refused, and named', () => {
  const r = parseNotesFeed(feed(entry({ url: 'https://evil.example/post.html' })), SITE);
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /not on https:\/\/thissevengoestoeleven\.com\//);
  assert.match(r.reason, /evil\.example/, 'the offending URL is in the reason');
});

test('a missing link is its own reason', () => {
  const noLink = '<entry><title>A post</title><published>2026-08-20T00:00:00+00:00</published></entry>';
  const r = parseNotesFeed(feed(noLink), SITE);
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /no link href/);
});

test('entities in a title are decoded once, not twice', () => {
  const r = parseNotesFeed(feed(entry({ title: 'Bank 1 &amp; 2 &quot;live&quot;' })), SITE);
  assert.strictEqual(r.title, 'Bank 1 & 2 "live"');
  // An already-escaped entity must survive as text rather than becoming markup.
  const r2 = parseNotesFeed(feed(entry({ title: 'Tags like &amp;lt;b&amp;gt;' })), SITE);
  assert.strictEqual(r2.title, 'Tags like &lt;b&gt;');
});

test('garbage in is a refusal, never a throw', () => {
  for (const bad of ['', null, undefined, 'not xml at all', '<feed>']) {
    const r = parseNotesFeed(bad, SITE);
    assert.strictEqual(r.ok, false, `${JSON.stringify(bad)} should decline`);
    assert.ok(r.reason, 'and say why');
  }
});

// ---- the seen-state ------------------------------------------------------

function freshSeen() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seven-notes-'));
  return { dir, seen: new NotesSeen(dir) };
}

test('nothing is seen until it is dismissed', () => {
  const { seen } = freshSeen();
  const url = `${SITE}a.html`;
  assert.strictEqual(seen.hasSeen(url), false);
  assert.strictEqual(seen.markSeen(url), true);
  assert.strictEqual(seen.hasSeen(url), true);
});

// The rule is the URL, not a date: no clock skew between a static site
// generator and a laptop, and no timezone that can make a post look old.
test('a NEWER post is unseen even though an older one was dismissed', () => {
  const { seen } = freshSeen();
  seen.markSeen(`${SITE}old.html`);
  assert.strictEqual(seen.hasSeen(`${SITE}new.html`), false);
});

test('an unreadable state shows the strip rather than swallowing it', () => {
  const { dir, seen } = freshSeen();
  fs.writeFileSync(path.join(dir, 'notes-seen.json'), '{ this is not json');
  assert.strictEqual(seen.hasSeen(`${SITE}a.html`), false,
    'the safe direction is one repeat, not silence');
});

test('reset clears it, which is what SEVEN_RESET_NOTES runs', () => {
  const { seen } = freshSeen();
  const url = `${SITE}a.html`;
  seen.markSeen(url);
  seen.reset();
  assert.strictEqual(seen.hasSeen(url), false);
  seen.reset(); // absent file is not an error
});

test('a junk URL is never recorded', () => {
  const { seen } = freshSeen();
  assert.strictEqual(seen.markSeen(''), false);
  assert.strictEqual(seen.markSeen(null), false);
});
