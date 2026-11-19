'use strict';

// Pure view layer: turns a patch (from the single library object) + the static
// schema into HTML. No DOM, no device, no globals — everything comes in as
// arguments, so it can be unit-tested in Node and reused unchanged when the
// library object starts coming from real MIDI instead of the fixture.
//
// View state (never persisted to a patch): callers pass a `view` object —
//   { showRaw: bool,            raw numeric values visible on every row
//     collapsed: {group: bool}, per-section expand/collapse
//     (no bankLabel/patchNumber — the "Bank 1 · Preset 3" caption they fed
//      was removed 17 Nov 2026 and they went with it rather than staying
//      as view fields nobody reads) }

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SevenRenderer = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const esc = (s) =>
    String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const soundArt = () =>
    (typeof window !== 'undefined' && window.SevenSoundArt) ? window.SevenSoundArt : null;

  // The instrument picture as a carousel. At rest it is one image — the sound
  // this patch names. On hover the neighbours peek out either side with arrows
  // over them, so choosing a different instrument is paging through pictures
  // rather than opening a grid and reading names.
  //
  // Only instruments: the modeled engines and the sampled sets the connected
  // unit has. Not patches — a patch is a set of SETTINGS, and this control
  // changes which instrument plays them.
  // The same shape as .fx-chevron and the picker's caret, in its own constant
  // so the two step buttons cannot drift apart. CSS rotates it; the path
  // itself always points down, which is why its optical centre is its box
  // centre in every rotation.
  const STEP_CHEVRON = '<svg viewBox="0 0 14 9" width="13" height="8" aria-hidden="true">'
    + '<path d="M2 2 L7 7 L12 2" fill="none" stroke="currentColor" stroke-width="2" '
    + 'stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function soundCarousel(patch, view) {
    const art = soundArt();
    const sounds = (view && view.sounds) || [];
    if (!art || sounds.length < 2) {
      return `<div class="engine-art">${art ? art.iconFor(patch.soundName, patch.sampled) : ''}</div>`;
    }
    const home = Math.max(0, sounds.findIndex((s) => s.name === patch.soundName));
    // carouselAt is where the user has paged to; null means "wherever the
    // patch is", so selecting another patch brings the carousel with it.
    const at = view.carouselAt == null ? home : ((view.carouselAt % sounds.length) + sounds.length) % sounds.length;
    const wrap = (i) => sounds[((i % sounds.length) + sounds.length) % sounds.length];
    // No label on the face. A name pill in the middle covered the very
    // instrument it named, and the ones on the neighbours crowded the panel.
    //
    // THE NAMING WAS GIVEN TO THE SOUND ENGINE HEADING on 2026-08-12, "following
    // whatever is in the centre". THAT PART IS REVERSED (18 Nov 2026): the
    // heading names what the instrument holds and never moves, because the
    // parameter rows beneath it cannot follow. The CAPTION under the stack
    // does the naming while you turn — see `.car-count` below.
    //
    // data-car-name stays: it is how a click knows which sound it means.
    // The art key rides along so CSS can treat a shape differently — a wide,
    // flat instrument fitted to the box's WIDTH ends up short, and standing it
    // on the floor line leaves it sitting low against instruments that have
    // legs (Daniel, 2026-08-12).
    const face = (s, cls, extra = '') =>
      `<span class="car-face ${cls}" data-car-name="${esc(s.name)}" ` +
      `data-car-art="${esc(art.artKeyFor(s.name, s.sampled))}">` +
      `${art.iconFor(s.name, s.sampled)}${extra}</span>`;
    const here = wrap(at);
    const moved = here.name !== patch.soundName;
    // OFFLINE IT IS A BROWSER, NOT A CONTROL (Daniel, 18 Nov 2026).
    // One flag, read three times below: the cards are marked unverified,
    // Select is not offered, and nothing claims an engine changed.
    const unverified = !(view && view.connected);
    return (
      `<div class="engine-art engine-carousel${moved ? ' has-moved' : ''}` +
      `${unverified ? ' is-unverified' : ''}" data-carousel>` +
      // A DEPTH STACK, NOT A SIDE-PEEK WHEEL (Daniel, 18 Nov 2026, from a
      // measured and approved prototype). The current sound is front and
      // centre; the next two sit BEHIND it, offset up and to the right,
      // scaled down and dimmed.
      //
      // THE WHOLE POINT IS THAT IT DRAWS INSIDE ITS OWN CELL. The wheel's
      // neighbours were painted OUTSIDE .engine-stage on purpose, and
      // everything that cost came from that: a clearance bar measured per
      // window width so the left peek did not land on Save patch, a
      // document-level pointermove test to decide whether the wheel was open,
      // and a media query that hid the peeks below 1031px — which took the
      // only way of turning the wheel with them. None of that is needed by a
      // stack, and all of it is gone rather than left inert.
      //
      // FOUR FACES, in depth order back to front. Three are visible at rest;
      // the fourth is the card that arrives from the LEFT when the stack is
      // stepped backwards, parked off-screen until then. It exists for the
      // same reason the old wheel carried faces beyond its edges: a turn
      // needs something to roll in with, or it reads as two pictures swapping.
      //
      // DOM ORDER IS PAINT ORDER HERE. These are absolutely positioned with
      // no z-index of their own, so the front card must come LAST or the two
      // behind it would paint over the thing they sit behind.
      face(wrap(at - 1), 'is-waiting') +
      face(wrap(at + 2), 'is-after') +
      face(wrap(at + 1), 'is-next') +
      // THE CARD IS THE CONTROL (Daniel, 18 Nov 2026). Clicking the front
      // card loads it, and the chip is the affordance that says so — sitting
      // ON the card, so nothing below it moves when it appears. It replaces
      // the Select button that sat under the stack.
      //
      // RENDERED ONLY WHEN THE ACTION EXISTS, which is the whole of rule 5:
      // no chip when the front card is already what is loaded (`moved`), and
      // none offline (`unverified`), because nothing can be sent with no
      // instrument attached. The absence IS the signal — it is how a player
      // can tell they are home.
      //
      // IT IS IN THE DOM ONLY WHEN IT COULD BE PRESSED, rather than hidden
      // by CSS: a chip that exists and is transparent is a thing a later
      // rule can reveal by accident, and this one must never appear offline.
      face(here, 'is-front',
        moved && !unverified ? '<span class="car-load">Load</span>' : '') +
      // THE CHEVRONS ARE THE ONLY HIT TARGETS NOW. On the wheel a click
      // landed on a peek, and the chevrons existed ONLY below 1031px as a
      // replacement for peeks that were hidden there. A stacked card is
      // mostly covered by the one in front of it, so there is nothing
      // reliable to aim at — the chevrons become the control at every width
      // and the media query that hid them is gone with the one that hid the
      // peeks.
      //
      // The chevron is the app's geometric one, rotated by CSS. Not a font
      // glyph: see picker.js for the two rounds that cost, and .fx-chevron for
      // the first.
      `<button type="button" class="car-step is-step-prev" data-car-step="-1"` +
      ` aria-label="Previous" title="Previous">${STEP_CHEVRON}</button>` +
      `<button type="button" class="car-step is-step-next" data-car-step="1"` +
      ` aria-label="Next" title="Next">${STEP_CHEVRON}</button>` +
      // WHERE YOU ARE IN THE LIST. The wheel gave no sense of place — the
      // peeks showed two neighbours and nothing said how many there were or
      // how far along you had come — and the stack gives no more. This is
      // what replaces it (Daniel, 18 Nov 2026).
      //
      // 1-BASED, because it is for a person counting instruments, not an
      // index. The same `at` the faces are drawn from, so it cannot drift.
      // `fresh` IS THE FRESHNESS LINE'S OWN CLASS, not a copy of its values:
      // Daniel asked for the same type, and sharing the rule is the only way
      // "the same" stays true when one of them is next edited.
      //
      // A CAPTION ONLY WHILE IT IS NEEDED (Daniel, 18 Nov 2026). It used to
      // be "15 of 24" at all times. Nothing is drawn while the front card IS
      // the loaded sound — the header already names it, and a second copy of
      // the name with a count after it is noise under a picture that is not
      // asking anything. The moment the front card differs, one line appears
      // and carries BOTH facts: which instrument you are looking at and how
      // far along the list you have come.
      //
      //     Combo Piano · 15 of 24
      //
      // THE DOT IS ITS OWN SPAN so it can be dimmer than either side: it is
      // punctuation between two facts, not a third one.
      (moved
        ? `<span class="car-count fresh">${esc(here.name)}` +
          `<span class="car-count-dot"> · </span>` +
          `${at + 1} of ${sounds.length}</span>`
        : '') +
      // THE SELECT BUTTON IS GONE. It sat under the stack and appeared when
      // the front card differed — which meant the block below it moved as
      // soon as you turned. The chip on the card does the same job without
      // taking any layout: see the `face(here, 'is-front', …)` call above.
      `</div>`
    );
  }

  // Effects chain, top to bottom. `sw` is the switch whose value 0 dims the
  // section (never inferred from a parameter value). pdl_exp has no switch.
  // `invert` marks inverted logic: veq_byp is EQ *Bypass* — 1 means bypassed,
  // i.e. the EQ is OFF, so its pill and dimming read the opposite way.
  const FX_SECTIONS = [
    // "VOLUME / EQ", not "MASTER VOLUME / EQ" (Daniel, 18 Nov 2026): this is
    // the longest title in the chain and it squeezed the summary beside it
    // down to "V...". The summary is `flex: 1` with a zero basis, so it gets
    // only what the title leaves. The schema's own label for the group is
    // "Master volume + EQ" and is deliberately NOT changed — that is the
    // group's identity on the wire, this is its display name in the chain.
    { title: 'Volume / EQ', group: 'efx_veq', sw: 'veq_byp', invert: true },
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
  // Short day form ("9 Aug"), matching the library's origin lines.
  function fmtDay(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

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
    // Which sounds EXIST. Starts as the schema's list — right when nothing is
    // plugged in — and is replaced by the connected unit's own table the moment
    // there is one (setKnownSounds, called from app.js's setSoundList).
    let soundNames = new Set(schema.sounds.map((s) => s.name));
    const groupLabels = schema.groups || {};

    // "Missing" means THIS INSTRUMENT does not have the sound — the warning is
    // about a patch that cannot be loaded here. Asking the schema instead
    // answered a different question: it flagged an expansion sound on a unit
    // that has it, and cleared a schema sound on a unit that lacks it.
    const isMissing = (patch) => !soundNames.has(patch.soundName);
    const setKnownSounds = (list) => {
      soundNames = new Set((list || []).map((s) => s.name));
    };

    const enumLabel = (key, value) => {
      const p = byKey.get(key);
      return p && p.values && p.values[value] != null ? p.values[value] : String(value);
    };

    // These six mirror physical Clavinet tabs: they follow the panel, announce
    // nothing (flag=0, cc=-1) so the app polls them, and take writes like any
    // other parameter — setting all four filters to 0 from the app silences
    // the instrument, verified 2026-08-11. Ordinary controls that happen to
    // have a hardware twin, which is what the row's tooltip says.
    const PANEL_MIRRORED = new Set(['zd6_br', 'zd6_tr', 'zd6_md', 'zd6_sf', 'zd6_cd', 'zd6_ab']);

    function paramRow(p, rawValue, view, opts, soundName) {
      // A parameter the patch does not carry is UNSET, not zero. Patches made
      // from an instrument carry only the effects chain — there is no factory
      // evidence for a sampled sound's engine values — and drawing a missing
      // value as 0 said "Level 0" over an instrument that was audibly playing
      // (Daniel, 2026-08-14). The row still draws, because the parameter
      // exists on the device; what it does not do is claim a number.
      const unset = rawValue == null;
      const value = unset ? 0 : rawValue;
      // Identity + range on every row, so the interaction layer can work from
      // the DOM without a second copy of the taxonomy. `live` is set only when
      // the instrument's edit buffer is known to hold THIS patch — otherwise a
      // drag would change whatever the Seven happens to be playing.
      const panelMirrored = PANEL_MIRRORED.has(p.key);
      // These six also live on the panel as physical tabs. Saying so in the
      // label widened the column enough to push the controls off screen, so
      // the row carries it as a title. Declared HERE, above `attrs`, which
      // interpolates it — as a `const` further down it was a use-before-
      // declaration that threw on every row and left the detail panel frozen
      // on whatever it had rendered last.
      const panelTitle = panelMirrored ? ' title="Also a tab on the Seven\u2019s panel"' : '';
      const live = view && view.live && !(opts && opts.inertReason);
      const attrs = `data-key="${p.key}" data-max="${p.max}"${panelTitle}`;
      const liveCls = live ? ' is-live' : '';
      // null means "no factory evidence for this sound" — such a row renders
      // normally rather than claiming to be stock.
      const factory = defaultFor(p, soundName);
      const isDefault = factory !== null && value === factory;
      const pct = p.max > 0 ? Math.max(0, Math.min(100, (value / p.max) * 100)) : 0;
      // THE EXPRESSION PEDAL'S ESTIMATED EFFECT ON THIS ROW, if the pedal
      // drives it and has moved this session. MODELLED, NOT MEASURED — see
      // pedalEstimates.
      //
      // THE FILL MOVES AND THE CIRCLE STAYS (Daniel, 18 Nov 2026). The row
      // already has two marks and they already mean the right things: the FILL
      // is how much there is, the CIRCLE is where the value is set. So the
      // pedal drives the fill and the circle holds the stored value — no third
      // symbol, and the number on the right stays the stored one.
      //
      // The first version drew a dotted line beside an unchanged fill, which
      // put three marks on a 6px bar to say two things.
      //
      // THE FILL IS HATCHED WHILE THE PEDAL OWNS IT, because a solid fill is
      // this row's most authoritative-looking element and this value is a
      // model resting on an assumed linear mapping (docs/DEVICE.md). The
      // texture is the hedge; see docs/DESIGN.md.
      //
      // ONLY THE PLAIN CONTINUOUS BAR. All eight destinations exp_fn can name
      // are 0..127 continuous parameters — checked against the schema, and the
      // seven bipolar parameters are engine detunes the pedal cannot reach —
      // so the bipolar branch above is deliberately left alone rather than
      // carrying a case nothing can produce.
      const estVal = view && view.pedalEst ? view.pedalEst[p.key] : null;
      const estPct = estVal != null && p.max > 0
        ? Math.max(0, Math.min(100, (estVal / p.max) * 100))
        : null;
      const pedalCls = estPct != null ? ' is-pedal' : '';
      const pedalTitle = estPct != null
        ? ` title="Expression pedal: about ${estVal} — estimated, not read from the Seven.`
          + ` The circle marks the stored ${value}."`
        : '';
      const label = p.values && p.values[value] != null ? p.values[value] : null;
      // Conditional/inert overlay (docs/DESIGN.md item: show when a parameter
      // is inert rather than pretending it applies).
      const inertReason = opts && opts.inertReason;
      const inertCls = inertReason ? ' is-inert' : '';
      // The reason is a TOOLTIP, not part of the label: the label column is
      // sized to its longest entry, so a sentence in one row widened the
      // column for every row (Daniel, 2026-08-12). What stays on screen is the
      // short marker; the "why" is one hover away.
      const labelHtml =
        `<span class="param-label-text">${esc(p.label)}</span>` +
        (inertReason ? ` <em class="inert-note">${esc(inertReason.mark)}</em>` : '');
      const labelTitle = inertReason
        ? ` title="${esc(`${p.label} — ${inertReason.why}`)}"`
        : '';
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
          `<div class="param param-enum ${isDefault ? 'is-default' : 'is-changed'}${inertCls}${liveCls}" ${attrs}>` +
          `<span class="param-label"${labelTitle}>${labelHtml}</span>` +
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
          `<div class="param param-switch${inertCls}${liveCls}" ${attrs}>` +
          `<span class="param-label"${labelTitle}>${labelHtml}</span>` +
          `<span class="param-pill-cell"><span class="d6-frame"><span class="d6-tab d6-choice">` +
          `<span class="d6-half${value === 0 ? ' pressed' : ''}" data-set="0">${esc(p.values[0])}</span>` +
          `<span class="d6-half${value === 1 ? ' pressed' : ''}" data-set="1">${esc(p.values[1])}</span>` +
          `</span></span></span>` +
          `</div>`
        );
      }
      // ON/OFF TOGGLE (max 1, no values): one label — the switch's own name —
      // pressed = on, raised = off. Independent; any combination valid.
      if (p.max === 1) {
        const cap = p.label.replace(/^Filter\s+/i, '');
        return (
          `<div class="param param-switch${inertCls}${liveCls}" ${attrs}>` +
          `<span class="param-label"${labelTitle}>${labelHtml}</span>` +
          `<span class="param-pill-cell"><span class="d6-frame">` +
          `<span class="d6-tab d6-toggle${value === 1 ? ' pressed' : ''}" data-set="${value === 1 ? 0 : 1}">${esc(cap)}</span>` +
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
          `<span class="seg${i === value ? ' cur' : ''}" data-set="${i}"></span>`
        ).join('');
        const pos = `${value + 1}/${p.max + 1}`;
        const posText = view && view.showRaw ? `${pos} <em>${value}</em>` : pos;
        return (
          `<div class="param param-discrete ${isDefault ? 'is-default' : 'is-changed'}${inertCls}${liveCls}" ${attrs}>` +
          `<span class="param-label"${labelTitle}>${labelHtml}</span>` +
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
          `<div class="param ${unset ? 'is-unset' : (isDefault ? 'is-default' : 'is-changed')}${inertCls}${liveCls}" ${attrs}>` +
          `<span class="param-label"${labelTitle}>${labelHtml}</span>` +
          `<span class="param-bar bipolar"><span class="param-bar-fill" style="left:${left}%;width:${width}%"></span>` +
          `<span class="param-bar-knob" style="left:${valPct}%"></span></span>` +
          `<span class="param-value">${unset ? '\u2014' : String(value)}</span>` +
          `</div>`
        );
      }
      // CONTINUOUS: plain left-origin bar.
      return (
        `<div class="param ${unset ? 'is-unset' : (isDefault ? 'is-default' : 'is-changed')}${inertCls}${liveCls}${pedalCls}" ${attrs}>` +
        `<span class="param-label"${labelTitle}>${labelHtml}</span>` +
        `<span class="param-bar"${pedalTitle}>` +
        // THE FILL IS THE PEDAL'S while it is driving this row, and the stored
        // value's otherwise. One element, one meaning at a time.
        `<span class="param-bar-fill" style="width:${estPct != null ? estPct : pct}%"></span>` +
        // A mark AT the value: something to aim a drag at, and the only way a
        // value of zero shows at all — an empty fill and an empty bar look the
        // same otherwise. IT NEVER MOVES FOR THE PEDAL: on a driven row it is
        // the only thing still showing what the patch holds.
        `<span class="param-bar-knob" style="left:${pct}%"></span></span>` +
        `<span class="param-value">${unset ? '\u2014' : String(value)}</span>` +
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
      const dLo = defaultFor(p, patch.soundName);
      const dHi = defaultFor(partner, patch.soundName);
      const bothDefault = dLo !== null && dHi !== null && mn === dLo && mx === dHi;
      // EDITABLE SINCE 18 Nov 2026. It was a readout — "an amber min→max
      // display instead of a broken-looking pair of bars" — and was never
      // wired, which left it the ONLY parameter row in the app that could not
      // be changed.
      //
      // THAT MATTERED MORE THAN IT LOOKED: the manual gives no front-panel
      // route to the pedal's Function or Range, so they are editor-only
      // parameters. Until this, the only way to change the range was Crumar's
      // web editor — the thing this app exists to replace.
      //
      // EACH HANDLE CARRIES ITS OWN KEY, because the row holds two parameters
      // and every other row holds one. The usual rowKeyOf() reads data-key off
      // the row, which cannot say which of the two a press meant; the drag
      // reads data-range-key off the handle instead.
      //
      // AND THE HANDLES ARE NOT CLAMPED TO EACH OTHER. min above max is legal
      // — the manual says it reverses the pedal's direction, which is what the
      // amber readout is for — and min EQUAL to max is reachable too, so the
      // pedal can be given no travel at all. Clamping would quietly delete
      // both states.
      const live = view && view.live;
      return (
        `<div class="param param-range ${bothDefault ? 'is-default' : 'is-changed'}`
        + `${live ? ' is-live' : ''}" data-key="${p.key}" data-max="${p.max}">` +
        `<span class="param-label">Range</span>` +
        `<span class="param-rangebar" data-range-max="${p.max}">` +
        `<span class="range-fill" style="left:${loPct}%;width:${widthPct}%"></span>` +
        // WHERE THE PEDAL IS, when it has said so. The Seven sends its raw
        // position as CC 11 (docs/DEVICE.md), and this track is already
        // 0..127 — so the mark is placed by the same arithmetic as the
        // handles and NOTHING IS INFERRED. A mark on the destination
        // parameter's bar would need the instrument's own mapping, which
        // cannot be read or checked from here.
        //
        // null, NOT ZERO, when the pedal has not moved this session: drawing
        // an unheard pedal at the heel would be a claim rather than a
        // reading.
        //
        // THE 127 IS THE CC'S RANGE, not this track's, and they agree only
        // because exp_mn and exp_mx both have max 127 in the schema — the
        // handles below divide by p.max. If a range parameter ever had a
        // different max, the CC fraction would have to be mapped into the
        // track rather than used as it is.
        (view && view.pedalPos != null
          ? `<span class="pedal-pos" style="left:${(view.pedalPos / 127) * 100}%"`
            + ` title="Expression pedal: ${view.pedalPos}" aria-hidden="true"></span>`
          : '') +
        `<span class="range-handle" data-range-key="${p.key}" data-range-end="min"`
        + ` title="Range min. (${mn})" style="left:${(mn / p.max) * 100}%"></span>` +
        `<span class="range-handle" data-range-key="${partner.key}" data-range-end="max"`
        + ` title="Range max. (${mx})" style="left:${(mx / p.max) * 100}%"></span></span>` +
        `<span class="param-value${reversed ? ' range-reversed' : ''}"` +
        (reversed ? ` title="Reversed: min is above max, which reverses the pedal action (manual)"` : '') +
        `>${mn}→${mx}</span>` +
        `</div>`
      );
    }

    // The key-range table, read once. It is a schema file, not live device
  // state, so re-reading it on every render would be work for nothing.
  let keyRanges = null;
  function keyRangeData() {
    if (keyRanges === null) {
      keyRanges = (typeof window !== 'undefined' && window.sevenAPI && window.sevenAPI.getKeyRanges)
        ? window.sevenAPI.getKeyRanges()
        : { keybed: null, ranges: {} };
    }
    return keyRanges;
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
              ? {
                inertReason: {
                  mark: 'not used',
                  why: 'This control only does something when the loaded sample is a ' +
                    'piano. The Seven still stores a value for it.',
                },
              }
              : undefined;
          return paramRow(p, patch.params[p.key], view, opts, patch.soundName);
        })
        .join('');
    }

    function renderEngine(patch, view) {
      const group = engineGroupFor(patch);
      const label = groupLabels[group] || group;
      const missing = isMissing(patch);
      // THE HEADING NAMES WHAT THE INSTRUMENT HOLDS. It does not follow the
      // stack (Daniel, 18 Nov 2026).
      //
      // IT USED TO, AND THAT WAS THE BUG: with slot 2 (Reed Piano) selected
      // and sounding, paging the stack to card 5 made this heading read "DX
      // Synth Piano / DX Digital E.P." while the Seven was still playing the
      // Reed. Nothing had been loaded. The panel named a sound the instrument
      // was not making.
      //
      // THE PARAMETER LIST BELOW BELONGS TO THIS HEADING and cannot follow —
      // the rows are the loaded patch's values, read from the instrument. A
      // heading that previews while the rows underneath do not is not a
      // preview, it is two different sounds stacked on top of each other with
      // one name between them. That is why Daniel considered letting the
      // header preview and rejected it, and why the caption under the stack
      // exists at all: the caption is the thing that is allowed to move.
      //
      // The `candidate` muting was the old preview's marker — "the instrument
      // is not playing it YET". There is no longer any state in which this
      // heading names something unplayed, so it is always false. REPORTED,
      // NOT TIDIED: `.engine-sound.is-candidate` in index.html is now
      // unreachable, and deleting a style on the strength of one reading is a
      // decision rather than a clean-up.
      //
      // NOTE FOR ANYONE RESTORING THE PREVIEW: `moved` in soundCarousel
      // compares the front card against `patch.soundName`, NOT against this
      // heading, so the caption and the LOAD chip are unaffected by what is
      // written here. They were checked when this was fixed.
      const shownSound = {
        name: patch.soundName, sampled: !!patch.sampled, candidate: false, label,
      };
      // Some sounds answer to only part of the keyboard — the modeled
      // Wurlitzer and the Vibraphone among them. Nothing on the wire says so
      // (see schema/key-ranges-1.37.json), so this draws only what has been
      // played and heard, and draws nothing at all otherwise. An absent range
      // is an unheard one, not a full one.
      const keyRangeStrip = (soundName) => {
        const kr = typeof window !== 'undefined' && window.SevenKeyRange;
        const data = typeof window !== 'undefined' && window.sevenAPI &&
          window.sevenAPI.getKeyRanges && keyRangeData();
        if (!kr || !data || !data.keybed) return '';
        const range = data.ranges[soundName];
        if (!range) return '';
        const svg = kr.render({ low: range.low, high: range.high, keybed: data.keybed });
        if (!svg) return '';
        return (
          '<div class="param engine-keyrange">' +
          '<span class="param-label keyrange-label">Restricted range</span>' +
          // The tooltip repeats what was HEARD, in the words it was heard in.
          // The frame this is drawn on is the right length but has never been
          // played, so an absolute note name here would be a measurement we
          // have not taken.
          `<span class="keyrange-keys" title="Plays ${esc(range.heard || '')}">${svg}</span>` +
          '</div>'
        );
      };

      // THE "Bank N · Preset M" LINE IS GONE (Daniel, 17 Nov 2026).
      //
      // The identity block is one tight group now — name, sub-line, Save
      // patch — and this was the third of four lines in it. It had to go for
      // the group to read as a group.
      //
      // IT WAS ALSO LARGELY A REPEAT. The left pane shows the selected row,
      // so a player looking at this block can already see which slot it came
      // from; stating it again here is the same fact in two places, and the
      // one in the list is the one they navigated with.
      //
      // THE PROVENANCE IS NOT LOST. It stays in the patch file, and the
      // detail pane's own actions still know the slot — this was a caption,
      // not the record. view.bankLabel and view.patchNumber went with it
      // rather than being left as fields nobody reads.
      //
      // The badge alone says Modeled/Sampled; the description line is the group
      // label only, so it never re-states the badge's word.
      return (
        `<div class="engine">` +
        `<div class="col-title">Sound engine</div>` +
        `<div class="engine-head">` +
        `<div class="engine-head-text">` +
        // The heading names whatever is in the middle of the carousel, even
        // before it is chosen — muted while it is only a candidate, full
        // strength once the instrument actually holds it. That is what lets
        // the pictures go unlabelled.
        `<div class="engine-sound${shownSound.candidate ? ' is-candidate' : ''}">` +
        `${esc(shownSound.name)} ` +
        `<span class="badge ${shownSound.sampled ? 'badge-sampled' : 'badge-modeled'}">` +
        `${shownSound.sampled ? 'Sample' : 'Model'}</span></div>` +
        // The same illustration the picker uses. A patch is easier to place by
        // the instrument it is than by its name — and using one picture in
        // both views means choosing a sound and looking at it afterwards are
        // recognisably the same thing.
        // Guarded: renderer.js is loaded in Node by the unit tests, where
        // there is no window and no art module.
        // THE STAGE: a fixed box the picture lives inside and cannot leave.
        // Whatever is in the middle — a tall upright, a flat stack of synths —
        // is fitted to it, and the neighbours that slide out on hover are
        // CLIPPED to it now (Daniel, 2026-11-15). They used to be drawn
        // outside, which is what let them cross the parameter rows.
        '<div class="engine-stage">' +
        (soundArt()
          // A BROWSER OFFLINE, A CONTROL CONNECTED (Daniel, 18 Nov 2026).
          //
          // THIS USED TO REQUIRE A CONNECTION and fall back to a flat
          // picture. The reasoning was sound and is only half-retired, so it
          // is kept: "the wheel changes what the instrument is playing, so
          // with nothing plugged in it can do exactly one thing — say
          // 'Connect the Seven'. A control whose only outcome is a refusal
          // is a dead end dressed as an offer." And: soundList falls back to
          // schema.sounds with no unit attached — this BUILD's 24, not the
          // player's instrument — so it would offer sounds their Seven does
          // not have and hide ones it does.
          //
          // WHAT CHANGED IS THE REASON TO SHOW IT AT ALL. Daniel demonstrates
          // the app without a Seven to hand, and a control that cannot be
          // shown is hard to explain. So it renders, and the two objections
          // above are answered rather than overruled:
          //
          //   THE REFUSAL IS REMOVED, NOT HIDDEN. Picking is not offered
          //   offline — no Select button, no selection state, no heading
          //   that renames itself. Turning is the whole of what works, and
          //   turning sends nothing and claims nothing. There is no gesture
          //   that appears to act and silently does not.
          //
          //   THE CLAIM IS WITHDRAWN. Every card is drawn in the app's
          //   unverified treatment — the same fade the stale bank rows wear
          //   — because the list IS this build's schema and not a reading of
          //   anybody's instrument. The app shows what it believes and marks
          //   what it has not confirmed.
          //
          // `canPickSound` STILL GATES IT, and still means what it meant: a
          // patch whose sound could be changed if there were something to
          // change it on. What no longer gates it is `connected`.
          ? (view && view.canPickSound
            // THE SAME CONTROL FOR A LIBRARY PATCH AS FOR A PRESET. It was not
            // always: from 2026-08-12 a library patch got a flat picture and a
            // tooltip instead, and the comment that stood here gave two
            // reasons. Both are now dead, and neither is dead by accident —
            // each was killed by the fix that made it unnecessary.
            //
            // "Editing the file's sound is a deliberate act elsewhere, not a
            // side effect of browsing." That protected something real: choosing
            // an instrument used to write the new name straight to disk, and
            // five of Daniel's patches were silently renamed by what he thought
            // was listening (0264132). THE PROTECTION NOW LIVES IN THE CONTROL
            // ITSELF — chosenFromCarousel only auditions and contains no write
            // at all — which is a better place for it than a view that declines
            // to offer the control. It is pinned by a test in the library view,
            // where the renames happened, and not only on the audition path.
            //
            // "Choosing an instrument means HEARING it, which needs a preset on
            // the Seven to hear it on." True while picking a sound routed
            // through the transfer walk and needed a destination slot. It does
            // not now: auditioning sends 0x46 to the edit buffer and claims no
            // destination, so there is nothing a library patch lacks.
            ? soundCarousel(patch, view)
            // Not a control here, and the tooltip says so rather than leaving
            // the picture looking inert for no reason.
            : `<div class="engine-art"${view && view.noPickReason ? ` title="${esc(view.noPickReason)}"` : ''}>` +
              `${soundArt().iconFor(patch.soundName, patch.sampled)}</div>`)
          : '') +
        '</div>' +
        // Name, description and slot in a column, with the instrument BESIDE
        // them rather than above: stacked, the picture pushed every parameter
        // down the page, and the parameters are what the view is for.
        `<div class="engine-sub"><span class="engine-group">${esc(shownSound.label)}</span></div>` +
        // Saving belongs to the sound, so it sits with it. Above the panel it
        // pushed BOTH columns down; here only the parameters move.
        (view && view.saveBar
          ? `<div class="save-slot${view.saveBarNew ? ' is-appearing' : ''}">${view.saveBar}</div>`
          : '') +
        `</div>` +
        `</div>` +
        // Warnings sit BELOW the head, full width — beside a picture they
        // would be squeezed into a column half the panel wide.
        (missing
          ? `<div class="warn-banner">⚠ This sound is not installed on this instrument — the patch needs “${esc(patch.soundName)}”.</div>`
          : '') +
        // All four Clavi filter switches off = the instrument produces NO
        // SOUND (manual). Named explicitly: a predicate over schema shape
        // ("max=1 without values") broke the moment the device-label harvest
        // gave every switch a values array — it matched nothing and
        // [].every() is vacuously true, so the warning fired for every
        // Clavi patch.
        `<div class="params">${rowsFor(group, patch, view)}</div>` +
        // Under the controls, laid out like one. In the header it competed
        // with the name, the badge and — on an instrument slot — the bank and
        // preset line, which is a lot of small print in one corner; here it
        // reads as what it is, one more fact about this engine
        // (Daniel, 2026-08-12).
        keyRangeStrip(shownSound.name) +
        // BELOW the controls, not above them. It appears and disappears as the
        // switches are flipped, and from the header it shoved every row down
        // mid-gesture — moving the switch out from under the pointer that just
        // turned it off.
        (group === 'pno_zd6' &&
        ['zd6_sf', 'zd6_md', 'zd6_tr', 'zd6_br']
          .every((k) => (patch.params[k] ?? 0) === 0)
          ? `<div class="warn-banner">⚠ All four filter switches are off — the Clavinet produces no sound in this state.</div>`
          : '') +
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

    // WHERE THE PEDAL IS PUTTING THE PARAMETER IT DRIVES — AN ESTIMATE, AND
    // THE ONLY HONEST WORD FOR IT IS MODELLED (Daniel, 18 Nov 2026).
    //
    // THE APP CANNOT READ THIS. Measured on hardware: the destination
    // parameter is NOT modulated — `veq_vol` read 127 with the pedal at the
    // heel and 127 held at the toe — and CC 11 carries the pedal's RAW
    // position, ignoring exp_mn/exp_mx (docs/DEVICE.md). So the instrument
    // never transmits the value it is applying, and nothing here is a reading.
    //
    //     estimate = exp_mn + (cc11 / 127) * (exp_mx - exp_mn)
    //
    // THAT FORMULA ASSUMES THE SEVEN MAPS LINEARLY, which is probable and is
    // NOT verifiable from this side of the cable. Its linearity, its rounding,
    // and whether it uses the pedal's full travel are all unverified — see
    // docs/DEVICE.md for what verifying it would take. The mark is therefore
    // drawn DIFFERENTLY from the stored value's solid one, and the number in
    // the row stays the STORED value: the pedal modulates, it does not edit,
    // and a bar that followed it would make Save patch write a lie.
    //
    // THE OPERANDS ARE NOT SORTED. exp_mn above exp_mx is legal and reverses
    // the pedal's direction (the manual says so, and it is surfaced in the
    // range row); subtracting in the written order handles that for free,
    // while a min/max pair would silently un-reverse it.
    //
    // exp_fn's ten values are the device's own display strings, harvested in
    // the 0x23 sweep of 2026-08-09 and stored in the schema. TWO OF THEM DRIVE
    // TWO ROWS — "FX 1 + 2 Depth" and "FX 1 + 2 Rate" — so this answers with a
    // key-to-estimate map rather than one key.
    //
    // THE KEYS ARE NOT WHAT exp_fn CALLS THEM. The function list says "Rate";
    // the parameters are `fx1_sp`/`fx2_sp`, labelled "Speed" (and "Time" when
    // the FX2 mode is Delay). pedal-position-probe.js carried `fx1_rt`/`fx2_rt`
    // in its own copy of this map, which exist nowhere in the schema — it only
    // ever ran with exp_fn=0, so nothing ever looked them up.
    const PEDAL_DEST = [
      ['veq_vol'],              // 0  Volume
      ['fx1_dp'],               // 1  FX 1 Depth
      ['fx2_dp'],               // 2  FX 2 Depth
      ['fx1_dp', 'fx2_dp'],     // 3  FX 1 + 2 Depth   — two rows
      ['fx1_sp'],               // 4  FX 1 Rate
      ['fx2_sp'],               // 5  FX 2 Rate
      ['fx1_sp', 'fx2_sp'],     // 6  FX 1 + 2 Rate    — two rows
      ['amp_dr'],               // 7  Amp Drive        — only with amp_sw on
      ['pad_lv'],               // 8  Pad Level
      ['pad_bl'],               // 9  Pad Blend
    ];
    const PEDAL_AMP_DRIVE = 7;

    function pedalEstimates(params, pedalPos) {
      if (pedalPos == null || !params) return null;
      const fn = params.exp_fn;
      const mn = params.exp_mn;
      const mx = params.exp_mx;
      // A patch that does not carry the pedal's own three parameters cannot be
      // modelled at all. Backup patches carry the effects chain only, so this
      // is the ordinary case rather than an error.
      if (fn == null || mn == null || mx == null) return null;
      const keys = PEDAL_DEST[fn];
      if (!keys) return null;
      // AMP DRIVE APPLIES ONLY WITH THE AMP SIMULATOR ON (manual). Drawing the
      // mark on a row the pedal cannot reach would be the claim this whole
      // feature is trying not to make. Strictly 1: a missing amp_sw is unknown,
      // not off.
      if (fn === PEDAL_AMP_DRIVE && params.amp_sw !== 1) return null;
      const est = Math.round(mn + (pedalPos / 127) * (mx - mn));
      const out = {};
      for (const k of keys) out[k] = est;
      return out;
    }

    function renderDetail(patch, view) {
      // Computed ONCE per render and handed down through `view`, so paramRow
      // stays a pure function of one parameter and the formula has one home.
      const pedalEst = pedalEstimates(
        (patch && patch.params) || null,
        view && view.pedalPos != null ? view.pedalPos : null
      );
      if (pedalEst) view = { ...view, pedalEst };
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

    // One line per slot — eight slots have to stay reachable above the library
    // region, so a second line is height the bank list can't spend. It borrows
    // what the two-line library row does cheaply: the sound sits in the right
    // column beside the badge, so both regions read the same way across.
    // A slot older than the region header says so on hover, not in the row.
    // `bank` is 1-based and optional: only the bank list passes it, and only
    // bank 1 changes what the row draws.
    function renderPatchRow(patch, index, selectedIndex, asOf, bank) {
      const missing = isMissing(patch);
      const stale = patch.date && asOf && patch.date < asOf;
      const title = stale ? ` title="Backed up ${esc(fmtDay(patch.date))} — older than the rest of this bank"` : '';
      return (
        `<button class="patch-row${index === selectedIndex ? ' selected' : ''}${stale ? ' is-stale' : ''}" data-index="${index}" type="button"${title}>` +
        `<span class="patch-num">${index + 1}</span>` +
        `<span class="patch-name" title="${esc(patch.name)}">${esc(patch.name)}</span>` +
        `<span class="patch-sound"></span>` +
        // NO Model/Sample pill. Removed from both list views 2026-08-21 —
        // engine type describes the patch that is loaded, and the detail panel
        // says it there. On a row it was a fact about every row, repeated
        // eight times per bank, taking width from the one badge that earns it.
        //
        // Bank 1's write protection is a fact about the BANK — it was true of
        // all eight rows here and of no row in the other three banks, so as a
        // per-row badge it said nothing eight times over. The lock on the
        // Bank 1 tab says it once (Daniel, 2026-08-16).
        (missing ? `<span class="badge badge-warn" title="Sound not installed on this instrument">⚠ Not installed</span>` : '') +
        // No "borrowed name" badge. It marked the EXPECTED case — a record
        // named after the patch you put in that slot — and could not mark the
        // surprising one, where a panel edit makes the values stop matching
        // and the name reverts to generated: by then there is no inherited
        // name left to badge (Daniel, 2026-08-16). Inheritance itself stays,
        // and `nameFrom` stays in the file, so provenance still records which
        // patch lent the name.
        `</button>`
      );
    }

    return {
      engineGroupFor,
      isMissing,
      setKnownSounds,
      paramRow,
      // Exported so app.js can move the estimate marks on every CC without a
      // re-render, using THE SAME arithmetic that drew them. A second copy of
      // the formula in the interaction layer is how the two would drift.
      pedalEstimates,
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
