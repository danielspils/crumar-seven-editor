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
  // Kept in step with the .seven-modal transitions in index.html.
  const REPLACE_FADE_MS = 170;
  const REPLACE_RESIZE_MS = 340;
  // Card classes that describe what the dialog is DOING, as opposed to what it
  // is — these survive a tone change.
  const STATE = new Set(['is-busy', 'is-swapping', 'is-resizing']);

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
  // `note` is a line UNDER the buttons — the rule that explains why one of
  // them is the way it is, which belongs beside the choice rather than in the
  // question above it. A choice may be `disabled`: shown, because leaving it
  // out makes the reader wonder whether it exists, and unpickable, because it
  // is not on offer (Daniel, 2026-08-14).
  function choose({ title, body, bodyHtml = '', choices, note = '', cancelLabel = 'Close', tone = '' }) {
    return new Promise((resolve) => {
      const host = document.createElement('div');
      host.className = 'seven-modal-overlay';
      host.innerHTML =
        `<div class="seven-modal ${tone}" role="dialog" aria-modal="true" aria-label="${esc(title)}">` +
        `<button type="button" class="seven-modal-cancel" aria-label="${esc(cancelLabel)}" ` +
        `title="${esc(cancelLabel)}">` +
        '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none" ' +
        'stroke="currentColor" stroke-width="1.6" stroke-linecap="round">' +
        '<path d="M4 4l8 8M12 4l-8 8"/></svg></button>' +
        `<div class="seven-modal-title">${esc(title)}</div>` +
        `<div class="seven-modal-body">${bodyHtml || paragraphs(body)}</div>` +
        `<div class="seven-modal-actions">` +
        choices.map((c) => (
          `<button type="button" class="seven-modal-ok${c.disabled ? ' is-off' : ''}" ` +
          `data-choice="${esc(c.value)}"${c.disabled ? ' disabled' : ''}>${esc(c.label)}</button>`
        )).join('') +
        `</div>` +
        (note ? `<p class="seven-modal-note">${esc(note)}</p>` : '') +
        `</div>`;

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
      // The first choice that can actually be taken: focus on a disabled one
      // would put the keyboard somewhere Enter does nothing.
      const first = host.querySelector('[data-choice]:not([disabled])');
      if (first) first.focus();
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
    let pendingPromise = null;
    const settle = (v) => {
      if (!pending) return;
      const resolve = pending;
      pending = null;
      pendingPromise = null;
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

    const actionsEl = host.querySelector('.seven-modal-actions');
    const titleEl = host.querySelector('.seven-modal-title');
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));

    return {
      body: bodyEl,
      // Waiting, while the app talks to the instrument: the actions go inert
      // rather than vanish, so the dialog doesn't change shape under the hands.
      busy(on) { card.classList.toggle('is-busy', !!on); },
      // Turn the SAME dialog into the next thing it has to be: the old content
      // fades out, the card resizes to the new content, the new content fades
      // in. A task that ends by replacing one dialog with another makes the end
      // look like a different event from the thing that led to it — when the
      // report IS the last step of the walk, not a new conversation.
      async replace({ title: newTitle, bodyHtml: html, confirmLabel: ok, denyLabel: deny = '', tone: newTone }) {
        // ORDER MATTERS, and getting it wrong is what made this jump: the
        // height is pinned BEFORE the content changes. Swap first and the card
        // lays out at the new content's natural height for a frame — a snap to
        // the new size, then an animation from it, which reads as the jump the
        // animation was supposed to prevent.
        card.classList.add('is-resizing');
        card.style.height = `${card.offsetHeight}px`;
        card.classList.add('is-swapping');
        await wait(REPLACE_FADE_MS);

        if (newTitle != null) titleEl.textContent = newTitle;
        if (newTone != null) {
          // Keep whatever state the card is mid-way through — rewriting the
          // class list wholesale would drop the fade we are inside of.
          const state = [...card.classList].filter((c) => c.startsWith('is-') && STATE.has(c));
          card.className = ['seven-modal', newTone, ...state].join(' ');
        }
        bodyEl.innerHTML = html;
        actionsEl.innerHTML =
          (deny ? `<button type="button" class="seven-modal-deny">${esc(deny)}</button>` : '') +
          `<button type="button" class="seven-modal-ok">${esc(ok)}</button>`;

        // Measure the new content's natural height. scrollHeight is no use
        // here: with the height pinned it never reports LESS than the pin, so
        // a report shorter than the step it replaces would measure as no
        // change at all and never animate. Release to auto, read, re-pin —
        // all in one go, so no frame is painted in between.
        const pinned = card.style.height;
        card.style.height = 'auto';
        const after = card.offsetHeight;
        card.style.height = pinned;
        await new Promise((r) => requestAnimationFrame(r));
        card.style.height = `${after}px`;
        card.classList.remove('is-swapping');
        await wait(REPLACE_RESIZE_MS);
        card.style.height = '';
        card.classList.remove('is-resizing');
        const nextOk = host.querySelector('.seven-modal-ok');
        if (nextOk) nextOk.focus();
      },
      // Idempotent on purpose: a caller that races this against something else
      // (the transfer walk races it against the instrument) will ask again
      // after losing the race, and a second promise would orphan the first —
      // leaving a click that resolves nothing.
      action() {
        if (!pendingPromise) pendingPromise = new Promise((resolve) => { pending = resolve; });
        return pendingPromise;
      },
      // Throw away a wait that something else already answered. Without this,
      // a caller that wins the race another way leaves the click armed: the
      // next press settles a promise from a step that is already over, and
      // advances one the player never answered. A click while nothing is
      // pending does nothing, which is the point.
      clearPending() { pending = null; pendingPromise = null; },
      close() {
        document.removeEventListener('keydown', onKey, true);
        settle(false);
        host.remove();
      },
    };
  }

  global.SevenModal = { confirm, choose, open };
})(window);
