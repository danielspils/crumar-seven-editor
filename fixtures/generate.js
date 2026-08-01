'use strict';

// Generates fixtures/sample-library.json — four banks of eight patches, built
// from schema/seven-1.37.json. Deterministic (no RNG) so the fixture is stable.
// This is DEMO data, not device data. Run: node fixtures/generate.js

const fs = require('fs');
const path = require('path');
const { defaultFor } = require('../src/defaults.js');
const schema = require('../schema/seven-1.37.json');

const params = schema.parameters;
const byKey = new Map(params.map((p) => [p.key, p]));
const soundByName = new Map(schema.sounds.map((s) => [s.name, s]));
const clamp = (v, p) => Math.max(p.min, Math.min(p.max, v));

// Mirror of the renderer's sound→engine-group map (sampled sounds → pno_rom).
function engineGroup(soundName, sampled) {
  if (sampled) return 'pno_rom';
  if (/Tine/i.test(soundName)) return 'pno_rho';
  if (/Reed/i.test(soundName)) return 'pno_wur';
  if (/Electric Grand/i.test(soundName)) return 'pno_egp';
  if (/Clavi/i.test(soundName)) return 'pno_zd6';
  if (/DX/i.test(soundName)) return 'pno_dx7';
  if (/MKS/i.test(soundName)) return 'pno_mks';
  if (/Vibraphone/i.test(soundName)) return 'pno_vib';
  if (/Acoustic/i.test(soundName)) return 'pno_acp';
  return 'pno_rom';
}

function baseline() {
  const o = {};
  for (const p of params) o[p.key] = defaultFor(p);
  return o;
}

// Deterministically nudge a set of keys away from their default so patches vary.
function vary(vals, keys, seed) {
  keys.forEach((k, i) => {
    const p = byKey.get(k);
    if (!p) return;
    const off = ((seed * 37 + i * 13 + 11) % 51) - 25; // -25..25, deterministic
    vals[k] = clamp(defaultFor(p) + off, p);
  });
}

// 32 patch names.
const NAMES = [
  'Sunset Rhodes', 'Wurli Grit', 'Big Stage EP', 'Funk Clav',
  'Digital Glass', 'MKS Air', 'Vibes Dream', 'Concert D',
  'Grand D Live', 'Ballad Keys', 'Combo Warmth', 'Tine Sample',
  'Reed Sample', 'CP Layer', 'Clav Sample', 'Vibes Sample',
  '70B Punch', 'Venice Breeze', 'CB Classic', 'D-274 Bright',
  'Open Lid', 'House Venice', 'Fazioli Dream', 'Upright Room',
  'Felt Upright', 'Morning Tine', 'Recital Grand', 'Berlin Grand',
  'Mallet Air', 'Grand D Stage', 'Clav Bite', 'DX Bells',
];

// 32 sound names. Most are drawn from the schema's sound list; two deliberately
// are NOT ("Fazioli F308", "Steinway D Berlin") to exercise the missing-sound
// state — those resolve as sampled expansions this unit lacks.
const SOUNDS = [
  'Tine Piano', 'Reed Piano', 'Electric Grand Piano', 'Clavi Piano',
  'DX Synth Piano', 'MKS Synth Piano', 'Vibraphone', 'Acoustic Piano',
  'GSi Grand D', 'Ballad Piano', 'Combo Piano', 'Sampled Tine Piano',
  'Sampled Reed Piano', 'Sampled CP Piano', 'Sampled Clavi Piano', 'Sampled Vibraphone',
  'Electric Grand 70B XL', 'Venice Grand Breeze', 'Venice Grand CB1898', 'Venice Grand D-274',
  'Venice Grand Open', 'Venice Grand', 'Fazioli F308', 'Venice Upright U1',
  'Venice Upright U1 Felt', 'Tine Piano', 'Acoustic Piano', 'Steinway D Berlin',
  'Vibraphone', 'GSi Grand D', 'Clavi Piano', 'DX Synth Piano',
];

const EFFECT_VARY = [
  'veq_vol', 'veq_bas', 'veq_trb', 'veq_mid', 'fx1_dp', 'fx1_sp', 'fx2_dp', 'fx2_sp',
  'amp_dr', 'rev_lv', 'rev_dc', 'pad_lv', 'pha_of', 'pha_fb', 'pha_mx', 'dly_mf', 'dly_ml', 'dly_sp',
];

// Bank names match the hardware panel, which numbers banks 1-4 (not A-D).
// Restore prompts will tell the user which physical button to press.
const BANK_NAMES = ['1', '2', '3', '4'];
const banks = [];
for (let g = 0; g < 4; g++) {
  const patches = [];
  for (let s = 0; s < 8; s++) {
    const idx = g * 8 + s;
    const soundName = SOUNDS[idx];
    const known = soundByName.get(soundName);
    const sampled = known ? known.sampled : true; // missing sounds resolve as sampled
    const vals = baseline();

    const grp = engineGroup(soundName, sampled);
    const grpKeys = params.filter((p) => p.group === grp).map((p) => p.key);
    vary(vals, grpKeys.slice(0, 6), idx + 1);
    vary(vals, EFFECT_VARY, idx + 3);

    // Section on/off variety — a section renders dimmed when its switch is 0.
    vals.veq_byp = idx % 2 === 0 ? 1 : 0;
    vals.fx1_sw = [1, 0, 1, 1, 0, 0, 1, 0][s];
    vals.fx2_sw = [0, 1, 1, 0, 1, 0, 0, 1][s];
    vals.amp_sw = s % 3 === 0 ? 1 : 0;
    vals.rev_sw = s === 4 ? 0 : 1;
    vals.pad_sw = s % 4 === 0 ? 1 : 0;

    // FX2 mode cycles 0..3 so chorus/phaser/flanger/delay are all represented;
    // phaser (1) reveals the efx_pha sub-params, delay (3) the efx_dly ones.
    vals.fx2_md = s % 4;

    patches.push({ name: NAMES[idx], soundName, sampled, params: vals });
  }
  banks.push({ name: BANK_NAMES[g], patches });
}

const library = {
  name: 'Sample Library',
  note: 'Demo fixture generated from schema/seven-1.37.json by fixtures/generate.js. Not device data.',
  firmware: schema.firmware,
  banks,
};

const outPath = path.join(__dirname, 'sample-library.json');
fs.writeFileSync(outPath, JSON.stringify(library, null, 2) + '\n');
console.log(`wrote ${outPath}: ${banks.length} banks x ${banks[0].patches.length} patches`);
