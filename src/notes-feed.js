'use strict';

// Reading the newest entry out of the Notes feed.
//
// Extracted from main.js so `npm test` can reach it. The UI scenario proves
// the strip appears against the LIVE feed, which is the right test for "does
// this feature exist and work" — but it cannot exercise the shapes a real feed
// never has. A title-less entry is one of those: the mutation that deletes the
// guard passes end-to-end, because thissevengoestoeleven.com always has titles
// (measured 2026-08-20). Those cases only exist in a unit test.
//
// EVERY DECLINE CARRIES ITS REASON. The absence of the strip is also its
// normal state, so seven identical `{ ok: false }` returns made a 404, a
// changed feed shape, and "no new post" one indistinguishable observable —
// which is how a missing renderer went unnoticed for ten days.

const decode = (t) => String(t)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  // LAST, or an escaped entity in the source (&amp;lt;) would be decoded twice.
  .replace(/&amp;/g, '&');

// xml: the feed body. site: the only prefix a link may have.
// Returns { ok: true, title, url, published } or { ok: false, reason }.
function parseNotesFeed(xml, site) {
  // `<entry[^>]*>` rather than `<entry>`: a generator that adds an attribute —
  // xml:base, say — would otherwise read as "no entries at all", which is the
  // silent-failure shape this whole exercise is about.
  const entry = (String(xml || '').match(/<entry[^>]*>[\s\S]*?<\/entry>/) || [])[0];
  if (!entry) return { ok: false, reason: 'no <entry> in the feed — empty, or the shape changed' };

  const title = decode((entry.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] || '').trim();
  const url = (entry.match(/<link[^>]*href="([^"]+)"/) || [])[1] || '';
  const published = (entry.match(/<published>([^<]+)<\/published>/) || [])[1] || '';

  // A TITLE IS THE WHOLE STRIP. Without one the line reads "New in Notes —"
  // and names nothing, so this is a failure with its own reason rather than a
  // success with a hole in it (Daniel, 2026-08-20).
  if (!title) return { ok: false, reason: 'entry has no <title>' };
  if (!url) return { ok: false, reason: 'entry has no link href' };
  // Only ever hand back a link to the site itself.
  if (!url.startsWith(site)) return { ok: false, reason: `entry link is not on ${site} (${url})` };

  return { ok: true, title, url, published };
}

module.exports = { parseNotesFeed };
