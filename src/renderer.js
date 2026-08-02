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
  // `invert` marks inverted logic: veq_byp is EQ *Bypass* — 1 means bypassed,
  // i.e. the EQ is OFF, so its pill and dimming read the opposite way.
  const FX_SECTIONS = [
    { title: 'Master Volume / EQ', group: 'efx_veq', sw: 'veq_byp', invert: true },
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

    function paramRow(p, rawValue, view, opts) {
      const value = rawValue == null ? 0 : rawValue;
      const isDefault = value === defaultFor(p);
      const pct = p.max > 0 ? Math.max(0, Math.min(100, (value / p.max) * 100)) : 0;
      const label = p.values && p.values[value] != null ? p.values[value] : null;
      // Conditional/inert overlay (docs/DESIGN.md item: show when a parameter
      // is inert rather than pretending it applies).
      const inertReason = opts && opts.inertReason;
      const inertCls = inertReason ? ' is-inert' : '';
      const labelHtml = esc(p.label) + (inertReason ? ` <em class="inert-note">${esc(inertReason)}</em>` : '');
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
      // (max=1 params with values are two-way choice rockers, handled below —
      // a dropdown for a two-position hardware tab would be wrong.)
      if (p.values && p.max > 1) {
        const options = p.values
          .map((v, i) => {
            const text = view && view.showRaw ? `${v} (${i})` : v;
            return `<option value="${i}"${i === value ? ' selected' : ''}>${esc(text)}</option>`;
          })
          .join('');
        return (
          `<div class="param param-enum ${isDefault ? 'is-default' : 'is-changed'}${inertCls}">` +
          `<span class="param-label">${labelHtml}</span>` +
          `<span class="param-value"><span class="select-wrap">` +
          `<select class="param-select" data-key="${p.key}">${options}</select>` +
          `</span></span>` +
          `</div>`
        );
      }
      // ---- Rendering taxonomy (docs/DESIGN.md) — decided from SCHEMA DATA
      // (max / values / bipolar / pairMax), never from hardcoded key lists.
      //
      // Binary parameters render as Clavinet-D6-style rocker TABS (cream cap
      // in a dark recessed frame — the hardware the panel's legends imitate),
      // not the app's green status pills; those belong to section headers.
      // Always full contrast: the min(64,max) default heuristic calls 1 the
      // default for max=1, which made engaged switches look untouched
      // (docs/DESIGN.md). Value→side mapping (0 = first/left) is ASSUMED — not
      // demonstrated by the device (docs/PROJECT-SCOPE.md).
      //
      // TWO-WAY CHOICE (max 1 + values): both labels on the cap, tab tips
      // toward the active choice — neither side is "off" (Pickup A|B, C|D,
      // Decay Type Keyboard|Mallets).
      if (p.max === 1 && p.values) {
        return (
          `<div class="param param-switch${inertCls}">` +
          `<span class="param-label">${labelHtml}</span>` +
          `<span class="param-pill-cell"><span class="d6-frame"><span class="d6-tab d6-choice">` +
          `<span class="d6-half${value === 0 ? ' pressed' : ''}">${esc(p.values[0])}</span>` +
          `<span class="d6-half${value === 1 ? ' pressed' : ''}">${esc(p.values[1])}</span>` +
          `</span></span></span>` +
          `</div>`
        );
      }
      // ON/OFF TOGGLE (max 1, no values): one label — the switch's own name —
      // pressed = on, raised = off. Independent; any combination valid.
      if (p.max === 1) {
        const cap = p.label.replace(/^Filter\s+/i, '');
        return (
          `<div class="param param-switch${inertCls}">` +
          `<span class="param-label">${labelHtml}</span>` +
          `<span class="param-pill-cell"><span class="d6-frame">` +
          `<span class="d6-tab d6-toggle${value === 1 ? ' pressed' : ''}">${esc(cap)}</span>` +
          `</span></span>` +
          `</div>`
        );
      }
      // Discrete selectors without labels: 2 <= max <= 15 and no values array
      // (rho_tp "Type" and dx7_tp "Variation", both 9-position). A full bar at
      // value 8 misreads as "maximum" rather than "the ninth variation".
      // Compact segmented control + 1-based "position/total". Names are NOT
      // invented — the manual never maps them (docs/PROJECT-SCOPE.md).
      // Non-interactive like the other stored-data controls.
      if (p.max >= 2 && p.max <= 15) {
        const segs = Array.from({ length: p.max + 1 }, (_, i) =>
          `<span class="seg${i === value ? ' cur' : ''}"></span>`
        ).join('');
        const pos = `${value + 1}/${p.max + 1}`;
        const posText = view && view.showRaw ? `${pos} <em>${value}</em>` : pos;
        return (
          `<div class="param param-discrete ${isDefault ? 'is-default' : 'is-changed'}${inertCls}">` +
          `<span class="param-label">${labelHtml}</span>` +
          `<span class="param-seg">${segs}</span>` +
          `<span class="param-value">${posText}</span>` +
          `</div>`
        );
      }
      // BIPOLAR (schema bipolar:true): centre is the neutral state per the
      // manual, so the fill grows from the centre outward — a left-origin fill
      // would misread 64 as "low" when it means neutral.
      if (p.bipolar) {
        const centre = 64;
        const centrePct = (centre / p.max) * 100;
        const valPct = (value / p.max) * 100;
        const left = Math.min(valPct, centrePct);
        const width = Math.abs(valPct - centrePct);
        return (
          `<div class="param ${isDefault ? 'is-default' : 'is-changed'}${inertCls}">` +
          `<span class="param-label">${labelHtml}</span>` +
          `<span class="param-bar bipolar"><span class="param-bar-fill" style="left:${left}%;width:${width}%"></span></span>` +
          `<span class="param-value">${String(value)}</span>` +
          `</div>`
        );
      }
      // CONTINUOUS: plain left-origin bar.
      return (
        `<div class="param ${isDefault ? 'is-default' : 'is-changed'}${inertCls}">` +
        `<span class="param-label">${labelHtml}</span>` +
        `<span class="param-bar"><span class="param-bar-fill" style="width:${pct}%"></span></span>` +
        `<span class="param-value">${String(value)}</span>` +
        `</div>`
      );
    }

    // RANGE PAIR (schema pairMax): two params forming one range. Per the
    // manual, min greater than max REVERSES the pedal action — surfaced as an
    // amber min→max readout instead of a broken-looking pair of bars.
    function renderRangeRow(p, partner, patch, view) {
      const mn = patch.params[p.key] ?? 0;
      const mx = patch.params[partner.key] ?? 0;
      const reversed = mn > mx;
      const lo = Math.min(mn, mx);
      const hi = Math.max(mn, mx);
      const loPct = (lo / p.max) * 100;
      const widthPct = ((hi - lo) / p.max) * 100;
      const bothDefault = mn === defaultFor(p) && mx === defaultFor(partner);
      return (
        `<div class="param param-range ${bothDefault ? 'is-default' : 'is-changed'}">` +
        `<span class="param-label">Range</span>` +
        `<span class="param-rangebar"><span class="range-fill" style="left:${loPct}%;width:${widthPct}%"></span>` +
        `<span class="range-handle" style="left:${(mn / p.max) * 100}%"></span>` +
        `<span class="range-handle" style="left:${(mx / p.max) * 100}%"></span></span>` +
        `<span class="param-value${reversed ? ' range-reversed' : ''}"` +
        (reversed ? ` title="Reversed: min is above max, which reverses the pedal action (manual)"` : '') +
        `>${mn}→${mx}</span>` +
        `</div>`
      );
    }

    // Display-order override: parameter display follows the HARDWARE where the
    // hardware has an order; otherwise schema (ID) order. The Clavinet D6 tabs
    // — and our panel strip's yellow legends — run BRILLIANT, TREBLE, MEDIUM,
    // SOFT, C/D, A/B, the reverse of schema ID order. Display only: the schema
    // and patch serialization stay keyed by schema key/ID order.
    const DISPLAY_ORDER = {
      pno_zd6: ['zd6_br', 'zd6_tr', 'zd6_md', 'zd6_sf', 'zd6_cd', 'zd6_ab', 'zd6_lv'],
    };

    function rowsFor(group, patch, view) {
      let params = byGroup(group).filter((p) => !SWITCH_KEYS.has(p.key));
      const order = DISPLAY_ORDER[group];
      if (order) {
        params = params.slice().sort((a, b) => {
          const ai = order.indexOf(a.key), bi = order.indexOf(b.key);
          return (ai < 0 ? order.length : ai) - (bi < 0 ? order.length : bi);
        });
      }
      const pairTargets = new Set(params.filter((p) => p.pairMax).map((p) => p.pairMax));
      return params
        .filter((p) => !pairTargets.has(p.key)) // partner renders inside the pair row
        .map((p) => {
          if (p.pairMax) {
            const partner = byKey.get(p.pairMax);
            if (partner) return renderRangeRow(p, partner, patch, view);
          }
          // rom_p05 "Piano Harp" does nothing unless the loaded sample is a
          // piano (manual) — show it as inert instead of pretending it applies.
          const opts =
            p.key === 'rom_p05' && !/piano|grand|upright/i.test(patch.soundName || '')
              ? { inertReason: '— inert: loaded sample isn’t a piano' }
              : undefined;
          return paramRow(p, patch.params[p.key], view, opts);
        })
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
        // All four Clavi filter switches off = the instrument produces NO
        // SOUND (manual). Filters found from schema data: max=1 without values.
        (group === 'pno_zd6' &&
        byGroup('pno_zd6')
          .filter((f) => f.max === 1 && !f.values)
          .every((f) => (patch.params[f.key] ?? 0) === 0)
          ? `<div class="warn-banner">⚠ All four filter switches are off — the Clavinet produces no sound in this state.</div>`
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
        case 'pdl_exp': return enumLabel('exp_fn', v('exp_fn'));
        default: return '';
      }
    }

    function renderSection(section, patch, view) {
      // Inverted switches (veq_byp): value 1 means the section is OFF.
      const off = section.sw != null &&
        patch.params[section.sw] === (section.invert ? 1 : 0);
      // When FX1 runs Pedal Wha-Wha, the pedal IGNORES its exp_fn assignment —
      // the wha always takes priority (manual). Index 3 = Pedal Wha-Wha per
      // the fx1_md values (valuesUnverified — if that mapping is wrong on the
      // device, this dims for the wrong mode).
      const whaOverride = section.group === 'pdl_exp' && patch.params.fx1_md === 3;
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
      // Say WHY the section is dimmed when it's an override, not a bypass.
      if (whaOverride) {
        rows =
          `<div class="fx-inert-banner">FX1 is set to Pedal Wha-Wha — the wha takes priority and this assignment is ignored.</div>` +
          rows;
      }
      return (
        `<div class="fx-section${off || whaOverride ? ' dimmed' : ''}${collapsed ? ' collapsed' : ''}" data-group="${section.group}">` +
        `<div class="fx-head" data-group="${section.group}" role="button" title="Toggle section">` +
        // Geometric chevron (not a font glyph): its optical centre IS its box
        // centre, so flex centering aligns it with the header text in both
        // rotations — glyph baselines sat visibly low.
        `<span class="fx-chevron"><svg viewBox="0 0 14 9" width="14" height="9" aria-hidden="true"><path d="M2 2 L7 7 L12 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>` +
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
