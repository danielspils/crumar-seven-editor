'use strict';
// HOW BIG IS "THE EFFECTS CHAIN", in parameters?
//
// Item A asks what the app would have to read to stop the panel claiming an
// effect is off while the instrument is playing it, and what that costs. A
// single parameter read is ~13ms measured (param-read-cost.js, median of 25),
// so the answer is a count multiplied by that — but the count has to come from
// the schema rather than from someone's memory of the panel.
const fs = require('node:fs');

const schema = JSON.parse(fs.readFileSync(
  '/Users/danielspils/crumar-seven-editor/schema/seven-1.37.json', 'utf8'
));
const params = schema.parameters || [];

const byGroup = new Map();
for (const p of params) {
  if (!byGroup.has(p.group)) byGroup.set(p.group, []);
  byGroup.get(p.group).push(p);
}

const fxGroups = [...byGroup.keys()].filter((g) => /^efx_/.test(g)).sort();
let total = 0;
console.log('group      n   parameters');
for (const g of fxGroups) {
  const list = byGroup.get(g);
  total += list.length;
  console.log(`${g.padEnd(10)} ${String(list.length).padStart(2)}  `
    + list.map((p) => `${p.key}(${p.id})`).join(' '));
}
console.log('');
console.log(`EVERY efx_ PARAMETER: ${total} of ${params.length}`);

// THE SWITCHES ALONE — the smallest read that could answer "is this block
// on?", which is the actual complaint. Named from the renderer's own section
// list rather than guessed: one switch per FX section.
const SWITCHES = ['veq_byp', 'fx1_sw', 'fx2_sw', 'amp_sw', 'rev_sw', 'pad_sw'];
const found = SWITCHES.filter((k) => params.some((p) => p.key === k));
console.log(`THE SECTION SWITCHES ONLY: ${found.length} — ${found.join(' ')}`);
if (found.length !== SWITCHES.length) {
  console.log(`  MISSING from the schema: ${SWITCHES.filter((k) => !found.includes(k)).join(' ')}`);
}

const MS = 13; // measured median for one parameter
console.log('');
console.log(`at ~${MS}ms a parameter:`);
console.log(`  switches only   ${found.length} x ${MS} = ~${found.length * MS}ms`);
console.log(`  whole chain     ${total} x ${MS} = ~${total * MS}ms`);
console.log(`  whole buffer    ${params.length} x ${MS} = ~${params.length * MS}ms`
  + '  (measured 1437ms, so the model is close)');
