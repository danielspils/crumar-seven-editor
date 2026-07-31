'use strict';

// App glue: owns UI state (selected bank/patch), injects the panel SVG, and asks
// SevenRenderer for HTML. The ONLY data sources are the three sevenAPI getters —
// no view code touches a device, and swapping the fixture for real MIDI changes
// preload.js alone.

(function () {
  // ---- Data (single library object; swappable source) ----------------------
  const library = window.sevenAPI.getLibrary();
  const schema = window.sevenAPI.getSchema();
  const R = SevenRenderer.createRenderer(schema, SevenDefaults.defaultFor);

  // ---- UI state -------------------------------------------------------------
  let bankIndex = 0;
  let patchIndex = 0; // selected patch within the bank; -1 = none

  // ---- Panel strip (inline SVG so element ids are addressable) -------------
  const panelStrip = document.getElementById('panel-strip');
  panelStrip.innerHTML = window.sevenAPI.getPanelSvg(); // keeps class="readonly"
  document.getElementById('app-logo').innerHTML = window.sevenAPI.getLogoSvg();

  // Panel buttons drive the same state as the tabs/list below. BANK cycles
  // 1→2→3→4→1 like the hardware; preset buttons select directly.
  panelStrip.addEventListener('click', (e) => {
    if (e.target.closest('#btn-bank')) {
      bankIndex = (bankIndex + 1) % library.banks.length;
      renderAll();
      return;
    }
    const preset = e.target.closest('[id^="preset-"]');
    if (preset) {
      const n = Number(preset.id.replace('preset-', ''));
      if (n >= 1 && n <= 8) {
        patchIndex = n - 1;
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

  function renderTabs() {
    tabsEl.innerHTML = library.banks
      .map((b, i) =>
        `<button class="bank-tab${i === bankIndex ? ' active' : ''}" data-bank="${i}" type="button">BANK ${b.name}</button>`
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
    const bank = library.banks[bankIndex];
    const patch = bank.patches[patchIndex];
    detailEl.innerHTML = patch
      ? R.renderDetail(patch)
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
    renderAll();
  });

  listEl.addEventListener('click', (e) => {
    const row = e.target.closest('.patch-row');
    if (!row) return;
    patchIndex = Number(row.dataset.index);
    renderAll();
  });

  renderAll();
})();
