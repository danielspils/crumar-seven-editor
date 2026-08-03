'use strict';

// Builds fixtures/library-roundtrip.json — a .sevenlib.json snapshot derived
// from fixtures/sample-library.json, committed as a STATIC fixture so the
// format tests don't depend on the renderer fixtures changing shape.
// Deterministic: timestamps are constants, order comes from the serializer.
// Run: node fixtures/generate-roundtrip.js

const fs = require('fs');
const path = require('path');
const schema = require('../schema/seven-1.37.json');
const sample = require('./sample-library.json');
const { serializeLibrary } = require('../src/format/serialize.js');

const CREATED = '2026-08-02T00:00:00Z'; // fixed — fixtures must be reproducible
const soundByName = new Map(schema.sounds.map((s) => [s.name, s]));

const patches = [];
sample.banks.forEach((bank, b) => {
  bank.patches.forEach((p, i) => {
    const known = soundByName.get(p.soundName);
    patches.push({
      name: p.name,
      origin: { bank: b + 1, preset: i + 1 },
      // sound.id is diagnostic; null when this instrument doesn't have it.
      sound: { name: p.soundName, id: known ? known.id : null },
      params: p.params,
      captured: CREATED,
    });
  });
});

const library = {
  format: 'crumar-seven-library',
  formatVersion: 1,
  created: CREATED,
  source: {
    app: 'crumar-seven-editor 0.0.0',
    firmware: schema.firmware,
    firmwareBuild: schema.buildDate,
    schema: 'seven-1.37.json',
    soundList: schema.sounds.map((s) => ({ id: s.id, name: s.name })),
  },
  patches,
};

const out = path.join(__dirname, 'library-roundtrip.json');
fs.writeFileSync(out, serializeLibrary(library));
console.log(`wrote ${out}: ${patches.length} patches`);
