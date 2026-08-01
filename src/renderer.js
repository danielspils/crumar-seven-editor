'use strict';

// Pure view layer: turns a patch (from the single library object) + the static
// schema into HTML. No DOM, no device, no globals — everything comes in as
// arguments, so it can be unit-tested in Node and reused unchanged when the
// library object starts coming from real MIDI instead of the fixture.
//
// View state (never persisted to a patch): callers pass a `view` object —
//   { showRaw: bool,            raw numeric values visible on every row
//     collapsed: {group: bool}, per-section expand/collapse
//     bankLabel: 'Bank 1',      hardware-matching bank label for the header
//     patchNumber: 3 }          1-based position within the bank

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SevenRenderer = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const esc = (s) =>
    String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Effects chain, top to bottom. `sw` is the switch whose value 0 dims the
  // section (never inferred from a parameter value). pdl_exp has no switch.
  const FX_SECTIONS = [
    { title: 'Master Volume / EQ', group: 'efx_veq', sw: 'veq_byp' },
    { title: 'FX1', group: 'efx_fx1', sw: 'fx1_sw' },
    { title: 'FX2', group: 'efx_fx2', sw: 'fx2_sw', fx2: true },
    { title: 'Amp Simulator', group: 'efx_amp', sw: 'amp_sw' },
    { title: 'Reverb', group: 'efx_rev', sw: 'rev_sw' },
    { title: 'Synth Pad', group: 'efx_pad', sw: 'pad_sw' },
    { title: 'Expression Pedal', group: 'pdl_exp', sw: null },
  ];

  // Section on/off switches drive the ON/OFF badge; showing them again as
  // parameter rows would state the same fact twice. Display-only filter — the
  // values are still stored and backed up.
  const SWITCH_KEYS = new Set(['veq_byp', 'fx1_sw', 'fx2_sw', 'amp_sw', 'rev_sw', 'pad_sw']);

  // Sound → engine group. Any sampled sound (incl. a missing one) is the sample
  // player; modeled sounds map by name.
  function engineGroupFor(patch) {
    if (patch.sampled) return 'pno_rom';
    const n = patch.soundName || '';
    if (/Tine/i.test(n)) return 'pno_rho';
    if (/Reed/i.test(n)) return 'pno_wur';
    if (/Electric Grand/i.test(n)) return 'pno_egp';
    if (/Clavi/i.test(n)) return 'pno_zd6';
    if (/DX/i.test(n)) return 'pno_dx7';
    if (/MKS/i.test(n)) return 'pno_mks';
    if (/Vibraphone/i.test(n)) return 'pno_vib';
    if (/Acoustic/i.test(n)) return 'pno_acp';
    return 'pno_rom';
  }

  function createRenderer(schema, defaultFor) {
    const byGroup = (g) => schema.parameters.filter((p) => p.group === g);
    const byKey = new Map(schema.parameters.map((p) => [p.key, p]));
    const soundNames = new Set(schema.sounds.map((s) => s.name));
    const groupLabels = schema.groups || {};

    const isMissing = (patch) => !soundNames.has(patch.soundName);

    const enumLabel = (key, value) => {
      const p = byKey.get(key);
      return p && p.values && p.values[value] != null ? p.values[value] : String(value);
    };

    function paramRow(p, rawValue, view) {
      const value = rawValue == null ? 0 : rawValue;
      const isDefault = value === defaultFor(p);
      const pct = p.max > 0 ? Math.max(0, Math.min(100, (value / p.max) * 100)) : 0;
      const label = p.values && p.values[value] != null ? p.values[value] : null;
      // Raw numeric hidden by default on enum rows ("Pedal Wha-Wha", not
      // "Pedal Wha-Wha 3"). With showRaw on, the raw byte shows on every row —
      // for non-enums the displayed number already IS the raw value, so the
      // toggle currently changes enum rows only; if scaled displays (Hz, dB)
      // arrive later, they route through here and obey the same flag.
      // Enum rows render as a dropdown — a mode is a choice, not a magnitude,
      // so neither a fill bar nor plain text fits. Only parameters WITH a
      // schema `values` array get this; continuous 0–127 params stay text.
      //
      // CAVEAT: the labels in `values` are marked valuesUnverified in the
      // schema. They come from the manual and are corroborated by the panel
      // silkscreen (TREM/PAN/A-WHA/P-WHA, CHOR/PHAS/FLNG/DELAY), but the
      // index→label mapping has not been confirmed against the device. If a
      // dropdown ever shows a label that doesn't match what the instrument
      // does, that's the reason.
      if (p.values) {
        const options = p.values
          .map((v, i) => {
            const text = view && view.showRaw ? `${v} (${i})` : v;
            return `<option value="${i}"${i === value ? ' selected' : ''}>${esc(text)}</option>`;
          })
          .join('');
        return (
          `<div class="param param-enum ${isDefault ? 'is-default' : 'is-changed'}">` +
          `<span class="param-label">${esc(p.label)}</span>` +
          `<span class="param-value"><span class="select-wrap">` +
          `<select class="param-select" data-key="${p.key}">${options}</select>` +
          `</span></span>` +
          `</div>`
        );
      }
      return (
        `<div class="param ${isDefault ? 'is-default' : 'is-changed'}">` +
        `<span class="param-label">${esc(p.label)}</span>` +
        `<span class="param-bar"><span class="param-bar-fill" style="width:${pct}%"></span></span>` +
        `<span class="param-value">${String(value)}</span>` +
        `</div>`
      );
    }

    function rowsFor(group, patch, view) {
      return byGroup(group)
        .filter((p) => !SWITCH_KEYS.has(p.key))
        .map((p) => paramRow(p, patch.params[p.key], view))
        .join('');
    }

    function renderEngine(patch, view) {
      const group = engineGroupFor(patch);
      const label = groupLabels[group] || group;
      const missing = isMissing(patch);
      const pos =
        view && view.bankLabel
          ? `<div class="engine-pos">${esc(view.bankLabel)} · Preset ${view.patchNumber}</div>`
          : '';
      // The badge alone says Modeled/Sampled; the description line is the group
      // label only, so it never re-states the badge's word.
      return (
        `<div class="engine">` +
        `<div class="col-title">Sound engine</div>` +
        `<div class="engine-head">` +
        `<div class="engine-sound">${esc(patch.soundName)} ` +
        `<span class="badge ${patch.sampled ? 'badge-sampled' : 'badge-modeled'}">${patch.sampled ? 'Sampled' : 'Modeled'}</span></div>` +
        `<div class="engine-sub"><span class="engine-group">${esc(label)}</span></div>` +
        pos +
        (missing
          ? `<div class="warn-banner">⚠ This sound is not installed on this instrument — the patch needs “${esc(patch.soundName)}”.</div>`
          : '') +
        `</div>` +
        `<div class="params">${rowsFor(group, patch, view)}</div>` +
        `</div>`
      );
    }

    // One-line summary for a collapsed section header.
    function sectionSummary(section, patch) {
      const v = (k) => patch.params[k];
      switch (section.group) {
        // Kept short — this summary sits beside the longest section title and
        // must not truncate mid-word.
        case 'efx_veq': return `Vol ${v('veq_vol')}`;
        case 'efx_fx1': return enumLabel('fx1_md', v('fx1_md'));
        case 'efx_fx2': return enumLabel('fx2_md', v('fx2_md'));
        case 'efx_amp': return enumLabel('amp_mo', v('amp_mo'));
        case 'efx_rev': return `Level ${v('rev_lv')} · Decay ${v('rev_dc')}`;
        case 'efx_pad': return `Level ${v('pad_lv')}`;
        case 'pdl_exp': return `Function ${v('exp_fn')}`;
        default: return '';
      }
    }

    function renderSection(section, patch, view) {
      const off = section.sw != null && patch.params[section.sw] === 0;
      const collapsed = !!(view && view.collapsed && view.collapsed[section.group]);
      // The body is ALWAYS in the DOM — expand/collapse is a CSS class toggled
      // by app.js without re-rendering, so height/opacity/chevron can animate.
      let rows = rowsFor(section.group, patch, view);
      // FX2 sub-parameters are conditional on the FX2 mode.
      if (section.fx2) {
        const md = patch.params.fx2_md;
        if (md === 1) rows += rowsFor('efx_pha', patch, view); // Stereo Phaser
        else if (md === 3) rows += rowsFor('efx_dly', patch, view); // Delay
      }
      return (
        `<div class="fx-section${off ? ' dimmed' : ''}${collapsed ? ' collapsed' : ''}" data-group="${section.group}">` +
        `<div class="fx-head" data-group="${section.group}" role="button" title="Toggle section">` +
        `<span class="fx-chevron">▾</span>` +
        `<span class="fx-title">${esc(section.title)}</span>` +
        // Summary is always rendered; CSS shows it only while collapsed.
        `<span class="fx-summary">${esc(sectionSummary(section, patch))}</span>` +
        // The pill is a control, but it renders DEVICE state only — app.js never
        // flips it from a click (see docs/DESIGN.md).
        (section.sw != null
          ? `<button type="button" class="fx-state ${off ? 'off' : 'on'}" data-switch="${section.sw}" aria-pressed="${!off}">${off ? 'OFF' : 'ON'}</button>`
          : '') +
        `</div>` +
        `<div class="fx-body"><div class="fx-body-inner"><div class="params">${rows}</div></div></div>` +
        `</div>`
      );
    }

    function renderDetail(patch, view) {
      return (
        `<div class="detail-cols">` +
        `<div class="col col-engine">${renderEngine(patch, view)}</div>` +
        `<div class="col col-fx">` +
        `<div class="col-title">Effects chain</div>` +
        FX_SECTIONS.map((s) => renderSection(s, patch, view)).join('') +
        `</div>` +
        `</div>`
      );
    }

    function renderPatchRow(patch, index, selectedIndex) {
      const missing = isMissing(patch);
      return (
        `<button class="patch-row${index === selectedIndex ? ' selected' : ''}" data-index="${index}" type="button">` +
        `<span class="patch-num">${index + 1}</span>` +
        `<span class="patch-name">${esc(patch.name)}</span>` +
        `<span class="patch-sound">${esc(patch.soundName)}</span>` +
        `<span class="badge ${patch.sampled ? 'badge-sampled' : 'badge-modeled'}">${patch.sampled ? 'Sampled' : 'Modeled'}</span>` +
        (missing ? `<span class="badge badge-warn" title="Sound not installed on this instrument">⚠ Not installed</span>` : `<span class="badge-gap"></span>`) +
        `</button>`
      );
    }

    return {
      engineGroupFor,
      isMissing,
      paramRow,
      renderEngine,
      renderSection,
      renderDetail,
      renderPatchRow,
      sectionSummary,
      FX_SECTIONS,
      SWITCH_KEYS,
    };
  }

  return { createRenderer, engineGroupFor };
});
