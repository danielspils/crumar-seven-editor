'use strict';

// electron-builder afterAllArtifactBuild hook: notarize and staple the DMG
// itself, then refuse to continue if Gatekeeper still won't take it.
//
// WHY THIS EXISTS. electron-builder signs, notarizes and staples the .app,
// then wraps it in a disk image — and the disk image is left unsigned and
// unstapled. v1.0.0 shipped that way: the app inside was perfect (`spctl`
// accepted it, `stapler validate` passed), while the .dmg a Mac user
// double-clicks FIRST was rejected outright, "no usable signature". The first
// impression of the app was a warning about the file it arrived in.
//
// Signing is handled by `dmg.sign: true` in electron-builder.yml, which runs
// before this. Here we submit the signed image to Apple, staple the ticket so
// it is accepted with no network, and then CHECK — because the whole reason
// this file exists is that nobody checked last time.
//
// Needs APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD and APPLE_TEAM_ID. Without them
// (an unsigned local `dist:mac:unsigned`) it says so and does nothing, which
// keeps local builds fast and honest about what they are.

const { execFileSync, spawnSync } = require('node:child_process');

exports.default = async function stapleDmg(context) {
  const dmgs = context.artifactPaths.filter((p) => p.endsWith('.dmg'));
  if (dmgs.length === 0) return;

  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env;
  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    console.log('  • staple-dmg: no Apple credentials — leaving the DMG unstapled');
    return;
  }

  for (const dmg of dmgs) {
    console.log(`  • staple-dmg: notarizing ${dmg}`);
    execFileSync('xcrun', [
      'notarytool', 'submit', dmg,
      '--apple-id', APPLE_ID,
      '--password', APPLE_APP_SPECIFIC_PASSWORD,
      '--team-id', APPLE_TEAM_ID,
      '--wait',
    ], { stdio: 'inherit' });

    console.log(`  • staple-dmg: stapling ${dmg}`);
    execFileSync('xcrun', ['stapler', 'staple', dmg], { stdio: 'inherit' });

    // The check that was missing. This is the same assessment Finder makes on
    // a downloaded image, and a build that fails it must not reach a release:
    // a red X here costs minutes, a bad DMG costs every first impression.
    console.log(`  • staple-dmg: asking Gatekeeper about ${dmg}`);
    // spawnSync, and BOTH streams: spctl writes its verdict to stderr, and it
    // exits non-zero on a rejection. Reading stdout alone got an empty string
    // and failed a build whose DMG was perfectly signed, notarized and
    // stapled — the check was the only broken part of it.
    const check = spawnSync('spctl', [
      '-a', '-t', 'open', '--context', 'context:primary-signature', '-vv', dmg,
    ], { encoding: 'utf8' });
    const verdict = `${check.stdout || ''}${check.stderr || ''}`.trim();
    console.log(verdict);
    if (check.status !== 0 || !/: accepted/.test(verdict)) {
      throw new Error(`Gatekeeper rejected ${dmg}:\n${verdict}`);
    }
  }
};
