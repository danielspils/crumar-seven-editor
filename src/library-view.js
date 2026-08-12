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


  // Say each fact once. A backup patch is auto-named "Bank 1 Preset 7 —
  // Vibraphone", which restates the origin line AND the sound cell beside it.
  // The stored name is untouched (renaming still edits what actually exists,
  // as in the bank list) — only the display drops the part its own row already
  // states, and the sound cell goes quiet when it would echo the name.
  function displayName(entry) {
    const o = entry.origin;
    if (!o || o.kind !== 'backup') return entry.name || '';
    const re = new RegExp(`^Bank ${o.bank} Preset ${o.preset}\\s*—\\s*`);
    return (entry.name || '').replace(re, '');
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
        `<span class="patch-num">${(entry.origin || {}).kind === 'backup' ? entry.origin.preset : ''}</span>` +
        `<input class="lib-rename-input" type="text" value="${esc(displayName(entry))}" spellcheck="false">` +
        `<span class="lib-origin"></span>` +
        `<span class="patch-sound">${esc(entry.soundName)}</span>` +
        `<span class="lib-badges">${badge(entry)}</span>` +
        `</div>`
      );
    }
    const o = entry.origin || {};
    // Bank and date live in the group header, so the row carries only what is
    // its own: which preset slot, what it is called, what sound it uses. A
    // patch with no slot (created or imported here) shows its date instead.
    const lead = o.kind === 'backup' ? String(o.preset) : '';
    const context = o.kind === 'backup' ? '' : originLine(entry);
    return (
      `<button type="button" class="lib-row lib-patch${selected ? ' selected' : ''}" data-file="${esc(entry.file)}" data-pi="${entry.patchIndex}" draggable="true">` +
      `<span class="patch-num">${lead}</span>` +
      `<span class="patch-name">${esc(displayName(entry))}</span>` +
      `<span class="lib-origin">${esc(context)}</span>` +
      `<span class="patch-sound">${esc(entry.soundName)}</span>` +
      `<span class="lib-badges">${badge(entry)}</span>` +
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

  // Grouped by where a patch came from, ordered the way the instrument is:
  // Bank 1..4 by preset, then anything made or imported here. Alphabetical
  // reads as random once most rows are backups — two "Combo Piano"s from
  // different banks land together and Bank 3 sorts above Bank 2. Bank and
  // capture date belong to the whole group, so they are stated once in its
  // header rather than on all 32 rows.
  function libraryGroups(list) {
    const banks = new Map(); // bank number -> entries
    const made = [];
    const imported = [];
    for (const e of list) {
      const o = e.origin || {};
      if (e.invalid) imported.push(e);
      else if (o.kind === 'backup') {
        if (!banks.has(o.bank)) banks.set(o.bank, []);
        banks.get(o.bank).push(e);
      } else if (o.kind === 'created') made.push(e);
      else imported.push(e);
    }
    const groups = [];
    for (const bank of [...banks.keys()].sort((a, b) => a - b)) {
      const rows = banks.get(bank).sort((a, b) => a.origin.preset - b.origin.preset);
      // Slots can come from different runs, so the header only claims a date
      // when they genuinely all share one. Compared by DAY: every patch in a
      // run carries its own second-resolution capture stamp, so comparing the
      // raw timestamps would never find two alike.
      const days = [...new Set(rows.map((e) => String(e.origin.date || '').slice(0, 10)).filter(Boolean))];
      const when = days.length === 1 ? ` · backed up ${fmtDate(days[0])}` : '';
      groups.push({ title: `Bank ${bank}${when}`, rows });
    }
    if (made.length) groups.push({ title: 'Created here', rows: made });
    if (imported.length) groups.push({ title: 'Imported', rows: imported });
    return groups;
  }

  function renderAllPatches(data, state) {
    const list = data.patches.filter((e) => matches(e, state.search));
    if (!list.length) {
      return `<div class="lib-empty">${data.patches.length
        ? 'No patches match the search.'
        : 'Patches you back up or import live here. They\u2019re files on your computer, not slots on the instrument.'}</div>`;
    }
    return libraryGroups(list)
      .map(
        (g) =>
          `<div class="lib-group"><div class="lib-group-title">${esc(g.title)}</div>` +
          g.rows.map((e) => renderPatchRow(e, state)).join('') +
          `</div>`
      )
      .join('');
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
          // Delete was reachable only by right-click, which nothing advertised.
          // Same trash icon a slot uses — one vocabulary for "remove this".
          // A row is a <button>, so the icon is a sibling, not a nested button.
          `<div class="lib-row lib-setlist-row">` +
          `<button type="button" class="lib-setlist" data-setlist="${i}">` +
          `<span class="patch-name">${esc(s.name)}</span>` +
          `<span class="patch-sound">${label}</span>` +
          `</button>` +
          `<button type="button" class="setlist-send" data-setlist-send="${i}" ` +
          `title="Load “${esc(s.name)}” onto a bank on the Seven">Send to bank…</button>` +
          `<button type="button" class="setlist-delete" data-setlist-delete="${i}" ` +
          `title="Delete “${esc(s.name)}” (the patches stay in the library)">` +
          '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" ' +
          'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M2.8 4.3h10.4"/><path d="M6.4 4.3V3.1h3.2v1.2"/>' +
          '<path d="M4.2 4.3l.7 8.2a.9.9 0 0 0 .9.8h4.4a.9.9 0 0 0 .9-.8l.7-8.2"/>' +
          '<path d="M6.8 6.6v4.4M9.2 6.6v4.4"/></svg></button>' +
          `<span class="lib-setlist-chev">›</span>` +
          `</div>`
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

  // Tile colours key off the SAME family the artwork uses (sound-art.js), so
  // the stripe and the drawing can never disagree. Deliberately not the
  // renderer's engine group: that one folds every sampled sound into a single
  // "sample player" family, which painted the whole Sampled section one colour
  // while the icons underneath varied. Modeled vs sampled is already carried
  // by the section headings and the (m)/(s) tag.
  const TILE_COLOUR = {
    tine: '#e0a03a', reed: '#d9744f', grandLegs: '#5b8fd9', clavi: '#a279d9',
    synth: '#4fc3d9', rack: '#4bb39b', vibes: '#6fbf5f', grand: '#9aa3b2',
    wave: '#4caf6d', keys: '#8b8b93',
  };

  const tileColour = (name, sampled) =>
    TILE_COLOUR[window.SevenSoundArt.artKeyFor(name, sampled)] || '#8b8b93';

  // Group patches the way the user thinks of them: which backup, which bank.
  // Browsing beats searching when you can't recall a name.
  function pickGroups(list, fmt) {
    const groups = new Map();
    for (const e of list) {
      const o = e.origin || {};
      const key = o.kind === 'backup'
        ? `${o.date ? fmt(o.date) : 'Backup'} · Bank ${o.bank}`
        : o.kind === 'created' ? 'Created here' : 'Imported';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(e);
    }
    for (const rows of groups.values()) {
      rows.sort((a, b) => ((a.origin || {}).preset || 0) - ((b.origin || {}).preset || 0));
    }
    return groups;
  }

  // The instrument grid: every sound the schema knows, illustrated. Choosing
  // one assigns the SOUND, not a patch — see SOUND_REF above for why that is
  // the only honest "unedited" option we can offer.
  function renderSoundTiles(state, sounds) {
    const q = (state.pickSearch || '').trim().toLowerCase();
    const list = sounds.filter((s) => !q || s.name.toLowerCase().includes(q));
    if (!list.length) return `<div class="lib-empty">No instrument matches “${esc(q)}”.</div>`;
    const section = (title, rows) =>
      rows.length
        ? `<div class="pick-group"><div class="pick-group-title">${title}</div>` +
          `<div class="pick-grid pick-grid-art">` +
          rows.map((s) => {
            const colour = tileColour(s.name, s.sampled);
            return (
              `<button type="button" class="pick-tile pick-tile-art" data-pick-sound="${esc(s.name)}" ` +
              `style="--tile:${colour}" title="${esc(s.name)} — selects this sound and leaves the settings alone">` +
              `<span class="tile-art">${window.SevenSoundArt.iconFor(s.name, s.sampled)}</span>` +
              `<span class="tile-name">${esc(s.name)}</span></button>`
            );
          }).join('') + `</div></div>`
        : '';
    return (
      section('Modeled', list.filter((s) => !s.sampled)) +
      section('Sampled', list.filter((s) => s.sampled)) +
      `<div class="pick-note">Choosing an instrument sets the sound only — every ` +
      `parameter keeps its current setting, which is what the Seven itself does ` +
      `when the sound changes.</div>`
    );
  }

  function renderPicker(data, state, sounds, allSounds) {
    const slot = state.picking;
    const q = state.pickSearch || '';
    const list = data.patches.filter((e) => !e.invalid && matches(e, q));
    const groups = pickGroups(list, fmtDate);
    const body = list.length
      ? [...groups.entries()].map(([title, rows]) =>
          `<div class="pick-group"><div class="pick-group-title">${esc(title)}</div>` +
          `<div class="pick-grid">` +
          rows.map((e) => {
            const colour = tileColour(e.soundName, e.sampled);
            return (
              `<button type="button" class="pick-tile" data-pick-file="${esc(e.file)}" ` +
              `style="--tile:${colour}" title="${esc(e.name)} — ${esc(e.soundName)}">` +
              `<span class="tile-name">${esc(e.name)}</span>` +
              `<span class="tile-sound">${esc(e.soundName)}<span class="sound-tag">` +
              `${e.sampled ? ' (s)' : ' (m)'}</span></span>` +
              `</button>`
            );
          }).join('') +
          `</div></div>`).join('')
      : `<div class="lib-empty">No patches match “${esc(q)}”.</div>`;
    const shown = sounds
      ? renderSoundTiles(state, allSounds || [])
      : body;
    return (
      `<div class="pick-overlay">` +
      `<div class="pick-modal" role="dialog" aria-label="Choose a patch">` +
      `<div class="pick-modal-head">` +
      `<span class="pick-title">Slot ${slot + 1}</span>` +
      `<div class="pick-modes">` +
      `<button type="button" class="pick-mode${sounds ? '' : ' on'}" data-pick-mode="patches">Patches</button>` +
      `<button type="button" class="pick-mode${sounds ? ' on' : ''}" data-pick-mode="sounds">Instruments</button>` +
      `</div>` +
      `<input class="lib-search lib-autofocus" data-pick-search type="search" ` +
      `placeholder="${sounds ? 'Search instruments…' : 'Search name or sound…'}" value="${esc(q)}">` +
      `<button type="button" class="pick-cancel">Cancel</button>` +
      `</div>` +
      `<div class="pick-body">${shown}</div>` +
      `</div></div>`
    );
  }

  // A slot may hold a library file OR a bare sound, stored as "sound:<name>".
  // Sound-only exists because the device supports it exactly: 0x46 changes the
  // sound and leaves every engine parameter alone (verified 2026-08-09). No
  // invented "factory default" values are involved — there are none to have.
  const SOUND_REF = 'sound:';
  const isSoundRef = (v) => typeof v === 'string' && v.startsWith(SOUND_REF);
  const soundRefName = (v) => v.slice(SOUND_REF.length);

  function renderSetlistSlots(data, state, opts = {}) {
    const setlist = data.setlists[state.setlistIndex];
    if (!setlist) return renderSetlistList(data, state);

    // First patch of a file represents it in a slot (slots reference files).
    const byFile = new Map();
    for (const e of data.patches) if (!byFile.has(e.file)) byFile.set(e.file, e);
    // The split selection model: when a library patch is selected, every slot
    // offers an Assign target for it — both selections stay visible.
    const sel = selectedEntry(data, state);
    const assignBtn = (i) =>
      `<button type="button" class="slot-assign" data-slot-assign="${i}" title="Choose a patch for slot ${i + 1}">Assign</button>`;
    const clearBtn = (i) =>
      `<button type="button" class="slot-clear" data-slot-clear="${i}" title="Remove from slot ${i + 1} (the patch stays in the library)">` +
      '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" ' +
      'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M2.8 4.3h10.4"/><path d="M6.4 4.3V3.1h3.2v1.2"/>' +
      '<path d="M4.2 4.3l.7 8.2a.9.9 0 0 0 .9.8h4.4a.9.9 0 0 0 .9-.8l.7-8.2"/>' +
      '<path d="M6.8 6.6v4.4M9.2 6.6v4.4"/></svg></button>';
    const clearedEntry = (i) =>
      (state.lastCleared && state.lastCleared.setlist === state.setlistIndex && state.lastCleared.slot === i
        && byFile.get(state.lastCleared.file)) || null;

    const undoBtn = (i) =>
      state.lastCleared && state.lastCleared.setlist === state.setlistIndex && state.lastCleared.slot === i
        ? `<button type="button" class="slot-undo" data-slot-undo="${i}" title="Put the patch back in slot ${i + 1}">` +
          '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">' +
          '<path d="M3.5 8a4.5 4.5 0 1 1 1.4 3.3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
          '<path d="M3.2 4.6v3.1h3.1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
          '</svg></button>'
        : '';

    // Kind reads as a quiet parenthetical after the sound name — "(m)" for
    // modeled, "(s)" for sampled — with the full word on hover.
    const soundTag = (entry) => {
      const kind = entry.sampled ? 'Sampled' : 'Modeled';
      return (
        ` <span class="sound-tag" title="${kind}" aria-label="${kind}">(${entry.sampled ? 's' : 'm'})</span>` +
        (entry.missing
          ? ' <span class="sound-tag is-warn" title="Sound not installed on this instrument" aria-label="Sound not installed">(!)</span>'
          : '')
      );
    };

    const pulse = (i) =>
      state.slotPulse && state.slotPulse.slot === i ? ` slot-${state.slotPulse.kind}` : '';

    const rows = setlist.slots
      .map((file, i) => {
        const num = `<span class="slot-num">${i + 1}</span>`;
        if (!file) {
          return (
            `<div class="lib-slot lib-slot-empty${pulse(i)}" data-slot="${i}">` +
            `${num}<span class="slot-text">Empty</span><span class="lib-badges"></span>` +
            `<span class="lib-origin">${clearedEntry(i) ? esc(originLine(clearedEntry(i))) : ''}</span>` +
            `<span class="patch-sound"></span>` +
            `<span class="slot-controls">${undoBtn(i)}${assignBtn(i)}</span></div>`
          );
        }
        if (isSoundRef(file)) {
          const name = soundRefName(file);
          const spec = (opts.sounds || []).find((x) => x.name === name);
          return (
            `<div class="lib-slot lib-slot-patch lib-slot-sound${pulse(i)}" data-slot="${i}">` +
            `${num}<span class="patch-name">${esc(name)}</span>` +
            `<span class="lib-badges"></span>` +
            `<span class="lib-origin">Sound only · settings stay as they are</span>` +
            `<span class="patch-sound">${esc(name)}` +
            ` <span class="sound-tag" title="${spec && spec.sampled ? 'Sampled' : 'Modeled'}">` +
            `(${spec && spec.sampled ? 's' : 'm'})</span></span>` +
            `<span class="slot-controls">${clearBtn(i)}${assignBtn(i)}</span></div>`
          );
        }
        const entry = byFile.get(file);
        if (!entry) {
          return (
            `<div class="lib-slot lib-slot-missing" data-slot="${i}" draggable="true" title="Referenced file is not in the library folder">` +
            `${num}<span class="slot-text">Missing file: ${esc(file)}</span>` +
            `<span class="lib-badges"></span>` +
            `<span class="lib-origin"></span>` +
            `<span class="patch-sound"><span class="sound-tag is-warn" title="Referenced file is missing">(missing)</span></span>` +
            `<span class="slot-controls">${clearBtn(i)}${assignBtn(i)}</span></div>`
          );
        }
        const selected = state.selected === rowKey(entry);
        if (state.renaming === rowKey(entry)) {
          return (
            `<div class="lib-slot lib-slot-patch selected" data-slot="${i}" data-file="${esc(entry.file)}" data-pi="${entry.patchIndex}">` +
            `${num}<input class="lib-rename-input" type="text" value="${esc(displayName(entry))}" spellcheck="false">` +
            `<span class="lib-badges"></span>` +
            `<span class="lib-origin">${esc(originLine(entry))}</span>` +
            `<span class="patch-sound">${esc(entry.soundName)}${soundTag(entry)}</span>` +
            `<span class="slot-controls">${clearBtn(i)}${assignBtn(i)}</span></div>`
          );
        }
        return (
          `<div class="lib-slot lib-slot-patch${selected ? ' selected' : ''}${pulse(i)}" data-slot="${i}" data-file="${esc(entry.file)}" data-pi="${entry.patchIndex}" draggable="true">` +
          `${num}<span class="patch-name">${esc(displayName(entry))}</span>` +
          `<span class="lib-badges"></span>` +
          `<span class="lib-origin">${esc(originLine(entry))}</span>` +
          `<span class="patch-sound">${esc(entry.soundName)}${soundTag(entry)}</span>` +
          `<span class="slot-controls">${clearBtn(i)}${assignBtn(i)}</span></div>`
        );
      })
      .join('');
    state.slotPulse = null; // consumed
    const overlay = state.picking != null
      ? renderPicker(data, state, state.pickMode === 'sounds', opts.sounds)
      : '';
    return (
      overlay +
      `<div class="lib-setlist-head">` +
      `<button type="button" class="lib-back">‹ Setlists</button>` +
      `<span class="lib-setlist-name">${esc(setlist.name)}</span>` +
      `</div>` +
      rows
    );
  }

  function renderBody(data, state, sounds) {
    const tab = (id, label) =>
      `<button type="button" class="seg-btn${state.tab === id ? ' active' : ''}" data-tab="${id}">${label}</button>`;
    const listHtml =
      state.tab === 'setlists'
        ? state.setlistIndex == null
          ? renderSetlistList(data, state)
          : renderSetlistSlots(data, state, { sounds })
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
      picking: null,     // slot index whose patch is being chosen
      pickMode: 'patches', // 'patches' | 'sounds'
      pickSearch: '',
      lastCleared: null, // { setlist, slot, file } — offer back an accidental clear
      slotPulse: null,   // { slot, kind } — one-shot, consumed by the next render
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

    // Bottom-edge fades. Both scrollers here are rebuilt on every render, so
    // they are watched by selector and refreshed after each one. The list puts
    // its class on #library-body (its fade is a parent pseudo-element — see
    // scroll-fade.js for why it can't be a mask); the picker wears its own.
    const fadeList = window.SevenScrollFade.watchWithin(el, '.lib-list', el);
    const fadePicker = window.SevenScrollFade.watchWithin(el, '.pick-body');
    const updateFade = () => { fadeList(); fadePicker(); };

    function render() {
      const viewKey = `${state.tab}:${state.setlistIndex}`;
      const prevList = el.querySelector('.lib-list');
      const keepScroll = prevList && lastViewKey === viewKey ? prevList.scrollTop : null;
      el.innerHTML = renderBody(data, state, on.sounds);
      if (keepScroll != null) {
        const list = el.querySelector('.lib-list');
        if (list) list.scrollTop = keepScroll;
      }
      lastViewKey = viewKey;
      updateFade();
      if (state.revealFile) {
        const row = el.querySelector(`[data-file="${CSS.escape(state.revealFile)}"]`);
        state.revealFile = null;
        if (row) row.scrollIntoView({ block: 'nearest' });
      }
      const input = el.querySelector('.lib-rename-input, .lib-autofocus');
      if (input) {
        input.focus();
        input.select();
      }
    }

    // Double-click a name to rename. Tracked by row key with a timer, not via
    // the dblclick event: the first click re-renders the list, so the second
    // click would land on a fresh node and never pair up.
    let lastNameClick = { key: null, t: 0 };
    let openTimer = null;

    el.addEventListener('click', (e) => {
      const nameEl = e.target.closest('.patch-name');
      if (nameEl) {
        const setlistRow = nameEl.closest('[data-setlist]');
        const patchRow = nameEl.closest('[data-file]');
        const key = setlistRow ? `s${setlistRow.dataset.setlist}`
          : patchRow ? `p${patchRow.dataset.file}:${patchRow.dataset.pi}` : null;
        const now = Date.now();
        if (key && lastNameClick.key === key && now - lastNameClick.t < 450) {
          clearTimeout(openTimer);
          lastNameClick = { key: null, t: 0 };
          if (setlistRow) state.renamingSetlist = Number(setlistRow.dataset.setlist);
          else {
            const entry = entryAt(patchRow);
            if (entry) state.renaming = rowKey(entry);
          }
          render();
          return;
        }
        lastNameClick = { key, t: now };
        if (setlistRow && setlistRow.classList.contains('lib-setlist')) {
          const index = Number(setlistRow.dataset.setlist);
          clearTimeout(openTimer);
          openTimer = setTimeout(() => {
            state.setlistIndex = index;
            render();
          }, 260);
          return;
        }
      }

      const seg = e.target.closest('.seg-btn');
      if (seg) {
        state.tab = seg.dataset.tab;
        state.setlistIndex = null;
        render();
        return;
      }
      if (e.target.closest('.lib-back') && !e.target.closest('.pick-cancel')) {
        state.setlistIndex = null;
        state.lastCleared = null;
        state.picking = null;
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
        state.picking = Number(assign.dataset.slotAssign);
        state.pickSearch = '';
        render();
        return;
      }
      const send = e.target.closest('[data-setlist-send]');
      if (send) {
        const i = Number(send.dataset.setlistSend);
        if (data.setlists[i] && on.sendSetlist) on.sendSetlist(i, data.setlists[i].name);
        return;
      }

      const del = e.target.closest('[data-setlist-delete]');
      if (del) {
        const i = Number(del.dataset.setlistDelete);
        if (data.setlists[i] && on.deleteSetlist) on.deleteSetlist(i, data.setlists[i].name);
        return;
      }

      const mode = e.target.closest('[data-pick-mode]');
      if (mode) {
        state.pickMode = mode.dataset.pickMode;
        state.pickSearch = '';
        render();
        return;
      }

      const pickSound = e.target.closest('[data-pick-sound]');
      if (pickSound && state.picking != null) {
        const slot = state.picking;
        const name = pickSound.dataset.pickSound;
        state.picking = null;
        state.pickSearch = '';
        state.slotPulse = { slot, kind: 'restored' };
        on.assignSlot(state.setlistIndex, slot, `${SOUND_REF}${name}`);
        return;
      }

      const pick = e.target.closest('[data-pick-file]');
      if (pick) {
        const slot = state.picking;
        state.picking = null;
        state.pickSearch = '';
        if (on.assignSlot) on.assignSlot(state.setlistIndex, slot, pick.dataset.pickFile);
        return;
      }
      if (e.target.classList.contains('pick-overlay') || e.target.closest('.pick-cancel')) {
        state.picking = null;
        state.pickSearch = '';
        render();
        return;
      }
      const undo = e.target.closest('[data-slot-undo]');
      if (undo) {
        const u = state.lastCleared;
        state.lastCleared = null;
        if (u) state.slotPulse = { slot: u.slot, kind: 'restored' };
        if (u && on.assignSlot) on.assignSlot(u.setlist, u.slot, u.file);
        return;
      }
      const clear = e.target.closest('[data-slot-clear]');
      if (clear) {
        const slot = Number(clear.dataset.slotClear);
        const setlist = data.setlists[state.setlistIndex];
        // Clearing a slot is one click and easy to do by accident; hold what
        // it removed so the empty slot can offer it straight back.
        state.lastCleared = setlist
          ? { setlist: state.setlistIndex, slot, file: setlist.slots[slot] }
          : null;
        state.slotPulse = { slot, kind: 'cleared' };
        if (on.clearSlot) on.clearSlot(state.setlistIndex, slot);
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
          // Tell app.js whether this click was inside a setlist, which is
          // what decides between "select" and "select and play".
          if (on.select) on.select(entry, { inSetlist: state.setlistIndex != null });
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
      if (e.target.dataset.pickSearch !== undefined) {
        state.pickSearch = e.target.value;
        const overlay = el.querySelector('.pick-overlay');
        if (overlay) {
          overlay.outerHTML =
            renderPicker(data, state, state.pickMode === 'sounds', on.sounds);
        }
        const field = el.querySelector('[data-pick-search]');
        if (field) { field.focus(); field.setSelectionRange(field.value.length, field.value.length); }
        return;
      }
      if (e.target.classList.contains('lib-search')) {
        state.search = e.target.value;
        const list = el.querySelector('.lib-list');
        if (list) {
          list.innerHTML =
            state.tab === 'setlists'
              ? state.setlistIndex == null
                ? renderSetlistList(data, state)
                : renderSetlistSlots(data, state, { sounds: on.sounds })
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
    // Clicking away COMMITS an in-progress inline edit. It used to discard it
    // silently, which read as "the rename didn't stick" — you only got your
    // name if you happened to press Enter. Escape still cancels: it clears the
    // renaming state before the input goes away, so the guards below are false
    // by the time blur fires. Enter is likewise already committed and guarded.
    el.addEventListener(
      'blur',
      (e) => {
        const cls = e.target.classList;
        if (!cls) return;
        const value = String(e.target.value || '').trim();
        if (cls.contains('lib-rename-input') && state.renaming != null) {
          const row = e.target.closest('[data-file]');
          const entry = row ? entryAt(row) : null;
          state.renaming = null;
          if (entry && value && value !== displayName(entry) && on.rename) on.rename(entry, value);
          else render();
        } else if (cls.contains('setlist-input') && (state.creatingSetlist || state.renamingSetlist != null)) {
          const creating = e.target.dataset.setlistCreate !== undefined;
          const index = Number(e.target.dataset.setlistRename);
          state.creatingSetlist = false;
          state.renamingSetlist = null;
          if (!value) render();
          else if (creating && on.createSetlist) on.createSetlist(value);
          else if (!creating && on.renameSetlist) on.renameSetlist(index, value);
          else render();
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
      // Scroll a file's row into view on the next render, and select it.
      reveal(file, patchIndex) {
        state.revealFile = file;
        state.selected = `${file} ${patchIndex || 0}`;
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
