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

  // Four banks of eight. A backup run cannot capture more than this many.
  const SLOT_COUNT = 32;

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtDate = (iso) => {
    // "2026-08-13" parses as UTC midnight, which is 13 Aug only east of
    // Greenwich — here it rendered as 12 Aug (Daniel, 2026-08-13). Date-only
    // strings are calendar dates, so read them as local.
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
    const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  };

  // How long ago, in the units a person would use. "Created 13 Aug" makes you
  // work out how old that is; "created 3 days ago" is the answer
  // (Daniel, 2026-08-13). Absolute dates stay where they identify a thing
  // rather than describe its age — a backup is "13 Aug", because that is its
  // name.
  const ago = (iso, now = new Date()) => {
    // Not merely tidiness: `new Date(null)` is the EPOCH, not an invalid date,
    // so a missing stamp reaching here rendered "57 years ago" rather than
    // nothing at all.
    if (iso == null || iso === '') return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
    const then = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso);
    if (Number.isNaN(then.getTime())) return '';
    // CALENDAR days in local time, not 24-hour blocks. Stamps are full UTC
    // instants (`verified`/`captured`), and dividing the elapsed milliseconds
    // called a patch verified at 12:04 yesterday "today" until lunchtime, and
    // one from Tuesday evening "2 days ago" on Friday morning (Daniel,
    // 2026-08-14 — measured against his own library). A person counting days
    // counts date changes, so this counts date changes.
    const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    // Rounded, not floored: a day boundary is 23 or 25 hours across a DST
    // change, and flooring that turns one of them into zero.
    const days = Math.round((midnight(now) - midnight(then)) / 86400000);
    if (days <= 0) return 'today';
    if (days === 1) return '1 day ago';
    if (days < 14) return `${days} days ago`;
    if (days < 60) {
      const weeks = Math.round(days / 7);
      return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
    }
    const months = Math.round(days / 30.44);
    if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
    const years = Math.round(days / 365.25);
    return `${years} year${years === 1 ? '' : 's'} ago`;
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
      return `Created ${ago(o.date)}`;
    }
    return `Imported · ${entry.file}`;
  }


  // Say each fact once. A backup patch is auto-named "Bank 1 Preset 7 —
  // Vibraphone", which restates the origin line AND the sound cell beside it.
  // The stored name is untouched (renaming still edits what actually exists,
  // as in the bank list) — only the display drops the part its own row already
  // states, and the sound cell goes quiet when it would echo the name.
  function displayName(entry) {
    // Any "Bank N Preset M — " prefix, not only one matching this patch's own
    // origin: a COPY keeps the prefix in its stored name while having no slot
    // of its own, and showed up as "Bank 1 …" truncated (Daniel, 2026-08-13).
    return String(entry.name || '').replace(/^Bank\s*\d+\s*Preset\s*\d+\s*—\s*/, '');
  }

  // The pill holds BOTH words and shows one at a time: "Model" at rest, the
  // instrument's name while the pointer is on it. The sound had a column of
  // its own, which on most rows repeated the patch's name and on the rest
  // took width from it — so the fact moved into the badge that was already
  // there to classify it (Daniel, 2026-08-13).
  // A capture of the factory bank. It is worth marking on the row because
  // those files behave differently from everything around them: they seed
  // every generated patch of that model, so the app copies rather than edits
  // them in place (Daniel, 2026-08-14).
  const isFactoryCapture = (entry) => !!(entry.origin && entry.origin.bank === 1);
  const factoryBadge = (entry) => (isFactoryCapture(entry)
    ? '<span class="badge badge-factory" title="Crumar factory preset, captured from Bank 1. ' +
      'Generated patches of this model are seeded from it, so edits are made on a copy.">' +
      'Crumar preset</span>'
    : '');

  function badge(entry) {
    const kind = entry.sampled ? 'Sample' : 'Model';
    return (
      `<span class="badge ${entry.sampled ? 'badge-sampled' : 'badge-modeled'}" ` +
      `title="${esc(entry.soundName || kind)}">` +
      `<span class="badge-kind">${kind}</span>` +
      `<span class="badge-sound">${esc(entry.soundName || kind)}</span></span>` +
      factoryBadge(entry) +
      (entry.missing
        ? `<span class="badge badge-warn" title="Sound not in the schema sound list">⚠ Not installed</span>`
        : `<span class="badge-gap"></span>`)
    );
  }

  function renderPatchRow(entry, state, opts = {}) {
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
    // The preset number and the bank BOTH belong to a row only where the view
    // does not already say them. Inside a backup run the bank is the group
    // heading, so the row carries the number alone; in the flat Patches list
    // there is no heading at all, so the row must say where it came from and
    // the bare number means nothing (Daniel, 2026-08-13).
    const inRun = !!opts.inRun;
    // Inside a backup the number is the PRESET — that is the record. In the
    // flat list it is just the row's position, to give the eye something to
    // count down (Daniel, 2026-08-13); it renumbers as you search, because it
    // describes the list you are looking at rather than the patch.
    const lead = inRun && o.kind === 'backup' ? String(o.preset)
      : (opts.n ? String(opts.n) : '');
    // A patch you made carries its date in the TOOLTIP, not in the row. It is
    // the least useful fact on the line and it was taking a column from things
    // that identify the patch (Daniel, 2026-08-13).
    // Where it came FROM is history and belongs to the Backups tab — but how
    // OLD it is belongs here, for the patches you made: "created 3 days ago"
    // is the answer to a question a date makes you work out
    // (Daniel, 2026-08-13). A captured patch says nothing: its row is already
    // identified by the backup it came from.
    // Every patch says its age, and the verb says how it got here — in the
    // words the app already uses elsewhere. "Captured" was the file format's
    // internal term leaking into the window; the button says "Back up
    // instrument", so the row says "backed up" (Daniel, 2026-08-13).
    // NO DATE. This list is current state now — the newest record per slot —
    // so "backed up today" on every row is a column of the same word, and for
    // a patch you made the date was already the least useful thing on the line.
    // Dates live in Backups, where they distinguish one run from another
    // (Daniel, 2026-08-16).
    const context = '';
    // The sound cell is NEWS, not a column that must be filled: it appears
    // only when the instrument differs from what the patch is called. Most
    // rows are quiet, because a backup patch is auto-named after its own
    // sound — and where it does speak, something happened worth seeing ("Reed
    // Piano copy" holding an Electric Grand means that patch was auditioned
    // onto a different instrument and saved).
    //
    // A trailing "copy" does not make it news, which is why it is stripped
    // before comparing (Daniel, 2026-08-13).
    const name = displayName(entry);
    const bare = name.replace(/\s+copy(\s*\d+)?$/i, '').trim().toLowerCase();
    const echoes = bare === String(entry.soundName).trim().toLowerCase();
    // Only when it says something the row does not. It was repeating the
    // name back at you on every row (Daniel, 2026-08-13).
    const tip = echoes ? '' : entry.soundName;
    return (
      `<span class="lib-row-wrap">` +
      `<button type="button" class="lib-row lib-patch${selected ? ' selected' : ''}" data-file="${esc(entry.file)}" data-pi="${entry.patchIndex}" draggable="true"${tip ? ` title="${esc(tip)}"` : ''}>` +
      `<span class="patch-num">${lead}</span>` +
      `<span class="patch-name">${esc(name)}</span>` +
      `<span class="lib-origin">${esc(context)}</span>` +
      `<span class="patch-sound"></span>` +
      // The Patches list carries NO pill. Which engine a patch uses is
      // answered the moment you select it — the centre column says it in
      // words, with the instrument drawn beside it — so in a list of forty
      // rows it was forty repetitions of something you learn on click
      // (Daniel, 2026-08-13). Rows inside a backup keep theirs.
      `<span class="lib-badges">${opts.flat ? factoryBadge(entry) : badge(entry)}</span>` +
      `</button>` +
      // A button cannot contain a button, so the delete is a SIBLING and the
      // wrapper positions it over the row's right edge.
      `<button type="button" class="patch-delete" data-patch-delete="${esc(entry.file)}" ` +
      `data-pi="${entry.patchIndex}" title="Delete “${esc(name)}”">` +
      '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" ' +
        'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M2.8 4.3h10.4"/><path d="M6.4 4.3V3.1h3.2v1.2"/>' +
        '<path d="M4.2 4.3l.7 8.2a.9.9 0 0 0 .9.8h4.4a.9.9 0 0 0 .9-.8l.7-8.2"/>' +
        '<path d="M6.8 6.6v4.4M9.2 6.6v4.4"/></svg>' + '</button>' +
      `</span>`
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
    // YOUR patches — the ones made outside a backup run. A captured patch
    // belongs to the backup it came from, and listing it here too made the
    // three tabs overlap (Daniel, 2026-08-13). The cost, accepted: you cannot
    // browse every Rhodes you have ever had in one place; a captured one is
    // reached through its backup.
    const list = data.patches.filter(
      (e) => inList(e, newestPerSlot(data.patches)) && matches(e, state.search)
    );
    if (!list.length) {
      return `<div class="lib-empty">${data.patches.length
        ? 'No patches match the search.'
        : 'Patches you save or import live here. Ones read off the Seven live under Backups.'}</div>`;
    }
    // FLAT, newest first. It used to group by bank with dated headings — which
    // is exactly what a backup is, so the two tabs showed the same list twice
    // (Daniel, 2026-08-13).
    //
    // It then sorted by NAME, and the name it sorted by was the stored one:
    // a copy keeps its "Bank 1 Preset 4 — " prefix, which the row strips
    // before drawing it. So six patches whose visible names run Tine, Reed,
    // Clavi, DX, MKS, Vibraphone were in perfect order — by an invisible
    // string — and looked shuffled (Daniel, 2026-08-14).
    //
    // Sorted by the date the row itself shows, so the order and the "created
    // …" column tell the same story, and the newest thing you saved is at the
    // top where you left it. Same rule as the Setlists tab. Ties fall back to
    // the name you can SEE.
    return orderedPatches(list, data)
      .map((e, i) => renderPatchRow(e, state, { flat: true, n: i + 1 }))
      .join('');
  }

  // ---- ordering ------------------------------------------------------------
  //
  // Both lists sort by RECENCY until you drag a row, and then they hold the
  // order you put them in (Daniel, 2026-08-14). One rule covers the awkward
  // case in both: something the order has never seen — a patch saved since,
  // a setlist just made — is not in it, so it goes to the TOP, newest of them
  // first. New things arrive where you are looking rather than at the bottom
  // of a list you have arranged.
  const patchKey = (e) => `${e.file}#${e.patchIndex || 0}`;
  // WHEN IT LAST CHANGED — not when it was last confirmed. A backup run that
  // finds a slot unchanged re-stamps `verified`, which is the instrument
  // agreeing rather than anything happening to the patch; sorting on that put
  // 32 untouched captures above the patch you edited an hour ago. `captured`
  // moves when values are read or when live edits are saved back, and
  // `date` is when a patch you made was made (Daniel, 2026-08-16).
  const patchWhen = (e) => {
    const o = e.origin || {};
    return String(o.captured || o.date || '');
  };

  // Which patches a scope admits. `mine` is what the tab always showed.
  const isFromSeven = (e) => (e.origin || {}).kind === 'backup';

  // CURRENT STATE, not history. A slot backed up five times has five records
  // on disk, all called "Bank 3 Preset 1 — Tine Piano", told apart only by a
  // date — a wall of near-duplicates where the answer to "what is on my Seven"
  // should be at most 32 rows. So this list carries the NEWEST record per slot
  // and the older ones stay exactly where they are: on disk, and reachable
  // through Backups, which is where dates belong (Daniel, 2026-08-16).
  //
  // Nothing is deleted and nothing is hidden from the tab that is about
  // history. The accepted consequence is that a superseded version cannot be
  // sent straight from Patches: restoring one goes through Backups, which
  // should be a deliberate act.
  const slotKey = (e) => `${e.origin.bank}:${e.origin.preset}`;
  const capturedAt = (e) => String((e.origin || {}).date || (e.origin || {}).captured || '');

  function newestPerSlot(patches) {
    const best = new Map();
    for (const e of patches) {
      if (e.invalid || !isFromSeven(e)) continue;
      const k = slotKey(e);
      const prev = best.get(k);
      // Ties go to the one listed later: same date, and the list is already in
      // a stable order, so this picks one rather than flickering between them.
      if (!prev || capturedAt(e) >= capturedAt(prev)) best.set(k, e);
    }
    return new Set([...best.values()]);
  }

  // ONE LIST. There were three sub-tabs — My patches, From the Seven, All —
  // and the distinction was not real: apart from Bank 1's eight factory
  // presets, everything here is yours or yours to change, and those eight
  // already wear a badge (Daniel, 2026-08-16). What is left is a membership
  // test: every patch, minus superseded captures of a slot.
  const inList = (e, current) => {
    if (e.invalid) return false;
    return !isFromSeven(e) || !current || current.has(e);
  };

  // A capture is filed by WHERE IT CAME FROM, not by its name. Five Tine
  // Pianos and four DX captures sorted alphabetically are a wall of
  // near-duplicates; in slot order they are a map of the instrument, which is
  // how someone looks for one (Daniel, 2026-08-14). Your own patches keep the
  // recency rule — they have no slot — and lead the list when both kinds are
  // shown together.
  const bySlot = (a, b) => (
    (a.origin.bank - b.origin.bank) ||
    ((a.origin.preset || 0) - (b.origin.preset || 0)) ||
    String(a.file).localeCompare(String(b.file))
  );

  // Whether the tab in front of you is holding an order somebody set.
  const hasManualOrder = (data, state) => (
    state.tab === 'patches' ? !!(data.patchOrder && data.patchOrder.length)
      : state.tab === 'setlists' ? data.setlists.some((s) => Number.isFinite(s.order))
        : false
  );

  function orderedPatches(list, data) {
    const order = (data && data.patchOrder) || [];
    const byRecency = (a, b) => (patchWhen(a) === patchWhen(b)
      ? displayName(a).localeCompare(displayName(b), undefined, { numeric: true })
      : (patchWhen(a) < patchWhen(b) ? 1 : -1));
    // ONE RULE: most recently changed first. Whatever you have been working on
    // is at the top and the untouched captures fall below it, which is the only
    // difference between these patches that means anything (Daniel,
    // 2026-08-16). No kinds, no grouping, no categories.
    if (!order.length) return [...list].sort(byRecency);
    const at = new Map(order.map((k, i) => [k, i]));
    // The hand-placed order applies WITHIN each kind, not across them. A drag
    // made while the tab showed only your own patches named seven files; seen
    // from "All", the other thirty-five were unplaced and floated above them,
    // so one stale order decided the shape of a list it had never described
    // (Daniel, 2026-08-14, found by measuring). Splitting first keeps both
    // rules true: yours lead, and a drag still holds where it was made.
    const rank = (rows, cmp) => {
      const placed = [];
      const fresh = [];
      for (const e of rows) (at.has(patchKey(e)) ? placed : fresh).push(e);
      placed.sort((a, b) => at.get(patchKey(a)) - at.get(patchKey(b)));
      fresh.sort(cmp);
      return [...fresh, ...placed];
    };
    return rank(list, byRecency);
  }

  // "Bank 2 setlist (2026-08-12)" — a dated RECORD written by a backup run, as
  // opposed to a setlist someone built for a gig.
  // "failed" is what a stopped run is called now; ", partial" is what runs
  // before 2026-08-16 wrote, and those setlists are still on disk.
  const BACKUP_NAME = /^Bank ([1-4]) setlist \((\d{4}-\d{2}-\d{2})(, (?:partial|failed))?\)$/;

  // Most recently touched first — made, edited, or opened. A backup run stamps
  // the four setlists it writes, so the last run sits at the top until you go
  // and work on something else, and then THAT is at the top. One rule, no
  // categories.
  //
  // Setlists made before the app recorded this have no stamp. Rather than dump
  // them in a heap, a backup record falls back to the date in its own name and
  // anything else to its position in the file — so an untouched library still
  // reads newest-run-first.
  // WHEN IT WAS MADE, newest first — and nothing moves it afterwards. It used
  // to sort by last touch, so opening a setlist promoted it to the top and the
  // list rearranged itself under someone who had only gone to look at
  // something (Daniel, 2026-08-14). A hand-placed order still wins over this.
  //
  // Setlists made before the app recorded createdAt fall back to their
  // position in the file, which IS creation order — createSetlist appends —
  // and sort below anything that carries a real stamp.
  const createdKey = (s, i) => {
    if (s.createdAt) return `9:${s.createdAt}`;
    const m = BACKUP_NAME.exec(s.name);
    if (m) return `1:${m[2]}:${String(9 - Number(m[1])).padStart(2, '0')}`;
    return `0:${String(10000 + i).padStart(6, '0')}`;
  };

  // A backup RUN is one dated thing containing four banks — the runner writes
  // it as four per-bank setlists, which is a storage detail rather than what a
  // player has (Daniel, 2026-08-13). Group them back into runs by date.
  // ONE ROW PER RUN, and a run is identified by the RUN — not by the day it
  // happened on. Grouping by date merged an aborted run with the retry that
  // followed it: 5 slots plus 32, shown as "37 presets · partial" for an
  // instrument with 32 slots (Daniel, 2026-08-16).
  //
  // Two keys, in order of what the data can support. A setlist written from
  // 2026-08-16 carries a `runId` — the instant its run began — and that is
  // exact. Older setlists have none, so they fall back to the date PLUS the
  // partial flag, which separates the only case that actually occurs: an
  // aborted run and a clean one on the same day never merge, because a partial
  // run writes a differently-named setlist. Nothing is backfilled.
  function backupRuns(data) {
    const runs = new Map(); // key -> { date, partial, banks: [{bank, index, name}] }
    data.setlists.forEach((s, i) => {
      const m = BACKUP_NAME.exec(s.name);
      if (!m) return;
      const date = m[2];
      const partial = !!m[3];
      const key = s.runId || `${date}${partial ? '|partial' : ''}`;
      if (!runs.has(key)) runs.set(key, { key, date, partial: false, startedAt: null, banks: [] });
      const run = runs.get(key);
      if (partial) run.partial = true;
      // The run's own instant, when it has one. It is what orders two runs of
      // the same day; without it there is nothing finer than the date.
      if (s.runId && (!run.startedAt || s.runId < run.startedAt)) run.startedAt = s.runId;
      run.banks.push({ bank: Number(m[1]), index: i, name: s.name });
    });
    for (const run of runs.values()) run.banks.sort((a, b) => a.bank - b.bank);
    // NEWEST FIRST, and within a day the run that started later comes first.
    // The aborted run this morning sorted above the retry that followed it,
    // because a date cannot tell two runs of one day apart (Daniel,
    // 2026-08-16). runId is that instant; setlists written before it have
    // none, so they keep their existing order — a partial run, which is the
    // only kind that can share a date with another, sorts last of the two.
    const sorted = [...runs.values()].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      if (a.startedAt && b.startedAt) return a.startedAt < b.startedAt ? 1 : -1;
      if (a.startedAt || b.startedAt) return a.startedAt ? -1 : 1; // stamped runs are newer
      if (a.partial !== b.partial) return a.partial ? 1 : -1;
      return 0;
    });

    // ONE ROW PER RUN. Identical consecutive runs used to collapse into a
    // dated span ("13-14 Aug · unchanged") so two quiet evenings did not read
    // as two rows saying the same thing. Daniel asked for that and then
    // reversed it (2026-08-14): a backup is an event, and the list of them is
    // a history — so each night keeps its own line whether or not the Seven
    // changed, and "how long has it been like this?" is answered by reading
    // the dates rather than by the app deciding they are one thing.
    return sorted;
  }

  // Everything a run captured, in bank order — the same shape the patches list
  // used to show for the whole library, which is where it belonged all along.
  function renderBackupRun(data, state) {
    // BY RUN KEY. Two runs can share a date — an aborted one and its retry —
    // and finding by date opened whichever came first, so the 32-preset row
    // showed the 5-preset run (Daniel, 2026-08-16).
    const run = backupRuns(data).find((r) => r.key === state.backupRun);
    if (!run) return renderBackupList(data, state);
    const byFile = new Map();
    for (const e of data.patches) if (!byFile.has(e.file)) byFile.set(e.file, e);
    const banks = run.banks.map((b) => {
      const slots = (data.setlists[b.index] || {}).slots || [];
      const rows = slots
        .map((f) => (f ? byFile.get(f) : null))
        .map((e, i) => (e
          // No pill here either: a backup is a list of forty rows the same
          // way, and selecting one answers the question in the centre column
          // (Daniel, 2026-08-13). The preset NUMBER still leads the row —
          // that is what a backup is a record of.
          ? renderPatchRow(e, state, { inRun: true, flat: true })
          : `<div class="lib-row lib-slot-empty"><span class="patch-num">${i + 1}</span>` +
            '<span class="lib-empty-slot">empty</span></div>'))
        .join('');
      // One Send per BANK, not one per run: a transfer walks eight slots into
      // one bank, and the target bank is chosen in the dialog — so this offers
      // "these eight patches, onto a bank of your choosing" (Daniel,
      // 2026-08-13). Bank 1's eight are offered too: they cannot be written
      // BACK to Bank 1, but sending the factory eight to Bank 3 is a
      // perfectly ordinary thing to want.
      return (
        '<div class="lib-group">' +
        `<div class="lib-group-title lib-group-title-row">Bank ${b.bank}` +
        `<button type="button" class="setlist-send" data-setlist-send="${b.index}" ` +
        `title="Load these eight patches onto a bank on the Seven">Send to Seven →</button>` +
        '</div>' + rows + '</div>'
      );
    }).join('');
    return (
      '<div class="lib-setlist-head">' +
      '<button type="button" class="lib-back" data-backup-back>‹ Backups</button>' +
      `<span class="lib-setlist-name">${esc(fmtDate(run.date))}` +
      `${run.partial ? ' · failed' : ''}</span>` +
      '</div>' + banks
    );
  }

  // The runs themselves: one row per backup, newest first.
  function renderBackupList(data, state) {
    const runs = backupRuns(data);
    if (!runs.length) {
      return '<div class="lib-empty">No backups yet. “Back up instrument” reads all ' +
        '32 presets and writes down what the Seven held.</div>';
    }
    return runs.map((r, i) => {
      const slots = r.banks.reduce((n, b) => n +
        ((data.setlists[b.index] || {}).slots || []).filter(Boolean).length, 0);
      // The Seven has 32 slots. A run cannot have captured more, so a bigger
      // number is not a number to render — it means the grouping has merged
      // two runs, which is exactly the bug that produced "37 presets" from an
      // aborted run plus its retry (Daniel, 2026-08-16). Say so instead of
      // printing an impossibility, and leave a trace in the log.
      const impossible = slots > SLOT_COUNT;
      if (impossible) {
        console.warn(
          `[seven] backup run ${r.key || r.date} counted ${slots} presets — more than the ` +
          `${SLOT_COUNT} the instrument has, so two runs have been grouped as one`
        );
      }
      // "32+" rather than a number that cannot be true, and it asks to be
      // clicked: the row has no room to explain itself, and someone seeing it
      // deserves to know their patches are fine.
      const count = impossible
        ? '32+'
        : `${slots} preset${slots === 1 ? '' : 's'}${r.partial ? ' · failed' : ''}`;
      return (
        '<div class="lib-row lib-setlist-row">' +
        `<button type="button" class="lib-setlist" data-backup="${esc(r.key)}">` +
        `<span class="patch-num">${i + 1}</span>` +
        `<span class="lib-setlist-name">${esc(fmtDate(r.date))} Backup</span>` +
        (impossible
          ? `<span class="lib-setlist-count is-wrong" role="button" tabindex="0" ` +
            `data-over-count="${slots}" title="More patches than the Seven has">${esc(count)}</span>`
          : `<span class="lib-setlist-count">${esc(count)}</span>`) +
        '</button>' +
        `<button type="button" class="setlist-delete" data-backup-delete="${esc(r.key)}" ` +
        `title="Delete the ${esc(fmtDate(r.date))} backup ` +
        `(the patches stay in the library)">` +
        '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" ' +
        'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M2.8 4.3h10.4"/><path d="M6.4 4.3V3.1h3.2v1.2"/>' +
        '<path d="M4.2 4.3l.7 8.2a.9.9 0 0 0 .9.8h4.4a.9.9 0 0 0 .9-.8l.7-8.2"/>' +
        '<path d="M6.8 6.6v4.4M9.2 6.6v4.4"/></svg>' + '</button>' +
        '<span class="lib-setlist-chev">›</span>' +
        '</div>'
      );
    }).join('');
  }

  function renderSetlistList(data, state) {
    // The original index travels with each row: everything downstream (rename,
    // delete, send, open) addresses setlists by their position in the FILE, so
    // this ordering is display only and never renumbers anything.
    const rows = data.setlists
      .map((s, i) => ({ s, i, key: createdKey(s, i) }))
      // A setlist is something YOU made. The dated records a backup writes are
      // backups, and they live under their own tab (Daniel, 2026-08-13).
      .filter(({ s }) => !BACKUP_NAME.test(s.name))
      // SORT FIRST, then number. Numbering before the sort assigned the file's
      // order to rows that were about to be rearranged, so the newest setlist
      // sat at the top wearing the number 2 (Daniel, 2026-08-14). The intent
      // below was always position in the list you are looking at; it just ran
      // a step too early.
      //
      // Hand-placed order wins once one exists, with anything it has never
      // seen floating to the top by recency — the same rule the Patches tab
      // uses, so dragging means one thing in this app.
      .sort((a, b) => {
        const manual = data.setlists.some((s) => Number.isFinite(s.order));
        if (manual) {
          const ao = Number.isFinite(a.s.order) ? a.s.order : -1;
          const bo = Number.isFinite(b.s.order) ? b.s.order : -1;
          // Both unplaced: newest first, as in the recency list below.
          if (ao === -1 && bo === -1) return a.key === b.key ? a.i - b.i : (a.key < b.key ? 1 : -1);
          if (ao === -1) return -1;
          if (bo === -1) return 1;
          return ao - bo;
        }
        return a.key === b.key ? a.i - b.i : (a.key < b.key ? 1 : -1);
      })
      .map((row, n) => ({ ...row, n: n + 1 }))
      .map(({ s, i, n }) => {
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
          `<div class="lib-row lib-setlist-row" draggable="true">` +
          `<button type="button" class="lib-setlist" data-setlist="${i}">` +
          `<span class="patch-num">${n}</span>` +
          `<span class="patch-name">${esc(s.name)}</span>` +
          `<span class="patch-sound">${label}</span>` +
          `</button>` +
          // No Send here. The row already carries a name, a count, a delete
          // and a chevron, and sending is the one action with an instrument on
          // the other end of it — it belongs on the detail page, where you
          // have opened the setlist and can see what you are about to send
          // (Daniel, 2026-08-13).
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
      : `<button type="button" class="lib-new-setlist">＋ Create new setlist</button>`;
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
  // ONE distinction, in the colours the app already uses for it: blue is
  // modeled, green is sampled — the badge colours (--modeled / --sampled).
  //
  // It used to be a colour per instrument FAMILY: thirteen pastels, which read
  // as decoration because nothing told you what they meant, and they competed
  // with the MODELED and SAMPLED headings the grid is already grouped under
  // (Daniel, 2026-08-13). A family palette needs thirteen legends; this one
  // needs none, because anyone who has seen a badge already knows it.
  const tileColour = (name, sampled) =>
    (sampled ? 'var(--sampled)' : 'var(--modeled)');

  // Group patches the way the user thinks of them: which backup, which bank.
  // Browsing beats searching when you can't recall a name.
  // The instrument grid: every sound the schema knows, illustrated. Choosing
  // one assigns the SOUND, not a patch — see SOUND_REF above for why that is
  // the only honest "unedited" option we can offer.
  function renderSoundTiles(state, sounds) {
    const q = (state.pickSearch || '').trim().toLowerCase();
    const list = sounds.filter((s) => !q || s.name.toLowerCase().includes(q));
    if (!list.length) return `<div class="lib-empty">No instrument matches “${esc(q)}”.</div>`;
    // The heading carries the engine's colour and is the size of a real
    // heading, because it is the one thing telling you which half of the grid
    // you are in (Daniel, 2026-08-13).
    const section = (title, rows, kind) =>
      rows.length
        ? `<div class="pick-group"><div class="pick-group-title ${kind}">${title}</div>` +
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
      section('Model', list.filter((s) => !s.sampled), 'is-modeled') +
      section('Sample', list.filter((s) => s.sampled), 'is-sampled') +
      `<div class="pick-note">Choosing an instrument sets the sound only — every ` +
      `parameter keeps its current setting, which is what the Seven itself does ` +
      `when the sound changes.</div>`
    );
  }

  // Segments, not a dropdown: three options whose counts are the point, and a
  // dropdown would hide two thirds of the answer behind a click.
  function renderPicker(data, state, sounds, allSounds) {
    const slot = state.picking;
    const q = state.pickSearch || '';
    // Bank 1's eight are the FACTORY presets: you cannot edit them and you
    // cannot write back to them, and the Instruments tab beside this one
    // offers those same eight sounds directly. Listing them here as patches
    // was the same eight things twice (Daniel, 2026-08-13). A patch you MADE
    // from one of them is your own and stays.
    const list = data.patches.filter((e) => !e.invalid && matches(e, q)
      && !((e.origin || {}).kind === 'backup' && e.origin.bank === 1));
    // FLAT, by name — the same inventory the Patches tab shows. It grouped by
    // "13 August · Bank 2 / Created here / Imported", which is the structure
    // the Backups tab now owns, so choosing a patch met the same shape a third
    // time (Daniel, 2026-08-13). One way to browse patches everywhere; the
    // search above does the finding.
    // The eight Bank 1 captures are deliberately absent — the Instruments tab
    // offers those same sounds directly, and listing them here as patches was
    // the same eight things twice. That reasoning was only in the source, so
    // the route it assumes was invisible (Daniel, 2026-08-14).
    const note = '<p class="pick-note">Bank 1\u2019s factory sounds are on the Instruments tab.</p>';
    const body = list.length
      ? (note + `<div class="pick-grid">` +
          [...list]
            .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true }))
            .map((e) => {
            const colour = tileColour(e.soundName, e.sampled);
            // The INSTRUMENT leads; the slot is the subhead (Daniel,
            // 2026-08-13). A backup patch is auto-named "Bank 1 Preset 3 —
            // Electric Grand Piano", so the tile led with five words every
            // tile shared, truncated the instrument, and then repeated it
            // underneath. Two tiles could look identical while naming
            // different patches.
            //
            // The auto-name is stripped wherever it appears — including on a
            // COPY, which carries the prefix in its stored name but has no
            // slot of its own, so the origin-aware displayName cannot see it.
            const auto = /^Bank\s*\d+\s*Preset\s*\d+\s*—\s*/;
            const own = String(e.name || '').replace(auto, '').trim();
            const o = e.origin || {};
            // WHEN, not where. The slot a patch was captured from is history
            // and belongs to the Backups tab — but two tiles for the same slot
            // are two genuinely different patches (the run dedupes identical
            // ones), so they need something that tells them apart, and the age
            // does it: "1 day ago" against "2 weeks ago"
            // (Daniel, 2026-08-13).
            // "from today", "from 1 week ago" — the tile is a patch you are
            // choosing, and where it comes from is the useful half of that
            // sentence, not the verb (Daniel, 2026-08-13).
            const where = o.date ? `from ${ago(o.date)}` : '';
            // The second line must say something the first does not. A name
            // like "Electric Grand Piano copy" under a title of "Electric
            // Grand Piano" is the same fact twice, and truncation made the two
            // lines read as identical (Daniel, 2026-08-13) — so a name is only
            // used when it is not just the instrument with a suffix on it.
            const bare = own.replace(/\s+copy(\s*\d+)?$/i, '').trim().toLowerCase();
            // A NAME YOU CHOSE leads. "Commander Piano w/ pad" is what you
            // call that patch; the instrument under it is the supporting fact
            // (Daniel, 2026-08-13). Only where there is no name of its own —
            // most backup patches, auto-named after their sound — does the
            // instrument take the headline.
            const named = bare && bare !== String(e.soundName).trim().toLowerCase();
            const name = named ? own : (e.soundName || own);
            const second = named ? e.soundName : where;
            return (
              `<button type="button" class="pick-tile" data-pick-file="${esc(e.file)}" ` +
              `style="--tile:${colour}" title="${esc(e.name)} — ${esc(e.soundName)}">` +
              `<span class="tile-name">${esc(name)}</span>` +
              // No (s)/(m): the tile's colour says which engine it is —
              // blue modeled, green sampled, the badge colours
              // (Daniel, 2026-08-13).
              `<span class="tile-sound">${esc(second)}</span>` +
              // A named patch shows its age on a THIRD line — the second is
              // already spent on the instrument, and the age is what tells
              // two captures of the same slot apart.
              (named && where ? `<span class="tile-when">${esc(where)}</span>` : '') +
              `</button>`
            );
          }).join('') +
          `</div>`)
      : `<div class="lib-empty">No patches match “${esc(q)}”.</div>`;
    const shown = sounds
      ? renderSoundTiles(state, allSounds || [])
      : body;
    return (
      `<div class="pick-overlay">` +
      `<div class="pick-modal" role="dialog" aria-label="Choose a patch">` +
      `<div class="pick-modal-head">` +
      `<span class="pick-title">Assigning Slot ${slot + 1}</span>` +
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

  // A slot holds a patch file. It could once hold a bare sound instead,
  // written as "sound:<name>" — a second kind of thing that every row, every
  // click and every send had to special-case. Choosing an instrument now
  // writes the patch it means, so the prefix survives only as the word the
  // picker hands to the store (Daniel, 2026-08-14).
  const SOUND_REF = 'sound:';

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
    // No (m)/(s) beside the sound. Modeled or sampled is a fact about the
    // INSTRUMENT, and the row is about the patch — it was two letters in
    // brackets that had to be learned to be read, on every line of a list you
    // scan by name (Daniel, 2026-08-14). The badge in the detail panel says it
    // in a word where there is room for the word.
    //
    // (!) stays: a sound this instrument does not have is not a classification
    // but a problem with the row it is on.
    const soundTag = (entry) => (entry.missing
      ? ' <span class="sound-tag is-warn" title="Sound not installed on this instrument" aria-label="Sound not installed">(!)</span>'
      : '');

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
        // No branch for a sound-only slot any more. Choosing an instrument
        // MAKES a patch — that model with the effects it comes with — so a
        // slot holds one kind of thing and every row below is the same row
        // (Daniel, 2026-08-14). Old `sound:NAME` slots are converted on read
        // by the store, so nothing here has to know they existed.
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
        // KEYED ON THE SLOT, not on the patch. A setlist may legitimately hold
        // the same file in several slots — Commander Piano in 5 and 7 — and
        // keying on identity highlighted both and loaded the first
        // (Daniel, 2026-08-16). Position is what a slot IS.
        const selected = state.selectedSlot === i;
        if (state.renaming === rowKey(entry) && state.renamingSlot === i) {
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
          `<span class="lib-badges">${factoryBadge(entry)}</span>` +
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
      // Also here, not only on the row you hovered to get in: this is the view
      // where you finish arranging a setlist, and it is the moment you want to
      // put it on the instrument.
      `<button type="button" class="setlist-send" data-setlist-send="${state.setlistIndex}" ` +
      `title="Load “${esc(setlist.name)}” onto a bank on the Seven">Send to Seven →</button>` +
      `</div>` +
      rows
    );
  }

  function renderBody(data, state, sounds) {
    const tab = (id, label) =>
      `<button type="button" class="seg-btn${state.tab === id ? ' active' : ''}" data-tab="${id}"><span class="seg-label">${label}</span></button>`;
    const listHtml =
      state.tab === 'backups'
        ? (state.backupRun == null
          ? renderBackupList(data, state)
          : renderBackupRun(data, state))
        : state.tab === 'setlists'
          ? (state.setlistIndex == null
            ? renderSetlistList(data, state)
            : renderSetlistSlots(data, state, { sounds }))
          : renderAllPatches(data, state);
    return (
      `<div class="lib-bar">` +
      `<div class="lib-seg">${tab('backups', 'Backups')}${tab('patches', 'Patches')}` +
      `${tab('setlists', 'Setlists')}</div>` +
      // No "Sort by recency" control. It appeared once a list had been
      // dragged, as the way back — and it was a button in the bar earning its
      // place from a state most people never reach (Daniel, 2026-08-14).
      // Undo still puts a drag back, and the store keeps the ability to clear
      // an order if this is ever wanted again.

      // No search on Backups: there are a handful of dated runs and you pick
      // one by looking (Daniel, 2026-08-13). It is a magnifier elsewhere until
      // it is wanted — the field sat open in the bar all day for something
      // reached for occasionally.
      (state.tab === 'backups'
        ? ''
        : (state.searchOpen || state.search
        ? `<input class="lib-search lib-autofocus" type="search" ` +
          `placeholder="Search name or sound…" value="${esc(state.search)}">`
        : '<button type="button" class="lib-search-open" data-search-open ' +
          'aria-label="Search" title="Search">' +
          '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" ' +
          'stroke="currentColor" stroke-width="1.8" stroke-linecap="round">' +
          '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg></button>')) +
      // WHICH patches, on the tab that has more than one answer. The numbers
      // ride on the segments: three surfaces filtered the same files three
      // ways and the header count matched none of them, so the control that
      // chooses is also where the totals reconcile (Daniel, 2026-08-14).
      //
      // Emitted AFTER the search on purpose: it wraps to its own line, and
      // anything after it wraps too — with the scope first, the magnifier was
      // pushed onto a third row of its own (measured).

      `</div>` +
      `<div class="lib-list">${listHtml}</div>`
    );
  }

  // Controller: owns view state, renders into `el`, wires delegated events.
  function createLibraryView({ el, on = {}, scope } = {}) {
    const state = {
      // WHICH PATCHES the Patches tab lists: 'mine' (made here), 'seven'
      // (captured from the instrument) or 'all'. It used to be a hard-coded
      // filter with no control, so the tab quietly hid 35 of 36 files
      // (Daniel, 2026-08-14). The default is what it always did.
      //
      // Persisted by app.js, unlike the tab and the search box: those are
      // things you DO, and this is how you want your library to look.
      // Backups opens first: it is the reason the app exists, and the newest
      // run is the thing most likely to be wanted (Daniel, 2026-08-13).
      tab: 'backups',
      search: '',
      setlistIndex: null,
      backupRun: null,    // which RUN is open, by its key — not its date
      searchOpen: false,  // the magnifier has been clicked
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

    // How many rows the current tab is showing, in its own units: patches on
    // Patches, runs on Backups, setlists on Setlists.
    function visibleCount() {
      if (state.tab === 'patches') {
        return data.patches.filter(
          (e) => inList(e, newestPerSlot(data.patches)) && matches(e, state.search)
        ).length;
      }
      if (state.tab === 'backups') return backupRuns(data).length;
      return data.setlists.filter((s2) => !BACKUP_NAME.test(s2.name)).length;
    }

    function render() {
      const viewKey = `${state.tab}:${state.setlistIndex}:${state.backupRun}`;
      const prevList = el.querySelector('.lib-list');
      const keepScroll = prevList && lastViewKey === viewKey ? prevList.scrollTop : null;
      el.innerHTML = renderBody(data, state, on.sounds);
      if (keepScroll != null) {
        const list = el.querySelector('.lib-list');
        if (list) list.scrollTop = keepScroll;
      }
      lastViewKey = viewKey;
      updateFade();
      // What is on screen, for the header above it. The count used to be the
      // FOLDER total on every tab, so "36 patch files" sat over a list of one
      // (Daniel, 2026-08-14).
      if (on.counts) on.counts(visibleCount(), data.patches.filter((e) => !e.invalid).length);
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
            if (entry) {
              state.renaming = rowKey(entry);
              state.renamingSlot = patchRow && patchRow.dataset.slot != null
                ? Number(patchRow.dataset.slot) : null;
            }
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
            if (on.openSetlist) on.openSetlist(index);
            render();
          }, 260);
          return;
        }
      }

      const seg = e.target.closest('.seg-btn');
      if (seg) {
        state.tab = seg.dataset.tab;
        state.setlistIndex = null;
        state.backupRun = null;
        if (state.tab === 'backups') { state.search = ''; state.searchOpen = false; }
        render();
        return;
      }
      if (e.target.closest('.lib-back') && !e.target.closest('.pick-cancel')) {
        state.setlistIndex = null;
        state.backupRun = null;
        state.lastCleared = null;
        state.picking = null;
        render();
        return;
      }
      if (e.target.closest('[data-search-open]')) {
        state.searchOpen = true;
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
      const backupDel = e.target.closest('[data-backup-delete]');
      if (backupDel) {
        // The exact setlists this run wrote, by index — never a date pattern,
        // which would take the other run of the same day with it.
        const run = backupRuns(data).find((r) => r.key === backupDel.dataset.backupDelete);
        if (run && on.deleteBackup) {
          on.deleteBackup({
            key: run.key,
            date: run.date,
            partial: run.partial,
            indexes: run.banks.map((b) => b.index),
          });
        }
        return;
      }
      const patchDel = e.target.closest('[data-patch-delete]');
      if (patchDel) {
        const entry = data.patches.find((x) => x.file === patchDel.dataset.patchDelete
          && String(x.patchIndex) === patchDel.dataset.pi);
        if (entry && on.trashPatch) on.trashPatch(entry);
        return;
      }
      const setlistRow = e.target.closest('.lib-setlist');
      if (setlistRow) {
        // A BACKUP row shares this class but carries a date instead of a
        // setlist index. This handler ran first and set setlistIndex to NaN,
        // so clicking a backup did nothing at all (Daniel, 2026-08-13).
        if (setlistRow.dataset.backup) {
          state.backupRun = setlistRow.dataset.backup;
          render();
          return;
        }
        const index = Number(setlistRow.dataset.setlist);
        state.setlistIndex = index;
        // Opening counts as touching it: the thing you just looked at is the
        // thing you are most likely to want next.
        if (on.openSetlist) on.openSetlist(index);
        render();
        return;
      }
      // An instrument slot. It holds a sound rather than a patch, so there is
      // no entry to select — clicking it plays that instrument.
      // The impossible-count badge explains itself rather than opening the run.
      const over = e.target.closest('[data-over-count]');
      if (over) {
        e.stopPropagation();
        if (on.countWarning) on.countWarning(Number(over.dataset.overCount));
        return;
      }
      const row = e.target.closest('[data-file]');
      if (row && !e.target.closest('.lib-rename-input')) {
        const entry = entryAt(row);
        if (entry) {
          state.selected = rowKey(entry);
          // Inside a setlist the slot is the selection; outside one there is no
          // slot and the patch is.
          state.selectedSlot = row.dataset.slot != null ? Number(row.dataset.slot) : null;
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
      // A setlist row, dragged to a place in its own list. Matched on the ROW,
      // then read from the button inside it: the row is what carries
      // draggable, so a grab on its padding — or anywhere but the button —
      // started a drag that carried no data at all.
      const setlistRow = e.target.closest('.lib-setlist-row');
      if (setlistRow) {
        const idEl = setlistRow.querySelector('[data-setlist]');
        if (idEl) {
          e.dataTransfer.setData('text/seven-setlist', idEl.dataset.setlist);
          e.dataTransfer.effectAllowed = 'move';
        }
        return;
      }
      const row = e.target.closest('.lib-row[data-file]');
      if (row) {
        const entry = entryAt(row);
        if (entry) {
          e.dataTransfer.setData('text/seven-file', entry.file);
          // A patch drag means two things depending on where it lands: into a
          // slot it assigns, within its own list it reorders. The KEY rides
          // along for the second, because a file can hold more than one patch
          // and the filename alone cannot say which row moved.
          e.dataTransfer.setData('text/seven-patch-key', `${entry.file}#${entry.patchIndex || 0}`);
          e.dataTransfer.effectAllowed = 'copyMove';
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
    });
    // Where a reorder drop would land: above the row under the pointer, or
    // below it. Half the row each, so the whole list is a target and there is
    // no dead band between rows to fall into.
    const clearDropMarks = () => {
      for (const n of el.querySelectorAll('.drop-above, .drop-below, .drop-target')) {
        n.classList.remove('drop-above', 'drop-below', 'drop-target');
      }
    };
    const reorderTarget = (e) => {
      const types = e.dataTransfer.types;
      if (types.includes('text/seven-setlist')) return e.target.closest('.lib-setlist-row');
      // A patch reorders only in its own flat list; over a slot it is being
      // assigned, which is a different act with its own target.
      if (types.includes('text/seven-patch-key') && state.tab === 'patches' && !e.target.closest('[data-slot]')) {
        return e.target.closest('.lib-row.lib-patch');
      }
      return null;
    };
    const dropsBelow = (row, e) => {
      const r = row.getBoundingClientRect();
      return e.clientY > r.top + r.height / 2;
    };
    el.addEventListener('dragover', (e) => {
      const slot = e.target.closest('[data-slot]');
      const types = e.dataTransfer.types;
      if (slot && (types.includes('text/seven-file') || types.includes('text/seven-slot'))) {
        e.preventDefault(); // allow the drop
        slot.classList.add('drop-target');
        return;
      }
      const row = reorderTarget(e);
      if (!row) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      clearDropMarks();
      row.classList.add(dropsBelow(row, e) ? 'drop-below' : 'drop-above');
    });
    el.addEventListener('dragleave', (e) => {
      const slot = e.target.closest('[data-slot]');
      if (slot) slot.classList.remove('drop-target');
      const row = e.target.closest('.lib-setlist-row, .lib-row.lib-patch');
      if (row) row.classList.remove('drop-above', 'drop-below');
    });
    el.addEventListener('dragend', clearDropMarks);
    el.addEventListener('drop', (e) => {
      // A reorder within a list. The whole displayed sequence is handed over,
      // not the one move: that is what pins the rows which were only at the
      // top because no order had ever named them.
      const target = reorderTarget(e);
      if (target) {
        e.preventDefault();
        clearDropMarks();
        const below = dropsBelow(target, e);
        const setlistIdx = e.dataTransfer.getData('text/seven-setlist');
        if (setlistIdx !== '') {
          const rows = [...el.querySelectorAll('.lib-setlist-row [data-setlist]')]
            .map((r) => Number(r.dataset.setlist));
          const moved = Number(setlistIdx);
          const targetIdx = Number(target.querySelector('[data-setlist]').dataset.setlist);
          if (moved === targetIdx) return;
          const next = rows.filter((i) => i !== moved);
          const at = next.indexOf(targetIdx);
          next.splice(below ? at + 1 : at, 0, moved);
          if (on.reorderSetlists) on.reorderSetlists(next);
          return;
        }
        const key = e.dataTransfer.getData('text/seven-patch-key');
        if (key) {
          const rows = [...el.querySelectorAll('.lib-row.lib-patch[data-file]')]
            .map((r) => `${r.dataset.file}#${r.dataset.pi || 0}`);
          const targetKey = `${target.dataset.file}#${target.dataset.pi || 0}`;
          if (key === targetKey) return;
          const next = rows.filter((k) => k !== key);
          const at = next.indexOf(targetKey);
          next.splice(below ? at + 1 : at, 0, key);
          if (on.reorderPatches) on.reorderPatches(next);
          return;
        }
        return;
      }
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
      beginRename(entry, opts = {}) {
        state.renaming = rowKey(entry);
        state.renamingSlot = Number.isInteger(opts.slot) ? opts.slot
          : (Number.isInteger(state.selectedSlot) ? state.selectedSlot : null);
        render();
      },
      beginSetlistRename(index) {
        state.tab = 'setlists';
        state.renamingSetlist = index;
        render();
      },
      // Scroll a file's row into view on the next render, and select it.
      // `tab` moves to the list that HAS that row first: revealing a patch
      // from a dialog is useless if the library happens to be showing
      // Backups. A rename passes no tab, because it must reveal the row where
      // the renaming happened rather than jumping the user somewhere else.
      reveal(file, patchIndex, { tab } = {}) {
        if (tab) {
          state.tab = tab;
          state.setlistIndex = null;
          state.backupRun = null;
        }
        // AND a scope that can show it. Landing on the Patches tab is not
        // enough now that the tab filters: saving a patch while the list was
        // showing "From the Seven" revealed a row that scope cannot contain —
        // the new patch is one you MADE — so the link appeared to do nothing
        // (Daniel, 2026-08-14). Switch to where the patch lives rather than to
        // "All", so the control still names a real category, and tell app.js
        // so the persisted preference matches what is on screen.
        const target = data.patches.find(
          (e) => e.file === file && (e.patchIndex || 0) === (patchIndex || 0)
        );
        // A superseded capture is no longer in ANY patches scope — it lives in
        // Backups now. Switching scope cannot reveal it, and this says so
        // rather than moving the list and leaving the row unfound.
        const current = newestPerSlot(data.patches);
        // Nothing to switch to any more: one list, and a superseded capture
        // is in none of it — it lives in Backups.
        state.revealFile = file;
        state.selected = `${file} ${patchIndex || 0}`;
        render();
      },
      // `slot` is the setlist position when the selection is a slot. Passing
      // it is what keeps two slots holding one file from both lighting up.
      select(entry, opts = {}) {
        state.selected = entry ? rowKey(entry) : null;
        state.selectedSlot = Number.isInteger(opts.slot) ? opts.slot : null;
        render();
      },
      patchCount: () => data.patches.filter((e) => !e.invalid).length,
    };
  }

  // backupRuns is exported for tests: the span collapse has a rule that is
  // easy to state and easy to break — only ADJACENT identical runs merge.
  // `ago` is exported for its own tests: it is one line of arithmetic that
  // every dated row in the library depends on, and it has been wrong once.
  // `displayName` is exported so a dialog naming a patch names it the way its
  // row does — one rule for stripping the slot prefix, in one place.
  return { createLibraryView, renderBody, renderSoundTiles, backupRuns, ago, displayName };
});
