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

  // Resolves true (confirmed), 'secondary' (the optional second action), or
  // false (cancelled, escaped, backdrop). The secondary exists for the case
  // where declining the main action still needs a choice of its own — "save
  // first" versus "go ahead and lose it" are different answers, and a plain
  // two-way confirm can only ask one of them.
  // bodyHtml is for markup the APP builds (the transfer's panel picture), never
  // for anything a user or a device typed. `body` stays the escaped path and is
  // what everything else uses.
  //
  // denyLabel gives declining a button of its own beside the action, for the
  // walk where "Stop" is a step in the task rather than a way out of a dialog.
  // Everywhere else the corner X is the right weight.
  //
  // defaultDeny is the separate question of where the keyboard starts. On
  // anything that overwrites the instrument, focus must NOT land on the
  // destructive button and Enter must not mean yes — the same defence the OS
  // dialog gave for free by defaulting to Cancel. Focus goes to the deny
  // button when there is one, and to the corner X when there isn't.
  // Dismiss is a close control in the corner, not a button competing with the
  // action — so the affirmative one stands alone, centred. cancelLabel survives
  // as the close control's accessible name.
  const shell = ({
    title, body = '', bodyHtml = '', confirmLabel, cancelLabel,
    secondaryLabel = '', denyLabel = '', tone = '',
  }) =>
    `<div class="seven-modal ${tone}" role="dialog" aria-modal="true" aria-label="${esc(title)}">` +
    `<button type="button" class="seven-modal-cancel" aria-label="${esc(cancelLabel)}" ` +
    `title="${esc(cancelLabel)}">` +
    '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none" ' +
    'stroke="currentColor" stroke-width="1.6" stroke-linecap="round">' +
    '<path d="M4 4l8 8M12 4l-8 8"/></svg></button>' +
    `<div class="seven-modal-title">${esc(title)}</div>` +
    `<div class="seven-modal-body">${bodyHtml || paragraphs(body)}</div>` +
    `<div class="seven-modal-actions">` +
    (secondaryLabel
      ? `<button type="button" class="seven-modal-second">${esc(secondaryLabel)}</button>`
      : '') +
    (denyLabel
      ? `<button type="button" class="seven-modal-deny">${esc(denyLabel)}</button>`
      : '') +
    `<button type="button" class="seven-modal-ok">${esc(confirmLabel)}</button>` +
    `</div></div>`;

  function confirm({
    title, body, bodyHtml = '', confirmLabel = 'OK', cancelLabel = 'Close',
    secondaryLabel = '', denyLabel = '', defaultDeny = false, tone = '',
  }) {
    return new Promise((resolve) => {
      const host = document.createElement('div');
      host.className = 'seven-modal-overlay';
      host.innerHTML = shell({
        title, body, bodyHtml, confirmLabel, cancelLabel, secondaryLabel, denyLabel, tone,
      });

      const done = (value) => {
        document.removeEventListener('keydown', onKey, true);
        host.remove();
        resolve(value);
      };
      // Enter confirms, except where the answer has to be deliberate: there it
      // does whatever is focused, and focus starts on the way out.
      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); done(false); }
        else if (e.key === 'Enter' && !defaultDeny) { e.preventDefault(); done(true); }
      };

      host.addEventListener('click', (e) => {
        if (e.target === host || e.target.closest('.seven-modal-cancel') ||
            e.target.closest('.seven-modal-deny')) done(false);
        else if (e.target.closest('.seven-modal-second')) done('secondary');
        else if (e.target.closest('.seven-modal-ok')) done(true);
      });
      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(host);
      host.querySelector(
        defaultDeny ? (denyLabel ? '.seven-modal-deny' : '.seven-modal-cancel') : '.seven-modal-ok'
      ).focus();
    });
  }

  // A short list of choices, for when the question is "which one" rather than
  // "are you sure". Resolves the chosen value, or null if dismissed.
  function choose({ title, body, choices, cancelLabel = 'Close' }) {
    return new Promise((resolve) => {
      const host = document.createElement('div');
      host.className = 'seven-modal-overlay';
      host.innerHTML =
        `<div class="seven-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">` +
        `<button type="button" class="seven-modal-cancel" aria-label="${esc(cancelLabel)}" ` +
        `title="${esc(cancelLabel)}">` +
        '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none" ' +
        'stroke="currentColor" stroke-width="1.6" stroke-linecap="round">' +
        '<path d="M4 4l8 8M12 4l-8 8"/></svg></button>' +
        `<div class="seven-modal-title">${esc(title)}</div>` +
        `<div class="seven-modal-body">${paragraphs(body)}</div>` +
        `<div class="seven-modal-actions">` +
        choices.map((c) => `<button type="button" class="seven-modal-ok" data-choice="${esc(c.value)}">${esc(c.label)}</button>`).join('') +
        `</div></div>`;

      const done = (value) => {
        document.removeEventListener('keydown', onKey, true);
        host.remove();
        resolve(value);
      };
      const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); done(null); } };
      host.addEventListener('click', (e) => {
        const pick = e.target.closest('[data-choice]');
        if (pick) return done(Number(pick.dataset.choice) || pick.dataset.choice);
        if (e.target === host || e.target.closest('.seven-modal-cancel')) done(null);
      });
      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(host);
      host.querySelector('[data-choice]').focus();
    });
  }

  // A modal that STAYS while the task moves through it, answering more than
  // once. The transfer walk needs this: closing and reopening a dialog for each
  // of eight presets makes the app flash at someone who is standing at the
  // instrument with both hands busy, and hides that these are eight steps of
  // one thing rather than eight separate questions.
  //
  // The caller drives it: await action() for each answer, edit the body between
  // answers, close() when the task is over. Nothing here closes on its own —
  // an Escape or an X resolves the pending action as false and leaves the
  // dialog up, because only the caller knows what stopping means.
  function open({
    title, body = '', bodyHtml = '', confirmLabel = 'OK', cancelLabel = 'Close',
    denyLabel = '', tone = '',
  }) {
    const host = document.createElement('div');
    host.className = 'seven-modal-overlay';
    host.innerHTML = shell({ title, body, bodyHtml, confirmLabel, cancelLabel, denyLabel, tone });

    const card = host.querySelector('.seven-modal');
    const bodyEl = host.querySelector('.seven-modal-body');
    const okBtn = host.querySelector('.seven-modal-ok');
    let pending = null;
    const settle = (v) => {
      if (!pending) return;
      const resolve = pending;
      pending = null;
      resolve(v);
    };
    const busy = () => card.classList.contains('is-busy');

    host.addEventListener('click', (e) => {
      if (busy()) return; // mid-step: the instrument is being written to
      if (e.target === host || e.target.closest('.seven-modal-cancel') ||
          e.target.closest('.seven-modal-deny')) settle(false);
      else if (e.target.closest('.seven-modal-ok')) settle(true);
    });
    const onKey = (e) => {
      if (!pending || busy()) return;
      if (e.key === 'Escape') { e.preventDefault(); settle(false); }
      else if (e.key === 'Enter') { e.preventDefault(); settle(true); }
    };
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(host);
    okBtn.focus();

    return {
      body: bodyEl,
      // Waiting, while the app talks to the instrument: the actions go inert
      // rather than vanish, so the dialog doesn't change shape under the hands.
      busy(on) { card.classList.toggle('is-busy', !!on); },
      action() { return new Promise((resolve) => { pending = resolve; }); },
      close() {
        document.removeEventListener('keydown', onKey, true);
        settle(false);
        host.remove();
      },
    };
  }

  global.SevenModal = { confirm, choose, open };
})(window);
