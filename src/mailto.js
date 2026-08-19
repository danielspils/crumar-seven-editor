'use strict';

// Hand a setlist to whatever mail client the person already uses, with the
// message composed and NO recipient — they choose who from their own address
// book and press Send there.
//
// WHAT THIS DELIBERATELY IS NOT: a compose window, a To: field, a stored
// address, or a Send button. A Send button that actually sent would need SMTP
// credentials, and this app stores no credentials of any kind, from any source
// (Rule 6). The mail client is better at all of it and already trusted with it.
//
// Pure, and in its own module, for the same reason as src/setlist-text.js:
// `npm test` globs "test/*.test.js" and never reaches src/app.js, so anything
// that lives there is untested by construction.

// RFC 6068. Two things it asks for that are easy to get wrong:
//
//  - NO RECIPIENT means an empty path — "mailto:?subject=…". Not "mailto://",
//    which is a different (and wrong) URL shape.
//  - LINE BREAKS IN A BODY ARE %0D%0A, not %0A. The formatter emits \n, so
//    they are converted here rather than in the formatter: a setlist on the
//    clipboard should carry the platform-neutral text, and only the URL has
//    this requirement.
//
// encodeURIComponent leaves ! ' ( ) * unescaped, which is legal in a query
// value and survives every client tried; everything else that matters —
// spaces, ampersands, the em dashes the formatter uses for empty slots — is
// escaped.
function buildMailto({ subject, body }) {
  const q = [];
  if (subject) q.push(`subject=${encodeURIComponent(String(subject).replace(/\s+/g, ' ').trim())}`);
  if (body) q.push(`body=${encodeURIComponent(String(body).replace(/\r?\n/g, '\r\n'))}`);
  return `mailto:${q.length ? `?${q.join('&')}` : ''}`;
}

// Open it, and if there is no mail client, DO NOT FAIL SILENTLY.
//
// A mailto: URL with nothing registered to handle it does nothing visible —
// the click looks like it did not work, which is the worst outcome available:
// the person has no message and no text and no idea why. So the fallback puts
// the setlist on the clipboard instead, and says which of the two happened.
// Either way they end up holding the setlist.
//
// Dependencies are injected so this can be tested without Electron; main.js
// passes shell.openExternal and clipboard.writeText.
//
// The result is { ok: true, via } rather than a thrown refusal — both outcomes
// SUCCEEDED, they just succeeded differently, so the caller is choosing a
// sentence rather than handling a failure. (The throwing convention in
// CLAUDE.md is for calls that either do the thing or do not.)
async function mailSetlist({ subject, body, openExternal, writeClipboard }) {
  const url = buildMailto({ subject, body });
  try {
    await openExternal(url);
    return { ok: true, via: 'mail' };
  } catch (err) {
    writeClipboard(body);
    return { ok: true, via: 'clipboard', error: String((err && err.message) || err) };
  }
}

module.exports = { buildMailto, mailSetlist };
