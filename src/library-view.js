'use strict';

// Library body — a self-contained component: it receives display-ready data
// via update() and emits events through callbacks. NO IPC, NO disk, NO
// knowledge of where the data came from, so it can later be remounted as a
// side drawer (drag-to-stage) without a rewrite.
//
// Data in (from app.js):
//   { patches: [{ file, patchIndex, name, soundName, sampled, missing,
//                 invalid?, params }],
//     setlists: [{ name, slots: [file|null x8] }] }
//
// Events out (callbacks): onSelect(entry), onContextMenu(entry),
//   onRename(entry, newName).
//
// Internal view state only (never persisted to patch data): active tab,
// search text, selected setlist, selected patch file, in-progress rename.

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
        `<div class="lib-row lib-patch selected lib-row-renaming" data-file="${esc(entry.file)}" data-pi="${entry.patchIndex}">` +
        `<input class="lib-rename-input" type="text" value="${esc(entry.name)}" spellcheck="false">` +
        `<span class="lib-badges">${badge(entry)}</span>` +
        `<span class="lib-origin">${esc(originLine(entry))}</span>` +
        `<span class="patch-sound">${esc(entry.soundName)}</span>` +
        `</div>`
      );
    }
    return (
      `<button type="button" class="lib-row lib-patch${selected ? ' selected' : ''}" data-file="${esc(entry.file)}" data-pi="${entry.patchIndex}" draggable="true">` +
      `<span class="patch-name">${esc(entry.name)}</span>` +
      `<span class="lib-badges">${badge(entry)}</span>` +
      `<span class="lib-origin">${esc(originLine(entry))}</span>` +
      `<span class="patch-sound">${esc(entry.soundName)}</span>` +
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

  function renderSetlistList(data, state) {
    const rows = data.setlists
      .map((s, i) => {
        if (state.renamingSetlist === i) {
          return (
            `<div class="lib-row lib-setlist-renaming" data-setlist="${i}">` +
            `<input class="setlist-input lib-autofocus" data-setlist-rename="${i}" type="text" value="${esc(s.name)}" spellcheck="false">` +
            `</div>`
          );
        }
        const filled = s.slots.filter(Boolean).length;
        // Users think in patches; the 8-slot capacity is visible in the slot
        // view itself. Note the empties only when there are any.
        const label = `${filled} patch${filled === 1 ? '' : 'es'}` + (filled < 8 ? ` · ${8 - filled} empty` : '');
        return (
          `<button type="button" class="lib-row lib-setlist" data-setlist="${i}">` +
          `<span class="patch-name">${esc(s.name)}</span>` +
          `<span class="patch-sound">${label}</span>` +
          `<span class="lib-setlist-chev">›</span>` +
          `</button>`
        );
      })
      .join('');
    const create = state.creatingSetlist
      ? `<div class="lib-row lib-setlist-renaming"><input class="setlist-input lib-autofocus" data-setlist-create type="text" placeholder="Setlist name…" spellcheck="false"></div>`
      : `<button type="button" class="lib-new-setlist">＋ New setlist</button>`;
    const empty = !data.setlists.length && !state.creatingSetlist
      ? `<div class="lib-empty">No setlists yet. A setlist is a bank’s worth of patches — 8 slots — staged for a gig or a transfer.</div>`
      : '';
    return empty + rows + create;
  }

  const selectedEntry = (data, state) =>
    (state.selected && data.patches.find((e) => state.selected === rowKey(e))) || null;

  function renderSetlistSlots(data, state) {
    const setlist = data.setlists[state.setlistIndex];
    if (!setlist) return renderSetlistList(data, state);
    // First patch of a file represents it in a slot (slots reference files).
    const byFile = new Map();
    for (const e of data.patches) if (!byFile.has(e.file)) byFile.set(e.file, e);
    // The split selection model: when a library patch is selected, every slot
    // offers an Assign target for it — both selections stay visible.
    const sel = selectedEntry(data, state);
    const assignBtn = (i) =>
      sel
        ? `<button type="button" class="slot-assign" data-slot-assign="${i}" title="Assign “${esc(sel.name)}” to slot ${i + 1}">Assign</button>`
        : '';
    const clearBtn = (i) =>
      `<button type="button" class="slot-clear" data-slot-clear="${i}" title="Remove from slot ${i + 1} (the patch stays in the library)">✕</button>`;
    const rows = setlist.slots
      .map((file, i) => {
        const num = `<span class="slot-num">${i + 1}</span>`;
        if (!file) {
          return (
            `<div class="lib-slot lib-slot-empty" data-slot="${i}">` +
            `${num}<span class="slot-text">Empty</span>${assignBtn(i)}</div>`
          );
        }
        const entry = byFile.get(file);
        if (!entry) {
          return (
            `<div class="lib-slot lib-slot-missing" data-slot="${i}" draggable="true" title="Referenced file is not in the library folder">` +
            `${num}<span class="slot-text">Missing file: ${esc(file)}</span>` +
            `<span class="badge badge-warn">⚠</span>${assignBtn(i)}${clearBtn(i)}</div>`
          );
        }
        const selected = state.selected === rowKey(entry);
        return (
          `<div class="lib-slot lib-slot-patch${selected ? ' selected' : ''}" data-slot="${i}" data-file="${esc(entry.file)}" data-pi="${entry.patchIndex}" draggable="true">` +
          `${num}${nameCell(entry)}` +
          `<span class="patch-sound">${esc(entry.soundName)}</span>` +
          badge(entry) +
          `${assignBtn(i)}${clearBtn(i)}</div>`
        );
      })
      .join('');
    return (
      `<div class="lib-setlist-head">` +
      `<button type="button" class="lib-back">‹ Setlists</button>` +
      `<span class="lib-setlist-name">${esc(setlist.name)}</span>` +
      `</div>` +
      rows
    );
  }

  function renderBody(data, state) {
    const tab = (id, label) =>
      `<button type="button" class="seg-btn${state.tab === id ? ' active' : ''}" data-tab="${id}">${label}</button>`;
    const listHtml =
      state.tab === 'setlists'
        ? state.setlistIndex == null
          ? renderSetlistList(data, state)
          : renderSetlistSlots(data, state)
        : renderAllPatches(data, state);
    return (
      `<div class="lib-bar">` +
      `<div class="lib-seg">${tab('patches', 'All Patches')}${tab('setlists', 'Setlists')}</div>` +
      `<input class="lib-search" type="search" placeholder="Search name or sound…" value="${esc(state.search)}">` +
      `</div>` +
      `<div class="lib-list">${listHtml}</div>`
    );
  }

  // Controller: owns view state, renders into `el`, wires delegated events.
  function createLibraryView({ el, on = {} }) {
    const state = {
      tab: 'patches',
      search: '',
      setlistIndex: null,
      selected: null,
      renaming: null,
      renamingSetlist: null,
      creatingSetlist: false,
    };
    let data = { patches: [], setlists: [] };

    const entryAt = (node) => {
      const file = node.dataset.file;
      const pi = Number(node.dataset.pi);
      return data.patches.find((e) => e.file === file && e.patchIndex === pi) || null;
    };

    // Re-rendering replaces .lib-list, which would snap scroll back to the
    // top on every selection click. Preserve scroll position — but only when
    // the re-render shows the SAME view (tab + setlist); a genuine view
    // change starts at the top.
    let lastViewKey = null;

    function render() {
      const viewKey = `${state.tab}:${state.setlistIndex}`;
      const prevList = el.querySelector('.lib-list');
      const keepScroll = prevList && lastViewKey === viewKey ? prevList.scrollTop : null;
      el.innerHTML = renderBody(data, state);
      if (keepScroll != null) {
        const list = el.querySelector('.lib-list');
        if (list) list.scrollTop = keepScroll;
      }
      lastViewKey = viewKey;
      const input = el.querySelector('.lib-rename-input, .lib-autofocus');
      if (input) {
        input.focus();
        input.select();
      }
    }

    el.addEventListener('click', (e) => {
      const seg = e.target.closest('.seg-btn');
      if (seg) {
        state.tab = seg.dataset.tab;
        state.setlistIndex = null;
        render();
        return;
      }
      if (e.target.closest('.lib-back')) {
        state.setlistIndex = null;
        render();
        return;
      }
      if (e.target.closest('.lib-new-setlist')) {
        state.creatingSetlist = true;
        render();
        return;
      }
      // Slot controls come before row selection — they sit inside slot rows.
      const assign = e.target.closest('[data-slot-assign]');
      if (assign) {
        const sel = selectedEntry(data, state);
        if (sel && on.assignSlot) on.assignSlot(state.setlistIndex, Number(assign.dataset.slotAssign), sel.file);
        return;
      }
      const clear = e.target.closest('[data-slot-clear]');
      if (clear) {
        if (on.clearSlot) on.clearSlot(state.setlistIndex, Number(clear.dataset.slotClear));
        return;
      }
      const setlistRow = e.target.closest('.lib-setlist');
      if (setlistRow) {
        state.setlistIndex = Number(setlistRow.dataset.setlist);
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
      const setlistRow = e.target.closest('.lib-setlist');
      if (setlistRow) {
        e.preventDefault();
        const i = Number(setlistRow.dataset.setlist);
        if (data.setlists[i] && on.setlistMenu) on.setlistMenu(i, data.setlists[i].name);
        return;
      }
      const row = e.target.closest('[data-file]');
      if (!row) return;
      e.preventDefault();
      const entry = entryAt(row);
      if (entry && on.contextMenu) on.contextMenu(entry);
    });

    // ---- Drag and drop -------------------------------------------------------
    // Two drags: a patch row (assign into a slot) and a slot row (reorder by
    // swap). Spring-loaded targets let a patch drag cross into the Setlists
    // tab and into a specific setlist without dropping.
    el.addEventListener('dragstart', (e) => {
      const slotRow = e.target.closest('.lib-slot[data-slot]');
      if (slotRow && state.tab === 'setlists') {
        e.dataTransfer.setData('text/seven-slot', slotRow.dataset.slot);
        e.dataTransfer.effectAllowed = 'move';
        return;
      }
      const row = e.target.closest('.lib-row[data-file]');
      if (row) {
        const entry = entryAt(row);
        if (entry) {
          e.dataTransfer.setData('text/seven-file', entry.file);
          e.dataTransfer.effectAllowed = 'copy';
        }
      }
    });
    el.addEventListener('dragenter', (e) => {
      if (!e.dataTransfer.types.includes('text/seven-file')) return;
      // Spring-loading: hovering the Setlists tab opens it; hovering a
      // setlist row opens its slots.
      const seg = e.target.closest('.seg-btn[data-tab="setlists"]');
      if (seg && state.tab !== 'setlists') {
        state.tab = 'setlists';
        state.setlistIndex = null;
        render();
        return;
      }
      const setlistRow = e.target.closest('.lib-setlist');
      if (setlistRow) {
        state.setlistIndex = Number(setlistRow.dataset.setlist);
        render();
      }
    });
    el.addEventListener('dragover', (e) => {
      const slot = e.target.closest('[data-slot]');
      const types = e.dataTransfer.types;
      if (slot && (types.includes('text/seven-file') || types.includes('text/seven-slot'))) {
        e.preventDefault(); // allow the drop
        slot.classList.add('drop-target');
      }
    });
    el.addEventListener('dragleave', (e) => {
      const slot = e.target.closest('[data-slot]');
      if (slot) slot.classList.remove('drop-target');
    });
    el.addEventListener('drop', (e) => {
      const slot = e.target.closest('[data-slot]');
      if (!slot) return;
      e.preventDefault();
      slot.classList.remove('drop-target');
      const to = Number(slot.dataset.slot);
      const fromSlot = e.dataTransfer.getData('text/seven-slot');
      if (fromSlot !== '') {
        const from = Number(fromSlot);
        if (from !== to && on.moveSlot) on.moveSlot(state.setlistIndex, from, to);
        return;
      }
      const file = e.dataTransfer.getData('text/seven-file');
      if (file && on.assignSlot) on.assignSlot(state.setlistIndex, to, file);
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
            state.tab === 'setlists'
              ? state.setlistIndex == null
                ? renderSetlistList(data, state)
                : renderSetlistSlots(data, state)
              : renderAllPatches(data, state);
        }
      }
    });

    el.addEventListener('keydown', (e) => {
      // Setlist create / rename inputs.
      const slInput = e.target.closest('.setlist-input');
      if (slInput) {
        if (e.key === 'Enter') {
          const value = slInput.value.trim();
          if (slInput.dataset.setlistCreate !== undefined) {
            state.creatingSetlist = false;
            if (value && on.createSetlist) on.createSetlist(value);
            else render();
          } else {
            const i = Number(slInput.dataset.setlistRename);
            state.renamingSetlist = null;
            if (value && on.renameSetlist) on.renameSetlist(i, value);
            else render();
          }
        } else if (e.key === 'Escape') {
          state.creatingSetlist = false;
          state.renamingSetlist = null;
          render();
        }
        return;
      }
      // Patch rename input.
      const input = e.target.closest('.lib-rename-input');
      if (!input) return;
      const row = input.closest('[data-file]');
      const entry = row ? entryAt(row) : null;
      if (e.key === 'Enter' && entry) {
        state.renaming = null;
        if (on.rename) on.rename(entry, input.value);
      } else if (e.key === 'Escape') {
        state.renaming = null;
        render();
      }
    });
    // Clicking away cancels any in-progress inline edit.
    el.addEventListener(
      'blur',
      (e) => {
        const cls = e.target.classList;
        if (!cls) return;
        if (cls.contains('lib-rename-input') && state.renaming != null) {
          state.renaming = null;
          render();
        } else if (cls.contains('setlist-input') && (state.creatingSetlist || state.renamingSetlist != null)) {
          state.creatingSetlist = false;
          state.renamingSetlist = null;
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
        // A deleted setlist may leave the index dangling.
        if (state.setlistIndex != null && state.setlistIndex >= data.setlists.length) {
          state.setlistIndex = null;
        }
        render();
      },
      beginRename(entry) {
        state.renaming = rowKey(entry);
        render();
      },
      beginSetlistRename(index) {
        state.tab = 'setlists';
        state.renamingSetlist = index;
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
