'use strict';

// Library body — a self-contained component: it receives display-ready data
// via update() and emits events through callbacks. NO IPC, NO disk, NO
// knowledge of where the data came from, so it can later be remounted as a
// side drawer (drag-to-stage) without a rewrite.
//
// Data in (from app.js):
//   { patches: [{ file, patchIndex, name, soundName, sampled, missing,
//                 invalid?, params }],
//     sets:    [{ name, slots: [file|null x8] }] }
//
// Events out (callbacks): onSelect(entry), onContextMenu(entry),
//   onRename(entry, newName).
//
// Internal view state only (never persisted to patch data): active tab,
// search text, selected set, selected patch file, in-progress rename.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SevenLibraryView = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const esc = (s) =>
    String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const rowKey = (e) => `${e.file} ${e.patchIndex}`;

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtDate = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  };

  // Origin line under every patch name: where this file-side patch came from.
  // Absent or unrecognised origins are IMPORTED — never "Created" (a file the
  // user drops into the folder by hand must not claim the app made it).
  function originLine(entry) {
    const o = entry.origin;
    if (o && o.kind === 'backup') {
      return `Bank ${o.bank} · Preset ${o.preset}${o.date ? ` · ${fmtDate(o.date)}` : ''}`;
    }
    if (o && o.kind === 'created' && o.date) {
      return `Created ${fmtDate(o.date)}`;
    }
    return `Imported · ${entry.file}`;
  }

  const nameCell = (entry) =>
    `<span class="name-cell"><span class="patch-name">${esc(entry.name)}</span>` +
    `<span class="lib-origin">${esc(originLine(entry))}</span></span>`;

  function badge(entry) {
    return (
      `<span class="badge ${entry.sampled ? 'badge-sampled' : 'badge-modeled'}">${entry.sampled ? 'Sampled' : 'Modeled'}</span>` +
      (entry.missing
        ? `<span class="badge badge-warn" title="Sound not in the schema sound list">⚠ Not installed</span>`
        : `<span class="badge-gap"></span>`)
    );
  }

  function renderPatchRow(entry, state) {
    if (entry.invalid) {
      return (
        `<div class="lib-row lib-row-invalid" title="${esc(entry.error || 'Unreadable file')}">` +
        `<span class="patch-name">${esc(entry.name)}</span>` +
        `<span class="patch-sound">unreadable</span>` +
        `<span class="badge badge-warn">⚠ Invalid</span><span class="badge-gap"></span>` +
        `</div>`
      );
    }
    const selected = state.selected === rowKey(entry);
    if (state.renaming === rowKey(entry)) {
      return (
        `<div class="lib-row selected lib-row-renaming" data-file="${esc(entry.file)}" data-pi="${entry.patchIndex}">` +
        `<input class="lib-rename-input" type="text" value="${esc(entry.name)}" spellcheck="false">` +
        `<span class="patch-sound">${esc(entry.soundName)}</span>` +
        badge(entry) +
        `</div>`
      );
    }
    return (
      `<button type="button" class="lib-row${selected ? ' selected' : ''}" data-file="${esc(entry.file)}" data-pi="${entry.patchIndex}">` +
      nameCell(entry) +
      `<span class="patch-sound">${esc(entry.soundName)}</span>` +
      badge(entry) +
      `</button>`
    );
  }

  function matches(entry, q) {
    if (!q) return true;
    const needle = q.toLowerCase();
    return (
      (entry.name || '').toLowerCase().includes(needle) ||
      (entry.soundName || '').toLowerCase().includes(needle)
    );
  }

  function renderAllPatches(data, state) {
    const list = data.patches
      .filter((e) => matches(e, state.search))
      .slice()
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    if (!list.length) {
      return `<div class="lib-empty">${data.patches.length
        ? 'No patches match the search.'
        : 'Patches you back up or import live here. They’re files on your computer, not slots on the instrument.'}</div>`;
    }
    return list.map((e) => renderPatchRow(e, state)).join('');
  }

  function renderSetList(data, state) {
    if (!data.sets.length) return `<div class="lib-empty">No sets yet — sets live in sets.json in the library folder.</div>`;
    return data.sets
      .map((s, i) => {
        const filled = s.slots.filter(Boolean).length;
        // Users think in patches; the 8-slot capacity is visible in the slot
        // view itself. Note the empties only when there are any.
        const label = `${filled} patch${filled === 1 ? '' : 'es'}` + (filled < 8 ? ` · ${8 - filled} empty` : '');
        return (
          `<button type="button" class="lib-row lib-set" data-set="${i}">` +
          `<span class="patch-name">${esc(s.name)}</span>` +
          `<span class="patch-sound">${label}</span>` +
          `<span class="lib-set-chev">›</span>` +
          `</button>`
        );
      })
      .join('');
  }

  function renderSetSlots(data, state) {
    const set = data.sets[state.setIndex];
    if (!set) return renderSetList(data, state);
    // First patch of a file represents it in a slot (slots reference files).
    const byFile = new Map();
    for (const e of data.patches) if (!byFile.has(e.file)) byFile.set(e.file, e);
    const rows = set.slots
      .map((file, i) => {
        const num = `<span class="slot-num">${i + 1}</span>`;
        if (!file) {
          return `<div class="lib-slot lib-slot-empty">${num}<span class="slot-text">Empty</span></div>`;
        }
        const entry = byFile.get(file);
        if (!entry) {
          return (
            `<div class="lib-slot lib-slot-missing" title="Referenced file is not in the library folder">` +
            `${num}<span class="slot-text">Missing file: ${esc(file)}</span>` +
            `<span class="badge badge-warn">⚠</span></div>`
          );
        }
        const selected = state.selected === rowKey(entry);
        return (
          `<button type="button" class="lib-slot lib-slot-patch${selected ? ' selected' : ''}" data-file="${esc(entry.file)}" data-pi="${entry.patchIndex}">` +
          `${num}${nameCell(entry)}` +
          `<span class="patch-sound">${esc(entry.soundName)}</span>` +
          badge(entry) +
          `</button>`
        );
      })
      .join('');
    return (
      `<div class="lib-set-head">` +
      `<button type="button" class="lib-back">‹ Sets</button>` +
      `<span class="lib-set-name">${esc(set.name)}</span>` +
      `</div>` +
      rows
    );
  }

  function renderBody(data, state) {
    const tab = (id, label) =>
      `<button type="button" class="seg-btn${state.tab === id ? ' active' : ''}" data-tab="${id}">${label}</button>`;
    const listHtml =
      state.tab === 'sets'
        ? state.setIndex == null
          ? renderSetList(data, state)
          : renderSetSlots(data, state)
        : renderAllPatches(data, state);
    return (
      `<div class="lib-bar">` +
      `<div class="lib-seg">${tab('patches', 'All Patches')}${tab('sets', 'Sets')}</div>` +
      `<input class="lib-search" type="search" placeholder="Search name or sound…" value="${esc(state.search)}">` +
      `</div>` +
      `<div class="lib-list">${listHtml}</div>`
    );
  }

  // Controller: owns view state, renders into `el`, wires delegated events.
  function createLibraryView({ el, on = {} }) {
    const state = { tab: 'patches', search: '', setIndex: null, selected: null, renaming: null };
    let data = { patches: [], sets: [] };

    const entryAt = (node) => {
      const file = node.dataset.file;
      const pi = Number(node.dataset.pi);
      return data.patches.find((e) => e.file === file && e.patchIndex === pi) || null;
    };

    function render() {
      el.innerHTML = renderBody(data, state);
      const input = el.querySelector('.lib-rename-input');
      if (input) {
        input.focus();
        input.select();
      }
    }

    el.addEventListener('click', (e) => {
      const seg = e.target.closest('.seg-btn');
      if (seg) {
        state.tab = seg.dataset.tab;
        state.setIndex = null;
        render();
        return;
      }
      if (e.target.closest('.lib-back')) {
        state.setIndex = null;
        render();
        return;
      }
      const set = e.target.closest('.lib-set');
      if (set) {
        state.setIndex = Number(set.dataset.set);
        render();
        return;
      }
      const row = e.target.closest('[data-file]');
      if (row && !e.target.closest('.lib-rename-input')) {
        const entry = entryAt(row);
        if (entry) {
          state.selected = rowKey(entry);
          render();
          if (on.select) on.select(entry);
        }
      }
    });

    el.addEventListener('contextmenu', (e) => {
      const row = e.target.closest('[data-file]');
      if (!row) return;
      e.preventDefault();
      const entry = entryAt(row);
      if (entry && on.contextMenu) on.contextMenu(entry);
    });

    // Search: filter as you type; input keeps focus because only .lib-list
    // would change — re-render preserves the bar? No: full re-render loses
    // focus, so patch the list innerHTML alone.
    el.addEventListener('input', (e) => {
      if (e.target.classList.contains('lib-search')) {
        state.search = e.target.value;
        const list = el.querySelector('.lib-list');
        if (list) {
          list.innerHTML =
            state.tab === 'sets'
              ? state.setIndex == null
                ? renderSetList(data, state)
                : renderSetSlots(data, state)
              : renderAllPatches(data, state);
        }
      }
    });

    el.addEventListener('keydown', (e) => {
      const input = e.target.closest('.lib-rename-input');
      if (!input) return;
      const row = input.closest('[data-file]');
      const entry = entryAt(row);
      if (e.key === 'Enter' && entry) {
        state.renaming = null;
        if (on.rename) on.rename(entry, input.value);
      } else if (e.key === 'Escape') {
        state.renaming = null;
        render();
      }
    });
    // Clicking away cancels an in-progress rename.
    el.addEventListener(
      'blur',
      (e) => {
        if (e.target.classList && e.target.classList.contains('lib-rename-input') && state.renaming) {
          state.renaming = null;
          render();
        }
      },
      true
    );

    return {
      update(next) {
        data = next;
        // Drop a selection whose row no longer exists (file trashed/renamed).
        if (state.selected && !data.patches.some((e) => state.selected === rowKey(e))) {
          state.selected = null;
        }
        render();
      },
      beginRename(entry) {
        state.renaming = rowKey(entry);
        render();
      },
      select(entry) {
        state.selected = entry ? rowKey(entry) : null;
        render();
      },
      patchCount: () => data.patches.filter((e) => !e.invalid).length,
    };
  }

  return { createLibraryView, renderBody };
});
