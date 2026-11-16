'use strict';

// A targeted check for the two CSS mistakes that have actually shipped here,
// not a general linter. Both were invisible to every other kind of test: the
// app rendered, nothing threw, and the affected controls simply did nothing.
//
//   1. A rule that can never win. An @media block styling S was placed ABOVE
//      the plain rule for S setting the same property — same specificity, so
//      the later one always wins and the media query does nothing. This hid
//      the website's mobile navigation entirely.
//
//   2. An opt-out that a later rule tries to undo. `pointer-events: none` on
//      a wrapper, with the rule turning it back on placed EARLIER in the file,
//      so it lost the cascade. The Clavinet's switches were unclickable for
//      two rounds of debugging, and synthetic clicks in a test could not see
//      it because dispatchEvent ignores pointer-events.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');
// Comments are stripped FIRST. Left in, they end up glued to the front of the
// following selector, so ".d6-frame" reads as "/* ... */ .d6-frame" and every
// exact-match check silently passes. That flaw made the first version of this
// file report clean against a deliberately reintroduced bug.
const css = ((html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '')
  .replace(/\/\*[\s\S]*?\*\//g, '');

// Rules in source order: { selector, body, media, index }. Deliberately simple
// — this file is one stylesheet written by hand, not arbitrary CSS.
function parseRules(text) {
  const rules = [];
  let media = null;
  let depth = 0;
  const re = /@media([^{]+)\{|([^{}]+)\{([^{}]*)\}|\}/g;
  let m;
  while ((m = re.exec(text))) {
    if (m[1] !== undefined) { media = m[1].trim(); depth = 1; continue; }
    if (m[2] !== undefined) {
      for (const selector of m[2].split(',')) {
        const s = selector.trim();
        if (s && !s.startsWith('@')) {
          rules.push({ selector: s, body: m[3], media, index: m.index });
        }
      }
      continue;
    }
    if (depth) { media = null; depth = 0; }
  }
  return rules;
}

const rules = parseRules(css);

function declaredProps(body) {
  return body
    .split(';')
    .map((d) => d.split(':')[0].trim())
    .filter(Boolean);
}

test('the stylesheet parses into rules', () => {
  assert.ok(rules.length > 100, `expected a real stylesheet, parsed ${rules.length} rules`);
});

// FULL CHROMA FOR MARKS, DAMPED FOR TEXT (DESIGN.md). --action is borrowed
// from a printed legend a few millimetres tall; set as the colour of WORDS it
// is the same hue at many times the ink, and the first pass of the list design
// read as neon for exactly this reason. So words take --action-text and marks —
// fills, 1px borders, focus rings, a 2px underline — keep --action.
//
// Asserted rather than remembered, because the two names differ by a suffix and
// the wrong one is invisible until somebody looks at it in dark mode: the values
// are IDENTICAL in light, where paper needs no damping. A sweep done once stays
// done only if something fails when it is undone.
test('no rule paints text with the undamped action green', () => {
  const offenders = rules.filter((r) => r.body
    .split(';')
    .some((d) => {
      const [prop, value] = d.split(':');
      if (!prop || !value) return false;
      // `color`, not `border-color` / `background-color` / `-webkit-text-fill`.
      if (prop.trim() !== 'color') return false;
      return /var\(\s*--action\s*\)/.test(value);
    }));
  assert.deepEqual(
    offenders.map((r) => r.selector), [],
    'these set text to var(--action); words take var(--action-text)'
  );
});

// THE THIRD MISTAKE THAT ACTUALLY SHIPPED HERE, and the most expensive to
// spot because the page looked fine.
//
// `font: 700 17px/1.1 inherit` reads as "bold, 17px, inherit the family" and
// sets NONE of it. The `font` shorthand's last value must be a font-FAMILY,
// and `inherit` is not a family token there, so the declaration is invalid and
// the browser discards it whole — the 700 and the 17px with it. A
// `font-family: inherit` sitting beside it still applies on its own, so the
// family is right and nothing looks broken enough to chase.
//
// The top tabs — the most prominent type in the app — rendered at the UA
// button default, 400 13.333px, from the day the rule was written until
// 2026-11-15. It was found by Daniel reading the source against a measurement
// of the screen and noticing the two did not agree.
//
// A BARE `font: inherit` IS VALID and is used ~30 times in this file. Only a
// shorthand that MIXES `inherit` with other values is broken, so that is
// exactly what this matches — anything stricter would condemn 30 correct
// lines, and a test that cries wolf is one people learn to skim.
test('no font shorthand mixes `inherit` with other values', () => {
  const offenders = [];
  for (const r of rules) {
    for (const d of r.body.split(';')) {
      const i = d.indexOf(':');
      if (i < 0) continue;
      const prop = d.slice(0, i).trim();
      const value = d.slice(i + 1).trim();
      if (prop !== 'font') continue;
      // A bare keyword as the ENTIRE value is legal: inherit, initial, unset,
      // revert, and the system font keywords.
      if (!/\binherit\b/.test(value)) continue;
      if (/^inherit$/i.test(value)) continue;
      offenders.push(`${r.selector} { font: ${value} }`);
    }
  }
  assert.deepEqual(offenders, [],
    'the `font` shorthand needs a real family last; `inherit` there voids the '
    + 'whole declaration, size and weight included. Use longhand: '
    + 'font-size / font-weight / line-height / font-family: inherit.');
});

test('no media-query rule is overridden by a later plain rule for the same selector', () => {
  const problems = [];
  for (const inMedia of rules.filter((r) => r.media)) {
    for (const prop of declaredProps(inMedia.body)) {
      const beaten = rules.find(
        (r) => !r.media && r.index > inMedia.index && r.selector === inMedia.selector &&
          declaredProps(r.body).includes(prop)
      );
      if (beaten) {
        problems.push(
          `@media (${inMedia.media}) { ${inMedia.selector} { ${prop} } } is overridden by the ` +
          `plain rule for "${inMedia.selector}" later in the file — the media query can never win`
        );
      }
    }
  }
  assert.deepStrictEqual(problems, []);
});

test('nothing tries to re-enable pointer-events from earlier in the file', () => {
  const offs = rules.filter((r) => /pointer-events\s*:\s*none/.test(r.body));
  const ons = rules.filter((r) => /pointer-events\s*:\s*auto/.test(r.body));
  const problems = [];
  for (const on of ons) {
    for (const off of offs) {
      // Does the "auto" rule address the same element, or one inside it?
      const sameElement = on.selector === off.selector || on.selector.endsWith(` ${off.selector}`) ||
        on.selector.includes(off.selector.replace(/^\./, '.'));
      if (sameElement && off.index > on.index) {
        problems.push(
          `"${on.selector}" sets pointer-events:auto, but "${off.selector}" sets it to none ` +
          'later in the file and wins — the control stays unclickable'
        );
      }
    }
  }
  assert.deepStrictEqual(problems, []);
});

test('no interactive control sits inside a pointer-events:none wrapper', () => {
  // The wrappers that hold something clickable. If one opts out of hit
  // testing, a real mouse can never reach what is inside it, however many
  // handlers are bound.
  const holdsControls = ['.d6-frame', '.param-seg', '.param-pill-cell', '.audition-bar', '.lib-row'];
  const problems = rules
    .filter((r) => /pointer-events\s*:\s*none/.test(r.body))
    .filter((r) => holdsControls.includes(r.selector.trim()))
    .map((r) => `"${r.selector}" carries pointer-events:none but contains controls`);
  assert.deepStrictEqual(problems, []);
});

// ---- Light / dark parity ---------------------------------------------------
// The app ships two palettes. A colour that exists in one and not the other is
// invisible until someone switches themes — the dropdown chevron was baked as
// a light stroke inside a data: URI and vanished in light mode for weeks.

function paletteVars(selector) {
  const block = css.slice(css.indexOf(selector));
  const body = block.slice(block.indexOf('{') + 1, block.indexOf('}'));
  return new Set((body.match(/--[a-z0-9-]+(?=\s*:)/g) || []));
}

test('both palettes define the same variables', () => {
  const dark = paletteVars(':root {');
  const light = paletteVars(':root[data-theme="light"]');
  assert.ok(dark.size > 15 && light.size > 15, `palettes look empty: ${dark.size}/${light.size}`);
  const missingInLight = [...dark].filter((v) => !light.has(v));
  const missingInDark = [...light].filter((v) => !dark.has(v));
  assert.deepStrictEqual(
    { missingInLight, missingInDark },
    { missingInLight: [], missingInDark: [] }
  );
});

test('no data: URI hardcodes a colour outside the palettes', () => {
  // An SVG in a data: URI cannot inherit currentColor, so its stroke has to be
  // written in. That is only safe inside a palette, where each theme supplies
  // its own — anywhere else it is one theme's colour used in both.
  const paletteEnd = css.indexOf('}', css.indexOf(':root[data-theme="light"]'));
  const afterPalettes = css.slice(paletteEnd);
  const offenders = (afterPalettes.match(/url\(['"]?data:image\/svg\+xml[^)]*\)/g) || [])
    .filter((u) => /stroke=%23|fill=%23|stroke="#|fill="#/.test(u))
    .map((u) => u.slice(0, 80));
  assert.deepStrictEqual(offenders, []);
});

// [hidden] is a UA default of display:none, and ANY author display rule beats
// it. The write-gate banner was given display:flex when its button went in,
// which made it permanently visible — an empty strip under the connection row
// for every user, on every instrument (2026-08-15). Any element the app hides
// with the attribute needs its own [hidden] rule once it has a display mode.
test('elements with a display rule also have a [hidden] rule', () => {
  const css = html.slice(html.indexOf('<style>'), html.lastIndexOf('</style>'));
  const displayed = new Set();
  for (const m of css.matchAll(/#([\w-]+)\s*\{[^}]*\bdisplay:\s*(?!none)[a-z-]+/g)) displayed.add(m[1]);
  const guarded = new Set();
  for (const m of css.matchAll(/#([\w-]+)\[hidden\]\s*\{[^}]*display:\s*none/g)) guarded.add(m[1]);
  const hiddenInMarkup = new Set();
  for (const m of html.matchAll(/<div id="([\w-]+)"[^>]*\shidden/g)) hiddenInMarkup.add(m[1]);
  const broken = [...hiddenInMarkup].filter((id) => displayed.has(id) && !guarded.has(id));
  assert.deepStrictEqual(broken, [], `these are hidden in markup but have a display rule that overrides it: ${broken.join(', ')}`);
});

// THE CAROUSEL CLEARS SAVE PATCH AT EVERY WIDTH, checked here because the
// alternative is one app launch per width.
//
// A UI scenario can only ask this question at the width it was launched at —
// the rule is a media query on the viewport, so SEVEN_WINDOW_WIDTH is set
// before the window opens and cannot change afterwards. Two scenarios cover
// the two tight points with real layout (carousel-narrow.js at 1024,
// carousel-no-peek.js at 800). This covers the RANGE, from the arithmetic
// those two validate.
//
// The ceiling — the largest spread whose left peek still clears the Save patch
// button — was swept on hardware and is linear in the window width at half a
// percentage point per pixel: 68.4% at 1060, 58.4% at 1040, 48.4% at 1020,
// 38.4% at 1000, 28.4% at 980. One per cent of the 128px face is 1.28px.
// Validated against real forced-width windows at 1020 (predicted 5.63px,
// measured 5.7) and at 1024, where carousel-narrow.js asserts the margin.
//
// WHAT WOULD MAKE THIS TEST LIE: a change to the engine column's layout that
// moves the button or the carousel relative to the window. The ceiling is a
// property of that geometry, not of the stylesheet, so the two scenarios are
// what keep this honest — if either stops agreeing with the model, the model
// is what is wrong.
test('no carousel peek can land on Save patch, at any window width', () => {
  const MIN_MARGIN = 8;
  const FACE = 128;
  const ceilingAt = (w) => 48.4 + 0.5 * (w - 1020);

  // The spread in force at width w: the last rule that applies wins, and a
  // media-gated one applies only when w is inside its bound.
  const spreadRules = rules.filter(
    (r) => /^\.engine-carousel$/.test(r.selector) && /--peek\s*:/.test(r.body)
  );
  assert.ok(spreadRules.length >= 2,
    `expected a base --peek and at least one override, found ${spreadRules.length}`);

  const boundOf = (media) => {
    if (!media) return Infinity;
    const m = media.match(/max-width\s*:\s*(\d+)px/);
    assert.ok(m, `--peek override has no max-width bound: "${media}"`);
    return Number(m[1]);
  };
  const spreadAt = (w) => {
    let value = null;
    for (const r of spreadRules) {
      if (w > boundOf(r.media)) continue;
      value = Number((r.body.match(/--peek\s*:\s*([\d.]+)%/) || [])[1]);
    }
    assert.ok(value != null, `no --peek applies at ${w}px`);
    return value;
  };

  // The width at or below which no non-hero face renders at all.
  const hideRules = rules.filter(
    (r) => /\.car-face:not\(\.is-hero\)/.test(r.selector) && /display\s*:\s*none/.test(r.body)
  );
  assert.strictEqual(hideRules.length, 1,
    `expected exactly one rule hiding the non-hero faces, found ${hideRules.length}`);
  const hiddenUpTo = boundOf(hideRules[0].media);
  assert.ok(Number.isFinite(hiddenUpTo),
    'the rule hiding the peeks must be inside a max-width media query, or it hides them always');

  // Every width from the forced-width floor in main.js to well past any real
  // display. The floor matters: a window cannot actually open below the
  // display's own width, but the plumbing clamps at 480 and the invariant
  // should hold wherever the rules can be evaluated.
  const thin = [];
  for (let w = 480; w <= 1600; w += 1) {
    if (w <= hiddenUpTo) continue;          // nothing is drawn to collide
    const margin = (ceilingAt(w) - spreadAt(w)) * (FACE / 100);
    if (margin < MIN_MARGIN) thin.push(`${w}px: ${Math.round(margin * 10) / 10}px`);
  }
  assert.deepStrictEqual(thin.slice(0, 6), [],
    'these widths render a peek with less than '
    + `${MIN_MARGIN}px of clearance over Save patch (first few of ${thin.length}): `
    + thin.slice(0, 6).join(', '));

  // AND THE BANDS MUST TILE. A gap would be a width with no rule at all; the
  // check above would not notice, because it only looks at what the rules say.
  assert.strictEqual(spreadAt(hiddenUpTo + 1), 44,
    `the width just above the hide threshold (${hiddenUpTo + 1}px) should get the`
    + ' tucked spread — otherwise the two overrides do not meet');
  assert.strictEqual(spreadAt(1600), 72,
    'a wide window keeps the approved spread');
});

// THE BOOT LOADER HONOURS prefers-reduced-motion, asserted here because a UI
// scenario cannot ask for it: the media query is a property of the window the
// app was launched into, and the runner cannot launch one that reports
// reduced motion. Reading the rules is the only way to check it at all, and a
// rule nobody can test is a rule that quietly stops being true.
//
// The requirement is not "no animation". It is that the INFORMATION survives
// and only the motion goes: the mark sits unlit while the read runs and goes
// to full when it lands, so both states that carry meaning are still there.
test('reduced motion removes the boot loader climb and flicker, not its states', () => {
  const reduced = rules.filter((r) => r.media && /prefers-reduced-motion/.test(r.media));
  assert.ok(reduced.length, 'there is a prefers-reduced-motion block');

  const warming = reduced.find((r) => /\.boot-mark\.is-warming/.test(r.selector));
  assert.ok(warming, '.boot-mark.is-warming is addressed under reduced motion');
  assert.match(warming.body, /animation\s*:\s*none/,
    'the climb and the flicker are both off — they are one animation shorthand');
  assert.match(warming.body, /opacity\s*:\s*1/,
    'and the mark is left fully opaque: the flicker drives opacity, so without '
    + 'this the mark would sit at the keyframe default of .10 and be invisible');

  const lit = reduced.find((r) => /\.boot-mark\.is-lit/.test(r.selector));
  assert.ok(lit, '.boot-mark.is-lit is addressed under reduced motion');
  assert.match(lit.body, /transition\s*:\s*none/, 'the landing is immediate rather than a move');

  // The lit state itself must still exist OUTSIDE the media query, or there
  // would be no "full" to land on and the information would not survive.
  const litAlways = rules.find(
    (r) => !r.media && /\.boot-mark\.is-lit/.test(r.selector) && /color\s*:/.test(r.body)
  );
  assert.ok(litAlways, 'the lit mark still takes its colour outside the reduced-motion block');
  assert.match(litAlways.body, /var\(--logo\)/, 'and that colour is the palette\'s lit logo');
});

// THE CURVE MUST NOT REACH FULL ON ITS OWN. Brightness is the progress
// indicator, and the whole design rests on the climb approaching full without
// arriving: the last step up may only ever happen because the instrument
// answered. A keyframe that ended at var(--logo) would make the loader claim
// a finished read that had not finished.
test('the boot warm-up never reaches the lit colour by itself', () => {
  const warm = (css.match(/@keyframes\s+boot-warm\s*\{([\s\S]*?)\n\s*\}/) || [])[1];
  assert.ok(warm, 'the boot-warm keyframes are in the stylesheet');
  // Every colour stop mixes TOWARDS --logo without being it.
  const stops = warm.match(/color\s*:\s*[^;]+;/g) || [];
  assert.ok(stops.length >= 4, `expected the rungs, found ${stops.length} colour stops`);
  for (const stop of stops) {
    assert.doesNotMatch(stop, /color\s*:\s*var\(--logo\)\s*;/,
      `a warm-up keyframe reaches the lit colour outright: ${stop.trim()}`);
  }
  const last = stops[stops.length - 1];
  assert.match(last, /color-mix/, `the final rung should still be a mix, not the lit colour: ${last}`);
  const pct = Number((last.match(/var\(--logo\)\s*(\d+)%/) || [])[1]);
  assert.ok(pct > 0 && pct < 100,
    `the final rung should be short of full (is ${pct}% of --logo)`);
});

// EVERY source file must PARSE. The unit suite exercises the modules it can
// require, but src/main.js needs Electron and is never loaded here — so a
// syntax error in it passed every test and only showed up as a crash dialog on
// launch ("Identifier 'backupRunner' has already been declared", 2026-08-16,
// from a bad edit). Parsing is not behaviour, but it is the failure that costs
// the most to find.
test('every source file parses', () => {
  const vm = require('node:vm');
  const dir = path.join(__dirname, '..', 'src');
  const files = [];
  const walk = (d) => {
    for (const name of fs.readdirSync(d)) {
      const full = path.join(d, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.js')) files.push(full);
    }
  };
  walk(dir);
  assert.ok(files.length > 8, `found ${files.length} source files`);
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    assert.doesNotThrow(
      () => new vm.Script(src, { filename: file }),
      `${path.relative(dir, file)} does not parse`
    );
  }
});
