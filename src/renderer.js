'use strict';

// Pure view layer: turns a patch (from the single library object) + the static
// schema into HTML. No DOM, no device, no globals — everything comes in as
// arguments, so it can be unit-tested in Node and reused unchanged when the
// library object starts coming from real MIDI instead of the fixture.

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
    const soundNames = new Set(schema.sounds.map((s) => s.name));
    const groupLabels = schema.groups || {};

    const isMissing = (patch) => !soundNames.has(patch.soundName);

    function paramRow(p, rawValue) {
      const value = rawValue == null ? 0 : rawValue;
      const isDefault = value === defaultFor(p);
      const pct = p.max > 0 ? Math.max(0, Math.min(100, (value / p.max) * 100)) : 0;
      // Enum params show their label; the raw number stays visible as a chip.
      const enumLabel = p.values && p.values[value] != null ? p.values[value] : null;
      const valueText = enumLabel ? `${esc(enumLabel)} <em>${value}</em>` : String(value);
      return (
        `<div class="param ${isDefault ? 'is-default' : 'is-changed'}">` +
        `<span class="param-label">${esc(p.label)}</span>` +
        `<span class="param-bar"><span class="param-bar-fill" style="width:${pct}%"></span></span>` +
        `<span class="param-value">${valueText}</span>` +
        `</div>`
      );
    }

    function rowsFor(group, patch) {
      return byGroup(group).map((p) => paramRow(p, patch.params[p.key])).join('');
    }

    function renderEngine(patch) {
      const group = engineGroupFor(patch);
      const label = groupLabels[group] || group;
      const missing = isMissing(patch);
      return (
        `<div class="engine">` +
        `<div class="col-title">Sound engine</div>` +
        `<div class="engine-head">` +
        `<div class="engine-sound">${esc(patch.soundName)}</div>` +
        `<div class="engine-sub"><span class="badge ${patch.sampled ? 'badge-sampled' : 'badge-modeled'}">` +
        `${patch.sampled ? 'Sampled' : 'Modeled'}</span> <span class="engine-group">${esc(label)}</span></div>` +
        (missing
          ? `<div class="warn-banner">⚠ This sound is not installed on this instrument — the patch needs “${esc(patch.soundName)}”.</div>`
          : '') +
        `</div>` +
        `<div class="params">${rowsFor(group, patch)}</div>` +
        `</div>`
      );
    }

    function renderSection(section, patch) {
      const dimmed = section.sw != null && patch.params[section.sw] === 0;
      let rows = rowsFor(section.group, patch);
      // FX2 sub-parameters are conditional on the FX2 mode.
      if (section.fx2) {
        const md = patch.params.fx2_md;
        if (md === 1) rows += rowsFor('efx_pha', patch); // Stereo Phaser
        else if (md === 3) rows += rowsFor('efx_dly', patch); // Delay
      }
      return (
        `<div class="fx-section ${dimmed ? 'dimmed' : ''}">` +
        `<div class="fx-head"><span class="fx-title">${esc(section.title)}</span>` +
        (section.sw != null
          ? `<span class="fx-state">${dimmed ? 'OFF' : 'ON'}</span>`
          : '') +
        `</div>` +
        `<div class="params">${rows}</div>` +
        `</div>`
      );
    }

    function renderDetail(patch) {
      return (
        `<div class="detail-cols">` +
        `<div class="col col-engine">${renderEngine(patch)}</div>` +
        `<div class="col col-fx">` +
        `<div class="col-title">Effects chain</div>` +
        FX_SECTIONS.map((s) => renderSection(s, patch)).join('') +
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
      FX_SECTIONS,
    };
  }

  return { createRenderer, engineGroupFor };
});
