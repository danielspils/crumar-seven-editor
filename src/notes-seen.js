'use strict';

// Which Notes post the user has already been told about.
//
// One string on disk — the URL of the newest entry they dismissed. The strip
// shows when the feed's newest entry is not that one, which is the whole rule:
// no dates to compare, no clock skew between a static site generator and a
// laptop, and nothing that can decide a post is "old" because a timezone moved
// it. A post is either the one you waved away or it isn't.
//
// Pure logic with an injected path, the way src/donations.js is, so `npm test`
// can reach it — the renderer half cannot be reached by a unit test at all.

const fs = require('fs');
const path = require('path');

const FILE = 'notes-seen.json';

class NotesSeen {
  constructor(dir) {
    this.file = path.join(dir, FILE);
  }

  // An unreadable or absent file means "seen nothing", which shows the strip.
  // That is the safe direction: the worst case is being told about a post you
  // had already dismissed, and the alternative — swallowing the state and
  // showing nothing — is the failure this whole feature was found to have.
  read() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return typeof raw.url === 'string' ? { url: raw.url } : { url: null };
    } catch {
      return { url: null };
    }
  }

  hasSeen(url) {
    if (!url) return false;
    return this.read().url === url;
  }

  // Called when the strip is dismissed OR followed — opening the post counts
  // as being told about it, so it does not come back on the next launch.
  markSeen(url) {
    if (typeof url !== 'string' || !url) return false;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, `${JSON.stringify({ url }, null, 2)}\n`);
      return true;
    } catch (err) {
      // Never let a write failure break the app; the cost is one repeated
      // strip, and the reason is logged by the caller.
      return false;
    }
  }

  // SEVEN_RESET_NOTES. Permanent development tooling for the same reason
  // SEVEN_RESET_DONATIONS is: this state is one-directional, so without a
  // reset the feature can be seen exactly once per published post and any
  // change to it is unverifiable.
  reset() {
    try { fs.unlinkSync(this.file); } catch { /* already gone */ }
  }
}

module.exports = { NotesSeen, NOTES_SEEN_FILE: FILE };
