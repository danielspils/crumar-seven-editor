'use strict';

// App glue: owns UI state (selected bank/patch + view state), injects the panel
// SVG, and asks SevenRenderer for HTML. The ONLY data sources are the sevenAPI
// getters and IPC namespaces — no view code touches a device. The bank region
// derives from the on-disk library's backup patches; nothing renders fixtures.

(function () {
  // Appearance: dark (default) or the antiqued-light theme. Applied before
  // anything renders so there is no flash, and persisted like the other UI
  // state — never patch data.
  const THEME_KEY = 'seven.theme';
  const applyTheme = (name) => {
    const theme = name === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
    // Keep the divider's switch in step whichever route set the theme.
    for (const b of document.querySelectorAll('[data-theme-set]')) {
      b.setAttribute('aria-pressed', String(b.dataset.themeSet === theme));
    }
  };
  applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
  document.addEventListener('DOMContentLoaded', () =>
    applyTheme(localStorage.getItem(THEME_KEY) || 'dark'));
  document.addEventListener('click', (e) => {
    const pick = e.target.closest('[data-theme-set]');
    if (pick) applyTheme(pick.dataset.themeSet);
  });

  // Self-hosted fonts (Archivo for the panel strip, Inter for the UI) — must be
  // registered before any rendering so nothing flashes in a fallback face.
  const fontStyle = document.createElement('style');
  fontStyle.textContent = window.sevenAPI.getFontCss();
  document.head.appendChild(fontStyle);

  // ---- Data -----------------------------------------------------------------
  const schema = window.sevenAPI.getSchema();
  const R = SevenRenderer.createRenderer(schema, SevenDefaults.defaultFor);

  // Banks 1–4 mirror the INSTRUMENT, derived from the latest backup patch per
  // slot (origin bank/preset) — never demo data. The Seven can't be asked
  // what's in its banks (no read-slot opcode), so this view is honest about
  // being "as of the last backup": banksAsOf feeds the region header, and a
  // slot with no backup renders as unknown rather than pretending.
  const emptyBanks = () =>
    Array.from({ length: 4 }, (_, i) => ({ name: String(i + 1), patches: Array(8).fill(null) }));
  let banks = emptyBanks();
  let banksAsOf = null; // newest capture date across the mapped slots

  function rebuildBanks(entries) {
    banks = emptyBanks();
    banksAsOf = null;
    const latest = new Map(); // "bank:preset" -> newest backup entry
    for (const e of entries) {
      if (e.invalid || !e.origin || e.origin.kind !== 'backup') continue;
      const b = e.origin.bank - 1;
      const p = e.origin.preset - 1;
      if (b < 0 || b > 3 || p < 0 || p > 7) continue;
      const k = `${b}:${p}`;
      const prev = latest.get(k);
      if (!prev || String(e.origin.date || '') > String(prev.origin.date || '')) latest.set(k, e);
    }
    for (const [k, e] of latest) {
      const [b, p] = k.split(':').map(Number);
      banks[b].patches[p] = {
        // Backup names embed their slot ("Bank 2 Preset 3 — Reed Piano");
        // inside the bank row that prefix is noise, so strip it — a
        // user-renamed patch shows its rename untouched.
        name: e.name.replace(new RegExp(`^Bank ${b + 1} Preset ${p + 1}\\s*—\\s*`), ''),
        soundName: e.soundName,
        sampled: e.sampled,
        params: e.params,
        file: e.file,
        // Per-slot, not per-region: slots can come from different backup runs,
        // and the row says which one this slot is "as of".
        date: e.origin.date || null,
      };
      if (e.origin.date && (!banksAsOf || e.origin.date > banksAsOf)) banksAsOf = e.origin.date;
    }
  }

  // ---- UI state -------------------------------------------------------------
  // TWO independent selections, held side by side — setlist editing and
  // transfer both need a source and a target selected simultaneously.
  // Selecting in one region never clears the other; `lastTouched` decides
  // which one the detail panel renders.
  let bankIndex = 0; // which bank the list DISPLAYS — navigation, not selection
  let deviceSel = { bank: 0, preset: 0 }; // the Seven boots at preset 1-1
  let lastTouched = 'device'; // 'device' | 'library'

  // View state only — never written to a patch or the library.
  let showRaw = false;
  let collapsed = {}; // section group -> bool

  // The patch the detail panel renders: whichever region was touched last.
  // libSelected/libToRendererPatch are declared in the library block below;
  // this closure only runs at render time, after the IIFE has initialised.
  const currentPatch = () => {
    if (lastTouched === 'library' && libSelected) return libToRendererPatch(libSelected);
    if (deviceSel) return banks[deviceSel.bank].patches[deviceSel.preset] || null;
    return null;
  };

  // ALL sections start collapsed regardless of switch state — the collapsed
  // header (name, summary, ON/OFF pill) is the resting view for the whole
  // chain. Recomputed whenever the selected patch changes.
  function resetCollapsed() {
    collapsed = {};
    for (const s of R.FX_SECTIONS) collapsed[s.group] = true;
  }

  // Long scrollers fade their bottom edge while there is more below. These two
  // outlive every re-render, so they are watched once.
  window.SevenScrollFade.watch(document.getElementById('detail'));
  window.SevenScrollFade.watch(document.getElementById('sounds-panel'));

  // ---- Panel strip (inline SVG so element ids are addressable) -------------
  const panelStrip = document.getElementById('panel-strip');
  panelStrip.innerHTML = window.sevenAPI.getPanelSvg(); // keeps class="readonly"

  // Panel knob → effects section. Navigation only: clicking a knob reveals and
  // highlights the section it controls; it never changes a value. Preset/bank
  // buttons are patch selection and are not part of this mapping.
  const KNOB_TO_SECTION = {
    'knob-volume': 'efx_veq',
    'knob-bass-mid': 'efx_veq',
    'knob-treble-midf': 'efx_veq',
    'knob-reverb': 'efx_rev',
    'knob-fx1': 'efx_fx1',
    'knob-fx2': 'efx_fx2',
    'knob-amp-drive': 'efx_amp',
    'knob-pad': 'efx_pad',
  };
  const SECTION_TO_KNOBS = {};
  for (const [knob, group] of Object.entries(KNOB_TO_SECTION)) {
    (SECTION_TO_KNOBS[group] = SECTION_TO_KNOBS[group] || []).push(knob);
  }
  // Mapped knobs get the nav-knob class: it re-enables pointer events (the
  // strip stays readonly otherwise) and carries the cursor/hover affordance.
  for (const id of Object.keys(KNOB_TO_SECTION)) {
    const el = panelStrip.querySelector(`#${id}`);
    if (el) el.classList.add('nav-knob');
  }

  // Three distinct cues (keep them distinct — docs/DESIGN.md):
  //   amber glow on a knob  = effect is on (patch data; not yet implemented)
  //   accent ring on a knob = its section is expanded (view state, persistent)
  //   brief accent tint     = you just opened this section (transient ~1.2s)

  // Persistent expanded-state rings: a knob wears the accent ring while its
  // section is open. Recomputed from `collapsed`, never from clicks directly.
  function updateKnobRings() {
    for (const [group, knobs] of Object.entries(SECTION_TO_KNOBS)) {
      for (const id of knobs) {
        const el = panelStrip.querySelector(`#${id}`);
        if (el) el.classList.toggle('nav-ring', !collapsed[group]);
      }
    }
  }

  // Transient open-confirmation tint, fading over ~1.2s. Animation-driven;
  // restart cleanly if the section is re-opened mid-fade.
  const tintTimers = {};
  function flashTint(el, group) {
    el.classList.remove('nav-flash');
    void el.offsetWidth; // restart the CSS animation
    el.classList.add('nav-flash');
    clearTimeout(tintTimers[group]);
    tintTimers[group] = setTimeout(() => el.classList.remove('nav-flash'), 1200);
  }

  // Single path for all expand/collapse changes: keeps the `collapsed` map and
  // the DOM class in sync, animates via CSS (no re-render), and applies the
  // open cues. Closing is plain — no highlight.
  function setSectionCollapsed(group, isCollapsed, opts = {}) {
    collapsed[group] = isCollapsed;
    const el = detailEl.querySelector(`.fx-section[data-group="${group}"]`);
    if (el) {
      el.classList.toggle('collapsed', isCollapsed);
      if (!isCollapsed) {
        if (opts.scroll) {
          const dr = detailEl.getBoundingClientRect();
          const er = el.getBoundingClientRect();
          if (er.top < dr.top || er.bottom > dr.bottom) {
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }
        if (opts.tint !== false) flashTint(el, group);
      }
    }
    updateKnobRings();
  }

  // Knob click TOGGLES its section (even when bypassed). Opening scrolls it
  // into view if needed. Values never change.
  function navToSection(group) {
    setSectionCollapsed(group, !collapsed[group], { scroll: true });
  }

  // BANK acts on mousedown, hardware-like: the bank advances and the LEDs
  // update at press time. The press VISUAL (.bank-pressed inversion) holds for
  // a minimum ~150ms so a quick click reads as intentional rather than a
  // glitch; held longer, it stays until release (window mouseup, so dragging
  // off the button still releases it).
  const BANK_MIN_PRESS_MS = 150;
  let bankPressedAt = 0;
  let bankReleaseTimer = null;
  panelStrip.addEventListener('mousedown', (e) => {
    const hit = e.target.closest('[data-hit="bank"]');
    if (!hit) return;
    const g = hit.closest('g');
    clearTimeout(bankReleaseTimer);
    g.classList.add('bank-pressed');
    bankPressedAt = performance.now();
    // Navigation only — the device selection is untouched until a preset is
    // pressed (mirrors the hardware's pending-bank behaviour loosely).
    bankIndex = (bankIndex + 1) % banks.length;
    renderAll();
  });
  window.addEventListener('mouseup', () => {
    const g = panelStrip.querySelector('g.bank-pressed');
    if (!g) return;
    const held = performance.now() - bankPressedAt;
    const remaining = Math.max(0, BANK_MIN_PRESS_MS - held);
    clearTimeout(bankReleaseTimer);
    bankReleaseTimer = setTimeout(() => g.classList.remove('bank-pressed'), remaining);
  });

  // Panel buttons drive the same state as the tabs/list below; preset buttons
  // select directly.
  panelStrip.addEventListener('click', (e) => {
    const knob = e.target.closest('[id^="knob-"]');
    if (knob && KNOB_TO_SECTION[knob.id]) {
      navToSection(KNOB_TO_SECTION[knob.id]);
      return;
    }
    const preset = e.target.closest('[id^="preset-"]');
    if (preset) {
      const n = Number(preset.id.replace('preset-', ''));
      if (n >= 1 && n <= 8) {
        deviceSel = { bank: bankIndex, preset: n - 1 };
        lastTouched = 'device';
        resetCollapsed();
        renderAll();
      }
    }
  });

  function setLed(id, on) {
    const el = panelStrip.querySelector(`#${id}`);
    if (el) el.classList.toggle('on', on);
  }

  function updatePanelLeds() {
    // Preset LEDs follow the device selection, and only while its bank is
    // the one displayed (same rule as the list rows).
    const sel = deviceSel && deviceSel.bank === bankIndex ? deviceSel.preset : -1;
    for (let b = 1; b <= 4; b++) setLed(`led-bank-${b}`, b - 1 === bankIndex);
    for (let p = 1; p <= 8; p++) setLed(`led-preset-${p}`, p - 1 === sel);
    // Preset button fills follow the LEDs.
    for (let p = 1; p <= 8; p++) {
      const btn = panelStrip.querySelector(`#preset-${p} .btn`);
      if (btn) btn.classList.toggle('on', p - 1 === sel);
    }
  }

  // ---- Library list ---------------------------------------------------------
  const tabsEl = document.getElementById('bank-tabs');
  const listEl = document.getElementById('patch-list');
  const detailEl = document.getElementById('detail');

  // Bank labels match the hardware panel (banks are numbered 1-4). Restore
  // prompts will tell the user which physical button to press.
  const bankLabel = (i) => `Bank ${banks[i].name}`;

  function renderTabs() {
    tabsEl.innerHTML = banks
      .map((b, i) =>
        `<button class="bank-tab${i === bankIndex ? ' active' : ''}" data-bank="${i}" type="button"><span class="bank-tab-label">Bank ${b.name}</span></button>`
      )
      .join('');
  }

  function renderList() {
    // The device selection shows only when its bank is the one displayed —
    // and it shows even while a library patch is ALSO selected (intended).
    // A slot with no backup renders honestly unknown; it is still selectable
    // (the selection is a POSITION on the hardware, not the patch data).
    const bank = banks[bankIndex];
    const sel = deviceSel && deviceSel.bank === bankIndex ? deviceSel.preset : -1;
    listEl.innerHTML = bank.patches
      .map((p, i) =>
        p && i === bankRenaming
          // The input prefills with what the ROW shows, not the stored name.
          // A backup's stored name is "Bank 4 Preset 1 — Tine Piano"; handing
          // that back means deleting a prefix you never saw before you can
          // type. Accepting it unchanged simply drops the prefix — no
          // information is lost, since bank and preset live in `origin`.
          ? `<div class="patch-row selected" data-index="${i}">` +
            `<span class="patch-num">${i + 1}</span>` +
            `<input class="lib-rename-input bank-rename" type="text" spellcheck="false" ` +
            `value="${String(p.name).replace(/"/g, '&quot;')}">` +
            `</div>`
          : p
          ? R.renderPatchRow(p, i, sel)
          : `<button class="patch-row empty-slot${i === sel ? ' selected' : ''}" data-index="${i}" type="button">` +
            `<span class="patch-num">${i + 1}</span>` +
            `<span class="patch-name">Not backed up</span>` +
            `</button>`
      )
      .join('');
  }

  function renderDetail() {
    const patch = currentPatch();
    // A library patch has no bank position — the pos line is omitted. A
    // device patch shows ITS bank/preset (the selection's, not the tab's).
    const pos =
      lastTouched === 'library' && libSelected
        ? {}
        : deviceSel
          ? { bankLabel: bankLabel(deviceSel.bank), patchNumber: deviceSel.preset + 1 }
          : {};
    const emptyMsg =
      lastTouched === 'device' && deviceSel
        ? `No backup of Bank ${deviceSel.bank + 1} · Preset ${deviceSel.preset + 1} yet — connect the Seven and click “Back up instrument”.`
        : 'Select a patch';
    detailEl.innerHTML = patch
      ? R.renderDetail(patch, { showRaw, collapsed, ...pos })
      : `<div class="placeholder">${emptyMsg}</div>`;
    updateKnobRings();
  }

  // Region header carries the honesty label: this view is what the LAST
  // BACKUP saw, not a live read — the Seven has no read-slot opcode.
  const sevenHead = document.getElementById('seven-head');
  // Shared by the expanded header and the collapsed strip, so the two can
  // never drift or depend on each other's render order.
  function asOfText() {
    const d = banksAsOf ? new Date(banksAsOf) : null;
    if (!d || isNaN(d)) return '';
    return `as of last backup · ${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}`;
  }

  function updateSevenHead() {
    const fmt = (iso) => {
      const d = new Date(iso);
      return isNaN(d) ? '' : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
    };
    sevenHead.innerHTML = banksAsOf
      ? `On the Seven <span class="asof">as of last backup · ${fmt(banksAsOf)}</span>`
      : `On the Seven <span class="asof">not yet backed up</span>`;
  }

  // Lit knob = its effect is ON in the selected patch (amber cap fill + amber
  // outline; the accent EXPANDED ring is a separate cue on the outer ring only
  // — both can show at once). Interim amber scheme; the eventual target is the
  // manual's RGB value-encoding (docs/DESIGN.md).
  const KNOB_LIT_SWITCH = {
    // Master volume has no switch — always lit. Its Local Off state (knob turns
    // BLUE on the hardware; slow push ≥100ms toggles, quick push switches the
    // displayed parameter) is a device-reported cue for when MIDI lands —
    // TODO(device); SysEx visibility unknown (docs/PROJECT-SCOPE.md).
    // veq_byp is EQ *Bypass* — INVERTED: 1 means bypassed, so the EQ knobs are
    // lit when it reads 0.
    'knob-volume': null,
    'knob-bass-mid': { sw: 'veq_byp', invert: true },
    'knob-treble-midf': { sw: 'veq_byp', invert: true },
    'knob-reverb': { sw: 'rev_sw' },
    'knob-fx1': { sw: 'fx1_sw' },
    'knob-fx2': { sw: 'fx2_sw' },
    'knob-amp-drive': { sw: 'amp_sw' },
    'knob-pad': { sw: 'pad_sw' },
  };
  // The value each knob DISPLAYS (its default parameter — the one the
  // hardware shows before any push-toggle). The manual's lighting scheme
  // (DESIGN.md "Knob lighting"): colour encodes value, green at low running
  // to red at high — confirmed live on the Volume knob. The Reverb Decay
  // blue→red and pulsing FX Rate variants apply to the knobs' ALTERNATE
  // parameters, which the strip doesn't render.
  const KNOB_VALUE_PARAM = {
    'knob-volume': 'veq_vol',
    'knob-reverb': 'rev_lv',
    'knob-bass-mid': 'veq_bas',
    'knob-treble-midf': 'veq_trb',
    'knob-fx1': 'fx1_dp',
    'knob-fx2': 'fx2_dp',
    'knob-amp-drive': 'amp_dr',
    'knob-pad': 'pad_lv',
  };
  const KNOB_COLOR_VARS = [
    '--k-glow-fill', '--k-bore-fill', '--k-bore-stroke', '--k-top-stroke',
    '--k-mid-stroke', '--k-skirt-stroke', '--k-rib-stroke', '--k-shadow',
  ];
  function updateKnobLit() {
    const patch = currentPatch();
    for (const [id, spec] of Object.entries(KNOB_LIT_SWITCH)) {
      const el = panelStrip.querySelector(`#${id}`);
      if (!el) continue;
      const lit =
        !!patch &&
        (spec === null ||
          (spec.invert ? patch.params[spec.sw] === 0 : patch.params[spec.sw] === 1));
      el.classList.toggle('knob-lit', lit);
      if (!lit) {
        for (const v of KNOB_COLOR_VARS) el.style.removeProperty(v);
        continue;
      }
      // Value → hue: green (120°) at 0 sweeping to red (0°) at max.
      const key = KNOB_VALUE_PARAM[id];
      const max = (schema.parameters.find((p) => p.key === key) || {}).max || 127;
      const value = Math.max(0, Math.min(max, patch.params[key] ?? 0));
      const hue = Math.round(120 * (1 - value / max));
      const c = (l, a) => `hsla(${hue}, 90%, ${l}%, ${a})`;
      el.style.setProperty('--k-glow-fill', c(55, 0.30));
      el.style.setProperty('--k-bore-fill', c(72, 1));
      el.style.setProperty('--k-bore-stroke', c(55, 1));
      el.style.setProperty('--k-top-stroke', c(70, 0.65));
      el.style.setProperty('--k-mid-stroke', c(65, 0.35));
      el.style.setProperty('--k-skirt-stroke', c(65, 0.55));
      el.style.setProperty('--k-rib-stroke', c(70, 0.4));
      el.style.setProperty('--k-shadow', c(55, 0.45));
    }
  }

  // Clavi tabs only act on the modeled Clavi engine. Dim the whole group unless
  // the selected sound resolves to pno_zd6 — resolved from the ENGINE GROUP, not
  // the sound name: "Sampled Clavi Piano" runs the pno_rom sample player and
  // must render inactive.
  function updateClaviGroup() {
    const group = panelStrip.querySelector('#clavi-group');
    if (!group) return;
    const patch = currentPatch();
    const active = !!patch && R.engineGroupFor(patch) === 'pno_zd6';
    group.classList.toggle('inactive', !active);
  }

  function renderAll() {
    renderTabs();
    renderList();
    const renameField = listEl.querySelector('.bank-rename');
    if (renameField) { renameField.focus(); renameField.select(); }
    renderDetail();
    updatePanelLeds();
    updateKnobLit();
    updateClaviGroup();
    // Function declaration in the library block below — hoisted, and
    // renderAll only ever runs after the whole IIFE has initialised.
    updateBankStrip();
  }

  tabsEl.addEventListener('click', (e) => {
    const tab = e.target.closest('.bank-tab');
    if (!tab) return;
    // Navigation only — browsing banks never changes either selection.
    bankIndex = Number(tab.dataset.bank);
    renderAll();
  });

  // Same paired-click rename as the library (see library-view.js for why a
  // dblclick listener can't work here).
  let lastSlotClick = { key: null, t: 0 };

  listEl.addEventListener('click', (e) => {
    const row = e.target.closest('.patch-row');
    if (!row) return;
    if (e.target.closest('.patch-name') && banks[bankIndex].patches[Number(row.dataset.index)]) {
      const key = `${bankIndex}:${row.dataset.index}`;
      const now = Date.now();
      if (lastSlotClick.key === key && now - lastSlotClick.t < 450) {
        lastSlotClick = { key: null, t: 0 };
        bankRenaming = Number(row.dataset.index);
        renderAll();
        return;
      }
      lastSlotClick = { key, t: now };
    }
    // A slot's name IS its backup patch's name — the Seven stores none. The
    // pencil therefore renames that library file; both regions then show the
    // new name, because both read the same file.

    deviceSel = { bank: bankIndex, preset: Number(row.dataset.index) };
    lastTouched = 'device';
    resetCollapsed();
    renderAll();
  });

  async function commitBankRename(value) {
    const i = bankRenaming;
    bankRenaming = null;
    const patch = banks[bankIndex].patches[i];
    const entry = patch && libEntries.find((x) => x.file === patch.file);
    const name = String(value).trim();
    if (!entry || !name || name === entry.name) { renderAll(); return; }
    await window.sevenAPI.library.rename(entry.file, entry.patchIndex, name);
    await refreshLibrary();
  }

  listEl.addEventListener('keydown', (e) => {
    if (!e.target.classList.contains('bank-rename')) return;
    if (e.key === 'Enter') commitBankRename(e.target.value);
    else if (e.key === 'Escape') { bankRenaming = null; renderAll(); }
  });
  listEl.addEventListener('focusout', (e) => {
    if (e.target.classList.contains('bank-rename') && bankRenaming != null) {
      commitBankRename(e.target.value);
    }
  });

  // Transient inline note next to a device-state control that can't act yet.
  function showDeviceNote(host) {
    let note = host.querySelector('.device-note');
    if (!note) {
      note = document.createElement('span');
      note.className = 'device-note';
      host.appendChild(note);
    }
    note.textContent = 'No instrument connected.';
    clearTimeout(note._timer);
    note._timer = setTimeout(() => note.remove(), 1800);
  }

  // The state pill reflects DEVICE state only — it never flips from a click
  // (docs/DESIGN.md). A write can fail; render what the instrument reports.
  function handleStatePill(pill) {
    // TODO(device): when MIDI lands, this becomes:
    //   1. send set-parameter (0x20) for the switch id (pill.dataset.switch)
    //      with the toggled value,
    //   2. await the device reply,
    //   3. re-render the pill from the value the DEVICE reports.
    // Until then: no device, so the pill stays put and we say why.
    showDeviceNote(pill.parentElement);
  }

  // Clicking a section header toggles it regardless of switch state — values in
  // a bypassed section must stay reachable. The state pill is its own control
  // and must not toggle collapse.
  detailEl.addEventListener('click', (e) => {
    const pill = e.target.closest('.fx-state');
    if (pill) {
      handleStatePill(pill);
      return;
    }
    const head = e.target.closest('.fx-head');
    if (!head || !head.dataset.group) return;
    // Toggle without re-render so the body height animates. Knob rings update
    // as part of setSectionCollapsed (persistent while open; pdl_exp has none).
    setSectionCollapsed(head.dataset.group, !collapsed[head.dataset.group]);
  });

  // Enum dropdowns follow the same honesty rule as the pill: a change never
  // updates local state. Revert to the patch value and say why. Because state
  // never forks, the FX2-mode-conditional sub-parameters (phaser at 1, delay
  // at 3) always read the same patch.params value the select shows.
  detailEl.addEventListener('change', (e) => {
    const sel = e.target.closest('.param-select');
    if (!sel) return;
    // TODO(device): when MIDI lands, this becomes:
    //   1. send set-parameter (0x20) for the param behind sel.dataset.key with
    //      Number(sel.value),
    //   2. await the device reply,
    //   3. re-render from the value the DEVICE reports (which also refreshes
    //      any mode-conditional sub-parameters).
    // Until then: revert the select — the control reflects device state only.
    const patch = currentPatch();
    if (patch) sel.value = String(patch.params[sel.dataset.key] ?? 0);
    // Chromium keeps :focus-visible on selects after mouse interaction; drop
    // focus so the accent ring doesn't linger as a false selected state.
    sel.blur();
    showDeviceNote(sel.closest('.param-value'));
  });

  // ---- Library section (on-disk library; data via preload IPC) --------------
  // Collapsible section below the bank rows. Reuses the fx-section disclosure
  // classes; expanded/collapsed persists across launches (view state —
  // localStorage, never patch data). The body is the self-contained
  // SevenLibraryView component: data in, events out.
  const libRoot = document.getElementById('library');
  const libSection = document.getElementById('library-section');
  const libHead = document.getElementById('library-head');
  const libCount = document.getElementById('library-count');
  const libReveal = document.getElementById('library-reveal');
  const bankStrip = document.getElementById('bank-strip');
  const bankStripLabel = document.getElementById('bank-strip-label');
  const splitDivider = document.getElementById('split-divider');
  const LIB_OPEN_KEY = 'seven.libraryOpen';
  const LIB_SPLIT_KEY = 'seven.librarySplit';

  // Library selection: when set, the detail view renders this entry instead of
  // the bank patch. Bank/preset clicks clear it.
  let libSelected = null;
  let libEntries = [];
  let bankRenaming = null; // preset index being renamed in the bank list

  const libToRendererPatch = (entry) => ({
    name: entry.name,
    soundName: entry.soundName,
    sampled: entry.sampled,
    params: entry.params,
  });

  const libView = SevenLibraryView.createLibraryView({
    el: document.getElementById('library-body'),
    on: {
      // Every sound the schema knows (read off the instrument, FW 1.37) —
      // the picker's Instruments tab. Sound-only slots reference these by NAME,
      // never by id: ids are not portable across units (schema soundsNote).
      sounds: schema.sounds,
      select(entry) {
        // Independent of the device selection — both stay set, both stay
        // visibly selected; the detail panel follows the last touch.
        libSelected = entry;
        lastTouched = 'library';
        resetCollapsed();
        renderAll();
      },
      async contextMenu(entry) {
        const action = await window.sevenAPI.library.contextMenu();
        if (!action) return;
        if (action === 'rename') {
          libView.beginRename(entry);
          return;
        }
        if (action === 'duplicate') await window.sevenAPI.library.duplicate(entry.file, entry.patchIndex);
        else if (action === 'trash') {
          await window.sevenAPI.library.trash(entry.file);
          if (libSelected && libSelected.file === entry.file) libSelected = null;
        } else if (action === 'export') {
          await window.sevenAPI.library.export(entry.file, `${entry.name}.sevenlib.json`);
          return; // nothing on disk changed inside the library folder
        }
        await refreshLibrary();
      },
      async rename(entry, newName) {
        const newFile = await window.sevenAPI.library.rename(entry.file, entry.patchIndex, newName);
        if (libSelected && libSelected.file === entry.file) {
          libSelected = { ...libSelected, file: newFile, name: newName };
        }
        await refreshLibrary();
        // The file is renamed too and the list is name-sorted, so the row has
        // moved — follow it, otherwise the rename looks like it was discarded.
        libView.reveal(newFile, entry.patchIndex);
      },
      // ---- setlist editing (every mutation persists via IPC, then re-syncs) --
      async createSetlist(name) {
        await window.sevenAPI.setlists.create(name);
        await refreshLibrary();
      },
      async renameSetlist(index, name) {
        await window.sevenAPI.setlists.rename(index, name);
        await refreshLibrary();
      },
      // Shared by the trash icon and the context menu's Delete — one confirm,
      // one path. Deleting a setlist never touches the patches it references.
      async deleteSetlist(index, name) {
        if (await window.sevenAPI.setlists.confirmDelete(name)) {
          await window.sevenAPI.setlists.delete(index);
          await refreshLibrary();
        }
      },
      async setlistMenu(index, name) {
        const action = await window.sevenAPI.setlists.contextMenu();
        if (action === 'rename') {
          libView.beginSetlistRename(index);
        } else if (action === 'delete') {
          // Confirm first; deleting a setlist never touches the patches.
          if (await window.sevenAPI.setlists.confirmDelete(name)) {
            await window.sevenAPI.setlists.delete(index);
            await refreshLibrary();
          }
        }
      },
      async assignSlot(index, slot, file) {
        await window.sevenAPI.setlists.assign(index, slot, file);
        await refreshLibrary();
      },
      async clearSlot(index, slot) {
        await window.sevenAPI.setlists.clear(index, slot);
        await refreshLibrary();
      },
      async moveSlot(index, from, to) {
        await window.sevenAPI.setlists.move(index, from, to);
        await refreshLibrary();
      },
    },
  });

  async function refreshLibrary() {
    const data = await window.sevenAPI.library.list();
    libEntries = data.patches;
    libView.update(data);
    const n = data.patches.filter((e) => !e.invalid).length;
    libCount.textContent = `— ${n} patch${n === 1 ? '' : 'es'}`;
    // The bank region derives from the same list — one fetch feeds both.
    rebuildBanks(data.patches);
    updateSevenHead();
    // Keep the detail in sync if the selected entry changed on disk.
    if (libSelected) {
      const fresh = data.patches.find(
        (e) => e.file === libSelected.file && e.patchIndex === libSelected.patchIndex
      );
      if (fresh) {
        libSelected = fresh;
        libView.select(fresh);
      } else {
        libSelected = null;
        // The library half of the split selection is gone; the detail panel
        // falls back to the device selection.
        if (lastTouched === 'library') lastTouched = 'device';
      }
    }
    renderAll();
  }

  // The bank summary strip shown while the Library is expanded. It ALWAYS
  // shows the device selection when one exists — regardless of what's
  // selected in the library — and falls back to bank-only when no preset has
  // been selected this session.
  function updateBankStrip() {
    if (deviceSel) {
      const bank = banks[deviceSel.bank];
      const patch = bank.patches[deviceSel.preset];
      bankStripLabel.textContent = `— Bank ${bank.name}${patch ? ` · ${patch.name}` : ''}`;
    } else {
      bankStripLabel.textContent = `— Bank ${banks[bankIndex].name}`;
    }
    // The honesty label rides along, so collapsing the region never hides the
    // fact that this view is only as fresh as the last backup.
    const asof = document.getElementById('bank-strip-asof');
    if (asof) asof.textContent = asOfText();
  }

  // The two regions expand mutually exclusively: opening the Library
  // collapses the bank rows to the strip; re-expanding the banks collapses
  // the Library back to its header. View state, persisted across launches.
  function setLibraryOpen(open, opts = {}) {
    libSection.classList.toggle('collapsed', !open);
    libRoot.classList.toggle('lib-open', open);
    updateBankStrip();
    localStorage.setItem(LIB_OPEN_KEY, open ? '1' : '0');
    // Never open below the fold.
    if (open && opts.scroll !== false) libSection.scrollIntoView({ block: 'nearest' });
  }
  libHead.addEventListener('click', (e) => {
    if (e.target.closest('#library-reveal')) return; // button, not a toggle
    setLibraryOpen(libSection.classList.contains('collapsed'));
  });
  bankStrip.addEventListener('click', () => setLibraryOpen(false));
  libReveal.addEventListener('click', () => window.sevenAPI.library.reveal());

  // Divider drag: sets the Library list height (--lib-split), persisted as a
  // FRACTION of the region rather than pixels. A pixel split saved on a tall
  // window left dead space under the list on a short one and clipped it on a
  // taller one; a fraction scales with whatever window the app opens in.
  let splitFraction = Number(localStorage.getItem(LIB_SPLIT_KEY)) || 0;
  // Migrate the old pixel value: anything >= 1.5 was px, not a fraction.
  if (splitFraction >= 1.5) {
    splitFraction = libRoot.clientHeight ? splitFraction / libRoot.clientHeight : 0;
    if (splitFraction > 0) localStorage.setItem(LIB_SPLIT_KEY, String(splitFraction));
  }
  splitFraction = splitFraction > 0.05 && splitFraction < 0.98 ? splitFraction : 0;

  // No saved split means no cap at all — the list fills what the window gives.
  function applySplit() {
    if (!splitFraction) {
      libRoot.style.removeProperty('--lib-split');
      return;
    }
    const h = Math.max(80, Math.round(libRoot.clientHeight * splitFraction));
    libRoot.style.setProperty('--lib-split', `${h}px`);
  }
  applySplit();
  window.addEventListener('resize', applySplit);
  splitDivider.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const list = document.querySelector('#library-body .lib-list');
    if (!list) return;
    const startY = e.clientY;
    const startH = list.getBoundingClientRect().height;
    const onMove = (ev) => {
      // Dragging down gives the bank region more room, the Library less.
      const h = Math.max(80, Math.round(startH - (ev.clientY - startY)));
      libRoot.style.setProperty('--lib-split', `${h}px`);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const h = parseInt(libRoot.style.getPropertyValue('--lib-split'), 10);
      const total = libRoot.clientHeight;
      if (h >= 80 && total) {
        splitFraction = h / total;
        localStorage.setItem(LIB_SPLIT_KEY, String(splitFraction));
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });

  // Default: banks expanded, Library collapsed; persisted view state wins.
  setLibraryOpen(localStorage.getItem(LIB_OPEN_KEY) === '1', { scroll: false });
  refreshLibrary();

  // ---- View menu commands (main process → here) -----------------------------
  if (window.sevenAPI.onViewCommand) {
    window.sevenAPI.onViewCommand((msg) => {
      if (msg.type === 'theme') {
        applyTheme(msg.value);
      } else if (msg.type === 'showRaw') {
        showRaw = !!msg.value;
        renderDetail();
      } else if (msg.type === 'expandAll') {
        // Animated class toggles; no tint — the open-confirmation cue is for
        // direct opens, not bulk menu actions.
        for (const s of R.FX_SECTIONS) setSectionCollapsed(s.group, false, { tint: false });
      } else if (msg.type === 'collapseAll') {
        for (const s of R.FX_SECTIONS) setSectionCollapsed(s.group, true);
      }
    });
  }

  // ---- Connection row (real MIDI through the preload seam) ------------------
  // The renderer only sees decoded status objects and events; connect() rejects
  // with a user-facing message (probe failure, device missing).
  if (window.sevenAPI.midi) {
    const connRow = document.getElementById('connection-row');
    const connText = document.getElementById('connection-text');
    const connBtn = document.getElementById('conn-button');
    const backupBtn = document.getElementById('backup-button');
    const soundsBtn = document.getElementById('sounds-button');
    const soundsPanel = document.getElementById('sounds-panel');
    let backupRunning = false;

    // Expansion visibility: the connected unit's own sound table. Ids are
    // unit-specific (they shift with installed expansions), which is exactly
    // why the panel shows them next to the names — and why backups reference
    // the table fingerprint shown in the footer.
    const renderSoundsPanel = (table) => {
      const cols = soundsPanel.querySelector('.sounds-cols');
      const foot = soundsPanel.querySelector('.sounds-foot');
      const group = (title, sounds) => {
        const div = document.createElement('div');
        div.className = 'sounds-group';
        const h = document.createElement('h4');
        h.textContent = title;
        div.appendChild(h);
        for (const s of sounds) {
          const row = document.createElement('div');
          row.className = 'sound-row';
          const id = document.createElement('span');
          id.className = 'sound-id';
          id.textContent = s.id;
          const name = document.createElement('span');
          name.textContent = s.name;
          row.append(id, name);
          div.appendChild(row);
        }
        return div;
      };
      cols.replaceChildren(
        group('Modeled', table.sounds.filter((s) => !s.sampled)),
        group('Sampled — GSP-01 expansions', table.sounds.filter((s) => s.sampled))
      );
      const when = new Date(table.readAt);
      foot.textContent =
        `Read from this unit at ${when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · fingerprint ${table.fingerprint} — backups reference this fingerprint so a patch can name a sound another Seven lacks.`;
    };

    const setSoundsOpen = (open) => {
      soundsPanel.hidden = !open;
      soundsBtn.classList.toggle('open', open);
    };
    soundsBtn.addEventListener('click', () => setSoundsOpen(soundsPanel.hidden));
    document.addEventListener('click', (e) => {
      if (!soundsPanel.hidden && !soundsPanel.contains(e.target) && e.target !== soundsBtn) {
        setSoundsOpen(false);
      }
    });

    const showStatus = (s, error) => {
      connRow.className = s.state === 'connected' ? 'connected'
        : s.state === 'connecting' ? 'connecting'
        : error ? 'failed' : '';
      if (s.state === 'connected') {
        // "Pronto" — ready, and what an Italian says answering the phone:
        // the instrument has just spoken for the first time. Crumar was built
        // in Castelfidardo; this is the one place the app nods to that.
        // Firmware stays visible beside it — every protocol fact in this
        // project is version-gated, so the version is never decoration.
        connText.innerHTML =
          `Pronto · <span class="conn-name">Crumar Seven</span>` +
          `<span class="conn-fw">${String(s.firmware).replace(/[&<>"]/g, '')}</span>`;
        connBtn.textContent = 'Disconnect';
        if (s.soundTable) {
          soundsBtn.textContent = `${s.soundTable.sounds.length} sounds`;
          renderSoundsPanel(s.soundTable);
        }
      } else if (s.state === 'connecting') {
        connText.textContent = 'Connecting…';
      } else {
        connText.textContent = error || 'No instrument connected';
        connBtn.textContent = 'Connect';
      }
      connBtn.disabled = s.state === 'connecting';
      backupBtn.hidden = s.state !== 'connected';
      soundsBtn.hidden = s.state !== 'connected' || !s.soundTable;
      if (s.state !== 'connected') { backupRunning = false; setSoundsOpen(false); }
    };

    const fmtElapsed = (ms) => `${Math.round(ms / 1000)}s`;

    const showBackupDone = (ev) => {
      backupRunning = false;
      backupBtn.textContent = 'Back up instrument';
      connBtn.disabled = false;
      if (!ev.ok) {
        connText.textContent = `Backup ${ev.slots ? `stopped after ${ev.slots}/32` : 'failed'} — ${ev.error || 'aborted'}`;
        return;
      }
      const where = ev.restored
        ? `returned to Bank ${ev.finalBank} · Preset ${ev.finalPreset}`
        : `Bank ${ev.finalBank} · Preset ${ev.finalPreset} is loaded`;
      const counts = `${ev.unchanged} unchanged, ${ev.created} new`;
      connText.textContent = ev.cancelled
        ? `Backup cancelled at ${ev.slots}/32 — ${counts} · ${where}`
        : `Backed up 32/32 in ${fmtElapsed(ev.durationMs)} — ${counts} · ${where}`;
      refreshLibrary();
    };

    backupBtn.addEventListener('click', async () => {
      if (backupRunning) {
        await window.sevenAPI.midi.cancelBackup();
        backupBtn.textContent = 'Cancelling…';
        return;
      }
      const { started } = await window.sevenAPI.midi.backup();
      if (started) {
        backupRunning = true;
        backupBtn.textContent = 'Cancel backup';
        connBtn.disabled = true;
        connText.textContent = 'Backing up… starting';
      }
    });

    connBtn.addEventListener('click', async () => {
      const connected = connRow.classList.contains('connected');
      try {
        if (connected) await window.sevenAPI.midi.disconnect();
        else await window.sevenAPI.midi.connect();
      } catch (err) {
        // Message text comes from the layer (already user-facing).
        showStatus({ state: 'disconnected' }, err.message.replace(/^.*Error: /, ''));
      }
    });

    window.sevenAPI.midi.onEvent((ev) => {
      if (ev.type === 'status') showStatus(ev, ev.error);
      else if (ev.type === 'backup-progress') {
        connText.textContent =
          `Backing up… ${ev.n}/${ev.total} — Bank ${ev.bank} · Preset ${ev.preset} · ${ev.name} · ${fmtElapsed(ev.elapsedMs)}`;
      } else if (ev.type === 'backup-done') showBackupDone(ev);
      else if (ev.type === 'program-change' && !backupRunning) {
        // Send PC on: panel recalls are slot-identified, so the bank region
        // follows the hardware. Suppressed during a backup run — those PCs
        // are ours.
        deviceSel = { bank: ev.bank - 1, preset: ev.preset - 1 };
        bankIndex = ev.bank - 1;
        lastTouched = 'device';
        resetCollapsed();
        renderAll();
      }
      // current-sound events also arrive here (recalls without Send PC give
      // sound identity but not the slot — not enough to move the selection).
    });

    window.sevenAPI.midi.status().then((s) => showStatus(s));
  }

  resetCollapsed();
  renderAll();
})();
