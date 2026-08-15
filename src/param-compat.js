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

// ---------------------------------------------------------------------------
// The banner
// ---------------------------------------------------------------------------
//
// Three paragraphs, in Daniel's words (approved 2026-08-15):
//
//   1. Which firmware this is, which one the app was built against, and the
//      two parameter counts. Both numbers are READ LIVE — the device's from
//      its own firmware string, the app's from the schema — because a
//      hardcoded number in a message about a mismatch is how a message about a
//      mismatch goes stale.
//   2. What still works and what does not, and WHY. It says the app hasn't
//      been verified against this firmware; it does NOT say "until", because
//      the block does not lift by itself — lifting it takes a schema only the
//      author can add.
//   3. The ask. "me", not "we": it is a one-person project, and the honesty
//      suits asking a stranger for a favour. Deliberately no promise of a fix
//      — someone waiting for one that never ships is worse off than someone
//      who knows where they stand.

// "CRUMAR Seven v.1.37 Build date: …" -> "1.37". Null when there is nothing to
// read: the firmware line is then dropped entirely rather than printed with a
// hole in it.
function firmwareVersion(firmware) {
  const m = /v\.?\s*([\d.]+)/i.exec(String(firmware || ''));
  return m ? m[1] : null;
}

// The counts sentence, which is the one thing that is always sayable — the
// device answered with a table, or the read failed and there is no count.
function countsClause(verdict) {
  if (!verdict || verdict.deviceCount == null || verdict.appCount == null) return '';
  return `this instrument reports ${verdict.deviceCount} parameter` +
    `${verdict.deviceCount === 1 ? '' : 's'} where the app knows ${verdict.appCount}`;
}

// [lead, consequence, ask] — the banner's paragraphs. The caller supplies what
// only it knows: the device's firmware string and the schema's firmware.
function gateParagraphs(verdict, { deviceFirmware, appFirmware } = {}) {
  if (!verdict || verdict.ok) return [];
  const version = firmwareVersion(deviceFirmware);
  const counts = countsClause(verdict);

  let lead;
  if (version && appFirmware) {
    // Both numbers live. The counts clause joins the same sentence.
    lead = `This Seven is running firmware ${version}. This app was built against ` +
      `${appFirmware}${counts ? `, and ${counts}` : ''}.`;
  } else if (counts) {
    // FALLBACK: no readable firmware string. Drop the first sentence entirely
    // and keep the counts — never print "firmware undefined".
    lead = `${counts.charAt(0).toUpperCase()}${counts.slice(1)}.`;
  } else {
    // No counts either: the table could not be read at all.
    lead = verdict.summary;
  }

  const detail = verdict.renamed && verdict.renamed.length ? ` ${namesClause(verdict)}` : '';
  return [`${lead}${detail}`, CONSEQUENCE, ASK];
}

// A count can match while the names do not, and then the counts clause says
// nothing useful on its own.
function namesClause(verdict) {
  const r = verdict.renamed[0];
  return `It calls parameter ${r.id} “${r.device}” where the app expects “${r.app}”` +
    (verdict.renamed.length > 1
      ? `, and ${verdict.renamed.length - 1} more name${verdict.renamed.length === 2 ? '' : 's'} differ.`
      : '.');
}

const CONSEQUENCE =
  'Backup and browsing still work, and you can still change sounds on the ' +
  'instrument. Sending patches, live edits and transfer are switched off, ' +
  'because the app hasn\'t been verified against this firmware.';

const ASK = 'A report gives me what I\'d need to add support for it.';

// The line the REPORT carries. One factual sentence, naming the firmware —
// that is the diagnostic, and the file's whole job is to be triaged from the
// top. Deliberately not the banner's wording: the banner talks to someone
// whose instrument just stopped accepting patches and has to say what still
// works, while this talks to whoever opens the issue. Different audience,
// different job, so the consequence paragraph stays out of it.
//
// Degrades a clause at a time rather than printing a hole: no readable device
// firmware drops "on firmware X", no schema firmware drops "built against Y".
function reportSummary(verdict, { deviceFirmware, appFirmware } = {}) {
  if (!verdict || verdict.ok) return '';
  const counts = verdict.deviceCount != null && verdict.appCount != null;
  if (!counts) return verdict.summary; // an unreadable table has no numbers to state
  const version = firmwareVersion(deviceFirmware);
  const on = version ? ` on firmware ${version}` : '';
  const against = appFirmware ? `, built against ${appFirmware}` : '';
  return `This Seven reports ${verdict.deviceCount} parameter` +
    `${verdict.deviceCount === 1 ? '' : 's'}${on}; the app knows ` +
    `${verdict.appCount}${against}.`;
}

// One line, for a THROWN error or a toast — the places three paragraphs cannot
// go. Same facts, no ask.
function blockMessage(verdict, opts) {
  if (!verdict || verdict.ok) return '';
  const [lead, consequence] = gateParagraphs(verdict, opts);
  return `${lead} ${consequence}`;
}

module.exports = {
  compareParamTables, unreadableVerdict, blockMessage, gateParagraphs,
  reportSummary, firmwareVersion, CONSEQUENCE, ASK,
};
