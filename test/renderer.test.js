'use strict';

// Renderer smoke tests. The renderer builds strings, so it can be exercised
// without a browser — and a use-before-declaration in one of those template
// literals once froze the whole detail panel while every other test passed.
// These render EVERY sound the instrument knows, in every mode, and assert the
// output rather than merely that nothing threw.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const schema = JSON.parse(fs.readFileSync(path.join(root, 'schema', 'seven-1.37.json'), 'utf8'));

// The renderer is a browser script (UMD-ish, no bundler). Load it the way the
// page does rather than importing it, so the test exercises the shipped file.
function loadRenderer() {
  const context = { window: {}, module: { exports: {} }, define: undefined };
  context.exports = context.module.exports;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'src', 'renderer.js'), 'utf8'), context);
  const api = context.module.exports.createRenderer ? context.module.exports : context.window.SevenRenderer;
  return api.createRenderer(schema, (p) => Math.min(64, p.max));
}

const R = loadRenderer();

const patchFor = (sound, value = 64) => ({
  name: `Test ${sound.name}`,
  soundName: sound.name,
  sampled: sound.sampled,
  params: Object.fromEntries(schema.parameters.map((p) => [p.key, Math.min(value, p.max)])),
});

test('every sound renders a detail panel, idle and live', () => {
  const problems = [];
  for (const sound of schema.sounds) {
    for (const live of [false, true]) {
      let html = '';
      try {
        html = R.renderDetail(patchFor(sound), { collapsed: {}, live });
      } catch (err) {
        problems.push(`${sound.name} (live=${live}) threw: ${err.message}`);
        continue;
      }
      if (!html.includes('Sound engine')) problems.push(`${sound.name}: no engine column`);
      if (!html.includes('Effects chain')) problems.push(`${sound.name}: no effects column`);
      if (live && !html.includes('is-live')) problems.push(`${sound.name}: live mode marks no rows`);
      if (!live && html.includes('is-live')) problems.push(`${sound.name}: idle mode marks live rows`);
    }
  }
  assert.deepStrictEqual(problems, []);
});

test('every parameter row carries its key and range', () => {
  const html = R.renderDetail(patchFor(schema.sounds[3]), { collapsed: {}, live: true });
  // Row containers only: their class list STARTS with "param", which
  // param-label and param-pill-cell do not.
  const rows = (html.match(/<div class="param(?: [^"]*)?"[^>]*>/g) || []);
  assert.ok(rows.length > 5, `expected parameter rows, found ${rows.length}`);
  // One known exception: a range PAIR row draws two parameters (the pedal's
  // min and max), so a single data-key cannot identify it — which is exactly
  // why it is the one control audition mode cannot edit. Named here so the
  // gap is deliberate rather than forgotten.
  const withoutKey = rows
    .filter((r) => !r.includes('data-key='))
    .filter((r) => !r.includes('param-range'));
  assert.deepStrictEqual(withoutKey, [], 'the interaction layer works from these attributes');
});

test('extreme values render without breaking the bars', () => {
  for (const value of [0, 1, 127]) {
    const html = R.renderDetail(patchFor(schema.sounds[0], value), { collapsed: {}, live: true });
    assert.ok(html.includes('param-bar-fill'), `value ${value} still draws a fill`);
    assert.ok(!html.includes('NaN'), `value ${value} produces no NaN`);
    assert.ok(!/width:\s*-/.test(html), `value ${value} produces no negative width`);
  }
});

test('a missing sound is flagged rather than rendered as normal', () => {
  const html = R.renderDetail(
    { name: 'Ghost', soundName: 'Not On This Unit', sampled: true, params: {} },
    { collapsed: {}, live: false }
  );
  assert.match(html, /not installed on this instrument/i);
});

test('all four Clavi filters off warns about silence', () => {
  const clavi = schema.sounds.find((s) => s.name === 'Clavi Piano');
  const patch = patchFor(clavi);
  for (const k of ['zd6_sf', 'zd6_md', 'zd6_tr', 'zd6_br']) patch.params[k] = 0;
  assert.match(R.renderDetail(patch, { collapsed: {}, live: false }), /produces no sound/i);

  patch.params.zd6_br = 1; // one filter is enough
  assert.ok(!/produces no sound/i.test(R.renderDetail(patch, { collapsed: {}, live: false })));
});

test('the panel-owned Clavi tabs say so on the row', () => {
  const clavi = schema.sounds.find((s) => s.name === 'Clavi Piano');
  const html = R.renderDetail(patchFor(clavi), { collapsed: {}, live: true });
  assert.match(html, /Also a tab on the Seven/);
});

test('bank rows render one line with the sound on the right', () => {
  const patch = { ...patchFor(schema.sounds[0]), date: '2026-08-09T10:00:00Z' };
  const row = R.renderPatchRow(patch, 0, 0, '2026-08-11T10:00:00Z');
  assert.match(row, /patch-num/);
  assert.match(row, /patch-sound/);
  assert.match(row, /Backed up/, 'a slot older than the header states its own date');
  const fresh = R.renderPatchRow({ ...patch, date: '2026-08-11T10:00:00Z' }, 0, 0, '2026-08-11T10:00:00Z');
  assert.ok(!/Backed up/.test(fresh), 'a slot as fresh as the header does not repeat it');
});

test('a bank row carries the warning and NOT the Model/Sample pill', () => {
  // The pill was removed from both list views on 2026-08-21: engine type
  // describes the patch that is loaded, the detail panel says it there, and on
  // a row it was a fact about every row said eight times per bank — taking
  // width from the one badge that earns it.
  //
  // The warning stays. It tells a player their Seven cannot play this patch
  // BEFORE they send it, which is the whole reason a row-level badge exists.
  const known = { ...patchFor(schema.sounds[0]), date: '2026-08-09T10:00:00Z' };
  const row = R.renderPatchRow(known, 0, 0, null);
  assert.doesNotMatch(row, /badge-kind|badge-sound/, 'no pill');
  assert.doesNotMatch(row, /badge-modeled|badge-sampled/, 'and neither of its colours');
  assert.doesNotMatch(row, /badge-gap/, 'nor the empty spacer that reserved room beside it');
  assert.doesNotMatch(row, /Not installed/, 'a sound this build knows says nothing');

  // A sound the instrument does not have still warns.
  const missing = R.renderPatchRow({ ...known, soundName: 'Steinway D Berlin' }, 0, 0, null);
  assert.match(missing, /Not installed/, 'the warning survives the pill');
  assert.doesNotMatch(missing, /badge-kind/, 'without bringing the pill back with it');
});

test('engine grouping maps names to families, sampled or not', () => {
  const cases = [
    ['Tine Piano', false, 'pno_rho'],
    ['Reed Piano', false, 'pno_wur'],
    ['Clavi Piano', false, 'pno_zd6'],
    ['Venice Grand D-274', true, 'pno_rom'],
  ];
  for (const [soundName, sampled, expected] of cases) {
    assert.strictEqual(R.engineGroupFor({ soundName, sampled }), expected, soundName);
  }
});

// A patch made from an instrument carries the effects chain and nothing else —
// there is no factory evidence for a sampled sound's engine values. The panel
// must not turn "we don't know" into "zero" (Daniel, 2026-08-14).
test('a parameter the patch does not carry renders unset, not zero', () => {
  const html = R.renderDetail(
    { name: 'Combo Piano', soundName: 'Combo Piano', sampled: true,
      params: { fx1_sw: 0, fx2_sw: 0, amp_sw: 0, rev_sw: 0, pad_sw: 0 } },
    { collapsed: {} }
  );
  assert.match(html, /class="param is-unset/, 'the row is marked unset');
  assert.match(html, /<span class="param-value">—<\/span>/, 'and shows an em dash, not 0');
});

test('a parameter the patch does carry still renders its number', () => {
  const html = R.renderDetail(
    { name: 'Rhodes', soundName: 'Tine Piano', sampled: false, params: { rho_atk: 32 } },
    { collapsed: {} }
  );
  assert.match(html, /<span class="param-value">32<\/span>/);
});

test('“not installed” follows the connected instrument, not the schema', () => {
  // Its own renderer: setKnownSounds is global to an instance, and the shared
  // R above is used by every other test in this file.
  const R = loadRenderer();
  const expansion = { name: 'X', soundName: 'Nord Lead Expansion', params: {} };
  const known = { name: 'Y', soundName: schema.sounds[0].name, params: {} };

  // Nothing attached: the schema decides, and it has never seen the expansion.
  assert.strictEqual(R.isMissing(expansion), true);
  assert.strictEqual(R.isMissing(known), false);

  // A unit that has the expansion and lacks the schema's first sound.
  R.setKnownSounds([{ id: 0, name: 'Nord Lead Expansion', sampled: true }]);
  assert.strictEqual(R.isMissing(expansion), false, 'this instrument has it');
  assert.strictEqual(R.isMissing(known), true, 'and does not have the other');

  // Unplugged: back to the schema's list.
  R.setKnownSounds(schema.sounds);
  assert.strictEqual(R.isMissing(known), false);
});

// An inherited name is not marked on the row. The badge that used to be here
// flagged the expected case — a record named after the patch you put in that
// slot — and could not flag the surprising one: once a panel edit stops the
// values matching, the name reverts to generated and there is nothing left to
// badge (Daniel, 2026-08-16). Inheritance and `nameFrom` both stay; only the
// marking goes, so an inherited name must render exactly like any other.
test('an inherited name is not marked on the row', () => {
  const R = loadRenderer();
  const base = patchFor(schema.sounds[0]);
  const plain = R.renderPatchRow({ ...base }, 0, -1, null, 2);
  const borrowed = R.renderPatchRow(
    { ...base, nameFrom: { file: 'kitchen-dishes-delay.sevenlib.json', name: 'Kitchen Dishes Delay' } },
    0, -1, null, 2
  );
  assert.strictEqual(borrowed, plain, 'nameFrom changes nothing on screen');
  assert.ok(!/borrowed/.test(borrowed), 'and leaves no trace of the old badge');
  assert.ok(!/Kitchen Dishes Delay/.test(borrowed), 'the lender is not named on the row');
});

// ── THE EXPRESSION PEDAL'S ESTIMATED EFFECT ──────────────────────────────────
//
// R.pedalEstimates models what the pedal is doing to the parameter it drives.
// IT IS A MODEL: the instrument does not transmit the applied value and the
// destination parameter is not modulated, so this arithmetic is the whole
// feature and there is nothing on the device to check it against
// (docs/DEVICE.md). That is exactly why it is pinned here, where every case
// including the ones nobody can reach on hardware in one sitting is cheap.
//
// The formula, and the operands are NOT sorted:
//     exp_mn + (cc11 / 127) * (exp_mx - exp_mn)

// SPREAD INTO THIS REALM, or deepStrictEqual fails on two identical objects.
// loadRenderer runs the shipped file inside a `vm` context, so what it returns
// carries THAT context's Object.prototype — and deepStrictEqual compares
// prototypes, reporting `{ amp_dr: 127 }` unequal to `{ amp_dr: 127 }` with no
// visible difference at all. null is preserved, because "no estimate" and "an
// empty estimate" are different answers.
const pedal = (over, pos) => {
  const est = R.pedalEstimates({ exp_fn: 0, exp_mn: 0, exp_mx: 127, ...over }, pos);
  return est == null ? null : { ...est };
};

test('the estimate spans the range, and the ends are the ends', () => {
  assert.deepStrictEqual(pedal({ exp_mn: 40, exp_mx: 80 }, 0), { veq_vol: 40 });
  assert.deepStrictEqual(pedal({ exp_mn: 40, exp_mx: 80 }, 127), { veq_vol: 80 });
  // Halfway along the pedal is halfway along the range.
  assert.deepStrictEqual(pedal({ exp_mn: 40, exp_mx: 80 }, 64), { veq_vol: 60 });
});

test('A REVERSED RANGE REVERSES THE ESTIMATE', () => {
  // exp_mn above exp_mx is legal and flips the pedal's direction (the manual
  // says so, and the range row surfaces it). Sorting the operands anywhere in
  // this path would silently un-reverse it, which is the one mistake the
  // formula's shape exists to prevent — so heel must give the HIGHER number.
  assert.deepStrictEqual(pedal({ exp_mn: 80, exp_mx: 40 }, 0), { veq_vol: 80 });
  assert.deepStrictEqual(pedal({ exp_mn: 80, exp_mx: 40 }, 127), { veq_vol: 40 });
  assert.deepStrictEqual(pedal({ exp_mn: 80, exp_mx: 40 }, 64), { veq_vol: 60 });
  // And it is genuinely the mirror of the forward case, not merely different.
  for (const pos of [0, 32, 64, 96, 127]) {
    const up = pedal({ exp_mn: 40, exp_mx: 80 }, pos).veq_vol;
    const down = pedal({ exp_mn: 80, exp_mx: 40 }, pos).veq_vol;
    assert.strictEqual(up + down, 120, `mirrored at cc ${pos}`);
  }
});

test('an equal range is a flat line — the pedal is disarmed', () => {
  // Settled on hardware by ear, 18 Nov 2026: 95 -> 95 produces no change in
  // volume across the pedal's whole travel. The estimate has to agree, or the
  // mark would travel while nothing was happening.
  for (const pos of [0, 40, 64, 127]) {
    assert.deepStrictEqual(pedal({ exp_mn: 95, exp_mx: 95 }, pos), { veq_vol: 95 });
  }
});

test('the two "FX 1 + 2" functions mark BOTH rows', () => {
  assert.deepStrictEqual(
    pedal({ exp_fn: 3, exp_mn: 0, exp_mx: 100 }, 127),
    { fx1_dp: 100, fx2_dp: 100 }, 'FX 1 + 2 Depth'
  );
  assert.deepStrictEqual(
    pedal({ exp_fn: 6, exp_mn: 0, exp_mx: 100 }, 127),
    { fx1_sp: 100, fx2_sp: 100 }, 'FX 1 + 2 Rate'
  );
});

test('every exp_fn names parameters the schema actually has', () => {
  // THE GUARD THAT WOULD HAVE CAUGHT fx1_rt. pedal-position-probe.js carried
  // `fx1_rt`/`fx2_rt` in its own copy of this map — keys that exist nowhere in
  // the schema — and nothing noticed, because that probe only ever ran with
  // exp_fn=0 so the entries were never looked up. The function list says
  // "Rate"; the parameters are fx1_sp/fx2_sp, labelled "Speed".
  const keys = new Set(schema.parameters.map((p) => p.key));
  const fn = schema.parameters.find((p) => p.key === 'exp_fn');
  assert.ok(fn && fn.values, 'exp_fn has its device-sourced label list');
  for (let i = 0; i <= fn.max; i += 1) {
    const est = R.pedalEstimates(
      { exp_fn: i, exp_mn: 0, exp_mx: 127, amp_sw: 1 }, 127
    );
    assert.ok(est, `exp_fn ${i} (${fn.values[i]}) has a destination`);
    for (const k of Object.keys(est)) {
      assert.ok(keys.has(k), `${fn.values[i]} -> ${k} is a real parameter`);
      assert.strictEqual(est[k], 127, `${k} reaches the top of the range`);
    }
  }
});

test('AN INERT ROW STILL SHOWS THE PEDAL — Amp Drive is not gated', () => {
  // This gated Amp Drive on amp_sw, from the v1.22 manual. Removed 18 Nov 2026
  // (Daniel): the app ALREADY dims an off section's rows and marks them inert
  // with a reason, so hiding the mark was a second rule stating the same fact
  // invisibly — and it read as the feature being broken. It also put a manual's
  // claim into running code, which Rule 1 exists to prevent.
  //
  // The mark answers "where is the pedal, mapped through its range". Whether
  // anything downstream is listening is a different question, and the row
  // answers that one itself.
  assert.deepStrictEqual(pedal({ exp_fn: 7, amp_sw: 1 }, 127), { amp_dr: 127 }, 'amp on');
  assert.deepStrictEqual(pedal({ exp_fn: 7, amp_sw: 0 }, 127), { amp_dr: 127 }, 'amp off');
  assert.deepStrictEqual(pedal({ exp_fn: 7 }, 127), { amp_dr: 127 }, 'amp_sw absent');
});

// ── THE WHA TAKES THE PEDAL, SO NO ROW WEARS THE PEDAL'S MARK ───────────────
//
// THE BUG (20 Nov 2026). pedalEstimates read exp_fn to find the destination
// and never asked whether FX1's Pedal Wha-Wha had overridden it. With
// fx1_md === 3 and exp_fn === 0 the Volume row got the full is-pedal
// treatment — amber hatching, a permanent circle — while the pedal was in
// fact driving the wha and Volume was untouched.
//
// WHY THIS IS PINNED HERE AND NOT IN A UI SCENARIO. `pedalPos` is a closure
// variable in app.js, set only when CC 11 arrives from the instrument; there
// is no seam a scenario can inject a position through, which is why both
// existing pedal scenarios are hands-on. The RENDERER takes the position as
// an argument — renderDetail(patch, { pedalPos }) — so the whole behaviour is
// reachable offline at this layer with no hardware and nothing faked. The
// hands-on scenarios still cover the real pedal; this covers the rule.
test('with the wha on the pedal, no row carries is-pedal', () => {
  // Its own renderer with the art stubbed, for the reason the plain-picture
  // test below gives: without it soundCarousel takes its !art early return.
  const ctx = { window: { SevenSoundArt: {
    iconFor: () => '<svg data-stub="1"></svg>',
    artKeyFor: (name) => String(name || '').toLowerCase(),
  } }, module: { exports: {} }, define: undefined };
  ctx.exports = ctx.module.exports;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'src', 'renderer.js'), 'utf8'), ctx);
  const api = ctx.module.exports.createRenderer ? ctx.module.exports : ctx.window.SevenRenderer;
  const Rw = api.createRenderer(schema, (p) => Math.min(64, p.max));

  const patchWith = (fx1md) => {
    const p = patchFor(schema.sounds.find((s) => s.sampled) || schema.sounds[0]);
    Object.assign(p.params, { exp_fn: 0, exp_mn: 0, exp_mx: 127, fx1_md: fx1md, fx1_sw: 1 });
    return p;
  };
  const view = { collapsed: {}, live: true, pedalPos: 100 };

  // THE CONTROL, and it is what makes the assertion mean anything: with any
  // other FX1 mode the mark IS there, so "no is-pedal" cannot pass because
  // the test is looking in the wrong place.
  const normal = Rw.renderDetail(patchWith(0), view);
  assert.ok(/is-pedal/.test(normal),
    'with FX1 in another mode the pedal mark is drawn somewhere');
  assert.ok(Rw.pedalEstimates(patchWith(0).params, 100).veq_vol != null,
    'and the estimate names veq_vol, which is what exp_fn 0 points at');

  // THE FIX.
  const wha = Rw.renderDetail(patchWith(3), view);
  assert.ok(!/is-pedal/.test(wha),
    'with Pedal Wha-Wha on FX1, NO row carries is-pedal');
  assert.strictEqual(Rw.pedalEstimates(patchWith(3).params, 100), null,
    'pedalEstimates returns null rather than re-pointing the mark — the wha '
    + 'has no parameter row for it to move to');

  // AND THE SCREEN SAYS WHERE CONTROL WENT, in both trays.
  assert.match(wha, /The expression pedal is controlling this wha\./,
    'FX1 names the pedal');
  assert.match(wha, /the pedal is controlling the wha, and this assignment is ignored/,
    'and the Expression Pedal tray says the assignment lost');
  // FX1 IS WORKING AND MUST NOT READ AS DISABLED: its line is its own class,
  // not the inert banner that lives in dimmed sections.
  assert.ok(/class="fx-note"/.test(wha),
    'the FX1 line is a statement (.fx-note), not an inert banner');
});

// ── THE PLAIN INSTRUMENT PICTURE IS STILL REACHABLE ─────────────────────────
//
// It was proposed for deletion on 18 Nov 2026 on the grounds that every view
// now passes `canPickSound`, so the stack always wins. IT IS NOT DEAD, and
// this test is the deliberate entry into the state that proves it — asked for
// in those terms, because `plain-variant-probe.js` drove TEN gestures in the
// running app and reached the stack every time.
//
// WHY THE UI SUITE CANNOT REACH IT. The gesture is: select a bank slot, select
// a library patch, then DELETE that patch. app.js's refreshLibrary keeps the
// invariant on purpose —
//
//     libSelected = null;
//     if (lastTouched === 'library') setLastTouched('device');
//
// — but that sits inside `if (libSelected)`, and the two trash sites (app.js
// 3229 and 3383) null libSelected THEMSELVES first, so the refresh skips it
// and lastTouched stays 'library'. currentPatch() then answers from deviceSel
// while the view's `pos` falls through both canPickSound arms to `{}`.
// The delete is behind window.sevenAPI.library.contextMenu(), a NATIVE
// Electron menu, which a DOM scenario cannot click — so the state is
// reachable by a person and not by the suite. Hence this, here.
test('without canPickSound the engine header draws the PLAIN picture', () => {
  // ITS OWN RENDERER, WITH THE ART STUBBED. The shared loadRenderer gives the
  // vm a bare `window`, so window.SevenSoundArt is absent and soundCarousel
  // takes its `!art` early return — the OTHER plain-variant path. Without the
  // stub both views come out plain and this test would pass while measuring
  // the wrong mechanism, which is the failure mode this file has three
  // headings about. The stub isolates canPickSound as the only variable.
  const ctx = { window: { SevenSoundArt: {
    iconFor: () => '<svg data-stub="1"></svg>',
    artKeyFor: (name) => String(name || '').toLowerCase(),
  } }, module: { exports: {} }, define: undefined };
  ctx.exports = ctx.module.exports;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'src', 'renderer.js'), 'utf8'), ctx);
  const api = ctx.module.exports.createRenderer ? ctx.module.exports : ctx.window.SevenRenderer;
  const Ra = api.createRenderer(schema, (p) => Math.min(64, p.max));

  const patch = patchFor(schema.sounds[0]);
  const withPick = Ra.renderDetail(patch, {
    collapsed: {}, live: false, canPickSound: { file: 'x.json', patchIndex: 0 }, sounds: schema.sounds,
  });
  const without = Ra.renderDetail(patch, { collapsed: {}, live: false });

  assert.ok(withPick.includes('engine-carousel'),
    'with canPickSound the stack renders');
  assert.ok(!without.includes('engine-carousel'),
    'WITHOUT canPickSound the stack does NOT render — this is the live path');
  assert.match(without, /class="engine-art"/,
    'and the plain picture takes its place, so the rules for it are not dead code');
});

// ── THE FIVE THAT ARE NOT DRAWN ─────────────────────────────────────────────
//
// Daniel, 18 Nov 2026: "If they don't work... they're confusing to me." Each
// of the five takes a write, echoes it and holds it on a fresh read, and
// changes nothing audible (docs/DEVICE.md). So they are not rendered.
//
// FIVE AND NOT SEVEN. `dly_mf` and `dly_ml` were briefly in this list and were
// taken out the same day: the manual says they are CEILINGS on how far DEPTH
// can push feedback and level, so the test that found them silent never
// controlled for DEPTH and may never have exercised them. They are asserted
// below as STILL DRAWN, which is the half of this test that would catch them
// being hidden again on the same untested premise.
//
// HIDING A ROW MUST NEVER BECOME DROPPING A VALUE. That is the whole risk in
// this change: a patch that lost them on save would rewrite somebody's preset
// the next time it was transferred back, silently and permanently. Both halves
// are asserted here, in one test, reading the SAME list the renderer uses —
// a copy of the seven keys in this file would be a second place for the
// decision to live, which is exactly what the constant exists to prevent.
test('the inaudible five are not drawn, and their values still round-trip', () => {
  const { serializeLibrary, parseLibrary } = require('../src/format/index.js');
  const hidden = Array.from(R.INAUDIBLE_KEYS);
  assert.strictEqual(hidden.length, 5, 'the list is the five in DEVICE.md');
  for (const k of ['dly_mf', 'dly_ml']) {
    assert.ok(!R.INAUDIBLE_KEYS.has(k),
      `${k} is NOT hidden — it is a ceiling on DEPTH and has never been tested as one`);
  }

  // A SAMPLED sound, or the pno_rom group never renders at all and every
  // "rom_p03 is absent" assertion below would pass for the wrong reason.
  const sampled = schema.sounds.find((s) => s.sampled);
  assert.ok(sampled, 'the schema knows a sampled sound');
  // THE REAL FIXTURE, not a hand-built object. The first attempt assembled a
  // library literal here and the parser refused it for a missing `format`
  // string — correctly, and it would have been a test of my object rather
  // than of the round trip.
  const lib = JSON.parse(fs.readFileSync(
    path.join(root, 'fixtures', 'library-roundtrip.json'), 'utf8'));
  const patch = lib.patches[0];
  patch.soundName = sampled.name;
  patch.sampled = sampled.sampled;
  Object.assign(patch.params,
    Object.fromEntries(schema.parameters.map((p) => [p.key, Math.min(64, p.max)])));
  // Distinctive, non-default, and inside every max.
  hidden.forEach((k, i) => { patch.params[k] = 7 + i * 11; });

  const html = R.renderDetail(patch, { collapsed: {}, live: true });
  for (const k of hidden) {
    assert.ok(!html.includes(`data-key="${k}"`), `${k} is not drawn`);
  }
  // THE POSITIVE CONTROLS, one from each group the seven come from. Without
  // them this test would pass just as happily against a renderer that drew
  // nothing at all.
  assert.ok(html.includes('data-key="rom_p00"'), 'rom_p00 Level is still drawn');
  assert.ok(html.includes('data-key="fx2_dp"'), 'fx2_dp Depth is still drawn');
  // THE TWO THAT WERE NEARLY HIDDEN BY MISTAKE. Their silence has a published
  // explanation nobody has tested against, so they stay as working controls
  // until somebody sweeps DEPTH with the ceilings high and then low.
  assert.ok(html.includes('data-key="dly_mf"'), 'dly_mf Max Feedback is still drawn');
  assert.ok(html.includes('data-key="dly_ml"'), 'dly_ml Max Level is still drawn');

  // AND THE FILE KEEPS THEM. Same values, through a real serialize/parse.
  const { library, report } = parseLibrary(serializeLibrary(lib), { schema });
  hidden.forEach((k, i) => {
    assert.strictEqual(library.patches[0].params[k], 7 + i * 11,
      `${k} survives the round trip`);
  });
  assert.strictEqual(report.errors.length, 0, 'and the file is clean');
  assert.strictEqual(Object.keys(library.patches[0].params).length, 110,
    'all 110 parameters are still in the file — hiding is not dropping');
});

test('nothing is modelled without a position or the pedal\'s own parameters', () => {
  // NULL IS NOT ZERO. A pedal that has not moved this session is in a position
  // the app does not know, and the heel is a claim rather than a reading.
  assert.strictEqual(pedal({}, null), null, 'no position');
  assert.strictEqual(R.pedalEstimates(null, 64), null, 'no params');
  // Backup patches carry the effects chain only, so a patch without the
  // pedal's three parameters is ordinary rather than broken.
  assert.strictEqual(R.pedalEstimates({ exp_fn: 0, exp_mn: 0 }, 64), null, 'no exp_mx');
  assert.strictEqual(R.pedalEstimates({ exp_mn: 0, exp_mx: 127 }, 64), null, 'no exp_fn');
});
