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

// NO COMMENT MARKER SURVIVES THE STRIP, which is how you know every one of
// them is balanced. A stray `*/` leaves prose sitting in the stylesheet as
// garbage, and CSS does not complain — the parser SKIPS FORWARD until it can
// resync, silently swallowing whatever rule comes next.
//
// MEASURED, 18 Nov 2026, and it cost a hardware run: a comment was closed, then
// fourteen more lines of prose were added before a second `*/`. The rule right
// after it — the expression pedal's hatched fill — was never applied, while the
// NEXT rule along was, so the stylesheet looked fine and one feature was simply
// absent. It took a scenario reporting `background-image: none` with the
// instrument attached and somebody's foot on the pedal to find it.
//
// Same family as the SVG trap in seven-panel.svg (CLAUDE.md): comment syntax
// that fails by deleting something rather than by erroring.
test('every CSS comment is balanced', () => {
  const stripped = ((html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const stray = stripped.indexOf('*/');
  if (stray !== -1) {
    const where = stripped.slice(Math.max(0, stray - 160), stray + 2).split('\n').slice(-4).join('\n');
    assert.fail(`a stray "*/" is left after stripping comments — the rule after `
      + `it is being swallowed:\n…${where}`);
  }
  assert.strictEqual(stripped.indexOf('/*'), -1,
    'an unterminated "/*" swallows the rest of the stylesheet');
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

// THE DEPTH STACK'S GEOMETRY, which replaced the side-peek wheel on
// 18 Nov 2026.
//
// WHAT THIS TEST USED TO BE, and why it is gone rather than edited: "no
// carousel peek can land on Save patch, at any window width". It modelled a
// clearance ceiling swept on hardware — ceiling%(w) = 48.4 + 0.5 x (w - 1020),
// one per cent of the 128px face being 1.28px, minus 5.12px for the hover
// growth — and walked every width from 480 to 1600 asserting an 8px bar.
// All of that was about faces drawn OUTSIDE .engine-stage. The stack draws
// inside its own cell, so there is nothing to collide with and no width at
// which to hide anything. The measurements are kept in index.html beside the
// deletion; they were not wrong, their subject is gone.
//
// WHAT A STATIC READ CAN STILL ANSWER is that the approved numbers are the
// ones in the file. The painted BOUNDS are a layout question and belong to
// test/ui/scenarios/carousel-stack.js, which measures them against
// .engine-stage at two pane widths — Daniel's brief calls that the point of
// the change, and this is the half that runs automatically.
test('the depth stack carries the approved geometry, and nothing of the wheel', () => {
  // EVERY RULE THAT ADDRESSES THE CLASS, joined — not the first one found.
  // Since 18 Nov the stack is BARE AT REST and opens on hover, so `.is-next`
  // and `.is-after` carry their resting state (at the front's position,
  // opacity 0) in one rule and the APPROVED OFFSETS in the hover rule. A
  // `find` on the plain selector returned the resting one and reported the
  // offsets missing from a stylesheet that has them.
  //
  // THE OFFSETS ARE STILL THE THING BEING PINNED, whichever state they live
  // in: they are Daniel's measured prototype, and this test exists so a
  // drift from them is a drift from something he looked at.
  const face = (cls) => {
    const rs = rules.filter((x) => new RegExp(`\\.${cls}\\b`).test(x.selector)
      && /\.engine-carousel/.test(x.selector) && !x.media);
    assert.ok(rs.length, `.${cls} has at least one rule`);
    return rs.map((r) => r.body).join('\n');
  };
  // DANIEL'S PROTOTYPE, VALUE FOR VALUE. These were measured and approved
  // before any of this was written, so a drift here is a drift from
  // something he looked at rather than from an idea in this file.
  const approved = {
    'is-front': [/translate\(-50%,\s*-50%\)/, /scale\(1\)/, /opacity:\s*1\b/],
    'is-next': [/translate\(-36%,\s*-53%\)/, /scale\(\.86\)/, /opacity:\s*\.30\b/],
    'is-after': [/translate\(-26%,\s*-56%\)/, /scale\(\.75\)/, /opacity:\s*\.14\b/],
    'is-waiting': [/translate\(-140%,\s*-50%\)/, /scale\(\.9\)/, /opacity:\s*0\b/],
  };
  for (const [cls, pats] of Object.entries(approved)) {
    const body = face(cls);
    for (const re of pats) assert.match(body, re, `.${cls}: ${re}`);
  }

  // THE LEAVING POSITION, which only exists mid-turn.
  const leavingRight = rules.find(
    (r) => r.selector === '.engine-carousel.is-turning-next .is-front'
  );
  assert.ok(leavingRight, 'the front card has a leaving position');
  assert.match(leavingRight.body, /translate\(40%,\s*-50%\)/, 'it leaves to the right');
  assert.match(leavingRight.body, /opacity:\s*0\b/, 'and fades out');

  // ONE CURVE, HIS: transform .3s cubic-bezier(.22,.68,.24,1), opacity .3s ease.
  //
  // ACROSS EVERY .car-face RULE, not the first one found. The selector
  // legitimately has more than one — the size is set apart from the
  // positioning — and `find` returned whichever came first in the file,
  // which made this fail on a stylesheet that was correct.
  const baseRules = rules.filter(
    (r) => r.selector === '.engine-carousel .car-face' && !r.media
  );
  assert.ok(baseRules.length, '.car-face has at least one base rule');
  const base = baseRules.map((r) => r.body).join('\n');
  assert.match(base, /transform\s+\.3s\s+cubic-bezier\(\.22,\s*\.68,\s*\.24,\s*1\)/,
    'the approved transform curve');
  assert.match(base, /opacity\s+\.3s\s+ease/, 'and the opacity curve');
  // THE CARDS ARE NOT TARGETS. The chevrons are the only hit targets, and a
  // card that could take a click would be the wheel's behaviour returning
  // through a side door.
  assert.match(base, /pointer-events:\s*none/,
    'the cards take no pointer events — the chevrons are the only hit targets');

  // REDUCED MOTION: the state changes instantly, per the brief.
  // THE EXACT SELECTOR. A substring match on `.engine-carousel .car-face`
  // also catches `.engine-carousel .car-face.is-landing .sound-art`, which
  // is the sampled afterglow and legitimately keeps an animation under
  // reduced motion — so `find` returned that one and this failed against a
  // correct stylesheet.
  const still = rules.filter((r) => r.media && /prefers-reduced-motion/.test(r.media)
    && r.selector === '.engine-carousel .car-face');
  assert.ok(still.length, 'the stack is addressed under prefers-reduced-motion');
  assert.ok(still.some((r) => /transition:\s*none/.test(r.body)),
    'and does not transition');

  // AND NOTHING OF THE WHEEL SURVIVES. Each of these would be live machinery
  // for a thing that no longer exists — the shape CLAUDE.md warns about,
  // where a dead hazard is re-found and re-fixed later.
  const peekSpread = rules.filter((r) => /--peek\s*:/.test(r.body));
  assert.deepStrictEqual(peekSpread.map((r) => r.selector), [],
    'the --peek spread is gone with the peeks it positioned');
  const hidesFaces = rules.filter(
    (r) => /\.car-face:not\(/.test(r.selector) && /display\s*:\s*none/.test(r.body)
  );
  assert.deepStrictEqual(hidesFaces.map((r) => r.media || r.selector), [],
    'no width hides a face any more — that rule existed because a peek landed on Save patch');
  // THE CHEVRONS ARE UNCONDITIONAL NOW. They were display:none outside
  // @media (max-width: 1031px); the stack makes them the control at every
  // width, so a media-gated .car-step would take the control away again.
  const stepRules = rules.filter((r) => /^\.car-step$/.test(r.selector));
  assert.ok(stepRules.length, '.car-step has a rule');
  for (const r of stepRules) {
    // A WIDTH GATE IS THE HAZARD, not any media query at all. The original
    // read "must not be media-gated", which was right while the only media
    // query in sight was the @media (max-width: 1031px) that used to reveal
    // these buttons — and wrong the moment they gained a
    // prefers-reduced-motion rule for their fade. A motion preference does
    // not take the control away; a width does.
    assert.ok(!/width/.test(r.media || ''),
      `.car-step must not be gated on a width (found "${r.media}")`);
    assert.ok(!/display\s*:\s*none/.test(r.body), '.car-step is not hidden');
  }
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

// THE BOOT LOADER IS VISIBLE FROM THE INITIAL HTML (2026-11-16).
//
// Launching with the Seven plugged in painted the app's full DISCONNECTED
// state for over a second — "No instrument connected", a Connect button,
// empty lists — while the instrument was attached and already being read. The
// first thing the app said was false.
//
// THE FIX IS STRUCTURAL AND SO IS THIS TEST. The loader covers the window, so
// it hides the false state too — but only if it is on screen in the FIRST
// frame. Anything that needs a script to run has already lost: that beat is
// the one you could see.
//
// A UI SCENARIO CANNOT CHECK THIS. Its script runs after the document has
// loaded, so the earliest paints are past — measured, by putting `hidden`
// back and watching test/ui/scenarios/boot-no-false-state.js pass anyway.
// Reading the markup is the only way to ask the question at all, which is
// what this whole file is for.
test('the boot loader paints with the first frame, not when a script says so', () => {
  const tag = /<div id="boot-loader"[^>]*>/.exec(html);
  assert.ok(tag, 'the boot loader element is still in index.html');
  assert.doesNotMatch(tag[0], /\shidden\b/,
    'it carries no `hidden` attribute — with one, the window paints the app '
    + 'first and the loader arrives a beat later, which is the bug');

  // AND SOMETHING MUST STILL BE ABLE TO PUT IT AWAY. Removing `hidden` from
  // the markup is only safe while the [hidden] rule survives: app.js sets
  // `.hidden = true` to land it, and without that rule the loader would never
  // leave.
  const rule = rules.find((r) => /\.boot-loader\[hidden\]/.test(r.selector));
  assert.ok(rule, 'the [hidden] rule survives, or the loader could never be put away');
  assert.match(rule.body, /display\s*:\s*none/, 'and it is what hides it');

  // THE OFFLINE SWITCH-OFF, which is what keeps an offline launch from
  // trading an app-flash for a loader-flash. boot-flag.js sets the attribute
  // before <body> is parsed; this is the rule that acts on it.
  const off = rules.find((r) => /data-seven-boot="none"/.test(r.selector)
    && /\.boot-loader/.test(r.selector));
  assert.ok(off, 'a rule switches the loader off when no instrument was seen');
  assert.match(off.body, /display\s*:\s*none/, 'by not rendering it at all');
});

// THE DECISION HAS TO BE MADE BEFORE <body> EXISTS.
test('boot-flag.js is a blocking script in the head', () => {
  const head = /<head>([\s\S]*?)<\/head>/.exec(html);
  assert.ok(head, '<head> is still recognisable');
  const tag = /<script[^>]*boot-flag\.js[^>]*>/.exec(head[1]);
  assert.ok(tag, 'boot-flag.js is loaded in <head>, not at the end of <body>');
  // `defer` or `async` would run it after parsing, which is after <body> has
  // painted — the exact beat this exists to get in front of.
  assert.doesNotMatch(tag[0], /\sdefer\b/, 'without `defer`');
  assert.doesNotMatch(tag[0], /\sasync\b/, 'and without `async`');

  // AND IT MUST BE A FILE. The page's CSP has no script-src 'unsafe-inline',
  // so an inline <head> script is blocked outright — a detail worth pinning,
  // because "just inline it" is the obvious simplification.
  assert.match(html, /Content-Security-Policy/, 'the CSP is still declared');
  assert.doesNotMatch(html, /script-src[^"]*unsafe-inline/,
    'and still forbids inline script, which is why boot-flag is a file');
});
