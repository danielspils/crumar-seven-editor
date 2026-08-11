'use strict';

// In-app modal. The OS dialog was doing the right job with the wrong voice: a
// system alert says "the computer needs something from you", when what these
// moments actually say is "here is how this instrument behaves". Same panel
// vocabulary as everything else — antiqued surface, felt-red rule, amber for
// the affirmative action.
//
// Escape and the backdrop both cancel, and focus lands on the confirm button,
// so the keyboard path is the same one the OS dialog gave for free.

(function (global) {
  const esc = (v) =>
    String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Paragraphs, not innerHTML: body text is copy, never markup, so a stray
  // angle bracket in a patch or sound name can never become an element.
  const paragraphs = (text) =>
    String(text)
      .split('\n\n')
      .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
      .join('');

  // Resolves true (confirmed) or false (cancelled, escaped, backdrop).
  function confirm({ title, body, confirmLabel = 'OK', cancelLabel = 'Cancel', tone = '' }) {
    return new Promise((resolve) => {
      const host = document.createElement('div');
      host.className = 'seven-modal-overlay';
      host.innerHTML =
        `<div class="seven-modal ${tone}" role="dialog" aria-modal="true" aria-label="${esc(title)}">` +
        `<div class="seven-modal-title">${esc(title)}</div>` +
        `<div class="seven-modal-body">${paragraphs(body)}</div>` +
        `<div class="seven-modal-actions">` +
        `<button type="button" class="seven-modal-cancel">${esc(cancelLabel)}</button>` +
        `<button type="button" class="seven-modal-ok">${esc(confirmLabel)}</button>` +
        `</div></div>`;

      const done = (value) => {
        document.removeEventListener('keydown', onKey, true);
        host.remove();
        resolve(value);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); done(false); }
        else if (e.key === 'Enter') { e.preventDefault(); done(true); }
      };

      host.addEventListener('click', (e) => {
        if (e.target === host || e.target.closest('.seven-modal-cancel')) done(false);
        else if (e.target.closest('.seven-modal-ok')) done(true);
      });
      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(host);
      host.querySelector('.seven-modal-ok').focus();
    });
  }

  global.SevenModal = { confirm };
})(window);
