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
