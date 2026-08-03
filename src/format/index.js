'use strict';

// Patch file format (.sevenlib.json) — data layer only. See docs/FORMAT.md.

const { serializeLibrary } = require('./serialize.js');
const { parseLibrary } = require('./parse.js');
const { validateLibrary, FORMAT_NAME } = require('./validate.js');
const { resolveSounds } = require('./resolve.js');

module.exports = { serializeLibrary, parseLibrary, validateLibrary, resolveSounds, FORMAT_NAME };
