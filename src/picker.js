'use strict';

// A dropdown the app owns.
//
// A native <select> can be styled shut and not styled open: the list is drawn
// by the OS, so a panel built in the app's colours drops a grey macOS menu out
// of itself the moment you click it (Daniel, 2026-08-12). This is the same
// control with the list drawn in the page — a button plus a listbox, keyboard
// and all.
//
// Two things it does NOT do, on purpose. It does not try to be a <select> for
// forms: nothing here is submitted anywhere. And it does not animate opening;
// a menu that has to finish arriving before you can read it is slower than one
// that is simply there.
(function (global) {
  const OPEN = new Set(); // every picker currently showing its list

  function closeAll(except) {
    for (const p of [...OPEN]) if (p !== except) p.close();
  }

  // The list is position:fixed rather than absolute inside the button. The
  // trays it lives in scroll and clip their content, and an absolute list gets
  // cut off at the panel edge — which is exactly where a dropdown needs to go.
  function place(btn, list) {
    const r = btn.getBoundingClientRect();
    const margin = 8;
    list.style.minWidth = `${r.width}px`;
    list.style.left = `${r.left}px`;
    // Measure before deciding: the list may be taller than the room below.
    list.style.top = '0px';
    list.style.maxHeight = '';
    const h = list.offsetHeight;
    const below = window.innerHeight - r.bottom - margin;
    const above = r.top - margin;
    if (h <= below || below >= above) {
      list.style.top = `${r.bottom + 2}px`;
      list.style.maxHeight = `${Math.max(below, 80)}px`;
    } else {
      list.style.top = `${Math.max(margin, r.top - 2 - Math.min(h, above))}px`;
      list.style.maxHeight = `${Math.max(above, 80)}px`;
    }
    // Keep it on screen horizontally too — a 17-entry channel list opened near
    // the right edge would otherwise hang off it.
    const w = list.offsetWidth;
    if (r.left + w > window.innerWidth - margin) {
      list.style.left = `${Math.max(margin, window.innerWidth - margin - w)}px`;
    }
  }

  // options: [{ value, label }]. onChange receives the chosen value.
  // Returns the button element; the list is created on demand and removed when
  // it closes, so a picker that is never opened costs one button.
  function create({ value, options, onChange, label, disabled }) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'picker';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    if (label) btn.setAttribute('aria-label', label);
    if (disabled) btn.disabled = true;

    let current = value;
    const chosen = options.find((o) => o.value === current);
    const text = document.createElement('span');
    text.className = 'picker-text';
    text.textContent = chosen ? chosen.label : String(current);
    const caret = document.createElement('span');
    caret.className = 'picker-caret';
    caret.setAttribute('aria-hidden', 'true');
    caret.textContent = '⌄'; // the app's own caret, not the OS chevron
    btn.append(text, caret);

    let list = null;
    let active = Math.max(0, options.findIndex((o) => o.value === current));

    const api = {};

    api.close = () => {
      if (!list) return;
      list.remove();
      list = null;
      OPEN.delete(api);
      btn.setAttribute('aria-expanded', 'false');
      window.removeEventListener('resize', api.close);
      window.removeEventListener('scroll', api.close, true);
    };

    const paintActive = () => {
      if (!list) return;
      [...list.children].forEach((el, i) => {
        el.classList.toggle('is-active', i === active);
        if (i === active) {
          el.scrollIntoView({ block: 'nearest' });
          list.setAttribute('aria-activedescendant', el.id);
        }
      });
    };

    const pick = (i) => {
      const opt = options[i];
      api.close();
      btn.focus();
      if (!opt || opt.value === current) return;
      current = opt.value;
      text.textContent = opt.label;
      if (onChange) onChange(opt.value);
    };

    api.open = () => {
      if (list || btn.disabled) return;
      closeAll(api);
      list = document.createElement('div');
      list.className = 'picker-list';
      list.setAttribute('role', 'listbox');
      const uid = `pk${Math.random().toString(36).slice(2, 8)}`;
      options.forEach((o, i) => {
        const item = document.createElement('div');
        item.id = `${uid}-${i}`;
        item.className = 'picker-option';
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', String(o.value === current));
        item.textContent = o.label;
        // pointerdown, not click: a click would land after the outside-click
        // handler had already closed the list out from under it.
        item.addEventListener('pointerdown', (e) => { e.preventDefault(); pick(i); });
        item.addEventListener('pointerenter', () => { active = i; paintActive(); });
        list.appendChild(item);
      });
      document.body.appendChild(list);
      active = Math.max(0, options.findIndex((o) => o.value === current));
      place(btn, list);
      paintActive();
      OPEN.add(api);
      btn.setAttribute('aria-expanded', 'true');
      // Closing on scroll rather than following it: the list is fixed, and a
      // menu that drifts away from its button is worse than one that shuts.
      window.addEventListener('resize', api.close);
      window.addEventListener('scroll', api.close, true);
    };

    btn.addEventListener('click', () => (list ? api.close() : api.open()));
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && list) { e.preventDefault(); api.close(); return; }
      if (!list && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault(); api.open(); return;
      }
      if (!list) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(options.length - 1, active + 1); paintActive(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); paintActive(); }
      else if (e.key === 'Home') { e.preventDefault(); active = 0; paintActive(); }
      else if (e.key === 'End') { e.preventDefault(); active = options.length - 1; paintActive(); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(active); }
      else if (e.key === 'Tab') api.close();
    });
    btn.addEventListener('blur', () => { if (list) setTimeout(() => api.close(), 0); });

    btn.sevenPicker = api;
    return btn;
  }

  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.picker') || e.target.closest('.picker-list')) return;
    closeAll(null);
  });

  global.SevenPicker = { create, closeAll };
})(window);
