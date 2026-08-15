'use strict';

// Does the instrument on the other end of the cable have the parameter map
// this build was written against?
//
// The Seven describes itself — that is how schema/seven-1.37.json was built in
// the first place — so the question is asked of the DEVICE, not of its firmware
// string. A version number is a proxy; the parameter table is the thing itself.
// A unit could report 1.37 and answer with a different map, and a unit could
// report something we have never heard of and answer with exactly ours.
//
// The verdict this module returns decides one thing: whether writes addressed
// by a SCHEMA parameter id (0x20) are allowed. The rule is about whose ID space
// a write uses, not about reads versus writes:
//
//   ENABLED  — writes addressed by an identity the device gave us: a 0x46
//              sound change (id resolved by name against the unit's own table)
//              and Program Change. Those ids came off this instrument.
//   BLOCKED  — anything addressed by a schema parameter id: patch audition,
//              live parameter edits, transfer, factory-defaults seeding.
//
// Reads are harmless on an unknown ID space — a wrong id reads a wrong number,
// and backup writes it to a file we can re-read. Writes are not: they alter
// someone's instrument on an assumption we never checked. That asymmetry is
// the whole rule.
//
// Pure functions, no device and no I/O, so the whole gate is testable without
// hardware.

// Differences that block, in the order a reader cares about them.
function compareParamTables(appParams, deviceParams) {
  const app = [...(appParams || [])].sort((a, b) => a.id - b.id);
  const dev = [...(deviceParams || [])].sort((a, b) => a.id - b.id);
  const appById = new Map(app.map((p) => [p.id, p]));
  const devById = new Map(dev.map((p) => [p.id, p]));

  const missing = app.filter((p) => !devById.has(p.id)).map((p) => p.id);
  const extra = dev.filter((p) => !appById.has(p.id)).map((p) => p.id);

  // A key is the NAME this app addresses a parameter by — patch files are
  // keyed by it, so a key that means something else on this instrument is a
  // silent data error, not a cosmetic one.
  const renamed = [];
  const labelDrift = [];
  const maxDrift = [];
  for (const d of dev) {
    const a = appById.get(d.id);
    if (!a) continue;
    if (a.key !== d.key) renamed.push({ id: d.id, app: a.key, device: d.key });
    else if (a.label !== d.label) labelDrift.push({ id: d.id, key: a.key, app: a.label, device: d.label });
    if (Number(a.max) !== Number(d.max)) {
      maxDrift.push({ id: d.id, key: a.key, app: Number(a.max), device: Number(d.max) });
    }
  }

  const appCount = app.length;
  const deviceCount = dev.length;
  const ok = appCount === deviceCount && !missing.length && !extra.length && !renamed.length;

  return {
    ok,
    appCount,
    deviceCount,
    missing,
    extra,
    renamed,
    // Reported, never blocking. A label is display text, and a max only
    // affects how a value is clamped — both are worth knowing and neither is
    // worth refusing to talk to the instrument over.
    labelDrift,
    maxDrift,
    summary: ok ? '' : summarize({ appCount, deviceCount, missing, extra, renamed }),
  };
}

// Say exactly what differs. A generic "incompatible instrument" tells the owner
// of that instrument nothing, and this app's whole claim is that the device is
// the authority — so quote what the device said.
function summarize({ appCount, deviceCount, missing, extra, renamed }) {
  const parts = [];
  if (appCount !== deviceCount) {
    parts.push(
      `This instrument reports ${deviceCount} parameter${deviceCount === 1 ? '' : 's'}; ` +
      `the app knows ${appCount}.`
    );
  }
  if (renamed.length) {
    const r = renamed[0];
    parts.push(
      `This instrument calls parameter ${r.id} “${r.device}”; the app expects “${r.app}”.` +
      (renamed.length > 1 ? ` ${renamed.length - 1} more name${renamed.length === 2 ? '' : 's'} differ.` : '')
    );
  }
  if (!parts.length && (missing.length || extra.length)) {
    // Same count, same names, different ids — describe the ids rather than
    // inventing a category for it.
    parts.push(`This instrument's parameter ids do not line up with the app's (${
      [...missing, ...extra].slice(0, 4).join(', ')
    }).`);
  }
  return parts.join(' ');
}

// The read itself failed. Treated exactly like a mismatch: an unreadable table
// is an unverified one, and this gate exists so that unverified never means
// "probably fine".
function unreadableVerdict(reason) {
  return {
    ok: false,
    appCount: null,
    deviceCount: null,
    missing: [],
    extra: [],
    renamed: [],
    labelDrift: [],
    maxDrift: [],
    summary: `The instrument's parameter table could not be read${reason ? ` (${reason})` : ''}.`,
  };
}

// The consequence, in the user's terms. Kept beside the difference so the two
// are always said together: what is wrong, then what it costs.
//
// It does NOT say "until the app knows this instrument's parameters". That
// implies the block lifts on its own — by waiting, or by reconnecting — and it
// does not: lifting it takes a schema for that firmware, which only the author
// can add. Telling someone to wait for something that will never happen is
// worse than telling them nothing (Daniel, 2026-08-14). Approved wording.
const CONSEQUENCE =
  'Backup and browsing still work, and you can still change sounds on the ' +
  'instrument. Sending patches, live edits and transfer are switched off, ' +
  'because this app hasn\'t been verified against this instrument\'s firmware.';

function blockMessage(verdict) {
  if (!verdict || verdict.ok) return '';
  return `${verdict.summary} ${CONSEQUENCE}`;
}

module.exports = { compareParamTables, unreadableVerdict, blockMessage, CONSEQUENCE };
