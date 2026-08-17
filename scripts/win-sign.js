'use strict';

// Windows code signing, wired through `win.signtoolOptions.sign`.
//
// WHY NOT electron-builder's built-in `azureSignOptions`, which is what
// docs/SIGNING.md used to recommend: its initialize() runs `Install-Module`
// unconditionally inside a captured-pipe PowerShell, with no check for whether
// the module is already there — so it deadlocks on GitHub runners and no
// amount of pre-installing prevents the call. JP Patches lost three CI runs to
// it, 29 to 43 silent minutes each, before hitting the job timeout.
//
// This hook does the same job by calling Invoke-TrustedSigning directly with
// stdio inherited: visible output, no captured pipe, no deadlock, and the
// identical signature from the identical certificate. The workflow installs
// the TrustedSigning module itself, once, before the build.
//
// electron-builder calls this once per file per hash algorithm; the config
// pins signingHashAlgorithms to ["sha256"], so it is once per file — the app
// exe, the NSIS uninstaller pieces, and the installer.
//
// Credentials never appear here. DefaultAzureCredential inside the module
// resolves them from AZURE_CLIENT_ID / AZURE_TENANT_ID / AZURE_CLIENT_SECRET
// in CI, or from an `az login` session on a local Windows machine (set
// FORCE_AZURE_SIGN=1 to sign locally without the CI variables).
//
// Account details are public — see docs/SIGNING.md.
const ENDPOINT = 'https://wus2.codesigning.azure.net/';
const ACCOUNT = 't7gt11signing';
const PROFILE = 'T7GT11SEATTLE';

const { execFileSync } = require('child_process');

exports.default = async function sign(configuration) {
  const file = configuration.path;

  // A Mac or Linux build reaches here only if someone asked for Windows
  // artifacts from the wrong machine. Skipping keeps `--win` usable for
  // layout checks; it cannot silently produce a signed-looking installer,
  // because it produces an unsigned one and says so.
  if (process.platform !== 'win32') {
    console.log(`  win-sign: not on Windows — skipping ${file}`);
    return;
  }

  // A fork PR receives no secrets. Better an obviously unsigned local build
  // than a mysterious failure; CI is where the absence must be loud, and the
  // workflow makes it so by running only on tags from this repo.
  if (!process.env.AZURE_CLIENT_ID && !process.env.FORCE_AZURE_SIGN) {
    console.log(`  win-sign: no Azure credentials in env — leaving unsigned: ${file}`);
    return;
  }

  console.log(`  win-sign: Invoke-TrustedSigning → ${file}`);
  const psFile = String(file).replace(/'/g, "''");
  execFileSync(
    'pwsh.exe',
    ['-NoProfile', '-NonInteractive', '-Command',
      `Invoke-TrustedSigning -Endpoint '${ENDPOINT}' ` +
      `-CodeSigningAccountName '${ACCOUNT}' -CertificateProfileName '${PROFILE}' ` +
      `-TimestampRfc3161 'http://timestamp.acs.microsoft.com' -TimestampDigest SHA256 ` +
      `-FileDigest SHA256 -Files '${psFile}'`],
    { stdio: 'inherit', timeout: 10 * 60 * 1000 },
  );
};
