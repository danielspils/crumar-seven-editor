'use strict';
// WHICH PARAMETERS CAN HOLD A STALE BELIEF THE APP WOULD THEN WRITE BACK?
//
// The undo of a live edit writes `before` — the app's working copy of the
// value as it was just before the edit. That is a remembered value, so it is
// only honest if the app's copy was right at that moment.
//
// Three things can make the copy right:
//   - the parameter carries a CC, so a panel move announces itself and
//     onPanelCc reads it back (flag === 1)
//   - it is one of the six Clavi tabs, which the poll reads every second
//   - it is a BAR, which since B7's fix reads the parameter at the grab
//
// Anything NOT covered by one of those, and edited by a control that is not a
// bar, can be undone to a value the instrument never held.
const fs = require('node:fs');

const schema = JSON.parse(fs.readFileSync(
  '/Users/danielspils/crumar-seven-editor/schema/seven-1.37.json', 'utf8'
));
const PANEL_OWNED = ['zd6_br', 'zd6_tr', 'zd6_md', 'zd6_sf', 'zd6_cd', 'zd6_ab'];

const params = schema.parameters || [];
console.log(`parameters: ${params.length}`);

// How does the renderer draw it? A parameter with `values` (an enum/switch)
// gets a select or segmented control; anything else gets a bar.
const isBar = (p) => !(p.values && p.values.length);

const rows = params.map((p) => ({
  key: p.key,
  id: p.id,
  flag: p.flag,
  cc: p.cc,
  max: p.max,
  bar: isBar(p),
  polled: PANEL_OWNED.includes(p.key),
}));

const followed = (r) => r.flag === 1 || r.polled;
const exposed = rows.filter((r) => !followed(r) && !r.bar);

console.log(`bars (covered by the B7 grab read): ${rows.filter((r) => r.bar).length}`);
console.log(`flag=1, announced by CC: ${rows.filter((r) => r.flag === 1).length}`);
console.log(`Clavi tabs, polled every second: ${rows.filter((r) => r.polled).length}`);
console.log('');
console.log(`NOT a bar, NOT announced, NOT polled: ${exposed.length}`);
for (const r of exposed) {
  console.log(`  ${r.key}(${r.id}) flag=${r.flag} cc=${r.cc} max=${r.max}`);
}
