'use strict';

// App glue: owns UI state (selected bank/patch + view state), injects the panel
// SVG, and asks SevenRenderer for HTML. The ONLY data sources are the sevenAPI
// getters — no view code touches a device, and swapping the fixture for real
// MIDI changes preload.js alone.

(function () {
  // Self-hosted fonts (Archivo for the panel strip, Inter for the UI) — must be
  // registered before any rendering so nothing flashes in a fallback face.
  const fontStyle = document.createElement('style');
  fontStyle.textContent = window.sevenAPI.getFontCss();
  document.head.appendChild(fontStyle);

  // ---- Data (single library object; swappable source) ----------------------
  const library = window.sevenAPI.getLibrary();
  const schema = window.sevenAPI.getSchema();
  const R = SevenRenderer.createRenderer(schema, SevenDefaults.defaultFor);

  // ---- UI state -------------------------------------------------------------
  let bankIndex = 0;
  let patchIndex = 0; // selected patch within the bank; -1 = none

  // View state only — never written to a patch or the library.
  let showRaw = false;
  let collapsed = {}; // section group -> bool

  const currentPatch = () => library.banks[bankIndex].patches[patchIndex] || null;

  // A section whose switch is 0 starts collapsed; switch 1 (or no switch)
  // starts expanded. Recomputed whenever the selected patch changes.
  function resetCollapsed() {
    collapsed = {};
    const patch = currentPatch();
    if (!patch) return;
    for (const s of R.FX_SECTIONS) {
      collapsed[s.group] = s.sw != null && patch.params[s.sw] === 0;
    }
  }

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

  const flashTimers = {};
  function flashSection(group) {
    const el = detailEl.querySelector(`.fx-section[data-group="${group}"]`);
    if (!el) return;
    el.classList.add('nav-flash');
    clearTimeout(flashTimers['s:' + group]);
    flashTimers['s:' + group] = setTimeout(() => el.classList.remove('nav-flash'), 1500);
  }
  function flashKnobs(group) {
    for (const id of SECTION_TO_KNOBS[group] || []) {
      const el = panelStrip.querySelector(`#${id}`);
      if (!el) continue;
      el.classList.add('nav-ring');
      clearTimeout(flashTimers['k:' + id]);
      flashTimers['k:' + id] = setTimeout(() => el.classList.remove('nav-ring'), 1500);
    }
  }

  // Knob click → expand (even when bypassed), scroll into view only if not
  // already visible, and flash both ends. Values never change.
  function navToSection(group) {
    if (collapsed[group]) {
      collapsed[group] = false;
      renderDetail();
    }
    const el = detailEl.querySelector(`.fx-section[data-group="${group}"]`);
    if (!el) return;
    const dr = detailEl.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    if (er.top < dr.top || er.bottom > dr.bottom) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    flashSection(group);
    flashKnobs(group);
  }

  // Panel buttons drive the same state as the tabs/list below. BANK cycles
  // 1→2→3→4→1 like the hardware; preset buttons select directly.
  panelStrip.addEventListener('click', (e) => {
    const knob = e.target.closest('[id^="knob-"]');
    if (knob && KNOB_TO_SECTION[knob.id]) {
      navToSection(KNOB_TO_SECTION[knob.id]);
      return;
    }
    if (e.target.closest('#btn-bank')) {
      bankIndex = (bankIndex + 1) % library.banks.length;
      resetCollapsed();
      renderAll();
      return;
    }
    const preset = e.target.closest('[id^="preset-"]');
    if (preset) {
      const n = Number(preset.id.replace('preset-', ''));
      if (n >= 1 && n <= 8) {
        patchIndex = n - 1;
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
    for (let b = 1; b <= 4; b++) setLed(`led-bank-${b}`, b - 1 === bankIndex);
    for (let p = 1; p <= 8; p++) setLed(`led-preset-${p}`, p - 1 === patchIndex);
    // Preset button fills follow the LEDs.
    for (let p = 1; p <= 8; p++) {
      const btn = panelStrip.querySelector(`#preset-${p} .btn`);
      if (btn) btn.classList.toggle('on', p - 1 === patchIndex);
    }
  }

  // ---- Library list ---------------------------------------------------------
  const tabsEl = document.getElementById('bank-tabs');
  const listEl = document.getElementById('patch-list');
  const detailEl = document.getElementById('detail');

  // Bank labels match the hardware panel (banks are numbered 1-4). Restore
  // prompts will tell the user which physical button to press.
  const bankLabel = (i) => `Bank ${library.banks[i].name}`;

  function renderTabs() {
    tabsEl.innerHTML = library.banks
      .map((b, i) =>
        `<button class="bank-tab${i === bankIndex ? ' active' : ''}" data-bank="${i}" type="button"><span class="bank-tab-label">Bank ${b.name}</span></button>`
      )
      .join('');
  }

  function renderList() {
    const bank = library.banks[bankIndex];
    listEl.innerHTML = bank.patches
      .map((p, i) => R.renderPatchRow(p, i, patchIndex))
      .join('');
  }

  function renderDetail() {
    const patch = currentPatch();
    detailEl.innerHTML = patch
      ? R.renderDetail(patch, {
          showRaw,
          collapsed,
          bankLabel: bankLabel(bankIndex),
          patchNumber: patchIndex + 1,
        })
      : '<div class="placeholder">Select a patch</div>';
  }

  function renderAll() {
    renderTabs();
    renderList();
    renderDetail();
    updatePanelLeds();
  }

  tabsEl.addEventListener('click', (e) => {
    const tab = e.target.closest('.bank-tab');
    if (!tab) return;
    bankIndex = Number(tab.dataset.bank);
    patchIndex = 0; // selecting a bank lands on its first patch
    resetCollapsed();
    renderAll();
  });

  listEl.addEventListener('click', (e) => {
    const row = e.target.closest('.patch-row');
    if (!row) return;
    patchIndex = Number(row.dataset.index);
    resetCollapsed();
    renderAll();
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
    collapsed[head.dataset.group] = !collapsed[head.dataset.group];
    renderDetail();
    // Bidirectional nav: touching a section lights up its knob(s) on the strip
    // (all three for efx_veq). Sections without a mapped knob are a no-op.
    flashKnobs(head.dataset.group);
    if (!collapsed[head.dataset.group]) flashSection(head.dataset.group);
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
    showDeviceNote(sel.closest('.param-value'));
  });

  // ---- View menu commands (main process → here) -----------------------------
  if (window.sevenAPI.onViewCommand) {
    window.sevenAPI.onViewCommand((msg) => {
      if (msg.type === 'showRaw') {
        showRaw = !!msg.value;
      } else if (msg.type === 'expandAll') {
        for (const s of R.FX_SECTIONS) collapsed[s.group] = false;
      } else if (msg.type === 'collapseAll') {
        for (const s of R.FX_SECTIONS) collapsed[s.group] = true;
      }
      renderDetail();
    });
  }

  resetCollapsed();
  renderAll();
})();
